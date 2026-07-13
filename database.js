(function (global) {
  const APP_CONFIG = global.APP_CONFIG;

  function cloneDefaultDraft() {
    return { ...APP_CONFIG.defaultForm };
  }

  function normalizeStandard(standard) {
    if (standard === '尾' || standard === 'P' || standard === '尾/P' || standard === 'tailP') return 'tailP';
    if (standard === 'kg') return 'kg';
    if (standard === 'c/s') return 'c/s';
    return APP_CONFIG.defaultForm.standard;
  }

  function normalizeProduct(data) {
    const source = data && typeof data === 'object' ? data : {};
    return {
      id: source.id || '',
      createdAt: source.createdAt || '',
      updatedAt: source.updatedAt || '',
      origin: source.origin || '',
      productName: source.productName || '',
      standard: normalizeStandard(source.standard),
      cost: source.cost ?? '',
      costType: source.costType === 'case' ? 'case' : 'kg',
      kgCount: source.kgCount ?? '',
      tailCount: source.tailCount ?? '',
      arrivalDate: source.arrivalDate || APP_CONFIG.defaultForm.arrivalDate,
      priority: APP_CONFIG.priorityOptions.some((item) => item.value === source.priority) ? source.priority : 'low',
      comment: source.comment || '',
      caseCost: source.caseCost ?? null,
      expenseCost: source.expenseCost ?? null,
      oneFishCost: source.oneFishCost ?? null,
    };
  }

  function getApiUrl() {
    const apiUrl = APP_CONFIG.apiUrl?.trim();
    if (!apiUrl || apiUrl === 'PASTE_YOUR_GAS_WEB_APP_URL_HERE') {
      throw new Error('config.js にGASウェブアプリのURLを設定してください。');
    }
    return apiUrl;
  }

  async function request(action, payload) {
    const apiUrl = getApiUrl();
    const options = action === 'get'
      ? { method: 'GET' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, payload }),
        };
    const url = action === 'get' ? `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}action=get` : apiUrl;
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`通信に失敗しました（${response.status}）。`);

    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'データの処理に失敗しました。');
    return result.data;
  }

  async function getProducts() {
    const products = await request('get');
    return Array.isArray(products) ? products.map(normalizeProduct) : [];
  }

  async function addProduct(product) {
    return normalizeProduct(await request('add', normalizeProduct(product)));
  }

  async function updateProduct(id, product) {
    return normalizeProduct(await request('update', { ...normalizeProduct(product), id }));
  }

  async function deleteProduct(id) {
    await request('delete', { id });
  }

  // 下書きだけは、各端末で入力を復元するためにlocalStorageへ保存します。
  function getDraft() {
    try {
      const savedDraft = JSON.parse(localStorage.getItem(APP_CONFIG.storageKeys.draft) || 'null');
      return { ...cloneDefaultDraft(), ...normalizeProduct(savedDraft) };
    } catch (error) {
      console.error('下書きの復元に失敗しました。', error);
      return cloneDefaultDraft();
    }
  }

  function saveDraft(draft) {
    localStorage.setItem(APP_CONFIG.storageKeys.draft, JSON.stringify(normalizeProduct(draft)));
  }

  function clearDraft() {
    localStorage.removeItem(APP_CONFIG.storageKeys.draft);
  }

  global.Database = { getProducts, addProduct, updateProduct, deleteProduct, getDraft, saveDraft, clearDraft };
})(window);
