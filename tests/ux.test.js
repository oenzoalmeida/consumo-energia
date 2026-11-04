const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const page = readFileSync('index.html', 'utf8');

test('energy cost input explains tariff in accessible language', () => {
  assert.match(page, /Preço da energia \(R\$ por kWh\)/);
  assert.match(page, /id="tarifa"\s+aria-describedby="ajuda-tarifa"/);
  assert.match(page, /id="ajuda-tarifa"/);
  assert.match(page, /na sua conta de luz/);
});

test('appliance power has an explanation linked to its field', () => {
  assert.match(page, /Potência do aparelho \(watts\)/);
  assert.match(page, /id="potencia"\s+aria-describedby="ajuda-potencia"/);
  assert.match(page, /id="ajuda-potencia"/);
});

test('savings action uses plain language without altering input IDs', () => {
  assert.match(page, /Quanto você poderia economizar\?/);
  assert.match(page, /id="percentual-economia"/);
  assert.match(page, /id="botao-comparar"/);
});
