(function (global) {
  const { formatCurrency } = global.Calc;
  const priorities = global.APP_CONFIG.priorityOptions;
  const printContainer = document.getElementById('printPreview');

  let cachedRecords = [];
  let cachedRowsSignature = '';
  let cachedRowsHtml = '';

  function getPriority(priority) {
    return priorities.find((item) => item.value === priority) || priorities[2];
  }

  function sortRecords(records) {
    return records.slice().sort((a, b) => {
      const priorityDifference = priorities.indexOf(getPriority(a.priority)) - priorities.indexOf(getPriority(b.priority));
      if (priorityDifference) return priorityDifference;
      const arrivalDateDifference = new Date(a.arrivalDate) - new Date(b.arrivalDate);
      if (arrivalDateDifference) return arrivalDateDifference;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  }

  function standardLabel(standard) {
    return standard === '尾' || standard === 'P' || standard === '尾/P' || standard === 'tailP'
      ? '尾/P'
      : (standard || '—');
  }

  function normalizeStandard(standard) {
    if (standard === '尾' || standard === 'P' || standard === '尾/P' || standard === 'tailP') return 'tailP';
    if (standard === 'kg') return 'kg';
    if (standard === 'c/s') return 'c/s';
    return '';
  }

  function parseCurrencyValue(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatCurrencyOrBlank(value) {
    return value === null || value === undefined ? '' : formatCurrency(value);
  }

  // 一覧と同じ並び順で印刷データを構築します。
  function buildPrintRows(records) {
    return sortRecords(records).map((record) => {
      const standard = normalizeStandard(record.standard);
      const caseCost = standard === 'tailP' ? '' : formatCurrency(record.caseCost);
      const oneFishCost = formatCurrencyOrBlank(parseCurrencyValue(record.oneFishCost));

      return `
      <tr>
        <td class="print-priority">${getPriority(record.priority).mark}</td>
        <td>${record.arrivalDate || '—'}</td>
        <td>${record.origin || '—'}</td>
        <td>${record.productName || '—'}</td>
        <td>${standardLabel(record.standard)}</td>
        <td>${caseCost}</td>
        <td>${formatCurrency(record.expenseCost)}</td>
        <td>${oneFishCost}</td>
        <td>${record.comment || '—'}</td>
      </tr>
    `;
    }).join('');
  }

  function recordsSignature(records) {
    return records
      .map((record) => `${record.id}|${record.updatedAt || ''}|${record.arrivalDate || ''}`)
      .join('~');
  }

  function renderPrintPreview(records) {
    cachedRecords = records;
    if (!printContainer) return;

    const signature = recordsSignature(records);
    if (cachedRowsSignature !== signature) {
      console.time('描画:印刷HTML');
      cachedRowsHtml = buildPrintRows(records);
      cachedRowsSignature = signature;
      console.timeEnd('描画:印刷HTML');
    }

    const rows = cachedRowsHtml;
    const printDate = new Date().toLocaleDateString('ja-JP');
    printContainer.innerHTML = `
      <div class="print-sheet">
        <div class="print-header">
          <h2>鮮魚原価・入荷管理一覧</h2>
          <p>印刷日: ${printDate}</p>
          <p>ページ <span class="page-number"></span></p>
        </div>
        <table class="print-table">
          <colgroup>
            <col style="width: 5%;">
            <col style="width: 13%;">
            <col style="width: 12%;">
            <col style="width: 18%;">
            <col style="width: 8%;">
            <col style="width: 14%;">
            <col style="width: 14%;">
            <col style="width: 14%;">
            <col style="width: 22%;">
          </colgroup>
          <thead>
            <tr class="print-title-row">
              <th colspan="9">
                <div class="print-title-grid">
                  <span class="print-title-text">鮮魚原価・入荷管理一覧</span>
                  <span class="print-title-date">印刷日: ${printDate}</span>
                  <span class="print-title-page">ページ <span class="page-number"></span></span>
                </div>
              </th>
            </tr>
            <tr class="print-column-row">
              <th>優先</th>
              <th>入荷日</th>
              <th>産地</th>
              <th>品名</th>
              <th>規格</th>
              <th>ケース原価</th>
              <th>経費込原価</th>
              <th>1尾（P）</th>
              <th>コメント</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="9">印刷対象のデータがありません。</td></tr>'}</tbody>
        </table>
        <footer class="print-footer">印刷日時: ${new Date().toLocaleString('ja-JP')} <span>｜</span> ページ <span class="page-number"></span></footer>
      </div>
    `;
  }

  function renderPrintError(message) {
    if (!printContainer) return;
    const safeMessage = String(message).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
    printContainer.innerHTML = `<div class="empty-card"><h3>印刷データを取得できませんでした</h3><p>${safeMessage}</p></div>`;
  }

  // 印刷はキャッシュ済みデータを使い、DBへの再取得を行いません。
  function printCurrentProducts() {
    if (!printContainer?.innerHTML) renderPrintPreview(cachedRecords);
    window.print();
  }

  global.PrintManager = { renderPrintPreview, renderPrintError, printCurrentProducts };
})(window);
