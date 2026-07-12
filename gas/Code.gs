function doGet(event) {
  const action = event.parameter.action || 'get';
  if (action !== 'get') return jsonResponse_(false, null, '未対応の操作です。');

  try {
    return jsonResponse_(true, getProducts_());
  } catch (error) {
    return jsonResponse_(false, null, error.message);
  }
}

function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents || '{}');
    const action = request.action;
    const product = request.payload || {};
    const sheet = getProductsSheet_();
    const now = new Date();

    if (action === 'get') return jsonResponse_(true, getProducts_());

    if (action === 'add') {
      const id = Utilities.getUuid();
      sheet.appendRow(productToRow_(product, id, now, now));
      return jsonResponse_(true, rowToProduct_(productToRow_(product, id, now, now)));
    }

    if (action === 'update') {
      if (!product.id) return jsonResponse_(false, null, 'IDが指定されていません。');
      const row = findProductRow_(product.id);
      if (row === -1) return jsonResponse_(false, null, '更新対象が見つかりません。');

      const createdAt = sheet.getRange(row, 2).getValue();
      const values = productToRow_(product, product.id, createdAt, now);
      sheet.getRange(row, 1, 1, PRODUCTS_HEADERS.length).setValues([values]);
      return jsonResponse_(true, rowToProduct_(values));
    }

    if (action === 'delete') {
      if (!product.id) return jsonResponse_(false, null, 'IDが指定されていません。');
      const row = findProductRow_(product.id);
      if (row === -1) return jsonResponse_(false, null, '削除対象が見つかりません。');

      sheet.deleteRow(row);
      return jsonResponse_(true, { id: product.id });
    }

    return jsonResponse_(false, null, '未対応の操作です。');
  } catch (error) {
    return jsonResponse_(false, null, error.message);
  }
}
