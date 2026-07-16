(function (global) {
  const EXPENSE_MULTIPLIER = Number(global.APP_CONFIG?.calculation?.expenseMultiplier) || 1.1;

  function parseNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function roundCurrency(value) {
    return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
  }

  // 入力形式（kg原価/ケース原価）に関わらず、表示に必要な原価を一括計算します。
  function calculateCosts(record) {
    const cost = parseNumber(record.cost);
    const kgCount = parseNumber(record.kgCount);
    const tailCount = parseNumber(record.tailCount);

    let caseCost = null;
    if (cost !== null) {
      caseCost = record.costType === 'kg' && kgCount !== null ? roundCurrency(cost * kgCount) : cost;
    }

    const expenseCost = caseCost !== null ? roundCurrency(caseCost * EXPENSE_MULTIPLIER) : null;
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

  // 既存呼び出しとの互換性維持のため calculateRecord も残します。
  global.Calc = { calculateCosts, calculateRecord: calculateCosts, formatCurrency };
})(window);
