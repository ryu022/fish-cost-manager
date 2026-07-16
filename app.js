(function (global) {
  const config = global.APP_CONFIG;
  const database = global.Database;
  const calc = global.Calc;
  const MESSAGES = {
    draftSaved: '入力途中を自動保存しました。',
    draftSavedForEdit: '編集途中を自動保存しました。',
    registerHeading: '新規登録',
    editHeading: '登録内容の編集',
  };

  const elements = {
    form: document.getElementById('recordForm'),
    navigationButtons: Array.from(document.querySelectorAll('[data-tab]')),
    tabs: Array.from(document.querySelectorAll('.tab')),
    panels: Array.from(document.querySelectorAll('.panel')),
    listContainer: document.getElementById('recordList'),
    standardInput: document.getElementById('standard'),
    standardButtons: Array.from(document.querySelectorAll('.standard-button')),
    kgCountWrap: document.getElementById('kgCountWrap'),
    tailCountWrap: document.getElementById('tailCountWrap'),
    saveMessage: document.getElementById('saveMessage'),
    toastMessage: document.getElementById('toastMessage'),
    installButton: document.getElementById('installButton'),
    refreshListButton: document.getElementById('refreshListButton'),
    submitButton: document.getElementById('submitButton'),
    formHeading: document.getElementById('formHeading'),
    inputs: {
      origin: document.getElementById('origin'),
      productName: document.getElementById('productName'),
      cost: document.getElementById('cost'),
      kgCount: document.getElementById('kgCount'),
      tailCount: document.getElementById('tailCount'),
      arrivalDate: document.getElementById('arrivalDate'),
      comment: document.getElementById('comment'),
    },
    buttons: {
      reset: document.getElementById('resetButton'),
      copyLast: document.getElementById('copyLastButton'),
      csvDownload: document.getElementById('csvDownloadButton'),
      print: document.getElementById('printButton'),
    },
    costTypeInputs: Array.from(document.querySelectorAll('input[name="costType"]')),
    priorityInputs: Array.from(document.querySelectorAll('input[name="priority"]')),
  };

  const priorityIndexByValue = Object.fromEntries(config.priorityOptions.map((item, index) => [item.value, index]));

  const summaryFields = {
    caseCost: document.getElementById('summaryExpenseCost'),
    expenseCost: document.getElementById('summaryCaseCost'),
    oneFishCost: document.getElementById('summaryOneFishCost'),
  };
  const listView = {
    isEmpty: true,
    tableWrap: null,
    tableBody: null,
    cardsContainer: null,
  };

  let editingId = null;
  let productsCache = [];
  let toastTimer = null;
  let eventsBound = false;
  let deferredInstallPrompt = null;

  // 規格表記の揺れを内部表現へ統一します。
  function normalizeStandard(standard) {
    if (standard === '尾' || standard === 'P' || standard === '尾/P' || standard === 'tailP') return 'tailP';
    if (standard === 'kg') return 'kg';
    if (standard === 'c/s') return 'c/s';
    return config.defaultForm.standard;
  }

  function standardLabel(standard) {
    const normalized = normalizeStandard(standard);
    if (normalized === 'tailP') return '尾/P';
    return normalized;
  }

  function getCheckedValue(inputs, fallback) {
    const selected = inputs.find((input) => input.checked);
    return selected ? selected.value : fallback;
  }

  function setCheckedByValue(inputs, value, fallback) {
    const target = inputs.find((input) => input.value === value) || inputs.find((input) => input.value === fallback);
    if (target) target.checked = true;
  }

  function syncStandardButtons() {
    const selected = normalizeStandard(elements.standardInput.value);
    elements.standardButtons.forEach((button) => {
      const isActive = button.dataset.standard === selected;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function setStandard(standard, options = {}) {
    const normalized = normalizeStandard(standard);
    const { autoCostType = false } = options;

    elements.standardInput.value = normalized;
    syncStandardButtons();

    if (autoCostType) {
      if (normalized === 'kg') {
        setCheckedByValue(elements.costTypeInputs, 'kg', 'kg');
      }
      if (normalized === 'c/s') {
        setCheckedByValue(elements.costTypeInputs, 'case', 'kg');
      }
    }

    updateQuantityVisibility();
    saveDraft();
  }

  // フォーム値の取得を1か所に集約し、保存・計算・下書き復元で再利用します。
  function getFormData() {
    const costType = getCheckedValue(elements.costTypeInputs, config.defaultForm.costType);
    return {
      origin: elements.inputs.origin.value.trim(),
      productName: elements.inputs.productName.value.trim(),
      standard: normalizeStandard(elements.standardInput.value),
      cost: elements.inputs.cost.value,
      costType,
      kgCount: costType === 'kg' ? elements.inputs.kgCount.value : '',
      tailCount: elements.inputs.tailCount.value,
      arrivalDate: elements.inputs.arrivalDate.value,
      priority: getCheckedValue(elements.priorityInputs, 'low'),
      comment: elements.inputs.comment.value.trim(),
    };
  }

  function setFormData(data) {
    const values = { ...config.defaultForm, ...data };
    elements.inputs.origin.value = values.origin;
    elements.inputs.productName.value = values.productName;
    elements.standardInput.value = normalizeStandard(values.standard);
    syncStandardButtons();
    elements.inputs.cost.value = values.cost;
    setCheckedByValue(elements.costTypeInputs, values.costType, 'kg');
    elements.inputs.kgCount.value = values.kgCount;
    elements.inputs.tailCount.value = values.tailCount;
    elements.inputs.arrivalDate.value = values.arrivalDate;
    setCheckedByValue(elements.priorityInputs, values.priority, 'low');
    elements.inputs.comment.value = values.comment;
    updateQuantityVisibility();
    renderSummary();
  }

  function updateQuantityVisibility() {
    const standard = normalizeStandard(elements.standardInput.value);
    elements.kgCountWrap.classList.toggle('is-hidden', standard !== 'kg');
    elements.tailCountWrap.classList.remove('is-hidden');
  }

  function renderSummary() {
    const result = calc.calculateCosts(getFormData());
    Object.entries(summaryFields).forEach(([key, element]) => {
      element.textContent = calc.formatCurrency(result[key]);
    });
  }

  function saveDraft() {
    database.saveDraft(getFormData());
    renderSummary();
    elements.saveMessage.textContent = editingId ? MESSAGES.draftSavedForEdit : MESSAGES.draftSaved;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toastMessage.textContent = message;
    elements.toastMessage.classList.add('is-visible');
    toastTimer = setTimeout(() => elements.toastMessage.classList.remove('is-visible'), 2000);
  }

  function updateInstallButtonVisibility() {
    if (!elements.installButton) {
      return;
    }

    const isInstallable = Boolean(deferredInstallPrompt);
    elements.installButton.hidden = !isInstallable;
  }

  function handleInstallClick() {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      updateInstallButtonVisibility();
    });
  }

  async function showTab(tabName) {
    elements.tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === tabName));
    elements.panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === tabName));
    if (tabName === 'print') global.PrintManager.renderPrintPreview(productsCache);
  }

  function isListActive() {
    return elements.panels.some((panel) => panel.dataset.panel === 'list' && panel.classList.contains('is-active'));
  }

  function getPriority(priority) {
    return config.priorityOptions.find((item) => item.value === priority) || config.priorityOptions[2];
  }

  function dateValue(value) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  // 優先度 → 入荷日（古い順）→ 登録日時の順で常に表示します。
  function sortProducts(products) {
    return products.slice().sort((a, b) => {
      const priorityDifference = (priorityIndexByValue[getPriority(a.priority).value] ?? 2) - (priorityIndexByValue[getPriority(b.priority).value] ?? 2);
      if (priorityDifference) return priorityDifference;
      const arrivalDateDifference = dateValue(a.arrivalDate) - dateValue(b.arrivalDate);
      if (arrivalDateDifference) return arrivalDateDifference;
      return dateValue(a.createdAt) - dateValue(b.createdAt) || String(a.id).localeCompare(String(b.id));
    });
  }

  function escapeHtml(value) {
    return String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function parseCurrencyValue(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatCurrencyOrBlank(value) {
    return value === null || value === undefined ? '' : calc.formatCurrency(value);
  }

  function productValues(product) {
    const standard = normalizeStandard(product.standard);
    const caseCost = standard === 'tailP'
      ? ''
      : calc.formatCurrency(product.caseCost);
    const oneFishCost = formatCurrencyOrBlank(parseCurrencyValue(product.oneFishCost));

    return {
      priority: getPriority(product.priority),
      date: product.arrivalDate || '—',
      origin: product.origin || '—',
      productName: product.productName || '—',
      standard: product.standard ? standardLabel(product.standard) : '—',
      caseCost,
      expenseCost: calc.formatCurrency(product.expenseCost),
      oneFishCost,
      comment: product.comment || '—',
    };
  }

  function actionButtons(id) {
    return `<div class="record-actions"><button type="button" class="secondary-button edit-button" data-action="edit" data-id="${id}">編集</button><button type="button" class="danger-button delete-button" data-action="delete" data-id="${id}">削除</button></div>`;
  }

  function resetListViewReferences() {
    listView.tableWrap = null;
    listView.tableBody = null;
    listView.cardsContainer = null;
  }

  function ensureListStructure() {
    if (listView.tableBody && listView.cardsContainer) return;
    elements.listContainer.innerHTML = '<div class="list-table-wrap"><table class="list-table"><thead><tr><th>優先</th><th>入荷日</th><th>産地</th><th>品名</th><th>規格</th><th>ケース原価</th><th>経費込み原価</th><th>1尾（P）</th><th>コメント</th><th>操作</th></tr></thead><tbody data-list-body></tbody></table></div><div class="list-cards" data-list-cards></div>';
    listView.tableWrap = elements.listContainer.querySelector('.list-table-wrap');
    listView.tableBody = elements.listContainer.querySelector('[data-list-body]');
    listView.cardsContainer = elements.listContainer.querySelector('[data-list-cards]');
  }

  // 一覧パネルの枠は維持し、行データだけ差し替えて再描画コストを下げます。
  function renderList(products) {
    const sortedProducts = sortProducts(products);
    if (!sortedProducts.length) {
      elements.listContainer.innerHTML = '<div class="empty-card"><h3>まだ登録データがありません</h3><p>新規登録から入荷情報を登録してください。</p></div>';
      listView.isEmpty = true;
      resetListViewReferences();
      return;
    }

    ensureListStructure();

    const rows = sortedProducts.map((product) => {
      const value = productValues(product);
      return `<tr><td><span class="priority-chip ${value.priority.className}">${value.priority.mark}</span></td><td>${escapeHtml(value.date)}</td><td>${escapeHtml(value.origin)}</td><td>${escapeHtml(value.productName)}</td><td>${escapeHtml(value.standard)}</td><td>${escapeHtml(value.caseCost)}</td><td>${escapeHtml(value.expenseCost)}</td><td>${escapeHtml(value.oneFishCost)}</td><td>${escapeHtml(value.comment)}</td><td>${actionButtons(product.id)}</td></tr>`;
    }).join('');
    const cards = sortedProducts.map((product) => {
      const value = productValues(product);
      return `<article class="record-card"><div class="record-card__heading"><span class="priority-chip ${value.priority.className}">${value.priority.mark} ${value.priority.name}</span><span class="record-date">入荷日 ${escapeHtml(value.date)}</span></div><div class="record-line"><div class="record-item"><span class="label">産地</span><strong>${escapeHtml(value.origin)}</strong></div><div class="record-item"><span class="label">品名</span><strong>${escapeHtml(value.productName)}</strong></div><div class="record-item"><span class="label">規格</span><strong>${escapeHtml(value.standard)}</strong></div><div class="record-item"><span class="label">ケース原価</span><strong>${escapeHtml(value.caseCost)}</strong></div><div class="record-item"><span class="label">経費込み原価</span><strong>${escapeHtml(value.expenseCost)}</strong></div><div class="record-item"><span class="label">1尾（P）</span><strong>${escapeHtml(value.oneFishCost)}</strong></div></div><p class="comment-box"><span class="label">コメント</span>${escapeHtml(value.comment)}</p>${actionButtons(product.id)}</article>`;
    }).join('');
    listView.tableBody.innerHTML = rows;
    listView.cardsContainer.innerHTML = cards;
    listView.isEmpty = false;
  }

  function rerenderActiveListPreservingScroll() {
    if (!isListActive()) return;
    const beforeY = window.scrollY;
    const tableScrollLeft = listView.tableWrap ? listView.tableWrap.scrollLeft : 0;

    renderList(productsCache);

    if (listView.tableWrap) listView.tableWrap.scrollLeft = tableScrollLeft;
    window.scrollTo(0, beforeY);
  }

  function upsertProductCache(product) {
    const index = productsCache.findIndex((item) => item.id === product.id);
    if (index === -1) productsCache.push(product);
    else productsCache[index] = product;
  }

  function showListError(message) {
    elements.listContainer.innerHTML = `<div class="empty-card"><h3>Googleとの通信に失敗しました</h3><p>${escapeHtml(message)} 接続設定とネットワークを確認してください。</p></div>`;
    listView.isEmpty = true;
    resetListViewReferences();
  }

  // 全件取得は起動時・手動更新時のみ実行します。
  async function refreshProducts() {
    try {
      productsCache = await database.getProducts();
      renderList(productsCache);
      global.PrintManager.renderPrintPreview(productsCache);
    } catch (error) {
      console.error(error);
      showListError(error.message);
      global.PrintManager.renderPrintError(error.message);
    }
  }

  function resetForm(clearDraft = true) {
    editingId = null;
    setFormData(config.defaultForm);
    elements.submitButton.textContent = '登録';
    elements.formHeading.textContent = MESSAGES.registerHeading;
    elements.saveMessage.textContent = '入力途中は自動保存されます。';
    if (clearDraft) database.clearDraft();
  }

  function resetAfterRegister(currentFormData) {
    editingId = null;
    setFormData({
      ...config.defaultForm,
      origin: currentFormData.origin,
      standard: currentFormData.standard,
      costType: currentFormData.costType,
      priority: currentFormData.priority,
      arrivalDate: currentFormData.arrivalDate || config.defaultForm.arrivalDate,
      productName: '',
      cost: '',
      kgCount: '',
      tailCount: '',
      comment: '',
    });
    elements.submitButton.textContent = '登録';
    elements.formHeading.textContent = MESSAGES.registerHeading;
    elements.saveMessage.textContent = '入力途中は自動保存されます。';
    requestAnimationFrame(() => elements.inputs.productName.focus());
  }

  function validateProduct(product) {
    if (!product.origin || !product.productName || !product.arrivalDate || product.cost === '') {
      return '産地・品名・入荷日・原価を入力してください。';
    }
    if (normalizeStandard(product.standard) === 'kg' && product.costType === 'kg' && product.kgCount === '') {
      return 'kg原価の場合はkg数を入力してください。';
    }
    return '';
  }

  async function startEdit(id) {
    try {
      const product = productsCache.find((item) => item.id === id);
      if (!product) throw new Error('編集対象のデータが見つかりません。');
      editingId = id;
      setFormData(product);
      elements.submitButton.textContent = '更新';
      elements.formHeading.textContent = MESSAGES.editHeading;
      await showTab('register');
    } catch (error) {
      showListError(error.message);
    }
  }

  async function removeProduct(id) {
    if (!window.confirm('削除しますか？')) return;
    try {
      await database.deleteProduct(id);
      const index = productsCache.findIndex((item) => item.id === id);
      if (index !== -1) productsCache.splice(index, 1);
      if (editingId === id) resetForm();
      rerenderActiveListPreservingScroll();
      global.PrintManager.renderPrintPreview(productsCache);
    } catch (error) {
      showListError(error.message);
    }
  }

  async function copyLastProduct() {
    try {
      const lastProduct = productsCache.slice().sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt))[0];
      if (!lastProduct) {
        elements.saveMessage.textContent = 'コピーできる登録データがありません。';
        return;
      }
      setFormData({
        ...config.defaultForm,
        origin: lastProduct.origin,
        productName: lastProduct.productName,
        standard: lastProduct.standard,
        costType: lastProduct.costType,
        comment: lastProduct.comment,
        priority: lastProduct.priority,
      });
      editingId = null;
      elements.submitButton.textContent = '登録';
      elements.formHeading.textContent = MESSAGES.registerHeading;
      saveDraft();
      elements.saveMessage.textContent = '前回の登録内容をコピーしました。';
    } catch (error) {
      elements.saveMessage.textContent = `前回コピーに失敗しました。${error.message}`;
    }
  }

  function downloadCsv() {
    if (!productsCache.length) {
      showListError('ダウンロードできるデータがありません。');
      return;
    }
    const headers = ['優先', '入荷日', '産地', '品名', '規格', 'kg数', '原価区分', '原価', '経費込み原価', 'ケース原価', '1尾（P）', '尾数', 'コメント'];
    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = sortProducts(productsCache).map((product) => [
      getPriority(product.priority).mark,
      product.arrivalDate,
      product.origin,
      product.productName,
      standardLabel(product.standard),
      product.kgCount,
      product.costType,
      product.cost,
      product.expenseCost,
      product.caseCost,
      product.oneFishCost,
      product.tailCount,
      product.comment,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `鮮魚原価一覧_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = getFormData();
    const validationMessage = validateProduct(formData);
    if (validationMessage) {
      elements.saveMessage.textContent = validationMessage;
      return;
    }
    const product = { ...formData, ...calc.calculateCosts(formData) };
    const isEditing = Boolean(editingId);
    elements.submitButton.disabled = true;
    try {
      if (isEditing) {
        const savedProduct = await database.updateProduct(editingId, product);
        upsertProductCache(savedProduct);
      } else {
        const savedProduct = await database.addProduct(product);
        upsertProductCache(savedProduct);
      }
      rerenderActiveListPreservingScroll();
      global.PrintManager.renderPrintPreview(productsCache);
      database.clearDraft();
      if (isEditing) {
        resetForm(false);
        await showTab('list');
        showToast('更新しました');
      } else {
        resetAfterRegister(formData);
        showToast('登録しました');
      }
    } catch (error) {
      elements.saveMessage.textContent = `保存に失敗しました。${error.message}`;
    } finally {
      elements.submitButton.disabled = false;
    }
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    elements.navigationButtons.forEach((button) => button.addEventListener('click', () => { void showTab(button.dataset.tab); }));
    elements.standardButtons.forEach((button) => {
      button.addEventListener('click', () => setStandard(button.dataset.standard, { autoCostType: true }));
    });
    elements.costTypeInputs.forEach((input) => {
      input.addEventListener('change', saveDraft);
    });
    elements.form.addEventListener('input', saveDraft);
    elements.form.addEventListener('change', saveDraft);
    elements.form.addEventListener('submit', (event) => { void handleSubmit(event); });
    elements.buttons.reset.addEventListener('click', () => resetForm());
    elements.buttons.copyLast.addEventListener('click', () => { void copyLastProduct(); });
    elements.refreshListButton?.addEventListener('click', () => { void refreshProducts(); });
    elements.buttons.csvDownload.addEventListener('click', downloadCsv);
    elements.buttons.print.addEventListener('click', () => { void global.PrintManager.printCurrentProducts(); });
    elements.installButton?.addEventListener('click', handleInstallClick);
    elements.listContainer.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'edit') void startEdit(button.dataset.id);
      if (button.dataset.action === 'delete') void removeProduct(button.dataset.id);
    });
  }

  async function initialize() {
    setFormData(database.getDraft());
    bindEvents();
    updateInstallButtonVisibility();
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallButtonVisibility();
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      updateInstallButtonVisibility();
    });
    await refreshProducts();
  }

  void initialize();
})(window);
