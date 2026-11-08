// A interface servida pelo backend (backend/public) deve ser idêntica à da raiz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const files = ['index.html', 'admin.html', 'auth.js', 'calc.js', 'script.js', 'style.css', 'privacidade.html', 'termos.html', '404.html', 'og-image.png', 'robots.txt', 'sitemap.xml'];
const root = path.join(__dirname, '..');

for (const f of files) {
  test(`backend/public/${f} está sincronizado com a raiz`, () => {
    assert.ok(fs.readFileSync(path.join(root, f)).equals(fs.readFileSync(path.join(root, 'backend', 'public', f))),
      'rode: node backend/scripts/sync-public.mjs');
  });
}

test('interface usa a mesma origem da API', () => {
  assert.match(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), /const API = '';/);
  assert.match(fs.readFileSync(path.join(root, 'admin.html'), 'utf8'), /const API='';/);
});
