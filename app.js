(function (global) {
  const config = global.APP_CONFIG;
  const database = global.Database;
  const calc = global.Calc;
  const form = document.getElementById('recordForm');
  const navigationButtons = Array.from(document.querySelectorAll('[data-tab]'));
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  const listContainer = document.getElementById('recordList');
  const standardInput = document.getElementById('standard');
  const standardButtons = Array.from(document.querySelectorAll('.standard-button'));
  const kgCountWrap = document.getElementById('kgCountWrap');
  const tailCountWrap = document.getElementById('tailCountWrap');
  const saveMessage = document.getElementById('saveMessage');
  const toastMessage = document.getElementById('toastMessage');
  const installButton = document.getElementById('installButton');
  const refreshListButton = document.getElementById('refreshListButton');
  const submitButton = document.getElementById('submitButton');
  const formHeading = document.getElementById('formHeading');
  const summaryFields = {
    caseCost: document.getElementById('summaryExpenseCost'),
    expenseCost: document.getElementById('summaryCaseCost'),
    oneFishCost: document.getElementById('summaryOneFishCost'),
  };
  let editingId = null;
  let productsCache = [];
  let toastTimer = null;

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

  function syncStandardButtons() {
    const selected = normalizeStandard(standardInput.value);
    standardButtons.forEach((button) => {
      const isActive = button.dataset.standard === selected;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function setStandard(standard, options = {}) {
    const normalized = normalizeStandard(standard);
    const { autoCostType = false } = options;

    standardInput.value = normalized;
    syncStandardButtons();

    if (autoCostType) {
      if (normalized === 'kg') {
        document.querySelector('input[name="costType"][value="kg"]').checked = true;
      }
      if (normalized === 'c/s') {
        document.querySelector('input[name="costType"][value="case"]').checked = true;
      }
    }

    updateQuantityVisibility();
    saveDraft();
  }

  function getFormData() {
    const costType = document.querySelector('input[name="costType"]:checked').value;
    return {
      origin: document.getElementById('origin').value.trim(),
      productName: document.getElementById('productName').value.trim(),
      standard: normalizeStandard(standardInput.value),
      cost: document.getElementById('cost').value,
      costType,
      kgCount: costType === 'kg' ? document.getElementById('kgCount').value : '',
      tailCount: document.getElementById('tailCount').value,
      arrivalDate: document.getElementById('arrivalDate').value,
      priority: document.querySelector('input[name="priority"]:checked').value,
      comment: document.getElementById('comment').value.trim(),
    };
  }

  function setFormData(data) {
    const values = { ...config.defaultForm, ...data };
    document.getElementById('origin').value = values.origin;
    document.getElementById('productName').value = values.productName;
    standardInput.value = normalizeStandard(values.standard);
    syncStandardButtons();
    document.getElementById('cost').value = values.cost;
    document.querySelector(`input[name="costType"][value="${values.costType}"]`).checked = true;
    document.getElementById('kgCount').value = values.kgCount;
    document.getElementById('tailCount').value = values.tailCount;
    document.getElementById('arrivalDate').value = values.arrivalDate;
    const priorityInput = document.querySelector(`input[name="priority"][value="${values.priority}"]`);
    (priorityInput || document.querySelector('input[name="priority"][value="low"]')).checked = true;
    document.getElementById('comment').value = values.comment;
    updateQuantityVisibility();
    renderSummary();
  }

  function updateQuantityVisibility() {
    const standard = normalizeStandard(standardInput.value);
    kgCountWrap.classList.toggle('is-hidden', standard !== 'kg');
    tailCountWrap.classList.remove('is-hidden');
  }

  function renderSummary() {
    const result = calc.calculateRecord(getFormData());
    Object.entries(summaryFields).forEach(([key, element]) => {
      element.textContent = calc.formatCurrency(result[key]);
    });
  }

  function saveDraft() {
    database.saveDraft(getFormData());
    renderSummary();
    saveMessage.textContent = editingId ? '編集途中を自動保存しました。' : '入力途中を自動保存しました。';
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toastMessage.textContent = message;
    toastMessage.classList.add('is-visible');
    toastTimer = setTimeout(() => toastMessage.classList.remove('is-visible'), 2000);
  }

  let deferredInstallPrompt = null;

  function updateInstallButtonVisibility() {
    if (!installButton) {
      return;
    }

    const isInstallable = Boolean(deferredInstallPrompt);
    installButton.hidden = !isInstallable;
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

  async function showTab(tabName, shouldRefresh = true) {
    tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === tabName));
    panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === tabName));
    if (shouldRefresh && tabName === 'list') await refreshProducts();
    if (tabName === 'print') global.PrintManager.renderPrintPreview(productsCache);
  }

  function isListActive() {
    return panels.some((panel) => panel.dataset.panel === 'list' && panel.classList.contains('is-active'));
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
      const priorityDifference = config.priorityOptions.indexOf(getPriority(a.priority)) - config.priorityOptions.indexOf(getPriority(b.priority));
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

  function calculateOneFishDisplayValue(product, standard) {
    const expenseCost = parseCurrencyValue(product.expenseCost);
    const tailCount = parseCurrencyValue(product.tailCount);

    if (standard === 'c/s') return null;
    if (standard === 'tailP') return expenseCost;
    if (standard === 'kg') {
      if (expenseCost === null || tailCount === null || tailCount <= 0) return null;
      return Math.round(((expenseCost / tailCount) + Number.EPSILON) * 100) / 100;
    }
    return parseCurrencyValue(product.oneFishCost);
  }

  function productValues(product) {
    const standard = normalizeStandard(product.standard);
    const caseCost = standard === 'tailP'
      ? ''
      : calc.formatCurrency(product.caseCost);
    const oneFishCost = formatCurrencyOrBlank(calculateOneFishDisplayValue(product, standard));

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

  function renderList(products) {
    const sortedProducts = sortProducts(products);
    if (!sortedProducts.length) {
      listContainer.innerHTML = '<div class="empty-card"><h3>まだ登録データがありません</h3><p>新規登録から入荷情報を登録してください。</p></div>';
      return;
    }

    const rows = sortedProducts.map((product) => {
      const value = productValues(product);
      return `<tr><td><span class="priority-chip ${value.priority.className}">${value.priority.mark}</span></td><td>${escapeHtml(value.date)}</td><td>${escapeHtml(value.origin)}</td><td>${escapeHtml(value.productName)}</td><td>${escapeHtml(value.standard)}</td><td>${escapeHtml(value.caseCost)}</td><td>${escapeHtml(value.expenseCost)}</td><td>${escapeHtml(value.oneFishCost)}</td><td>${escapeHtml(value.comment)}</td><td>${actionButtons(product.id)}</td></tr>`;
    }).join('');
    const cards = sortedProducts.map((product) => {
      const value = productValues(product);
      return `<article class="record-card"><div class="record-card__heading"><span class="priority-chip ${value.priority.className}">${value.priority.mark} ${value.priority.name}</span><span class="record-date">入荷日 ${escapeHtml(value.date)}</span></div><div class="record-line"><div class="record-item"><span class="label">産地</span><strong>${escapeHtml(value.origin)}</strong></div><div class="record-item"><span class="label">品名</span><strong>${escapeHtml(value.productName)}</strong></div><div class="record-item"><span class="label">規格</span><strong>${escapeHtml(value.standard)}</strong></div><div class="record-item"><span class="label">ケース原価</span><strong>${escapeHtml(value.caseCost)}</strong></div><div class="record-item"><span class="label">経費込み原価</span><strong>${escapeHtml(value.expenseCost)}</strong></div><div class="record-item"><span class="label">1尾（P）</span><strong>${escapeHtml(value.oneFishCost)}</strong></div></div><p class="comment-box"><span class="label">コメント</span>${escapeHtml(value.comment)}</p>${actionButtons(product.id)}</article>`;
    }).join('');
    listContainer.innerHTML = `<div class="list-table-wrap"><table class="list-table"><thead><tr><th>優先</th><th>入荷日</th><th>産地</th><th>品名</th><th>規格</th><th>ケース原価</th><th>経費込み原価</th><th>1尾（P）</th><th>コメント</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div><div class="list-cards">${cards}</div>`;
  }

  function rerenderActiveListPreservingScroll() {
    if (!isListActive()) return;
    const beforeY = window.scrollY;
    const tableWrap = listContainer.querySelector('.list-table-wrap');
    const tableScrollLeft = tableWrap ? tableWrap.scrollLeft : 0;

    renderList(productsCache);

    const nextTableWrap = listContainer.querySelector('.list-table-wrap');
    if (nextTableWrap) nextTableWrap.scrollLeft = tableScrollLeft;
    window.scrollTo(0, beforeY);
  }

  function upsertProductCache(product) {
    const index = productsCache.findIndex((item) => item.id === product.id);
    if (index === -1) productsCache = [...productsCache, product];
    else productsCache = productsCache.map((item) => (item.id === product.id ? product : item));
  }

  function showListError(message) {
    listContainer.innerHTML = `<div class="empty-card"><h3>Googleとの通信に失敗しました</h3><p>${escapeHtml(message)} 接続設定とネットワークを確認してください。</p></div>`;
  }

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
    submitButton.textContent = '登録';
    formHeading.textContent = '新規登録';
    saveMessage.textContent = '入力途中は自動保存されます。';
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
    submitButton.textContent = '登録';
    formHeading.textContent = '新規登録';
    saveMessage.textContent = '入力途中は自動保存されます。';
    requestAnimationFrame(() => document.getElementById('productName').focus());
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
      submitButton.textContent = '更新';
      formHeading.textContent = '登録内容の編集';
      await showTab('register', false);
    } catch (error) {
      showListError(error.message);
    }
  }

  async function removeProduct(id) {
    if (!window.confirm('削除しますか？')) return;
    try {
      await database.deleteProduct(id);
      productsCache = productsCache.filter((item) => item.id !== id);
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
        saveMessage.textContent = 'コピーできる登録データがありません。';
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
      submitButton.textContent = '登録';
      formHeading.textContent = '新規登録';
      saveDraft();
      saveMessage.textContent = '前回の登録内容をコピーしました。';
    } catch (error) {
      saveMessage.textContent = `前回コピーに失敗しました。${error.message}`;
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
      saveMessage.textContent = validationMessage;
      return;
    }
    const product = { ...formData, ...calc.calculateRecord(formData) };
    const isEditing = Boolean(editingId);
    submitButton.disabled = true;
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
        await showTab('list', false);
        showToast('更新しました');
      } else {
        resetAfterRegister(formData);
        showToast('登録しました');
      }
    } catch (error) {
      saveMessage.textContent = `保存に失敗しました。${error.message}`;
    } finally {
      submitButton.disabled = false;
    }
  }

  function bindEvents() {
    navigationButtons.forEach((button) => button.addEventListener('click', () => { void showTab(button.dataset.tab); }));
    standardButtons.forEach((button) => {
      button.addEventListener('click', () => setStandard(button.dataset.standard, { autoCostType: true }));
    });
    document.querySelectorAll('input[name="costType"]').forEach((input) => {
      input.addEventListener('change', saveDraft);
    });
    form.addEventListener('input', saveDraft);
    form.addEventListener('change', saveDraft);
    form.addEventListener('submit', (event) => { void handleSubmit(event); });
    document.getElementById('resetButton').addEventListener('click', () => resetForm());
    document.getElementById('copyLastButton').addEventListener('click', () => { void copyLastProduct(); });
    refreshListButton?.addEventListener('click', () => { void refreshProducts(); });
    document.getElementById('csvDownloadButton').addEventListener('click', downloadCsv);
    document.getElementById('printButton').addEventListener('click', () => { void global.PrintManager.printCurrentProducts(); });
    installButton?.addEventListener('click', handleInstallClick);
    listContainer.addEventListener('click', (event) => {
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
