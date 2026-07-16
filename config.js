(function (global) {
  const today = new Date().toISOString().slice(0, 10);

  global.APP_CONFIG = {
    // GAS をウェブアプリとしてデプロイ後、このURLだけを差し替えてください。
    apiUrl: 'https://script.google.com/macros/s/AKfycbxHFNfZaTbbwzsVKeyLbthfxHoFTxSg8os9OZt580qNMRZEctJsjipRSgpr3wzWgdBV/exec',
    storageKeys: {
      draft: 'fish-cost-manager.draft',
    },
    calculation: {
      expenseMultiplier: 1.1,
    },
    costTypes: ['kg', 'case'],
    defaultForm: {
      origin: '',
      productName: '',
      standard: 'tailP',
      cost: '',
      costType: 'case',
      kgCount: '',
      tailCount: '',
      arrivalDate: today,
      priority: 'low',
      comment: '',
    },
    standards: ['kg', 'tailP', 'c/s', '尾', 'P', '尾/P'],
    priorityOptions: [
      { value: 'high', mark: '▲', name: '高', className: 'priority-red' },
      { value: 'medium', mark: '■', name: '中', className: 'priority-yellow' },
      { value: 'low', mark: '●', name: '低', className: 'priority-blue' },
    ],
  };
})(window);
