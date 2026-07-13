const PRODUCTS_SHEET_NAME = 'Products';
const PRODUCTS_HEADERS = [
  'ID', '登録日時', '更新日時', '入荷日', '優先度', '産地', '品名', '規格',
  'kg数', '原価区分', '原価', '経費込み原価', 'ケース原価', '1尾（P）', '尾数', 'コメント',
];

function getProductsSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(PRODUCTS_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(PRODUCTS_SHEET_NAME);
    sheet.getRange(1, 1, 1, PRODUCTS_HEADERS.length).setValues([PRODUCTS_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function getProducts_() {
  const sheet = getProductsSheet_();
  if (sheet.getLastRow() < 2) return [];

  return sheet.getRange(2, 1, sheet.getLastRow() - 1, PRODUCTS_HEADERS.length)
    .getValues()
    .map(rowToProduct_)
    .filter(product => product.id);
}

function findProductRow_(id) {
  const sheet = getProductsSheet_();
  if (sheet.getLastRow() < 2) return -1;

  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  const index = ids.indexOf(id);
  return index === -1 ? -1 : index + 2;
}

function productToRow_(product, id, createdAt, updatedAt) {
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
  ];
}

function rowToProduct_(row) {
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

function jsonResponse_(success, data, message) {
  return ContentService.createTextOutput(JSON.stringify({ success, data, message }))
    .setMimeType(ContentService.MimeType.JSON);
}
