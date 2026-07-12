(function (global) {
  const { formatCurrency } = global.Calc;
  const priorities = global.APP_CONFIG.priorityOptions;

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

  function buildPrintRows(records) {
    return sortRecords(records).map((record) => `
      <tr>
        <td class="print-priority">${getPriority(record.priority).mark}</td>
        <td>${record.arrivalDate || '—'}</td>
        <td>${record.origin || '—'}</td>
        <td>${record.productName || '—'}</td>
        <td>${record.standard || '—'}</td>
        <td>${formatCurrency(record.caseCost)}</td>
        <td>${formatCurrency(record.expenseCost)}</td>
        <td>${formatCurrency(record.oneFishCost)}</td>
        <td>${record.comment || '—'}</td>
      </tr>
    `).join('');
  }

  function renderPrintPreview(records) {
    const container = document.getElementById('printPreview');
    if (!container) return;

    const rows = buildPrintRows(records);
    container.innerHTML = `
      <div class="print-sheet">
        <div class="print-header">
          <h2>鮮魚原価・入荷管理 一覧印刷</h2>
          <p>印刷日: ${new Date().toLocaleDateString('ja-JP')}</p>
        </div>
        <table class="print-table">
          <thead><tr><th>優先</th><th>入荷日</th><th>産地</th><th>品名</th><th>規格</th><th>ケース原価</th><th>経費込み原価</th><th>1尾原価</th><th>コメント</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="9">印刷対象のデータがありません。</td></tr>'}</tbody>
        </table>
        <footer class="print-footer">印刷日時: ${new Date().toLocaleString('ja-JP')} <span>｜</span> ページ <span class="page-number"></span></footer>
      </div>
    `;
  }

  function renderPrintError(message) {
    const container = document.getElementById('printPreview');
    if (!container) return;
    const safeMessage = String(message).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
    container.innerHTML = `<div class="empty-card"><h3>印刷データを取得できませんでした</h3><p>${safeMessage}</p></div>`;
  }

  async function printCurrentProducts() {
    try {
      renderPrintPreview(await global.Database.getProducts());
      window.print();
    } catch (error) {
      renderPrintError(error.message);
    }
  }

  global.PrintManager = { renderPrintPreview, renderPrintError, printCurrentProducts };
})(window);
