const PRODUCTS_SHEET_NAME = 'Products';
const PRODUCTS_HEADERS = [
  'ID', '登録日時', '更新日時', '入荷日', '優先度', '産地', '品名', '規格',
  'kg数', '原価区分', '原価', '経費込み原価', 'ケース原価', '1尾（P）', '尾数', 'コメント', 'Deleted',
];
const PRODUCTS_COLUMN_COUNT = PRODUCTS_HEADERS.length;
const PRODUCTS_HEADER_ROW = 1;
const PRODUCTS_DATA_START_ROW = 2;
const PRODUCTS_CACHE_KEY = 'fish-cost-manager.products.v3';
const PRODUCT_ROW_CACHE_KEY = 'fish-cost-manager.product-row-map.v3';
const PRODUCTS_CACHE_TTL_SECONDS = 21600;

let cachedSpreadsheet_ = null;
let cachedSheet_ = null;

function getProductsSheet_() {
  if (cachedSheet_) return cachedSheet_;

  const spreadsheetStartedAt = Date.now();
  const spreadsheet = cachedSpreadsheet_ || (cachedSpreadsheet_ = SpreadsheetApp.getActiveSpreadsheet());
  let sheet = spreadsheet.getSheetByName(PRODUCTS_SHEET_NAME);
  Logger.log(`シート取得 ${Date.now() - spreadsheetStartedAt}ms`);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(PRODUCTS_SHEET_NAME);
    sheet.getRange(PRODUCTS_HEADER_ROW, 1, 1, PRODUCTS_COLUMN_COUNT).setValues([PRODUCTS_HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    ensureProductsSchema_(sheet);
  }

  cachedSheet_ = sheet;
  return cachedSheet_;
}

function getProducts_() {
  const cacheStartedAt = Date.now();
  const cachedProducts = readJsonCache_(PRODUCTS_CACHE_KEY);
  if (cachedProducts) {
    Logger.log(`データ検索 cache ${Date.now() - cacheStartedAt}ms`);
    return cachedProducts;
  }

  const sheet = getProductsSheet_();
  const loadStartedAt = Date.now();
  const state = loadProductsStateFromSheet_(sheet);
  Logger.log(`データ検索 sheet ${Date.now() - loadStartedAt}ms`);
  writeProductsStateCache_(state);
  return state.products;
}

function findProductRow_(sheet, id, lastRow) {
  if (lastRow < PRODUCTS_DATA_START_ROW) return -1;

  const cacheStartedAt = Date.now();
  const rowMap = readJsonCache_(PRODUCT_ROW_CACHE_KEY);
  if (rowMap && Object.prototype.hasOwnProperty.call(rowMap, String(id))) {
    Logger.log(`検索 cache ${Date.now() - cacheStartedAt}ms`);
    return rowMap[String(id)];
  }

  // キャッシュが無い場合だけシートを走査します。
  const searchStartedAt = Date.now();
  const idValues = sheet.getRange(PRODUCTS_DATA_START_ROW, 1, lastRow - PRODUCTS_DATA_START_ROW + 1, 1).getValues();
  const targetId = String(id);
  for (let index = 0; index < idValues.length; index += 1) {
    if (String(idValues[index][0] || '') === targetId) {
      const row = PRODUCTS_DATA_START_ROW + index;
      Logger.log(`検索 sheet ${Date.now() - searchStartedAt}ms`);
      cacheProductRow_(targetId, row);
      return row;
    }
  }
  Logger.log(`検索 sheet ${Date.now() - searchStartedAt}ms`);
  return -1;
}

function findProductRows_(sheet, ids, lastRow) {
  if (lastRow < PRODUCTS_DATA_START_ROW) return ids.map((id) => ({ id, row: -1 }));

  const targetIds = new Set(ids.map(String));
  const idValues = sheet.getRange(PRODUCTS_DATA_START_ROW, 1, lastRow - PRODUCTS_DATA_START_ROW + 1, 1).getValues();
  const rowsById = {};
  idValues.forEach((value, index) => {
    const id = String(value[0] || '');
    if (targetIds.has(id)) rowsById[id] = PRODUCTS_DATA_START_ROW + index;
  });
  return ids.map((id) => ({ id, row: rowsById[id] || -1 }));
}

function appendProductRow_(sheet, values) {
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, PRODUCTS_COLUMN_COUNT).setValues([values]);
  return row;
}

function collectResponseTiming_(startedAt) {
  const duration = Date.now() - startedAt;
  Logger.log(`レスポンス生成 ${duration}ms`);
  return [{ stage: 'response', duration }];
}

function productToRow_(product, id, createdAt, updatedAt, deleted) {
  return [
    id,
    createdAt,
    updatedAt,
    product.arrivalDate || '',
    product.priority || 'low',
    product.origin || '',
    product.productName || '',
    product.standard || '',
    product.kgCount || '',
    product.costType || '',
    product.cost ?? '',
    product.expenseCost ?? '',
    product.caseCost ?? '',
    product.oneFishCost ?? '',
    product.tailCount || '',
    product.comment || '',
    deleted ? true : false,
  ];
}

