// Concorrência otimista do cenário salvo (migration 003): PUT exige a versão
// em que o cliente se baseou; versão defasada vira 409 e nada é sobrescrito.
// Roda contra o Postgres do CI (schema do seed + migrations 001-003).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const { default: app } = await import('./server.js');
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => new Promise(resolve => server.close(resolve)));

async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}

async function freshUser() {
  const email = `versao-${randomUUID()}@example.com`;
  const r = await call('/api/auth/register', { method: 'POST', body: { name: 'Teste Versão', email, password: 'senha-super-longa-123' } });
  assert.equal(r.status, 201);
  return r.setCookie.split(';')[0];
}

test('GET devolve versão 0 sem cenário; primeiro PUT cria versão 1', async () => {
  const cookie = await freshUser();
  let r = await call('/api/data', { cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data, {});
  assert.equal(r.json.version, 0);
  r = await call('/api/data', { method: 'PUT', body: { data: { aparelhos: [{ nome: 'TV' }] }, baseVersion: 0 }, cookie });
  assert.equal(r.status, 200);
  assert.equal(r.json.version, 1);
  r = await call('/api/data', { cookie });
  assert.equal(r.json.version, 1);
  assert.equal(r.json.data.aparelhos[0].nome, 'TV');
});

test('PUT sem baseVersion é 400 e não grava nada', async () => {
  const cookie = await freshUser();
  const r = await call('/api/data', { method: 'PUT', body: { data: { aparelhos: [{ nome: 'TV' }] } }, cookie });
  assert.equal(r.status, 400);
  const check = await call('/api/data', { cookie });
  assert.equal(check.json.version, 0);
  assert.deepEqual(check.json.data, {});
});

test('PUT com versão defasada é 409, informa a versão atual e preserva o cenário salvo', async () => {
  const cookie = await freshUser();
  await call('/api/data', { method: 'PUT', body: { data: { aparelhos: [{ nome: 'Aba 1' }] }, baseVersion: 0 }, cookie });
  const r2 = await call('/api/data', { method: 'PUT', body: { data: { aparelhos: [{ nome: 'Aba 2' }] }, baseVersion: 1 }, cookie });
  assert.equal(r2.json.version, 2);
  // terceira aba ainda na versão 1: conflito, nada é sobrescrito
  const stale = await call('/api/data', { method: 'PUT', body: { data: { aparelhos: [{ nome: 'Aba velha' }] }, baseVersion: 1 }, cookie });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'CONFLITO_VERSAO');
  assert.equal(stale.json.version, 2);
  const check = await call('/api/data', { cookie });
  assert.equal(check.json.version, 2);
  assert.equal(check.json.data.aparelhos[0].nome, 'Aba 2');
});

test('criações concorrentes na versão 0: uma vence, a outra recebe 409', async () => {
  const cookie = await freshUser();
  const [a, b] = await Promise.all([
    call('/api/data', { method: 'PUT', body: { data: { aparelhos: [{ nome: 'A' }] }, baseVersion: 0 }, cookie }),
    call('/api/data', { method: 'PUT', body: { data: { aparelhos: [{ nome: 'B' }] }, baseVersion: 0 }, cookie }),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const check = await call('/api/data', { cookie });
  assert.equal(check.json.version, 1);
});
