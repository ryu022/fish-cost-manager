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
    selectAllButton: document.getElementById('selectAllButton'),
    deleteSelectedButton: document.getElementById('deleteSelectedButton'),
    deleteAllButton: document.getElementById('deleteAllButton'),
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
  let committedProductsCache = [];
  let productsById = new Map();
  let sortedProductIds = [];
  let toastTimer = null;
  let eventsBound = false;
  let deferredInstallPrompt = null;
  let submitPending = false;
  const deletePendingIds = new Set();
  const selectedProductIds = new Set();
  const perfMetrics = global.__perfMetrics || (global.__perfMetrics = []);

  function todayValue() {
    const now = new Date();
    const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
  }

  function startPerfTimer(label, scope, stage) {
    const startedAt = performance.now();
    let ended = false;
    console.time(label);
    return () => {
      if (ended) return 0;
      ended = true;
      const duration = performance.now() - startedAt;
      console.timeEnd(label);
      perfMetrics.push({ scope, stage, label, duration: Math.round(duration * 10) / 10 });
      return duration;
    };
  }

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
    if (tabName === 'register' && !editingId) {
      setFormData({ ...database.getDraft(), arrivalDate: todayValue() });
    }
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

  function compareProducts(a, b) {
    const priorityDifference = (priorityIndexByValue[getPriority(a.priority).value] ?? 2) - (priorityIndexByValue[getPriority(b.priority).value] ?? 2);
    if (priorityDifference) return priorityDifference;
    const arrivalDateDifference = dateValue(a.arrivalDate) - dateValue(b.arrivalDate);
    if (arrivalDateDifference) return arrivalDateDifference;
    return dateValue(a.createdAt) - dateValue(b.createdAt) || String(a.id).localeCompare(String(b.id));
  }

  function cloneProducts(products) {
    return products.map((product) => ({ ...product }));
  }

  function rebuildDerivedCachesFromMap() {
    productsCache = sortProducts(Array.from(productsById.values()));
    sortedProductIds = productsCache.map((product) => String(product.id));
  }

  function setProductsCache(products, { commit = false } = {}) {
    const list = Array.isArray(products) ? products : [];
    productsById = new Map(list.map((product) => [String(product.id), { ...product }]));
    rebuildDerivedCachesFromMap();
    if (commit) committedProductsCache = cloneProducts(productsCache);
  }

  function commitCurrentCache() {
    committedProductsCache = cloneProducts(productsCache);
  }

  function rollbackToCommittedCache() {
    console.time('描画:ロールバック');
    setProductsCache(committedProductsCache, { commit: false });
    rerenderActiveListPreservingScroll();
    global.PrintManager.renderPrintPreview(productsCache);
    console.timeEnd('描画:ロールバック');
  }

  // 優先度 → 入荷日（古い順）→ 登録日時の順で常に表示します。
  function sortProducts(products) {
    return products.slice().sort(compareProducts);
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
    const oneFishCost = formatCurrencyOrBlank(parseCurrencyValue(product.oneFishCost));
    const expenseCost = parseCurrencyValue(product.expenseCost);
    const kgCount = parseCurrencyValue(product.kgCount);
    const expenseKgCost = standard === 'kg' && expenseCost !== null && kgCount !== null && kgCount > 0
      ? calc.formatCurrency(expenseCost / kgCount)
      : '—';

    return {
      priority: getPriority(product.priority),
      date: product.arrivalDate || '—',
      origin: product.origin || '—',
      productName: product.productName || '—',
      standard: product.standard ? standardLabel(product.standard) : '—',
      priceLabel: standard === 'kg' ? '経費込みKg原価' : (standard === 'c/s' ? '経費込みケース原価' : ''),
      price: standard === 'kg' ? expenseKgCost : (standard === 'c/s' ? calc.formatCurrency(product.expenseCost) : ''),
      oneFishCost,
      comment: product.comment || '—',
    };
  }

  function actionButtons(id) {
    return `<div class="record-actions"><button type="button" class="secondary-button edit-button" data-action="edit" data-id="${id}">編集</button><button type="button" class="danger-button delete-button" data-action="delete" data-id="${id}">削除</button></div>`;
  }

  function buildTableRow(product) {
    const value = productValues(product);
    const checked = selectedProductIds.has(String(product.id)) ? ' checked' : '';
    return `<tr data-id="${product.id}"><td><input class="record-select" type="checkbox" data-select-id="${product.id}" aria-label="${escapeHtml(value.productName)}を選択"${checked} /></td><td><span class="priority-chip ${value.priority.className}">${value.priority.mark}</span></td><td>${escapeHtml(value.date)}</td><td>${escapeHtml(value.origin)}</td><td>${escapeHtml(value.productName)}</td><td>${escapeHtml(value.standard)}</td><td>${escapeHtml(value.price)}</td><td>${escapeHtml(value.oneFishCost)}</td><td>${escapeHtml(value.comment)}</td><td>${actionButtons(product.id)}</td></tr>`;
  }

  function buildCard(product) {
    const value = productValues(product);
    const checked = selectedProductIds.has(String(product.id)) ? ' checked' : '';
    const priceField = value.priceLabel ? `<div><span>${escapeHtml(value.priceLabel)}</span><strong>${escapeHtml(value.price)}</strong></div>` : '';
    return `<article class="record-card" data-id="${product.id}" tabindex="0"><div class="record-card__heading"><label class="record-check"><input class="record-select" type="checkbox" data-select-id="${product.id}" aria-label="${escapeHtml(value.productName)}を選択"${checked} /><span>選択</span></label><span class="record-date">入荷日 ${escapeHtml(value.date)}</span></div><div class="record-card__title"><span class="priority-chip ${value.priority.className}">${value.priority.mark}</span><strong>${escapeHtml(value.productName)}</strong></div><p class="record-card__detail">${escapeHtml(value.origin)}　${escapeHtml(value.standard)}</p><div class="record-costs">${priceField}<div><span>1尾原価</span><strong>${escapeHtml(value.oneFishCost)}</strong></div></div><p class="comment-box"><span class="label">コメント</span>${escapeHtml(value.comment)}</p>${actionButtons(product.id)}</article>`;
  }

  function resetListViewReferences() {
    listView.tableWrap = null;
    listView.tableBody = null;
    listView.cardsContainer = null;
  }

  function ensureListStructure() {
    if (listView.tableBody && listView.cardsContainer) return;
    elements.listContainer.innerHTML = '<div class="list-table-wrap"><table class="list-table"><thead><tr><th>選択</th><th>優先</th><th>入荷日</th><th>産地</th><th>品名</th><th>規格</th><th>経費込み原価</th><th>1尾原価</th><th>コメント</th><th>操作</th></tr></thead><tbody data-list-body></tbody></table></div><div class="list-cards" data-list-cards></div>';
    listView.tableWrap = elements.listContainer.querySelector('.list-table-wrap');
    listView.tableBody = elements.listContainer.querySelector('[data-list-body]');
    listView.cardsContainer = elements.listContainer.querySelector('[data-list-cards]');
  }

  function buildTableRowElement(product) {
    const template = document.createElement('template');
    template.innerHTML = buildTableRow(product).trim();
    return template.content.firstElementChild;
  }

  function buildCardElement(product) {
    const template = document.createElement('template');
    template.innerHTML = buildCard(product).trim();
    return template.content.firstElementChild;
  }

  function getNextProductId(id) {
    const currentIndex = sortedProductIds.indexOf(String(id));
    if (currentIndex < 0 || currentIndex >= sortedProductIds.length - 1) return null;
    return sortedProductIds[currentIndex + 1];
  }

  // 一覧パネルの枠は維持し、行データだけ差し替えて再描画コストを下げます。
  function renderList() {
    const endRenderTimer = startPerfTimer('renderList', 'render', 'renderList');
    const sortedProducts = productsCache;

    if (!sortedProducts.length) {
      const endDomTimer = startPerfTimer('DOM更新:空表示', 'render', 'dom');
      elements.listContainer.innerHTML = '<div class="empty-card"><h3>まだ登録データがありません</h3><p>新規登録から入荷情報を登録してください。</p></div>';
      listView.isEmpty = true;
      resetListViewReferences();
      updateSelectionControls();
      endDomTimer();
      endRenderTimer();
      return;
    }

    ensureListStructure();

    const endDomTimer = startPerfTimer('DOM更新', 'render', 'dom');
    const rowFragment = document.createDocumentFragment();
    const cardFragment = document.createDocumentFragment();
    sortedProducts.forEach((product) => {
      rowFragment.appendChild(buildTableRowElement(product));
      cardFragment.appendChild(buildCardElement(product));
    });

    listView.tableBody.textContent = '';
    listView.cardsContainer.textContent = '';
    listView.tableBody.appendChild(rowFragment);
    listView.cardsContainer.appendChild(cardFragment);
    listView.isEmpty = false;
    updateSelectionControls();
    endDomTimer();
    endRenderTimer();
  }

  function rerenderActiveListPreservingScroll() {
    if (!isListActive()) return;
    const beforeY = window.scrollY;
    const tableScrollLeft = listView.tableWrap ? listView.tableWrap.scrollLeft : 0;

    renderList();

    if (listView.tableWrap) listView.tableWrap.scrollLeft = tableScrollLeft;
    window.scrollTo(0, beforeY);
  }

  function upsertProductCache(product) {
    const productId = String(product.id);
    productsById.set(productId, { ...product, id: productId });
    rebuildDerivedCachesFromMap();
  }

  function removeProductFromCache(id) {
    const targetId = String(id);
    productsById.delete(targetId);
    rebuildDerivedCachesFromMap();
  }

  function removeProductsFromCache(ids) {
    ids.forEach((id) => productsById.delete(String(id)));
    rebuildDerivedCachesFromMap();
  }

  function updateSelectionControls() {
    const count = selectedProductIds.size;
    elements.deleteSelectedButton.disabled = count === 0;
    elements.deleteSelectedButton.textContent = count ? `選択削除（${count}件）` : '選択削除';
    elements.deleteAllButton.disabled = sortedProductIds.length === 0;
    elements.selectAllButton.textContent = sortedProductIds.length && sortedProductIds.every((id) => selectedProductIds.has(id)) ? '選択解除' : '全選択';
  }

  function setRecordActionsDisabled(id, disabled) {
    if (!isListActive()) return;
    const targetId = String(id);
    const controls = elements.listContainer.querySelectorAll(`button[data-id="${targetId}"]`);
    controls.forEach((button) => {
      button.disabled = disabled;
    });
  }

  // 新規追加時: ソート順の正しい位置に1行だけ挿入します。
  function appendProductToList(product) {
    const endTimer = startPerfTimer('DOM更新:登録差分', 'render', 'domPatch');
    try {
      if (!isListActive()) return;
      if (listView.isEmpty || !listView.tableBody || !listView.cardsContainer) ensureListStructure();
      if (!listView.tableBody || !listView.cardsContainer) return;

      const newTr = buildTableRowElement(product);
      const newCard = buildCardElement(product);
      const nextId = getNextProductId(product.id);
      const nextTr = nextId ? listView.tableBody.querySelector(`tr[data-id="${nextId}"]`) : null;
      const nextCard = nextId ? listView.cardsContainer.querySelector(`article[data-id="${nextId}"]`) : null;

      listView.tableBody.insertBefore(newTr, nextTr || null);
      listView.cardsContainer.insertBefore(newCard, nextCard || null);
      listView.isEmpty = false;
      updateSelectionControls();
    } finally {
      endTimer();
    }
  }

  // 削除時: 対象行だけ取り除き、空なら空表示へ切り替えます。
  function removeProductFromList(id) {
    const endTimer = startPerfTimer('DOM更新:削除差分', 'render', 'domPatch');
    try {
      if (!isListActive()) return;
      if (!listView.tableBody || !listView.cardsContainer) return;
      const tr = listView.tableBody.querySelector(`tr[data-id="${id}"]`);
      const card = listView.cardsContainer.querySelector(`article[data-id="${id}"]`);
      if (tr) tr.remove();
      if (card) card.remove();
      selectedProductIds.delete(String(id));
      if (!listView.tableBody.firstElementChild) {
        elements.listContainer.innerHTML = '<div class="empty-card"><h3>まだ登録データがありません</h3><p>新規登録から入荷情報を登録してください。</p></div>';
        listView.isEmpty = true;
        resetListViewReferences();
      }
      updateSelectionControls();
    } finally {
      endTimer();
    }
  }

  // 編集時: 対象行だけ置換し、必要時は行を移動して並び順だけ調整します。
  function updateProductInList(product) {
    const endTimer = startPerfTimer('DOM更新:編集差分', 'render', 'domPatch');
    try {
      if (!isListActive()) return;
      if (listView.isEmpty || !listView.tableBody || !listView.cardsContainer) {
        appendProductToList(product);
        return;
      }

      const id = String(product.id);
      const existingTr = listView.tableBody.querySelector(`tr[data-id="${id}"]`);
      const existingCard = listView.cardsContainer.querySelector(`article[data-id="${id}"]`);
      if (!existingTr || !existingCard) {
        appendProductToList(product);
        return;
      }

      const nextId = getNextProductId(id);
      const nextTr = nextId ? listView.tableBody.querySelector(`tr[data-id="${nextId}"]`) : null;
      const nextCard = nextId ? listView.cardsContainer.querySelector(`article[data-id="${nextId}"]`) : null;

      const newTr = buildTableRowElement(product);
      const newCard = buildCardElement(product);
      existingTr.replaceWith(newTr);
      existingCard.replaceWith(newCard);

      listView.tableBody.insertBefore(newTr, nextTr || null);
      listView.cardsContainer.insertBefore(newCard, nextCard || null);
    } finally {
      endTimer();
    }
  }

  function showListError(message) {
    elements.listContainer.innerHTML = `<div class="empty-card"><h3>Googleとの通信に失敗しました</h3><p>${escapeHtml(message)} 接続設定とネットワークを確認してください。</p></div>`;
    listView.isEmpty = true;
    resetListViewReferences();
  }

  // 全件取得は起動時・手動更新時のみ実行します。
  async function refreshProducts() {
    let fetchTimerEnd = null;
    try {
      fetchTimerEnd = startPerfTimer('fetch開始:get', 'network', 'fetch');
      setProductsCache(await database.getProducts(), { commit: true });
      fetchTimerEnd();
      renderList();
      global.PrintManager.renderPrintPreview(productsCache);
    } catch (error) {
      if (fetchTimerEnd) fetchTimerEnd();
      console.error(error);
      showListError(error.message);
      global.PrintManager.renderPrintError(error.message);
    }
  }

  function resetForm(clearDraft = true) {
    editingId = null;
    setFormData({ ...config.defaultForm, arrivalDate: todayValue() });
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
      arrivalDate: todayValue(),
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
    const endTotalTimer = startPerfTimer('編集開始', 'edit', 'total');
    try {
      const product = productsById.get(String(id));
      if (!product) throw new Error('編集対象のデータが見つかりません。');
      editingId = id;
      setFormData(product);
      elements.submitButton.textContent = '更新';
      elements.formHeading.textContent = MESSAGES.editHeading;
      await showTab('register');
    } catch (error) {
      showListError(error.message);
    } finally {
      endTotalTimer();
    }
  }

  async function removeProduct(id) {
    if (!window.confirm('削除しますか？')) return;
    if (deletePendingIds.has(String(id))) return;
    const endTotalTimer = startPerfTimer('削除開始', 'delete', 'total');

    const target = productsById.get(String(id));
    if (!target) {
      showListError('削除対象のデータが見つかりません。');
      endTotalTimer();
      return;
    }

    deletePendingIds.add(String(id));
    setRecordActionsDisabled(id, true);

    removeProductFromCache(id);
    if (editingId === id) resetForm();
    removeProductFromList(id);
    global.PrintManager.renderPrintPreview(productsCache);

    let fetchTimerEnd = null;
    try {
      fetchTimerEnd = startPerfTimer('削除:fetch開始', 'delete', 'fetch');
      await database.deleteProduct(id);
      fetchTimerEnd();
      selectedProductIds.clear();
      await refreshProducts();
      showToast('削除しました');
    } catch (error) {
      if (fetchTimerEnd) fetchTimerEnd();
      rollbackToCommittedCache();
      elements.saveMessage.textContent = `削除に失敗しました。${error.message}`;
    } finally {
      deletePendingIds.delete(String(id));
      setRecordActionsDisabled(id, false);
      endTotalTimer();
    }
  }

  async function removeProducts(ids, confirmationMessage) {
    if (!ids.length) {
      showToast('削除する商品がありません');
      return;
    }
    if (!window.confirm(confirmationMessage)) return;

    ids.forEach((id) => deletePendingIds.add(id));
    removeProductsFromCache(ids);
    ids.forEach((id) => removeProductFromList(id));
    global.PrintManager.renderPrintPreview(productsCache);

    try {
      const deletedIds = await database.deleteProducts(ids);
      if (deletedIds.length !== ids.length) throw new Error('一部の商品を削除できませんでした。');
      selectedProductIds.clear();
      await refreshProducts();
      showToast(`${ids.length}件を削除しました`);
    } catch (error) {
      rollbackToCommittedCache();
      elements.saveMessage.textContent = `削除に失敗しました。${error.message}`;
    } finally {
      ids.forEach((id) => deletePendingIds.delete(id));
    }
  }

  async function removeSelectedProducts() {
    const ids = Array.from(selectedProductIds).filter((id) => productsById.has(id));
    await removeProducts(ids, `選択した${ids.length}件の商品を削除しますか？`);
  }

  async function removeAllProducts() {
    const ids = sortedProductIds.slice();
    await removeProducts(ids, `現在一覧に表示されている${ids.length}件の商品を削除しますか？`);
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
        arrivalDate: todayValue(),
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
    if (submitPending) return;

    const isEditing = Boolean(editingId);
    const scope = isEditing ? 'edit' : 'register';
    const endTotalTimer = startPerfTimer(isEditing ? '編集開始' : '登録開始', scope, 'total');

    const formData = getFormData();
    const validationMessage = validateProduct(formData);
    if (validationMessage) {
      elements.saveMessage.textContent = validationMessage;
      endTotalTimer();
      return;
    }

    const product = { ...formData, ...calc.calculateCosts(formData) };
    const nowIso = new Date().toISOString();
    const optimisticId = isEditing ? String(editingId) : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previousEditingProduct = isEditing ? productsById.get(String(editingId)) : null;
    const optimisticProduct = {
      ...(previousEditingProduct || {}),
      ...product,
      id: optimisticId,
      createdAt: previousEditingProduct?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    submitPending = true;
    elements.submitButton.disabled = true;
    let fetchTimerEnd = null;

    const endDomTimer = startPerfTimer(isEditing ? '編集:DOM更新' : '登録:DOM更新', scope, 'dom');
    upsertProductCache(optimisticProduct);
    if (isEditing) {
      updateProductInList(optimisticProduct);
    } else {
      appendProductToList(optimisticProduct);
    }
    global.PrintManager.renderPrintPreview(productsCache);
    endDomTimer();

    try {
      if (isEditing) {
        fetchTimerEnd = startPerfTimer('編集:fetch開始', scope, 'fetch');
        const savedProduct = await database.updateProduct(editingId, product);
        fetchTimerEnd();
        upsertProductCache(savedProduct);
        updateProductInList(savedProduct);
        commitCurrentCache();
        global.PrintManager.renderPrintPreview(productsCache);
      } else {
        fetchTimerEnd = startPerfTimer('登録:fetch開始', scope, 'fetch');
        const savedProduct = await database.addProduct(product);
        fetchTimerEnd();
        removeProductFromCache(optimisticId);
        removeProductFromList(optimisticId);
        upsertProductCache(savedProduct);
        appendProductToList(savedProduct);
        commitCurrentCache();
        global.PrintManager.renderPrintPreview(productsCache);
      }

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
      if (fetchTimerEnd) fetchTimerEnd();
      rollbackToCommittedCache();
      if (isEditing && previousEditingProduct) {
        editingId = previousEditingProduct.id;
      }
      elements.saveMessage.textContent = `保存に失敗しました。${error.message}`;
    } finally {
      submitPending = false;
      elements.submitButton.disabled = false;
      endTotalTimer();
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
    elements.selectAllButton?.addEventListener('click', () => {
      const shouldSelect = !sortedProductIds.every((id) => selectedProductIds.has(id));
      sortedProductIds.forEach((id) => {
        if (shouldSelect) selectedProductIds.add(id);
        else selectedProductIds.delete(id);
      });
      elements.listContainer.querySelectorAll('[data-select-id]').forEach((input) => {
        input.checked = selectedProductIds.has(input.dataset.selectId);
      });
      updateSelectionControls();
    });
    elements.deleteSelectedButton?.addEventListener('click', () => { void removeSelectedProducts(); });
    elements.deleteAllButton?.addEventListener('click', () => { void removeAllProducts(); });
    elements.listContainer.addEventListener('click', (event) => {
      if (event.target.closest('.record-check, .record-select')) return;
      const button = event.target.closest('[data-action]');
      if (button) {
        if (button.dataset.action === 'edit') void startEdit(button.dataset.id);
        if (button.dataset.action === 'delete') void removeProduct(button.dataset.id);
        return;
      }
      const card = event.target.closest('.record-card');
      if (card) void startEdit(card.dataset.id);
    });
    elements.listContainer.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-select-id]');
      if (!checkbox) return;
      const id = checkbox.dataset.selectId;
      if (checkbox.checked) selectedProductIds.add(id);
      else selectedProductIds.delete(id);
      elements.listContainer.querySelectorAll(`[data-select-id="${id}"]`).forEach((input) => { input.checked = checkbox.checked; });
      updateSelectionControls();
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
