// E2E fixture: troca obrigatória de senha + revogação de sessão (Consumo de Energia).
// Roda contra um Postgres local (restauração do backup de produção + migration 002).
// Uso: DATABASE_URL=postgres://postgres@localhost:PORT/consumo_fixture node e2e-forced-change.test.mjs
import { spawn } from 'node:child_process';

const BASE_DB = process.env.DATABASE_URL;
if (!BASE_DB) { console.error('DATABASE_URL required'); process.exit(2); }
const PORT = 18923;
const BASE = `http://127.0.0.1:${PORT}`;
process.env.DATABASE_URL = BASE_DB;
process.env.JWT_SECRET = 'e2e-secret';
process.env.FRONTEND_URL = BASE;

const { default: app } = await import('./server.js');
const server = await new Promise(r => { const s = app.listen(PORT, () => r(s)); });

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`ok ${pass + fail} - ${name}`); } else { fail++; console.log(`NOT OK ${pass + fail} - ${name}`); } };
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

// estado inicial do fixture:
//  - admin@consumoenergia.app (ADMIN, temp 'TempAdmin#2026', must_change=true)
//  - velho@example.com (ADMIN, temp 'TempVelho#2026', must_change=false) -> admin "antigo" a desativar
//  - demo user normal

// 1. login admin central com senha temporária
let r = await call('/api/auth/login', { method: 'POST', body: { email: 'admin@consumoenergia.app', password: 'TempAdmin#2026' } });
ok(r.status === 200 && r.json.user.mustChange === true, 'login com senha temporária retorna mustChange=true');
const adminCookie = r.setCookie.split(';')[0];

// 2. guarda: rotas protegidas bloqueadas com 403 MUST_CHANGE_PASSWORD
r = await call('/api/data', { cookie: adminCookie });
ok(r.status === 403 && r.json.error === 'MUST_CHANGE_PASSWORD', 'GET /api/data bloqueado (403 MUST_CHANGE_PASSWORD)');
r = await call('/api/data', { method: 'PUT', body: { data: {} }, cookie: adminCookie });
ok(r.status === 403, 'PUT /api/data bloqueado');
r = await call('/api/admin/users', { cookie: adminCookie });
ok(r.status === 403, 'GET /api/admin/users bloqueado');
r = await call('/api/account', { method: 'DELETE', cookie: adminCookie });
ok(r.status === 403, 'DELETE /api/account bloqueado');

// 3. permitidos: me + logout respondem
r = await call('/api/auth/me', { cookie: adminCookie });
ok(r.status === 200 && r.json.user.mustChange === true, 'GET /api/auth/me permitido durante troca obrigatória');

// 4. troca com senha atual errada
r = await call('/api/auth/change-password', { method: 'POST', body: { current_password: 'errada', new_password: 'NovaSenhaForte#1' }, cookie: adminCookie });
ok(r.status === 401, 'troca com senha atual errada -> 401');

// 5. troca com senha nova fraca
r = await call('/api/auth/change-password', { method: 'POST', body: { current_password: 'TempAdmin#2026', new_password: 'curta' }, cookie: adminCookie });
ok(r.status === 400, 'troca com senha nova < 12 -> 400');

// 6. troca com nova == atual
r = await call('/api/auth/change-password', { method: 'POST', body: { current_password: 'TempAdmin#2026', new_password: 'TempAdmin#2026' }, cookie: adminCookie });
ok(r.status === 400, 'nova igual à atual -> 400');

// 7. troca válida
r = await call('/api/auth/change-password', { method: 'POST', body: { current_password: 'TempAdmin#2026', new_password: 'NovaSenhaForte#1' }, cookie: adminCookie });
ok(r.status === 200 && r.json.user.mustChange === false, 'troca válida -> 200 mustChange=false');
const newCookie = r.setCookie.split(';')[0];

// 8. cookie antigo revogado (auth_version mudou)
r = await call('/api/auth/me', { cookie: adminCookie });
ok(r.status === 401, 'sessão antiga revogada após troca (401)');

// 9. novo cookie funciona nas rotas antes bloqueadas
r = await call('/api/admin/users', { cookie: newCookie });
ok(r.status === 200 && Array.isArray(r.json.users), 'novo cookie acessa /api/admin/users');

// 10. senha temporária não funciona mais; nova funciona
r = await call('/api/auth/login', { method: 'POST', body: { email: 'admin@consumoenergia.app', password: 'TempAdmin#2026' } });
ok(r.status === 401, 'senha temporária deixa de funcionar');
r = await call('/api/auth/login', { method: 'POST', body: { email: 'admin@consumoenergia.app', password: 'NovaSenhaForte#1' } });
ok(r.status === 200 && r.json.user.mustChange === false, 'login com senha nova ok');

// 11. usuário comum NÃO é afetado (must_change=false por padrão)
r = await call('/api/auth/register', { method: 'POST', body: { name: 'Teste User', email: 'teste.user@example.com', password: 'SenhaDoUser#123' } });
ok(r.status === 201 && r.json.user.mustChange === false, 'registro de usuário comum sem mustChange');
const userCookie = r.setCookie.split(';')[0];
r = await call('/api/data', { cookie: userCookie });
ok(r.status === 200, 'usuário comum acessa /api/data normalmente');

// 12. usuário comum não acessa admin
r = await call('/api/admin/users', { cookie: userCookie });
ok(r.status === 403 && r.json.error !== 'MUST_CHANGE_PASSWORD', 'usuário comum -> 403 de admin (não de troca)');

// 13. painel: admin não desativa a si mesmo
r = await call('/api/auth/login', { method: 'POST', body: { email: 'admin@consumoenergia.app', password: 'NovaSenhaForte#1' } });
const selfId = r.json.user.id; const selfCookie = r.setCookie.split(';')[0];
r = await call(`/api/admin/users/${selfId}`, { method: 'PATCH', body: { active: false }, cookie: selfCookie });
ok(r.status === 400, 'admin não desativa a própria conta');

// 14. painel: desativar OUTRO admin funciona (velho@example.com)
r = await call('/api/auth/login', { method: 'POST', body: { email: 'velho@example.com', password: 'TempVelho#2026' } });
const oldId = r.json.user.id;
r = await call(`/api/admin/users/${oldId}`, { method: 'PATCH', body: { active: false }, cookie: selfCookie });
ok(r.status === 200 && r.json.user.active === false, 'admin central desativa admin antigo');

// 15. admin antigo desativado perde acesso (sessão existente 401)
const oldCookie = (await call('/api/auth/login', { method: 'POST', body: { email: 'velho@example.com', password: 'TempVelho#2026' } })).setCookie;
ok(oldCookie === null, 'admin desativado não faz login');

// 16. trava de último admin: desativar o central (último ativo) -> 400
r = await call(`/api/admin/users/${selfId}`, { method: 'PATCH', body: { active: false }, cookie: selfCookie });
ok(r.status === 400, 'não desativa o último admin ativo');

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
