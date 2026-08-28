const fs = require('fs');
const assert = require('assert');

global.window = global;
global.performance = { now: () => Date.now() };

const printContainer = {
  _html: '',
  set innerHTML(val) {
    this._html = val;
  },
  get innerHTML() {
    return this._html;
  }
};

global.document = {
  getElementById: (id) => {
    if (id === 'printPreview') return printContainer;
    return null;
  }
};

require('./config.js');
require('./calc.js');
require('./print.js');

const record = {
  id: '1',
  priority: 'low',
  arrivalDate: '2026-07-12',
  origin: '北海道',
  productName: '鮭',
  standard: 'kg',
  expenseCost: 3300,
  kgCount: 10,
  oneFishCost: null,
  comment: 'テストコメント'
};

window.PrintManager.renderPrintPreview([record]);

const html = printContainer.innerHTML;
console.log('--- Rendered HTML ---');
console.log(html);

assert(!html.includes('ケース原価'), 'HTML contains ケース原価!');

const colRowReg = /<tr class="print-column-row">([\s\S]*?)<\/tr>/;
const colRowMatch = html.match(colRowReg);
assert(colRowMatch, 'Could not find print-column-row!');
const thCount = (colRowMatch[1].match(/<th/g) || []).length;
assert.strictEqual(thCount, 8, Column header row th count should be 8, got \);

const titleColspanMatch = html.match(/<th[^>]*colspan="8"[^>]*>/i);
assert(titleColspanMatch, 'Could not find <th colspan="8"> in title row!');

const emptyColspanMatch = html.match(/<td colspan="8">/) || html.match(/colspan="8"/);
assert(emptyColspanMatch, 'Could not find empty data colspan="8"!');

const tbodyReg = /<tbody>([\s\S]*?)<\/tbody>/;
const tbodyMatch = html.match(tbodyReg);
assert(tbodyMatch, 'Could not find <tbody>!');
const trMatch = tbodyMatch[1].match(/<tr>([\s\S]*?)<\/tr>/);
assert(trMatch, 'Could not find data row inside tbody!');
const tds = trMatch[1].match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
assert.strictEqual(tds.length, 8, Data row cell count should be 8, got \);

const cleanedTds = tds.map(td => td.replace(/<[^>]*>/g, '').trim());
console.log('Cleaned TD internal contents:', cleanedTds);

assert.strictEqual(cleanedTds[5], '330円', Expected '330円' at 経費込原価 position (index 5), got '\');

console.log('SUCCESS: All assertions passed!');
