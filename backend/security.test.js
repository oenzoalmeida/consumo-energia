import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseOptions, positiveInteger, proxyHops, createAuthRateLimit, securityHeaders } from './security.js';

test('production verifies TLS and URL parameters cannot override policy or CA', () => {
  const result = databaseOptions({ NODE_ENV: 'production', DATABASE_URL: 'postgres://user:pass@localhost/db?sslmode=no-verify&sslrootcert=bad&application_name=test', DATABASE_CA_CERT: 'CA' });
  assert.deepEqual(result.ssl, { rejectUnauthorized: true, ca: 'CA' });
  assert.equal(new URL(result.connectionString).searchParams.get('sslmode'), null);
  assert.equal(new URL(result.connectionString).searchParams.get('application_name'), 'test');
  assert.ok(result.connectionTimeoutMillis > 0);
});
test('explicit TLS modes and unknown values', () => {
  for (const [mode, expected] of [['verify', true], ['no-verify', false]]) {
    assert.equal(databaseOptions({ DATABASE_URL: 'postgres://localhost/db', DATABASE_SSL_MODE: mode }).ssl.rejectUnauthorized, expected);
  }
  assert.equal(databaseOptions({ DATABASE_URL: 'postgres://localhost/db', DATABASE_SSL_MODE: 'disable' }).ssl, false);
  for (const mode of ['typo', 'toString', '__proto__']) assert.throws(() => databaseOptions({ DATABASE_URL: 'postgres://localhost/db', DATABASE_SSL_MODE: mode }));
});
test('configuration rejects invalid limits and proxy settings', () => {
  for (const value of ['NaN', '', '0', '-1', '1.5', 'Infinity', '2147483648']) assert.throws(() => positiveInteger(value, 10, 'limit'));
  assert.equal(positiveInteger(undefined, 10, 'limit'), 10);
  assert.equal(proxyHops({}), 0);
  assert.equal(proxyHops({ TRUST_PROXY_HOPS: '1' }), 1);
  assert.throws(() => proxyHops({ TRUST_PROXY_HOPS: '-1' }));
});
function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
}
test('limit boundary returns 429 with Retry-After, uses trusted req.ip', async () => {
  let hits = 0;
  const pool = { async query(sql, values) {
    assert.equal(values[0], 'trusted-ip');
    assert.ok(!sql.includes('CREATE TABLE'));
    return { rows: [{ hits: ++hits, retry_after: 42 }] };
  } };
  const middleware = createAuthRateLimit(pool, { max: 2, windowMs: 60000 });
  let next = 0;
  for (let i = 0; i < 3; i++) {
    const res = response();
    await middleware({ ip: 'trusted-ip', headers: { 'x-forwarded-for': 'forged' } }, res, () => next++);
    if (i === 2) { assert.equal(res.code, 429); assert.equal(res.headers['Retry-After'], '42'); }
  }
  assert.equal(next, 2);
});
test('outage, missing migration, permissions and invalid results fail closed', async () => {
  for (const failure of ['08006', '42P01', '42501', '57014', 'malformed']) {
    const middleware = createAuthRateLimit({ async query() {
      if (failure === 'malformed') return { rows: [] };
      throw Object.assign(new Error('secret connection details'), { code: failure });
    } }, { max: 10, windowMs: 60000, logger: { error(message) { assert.ok(!message.includes('secret')); } } });
    const res = response();
    await middleware({ ip: 'test' }, res, () => assert.fail('auth must not execute'));
    assert.equal(res.code, 503);
    assert.equal(res.headers['Retry-After'], '5');
    assert.ok(!JSON.stringify(res.body).includes('secret'));
  }
});

test('security headers on every response (CE-1)', () => {
  let next = 0;
  const res = response();
  securityHeaders({ NODE_ENV: 'production' })({}, res, () => next++);
  assert.equal(next, 1);
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.match(res.headers['Content-Security-Policy'], /default-src 'self'/);
  assert.match(res.headers['Content-Security-Policy'], /script-src 'self'/);
  assert.match(res.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(res.headers['Strict-Transport-Security'], 'max-age=15552000; includeSubDomains');
  const dev = response();
  securityHeaders({ NODE_ENV: 'development' })({}, dev, () => {});
  assert.equal(dev.headers['Strict-Transport-Security'], undefined);
  assert.equal(dev.headers['X-Frame-Options'], 'DENY');
});