function rowToProduct_(row) {
  const deleted = String(row[16] || '').toLowerCase() === 'true' || row[16] === true;
  if (deleted) return null;
  return {
    id: String(row[0] || ''),
    createdAt: row[1] instanceof Date ? row[1].toISOString() : row[1],
    updatedAt: row[2] instanceof Date ? row[2].toISOString() : row[2],
    arrivalDate: row[3] instanceof Date ? Utilities.formatDate(row[3], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(row[3] || ''),
    priority: String(row[4] || 'low'),
    origin: String(row[5] || ''),
    productName: String(row[6] || ''),
    standard: String(row[7] || ''),
    kgCount: row[8] === '' ? '' : String(row[8]),
    costType: String(row[9] || 'kg'),
    cost: row[10] === '' ? '' : Number(row[10]),
    expenseCost: row[11] === '' ? null : Number(row[11]),
    caseCost: row[12] === '' ? null : Number(row[12]),
    oneFishCost: row[13] === '' ? null : Number(row[13]),
    tailCount: row[14] === '' ? '' : String(row[14]),
    comment: String(row[15] || ''),
  };
}

function buildProductsStateFromRows_(rows) {
  const products = [];
  const rowMap = {};
  rows.forEach((row, index) => {
    const product = rowToProduct_(row);
    if (!product) return;
    const rowNumber = PRODUCTS_DATA_START_ROW + index;
    rowMap[product.id] = rowNumber;
    products.push(product);
  });
  return { products, rowMap };
}

function loadProductsStateFromSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < PRODUCTS_DATA_START_ROW) {
    return { products: [], rowMap: {} };
  }

  // 一覧取得は必要列のみをまとめて取得します。
  const rows = sheet.getRange(PRODUCTS_DATA_START_ROW, 1, lastRow - PRODUCTS_DATA_START_ROW + 1, PRODUCTS_COLUMN_COUNT).getValues();
  return buildProductsStateFromRows_(rows);
}

function readJsonCache_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const value = cache.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function getProductsStateCache_() {
  const products = readJsonCache_(PRODUCTS_CACHE_KEY);
  const rowMap = readJsonCache_(PRODUCT_ROW_CACHE_KEY);
  if (!Array.isArray(products) || !rowMap || typeof rowMap !== 'object') return null;
  return { products, rowMap };
}

function writeJsonCache_(key, value) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 90000) return false;
    CacheService.getScriptCache().put(key, serialized, PRODUCTS_CACHE_TTL_SECONDS);
    return true;
  } catch (error) {
    return false;
  }
}

function writeProductsStateCache_(state) {
  writeJsonCache_(PRODUCTS_CACHE_KEY, state.products);
  writeJsonCache_(PRODUCT_ROW_CACHE_KEY, state.rowMap);
}

function upsertProductStateCache_(product, row, sheet) {
  const state = getProductsStateCache_() || (sheet ? loadProductsStateFromSheet_(sheet) : { products: [], rowMap: {} });
  const targetId = String(product.id);
  const existingIndex = state.products.findIndex((item) => String(item.id) === targetId);
  if (existingIndex >= 0) {
    state.products[existingIndex] = product;
  } else {
    state.products.push(product);
  }
  state.rowMap[targetId] = row;
  writeProductsStateCache_(state);
}

function deleteProductStateCache_(id, sheet) {
  const state = getProductsStateCache_() || (sheet ? loadProductsStateFromSheet_(sheet) : { products: [], rowMap: {} });
  const targetId = String(id);
  state.products = state.products.filter((item) => String(item.id) !== targetId);
  delete state.rowMap[targetId];
  writeProductsStateCache_(state);
}

function deleteProductsStateCache_(ids, sheet) {
  const state = getProductsStateCache_() || (sheet ? loadProductsStateFromSheet_(sheet) : { products: [], rowMap: {} });
  const targetIds = new Set(ids.map(String));
  state.products = state.products.filter((item) => !targetIds.has(String(item.id)));
  targetIds.forEach((id) => delete state.rowMap[id]);
  writeProductsStateCache_(state);
}

function getCachedProductById_(id) {
  const state = getProductsStateCache_();
  if (!state) return null;
  const targetId = String(id);
  return state.products.find((item) => String(item.id) === targetId) || null;
}

function cacheProductRow_(id, row) {
  const rowMap = readJsonCache_(PRODUCT_ROW_CACHE_KEY) || {};
  rowMap[String(id)] = row;
  writeJsonCache_(PRODUCT_ROW_CACHE_KEY, rowMap);
}

function invalidateProductsCache_() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(PRODUCTS_CACHE_KEY);
    cache.remove(PRODUCT_ROW_CACHE_KEY);
  } catch (error) {
    // Cache invalidation failure must not block CRUD.
  }
}

function ensureProductsSchema_(sheet) {
  const currentLastColumn = sheet.getLastColumn();
  if (currentLastColumn < PRODUCTS_COLUMN_COUNT) {
    sheet.insertColumnAfter(currentLastColumn);
    sheet.getRange(PRODUCTS_HEADER_ROW, 1, 1, PRODUCTS_COLUMN_COUNT).setValues([PRODUCTS_HEADERS]);
    return;
  }

  const headerValues = sheet.getRange(PRODUCTS_HEADER_ROW, 1, 1, PRODUCTS_COLUMN_COUNT).getValues()[0];
  if (String(headerValues[PRODUCTS_COLUMN_COUNT - 1] || '') !== 'Deleted') {
    sheet.getRange(PRODUCTS_HEADER_ROW, 1, 1, PRODUCTS_COLUMN_COUNT).setValues([PRODUCTS_HEADERS]);
  }
}

function jsonResponse_(success, data, message, timings) {
  return ContentService.createTextOutput(JSON.stringify({ success, data, message, timings: timings || [] }))
    .setMimeType(ContentService.MimeType.JSON);
}
