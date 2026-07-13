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

  function calculateOneFishDisplayValue(record, standard) {
    const expenseCost = parseCurrencyValue(record.expenseCost);
    const tailCount = parseCurrencyValue(record.tailCount);

    if (standard === 'c/s') return null;
    if (standard === 'tailP') return expenseCost;
    if (standard === 'kg') {
      if (expenseCost === null || tailCount === null || tailCount <= 0) return null;
      return Math.round(((expenseCost / tailCount) + Number.EPSILON) * 100) / 100;
    }
    return parseCurrencyValue(record.oneFishCost);
  }

  function buildPrintRows(records) {
    return sortRecords(records).map((record) => {
      const standard = normalizeStandard(record.standard);
      const caseCost = standard === 'tailP' ? '' : formatCurrency(record.caseCost);
      const oneFishCost = formatCurrencyOrBlank(calculateOneFishDisplayValue(record, standard));

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

  function renderPrintPreview(records) {
    const container = document.getElementById('printPreview');
    if (!container) return;

    const rows = buildPrintRows(records);
    const printDate = new Date().toLocaleDateString('ja-JP');
    container.innerHTML = `
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
