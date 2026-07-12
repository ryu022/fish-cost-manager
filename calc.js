(function (global) {
  function parseNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function roundCurrency(value) {
    return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
  }

  function calculateRecord(record) {
    const cost = parseNumber(record.cost);
    const kgCount = parseNumber(record.kgCount);
    const tailCount = parseNumber(record.tailCount);

    let caseCost = null;
    if (cost !== null) {
      caseCost = record.costType === 'kg' && kgCount !== null ? roundCurrency(cost * kgCount) : cost;
    }

    const expenseCost = caseCost !== null ? roundCurrency(caseCost * 1.1) : null;
    const oneFishCost = expenseCost !== null && tailCount !== null && tailCount > 0
      ? roundCurrency(expenseCost / tailCount)
      : null;

    return { caseCost, expenseCost, oneFishCost };
  }

  function formatCurrency(value) {
    return value === null || value === undefined || Number.isNaN(value)
      ? '—'
      : `${Number(value).toLocaleString('ja-JP')}円`;
  }

  global.Calc = { calculateRecord, formatCurrency };
})(window);
