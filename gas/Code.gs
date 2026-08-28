function doGet(event) {
  const startedAt = Date.now();
  const action = event.parameter.action || 'get';
  if (action !== 'get') return jsonResponse_(false, null, '未対応の操作です。');

  try {
    const dataStartedAt = Date.now();
    const data = getProducts_();
    Logger.log(`[doGet] データ検索 ${Date.now() - dataStartedAt}ms`);
    return jsonResponse_(true, data, null, collectResponseTiming_(startedAt));
  } catch (error) {
    Logger.log(`[doGet] error=${error.message}`);
    return jsonResponse_(false, null, error.message);
  }
}

function doPost(event) {
  const startedAt = Date.now();
  try {
    const request = JSON.parse(event.postData.contents || '{}');
    const action = request.action;
    const product = request.payload || {};
    const now = new Date();

    const sheetStartedAt = Date.now();
    const sheet = getProductsSheet_();
    const lastRow = sheet.getLastRow();
    Logger.log(`[${action}] シート取得 ${Date.now() - sheetStartedAt}ms`);

    if (action === 'get') {
      const dataStartedAt = Date.now();
      const data = getProducts_();
      Logger.log(`[${action}] データ検索 ${Date.now() - dataStartedAt}ms`);
      return jsonResponse_(true, data, null, collectResponseTiming_(startedAt));
    }

    if (action === 'add') {
      const writeStartedAt = Date.now();
      const id = Utilities.getUuid();
      const values = productToRow_(product, id, now, now, false);
      const row = appendProductRow_(sheet, values);
      upsertProductStateCache_(rowToProduct_(values), row, sheet);
      Logger.log(`[${action}] 書き込み ${Date.now() - writeStartedAt}ms`);
      return jsonResponse_(true, rowToProduct_(values), null, collectResponseTiming_(startedAt));
    }

    if (action === 'update') {
      if (!product.id) return jsonResponse_(false, null, 'IDが指定されていません。');
      const searchStartedAt = Date.now();
      const row = findProductRow_(sheet, product.id, lastRow);
      Logger.log(`[${action}] データ検索 ${Date.now() - searchStartedAt}ms`);
      if (row === -1) return jsonResponse_(false, null, '更新対象が見つかりません。');

      const writeStartedAt = Date.now();
      const existingProduct = getCachedProductById_(product.id) || getProducts_().find((item) => String(item.id) === String(product.id));
      if (!existingProduct) return jsonResponse_(false, null, '更新対象が見つかりません。');
      const createdAt = existingProduct.createdAt;
      const values = productToRow_(product, product.id, createdAt, now, false);
      sheet.getRange(row, 1, 1, PRODUCTS_COLUMN_COUNT).setValues([values]);
      upsertProductStateCache_(rowToProduct_(values), row, sheet);
      Logger.log(`[${action}] 書き込み ${Date.now() - writeStartedAt}ms`);
      return jsonResponse_(true, rowToProduct_(values), null, collectResponseTiming_(startedAt));
    }

    if (action === 'delete') {
      if (!product.id) return jsonResponse_(false, null, 'IDが指定されていません。');
      const searchStartedAt = Date.now();
      const row = findProductRow_(sheet, product.id, lastRow);
      Logger.log(`[${action}] データ検索 ${Date.now() - searchStartedAt}ms`);
      if (row === -1) return jsonResponse_(false, null, '削除対象が見つかりません。');

      const writeStartedAt = Date.now();
      sheet.getRange(row, PRODUCTS_COLUMN_COUNT, 1, 1).setValues([[true]]);
      deleteProductStateCache_(product.id, sheet);
      Logger.log(`[${action}] 書き込み ${Date.now() - writeStartedAt}ms`);
      return jsonResponse_(true, { id: product.id }, null, collectResponseTiming_(startedAt));
    }

    if (action === 'deleteMultiple') {
      const ids = Array.isArray(product.ids) ? [...new Set(product.ids.map(String).filter(Boolean))] : [];
      if (!ids.length) return jsonResponse_(false, null, '削除対象が指定されていません。');

      const searchStartedAt = Date.now();
      const rows = ids.map((id) => ({ id, row: findProductRow_(sheet, id, lastRow) }));
      Logger.log(`[${action}] データ検索 ${Date.now() - searchStartedAt}ms`);
      if (rows.some((item) => item.row === -1)) return jsonResponse_(false, null, '削除対象が見つかりません。');

      const writeStartedAt = Date.now();
      sheet.getRangeList(rows.map((item) => `${sheet.getRange(item.row, PRODUCTS_COLUMN_COUNT).getA1Notation()}`)).setValue(true);
      deleteProductsStateCache_(ids, sheet);
      Logger.log(`[${action}] 書き込み ${Date.now() - writeStartedAt}ms`);
      return jsonResponse_(true, ids, null, collectResponseTiming_(startedAt));
    }

    return jsonResponse_(false, null, '未対応の操作です。');
  } catch (error) {
    Logger.log(`[doPost] error=${error.message}`);
    return jsonResponse_(false, null, error.message);
  }
}
