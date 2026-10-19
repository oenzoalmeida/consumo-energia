import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pg from 'pg';
import { pathToFileURL } from 'node:url';

const app = express();
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://consumo-energia-2.web.app';
// FRONTEND_URL aceita uma ou mais origens separadas por vírgula (transição
// Render -> Cloudflare Pages). Com um único valor (ou o default), o
// comportamento permanece idêntico ao anterior (origin fixa).
const FRONTEND_ORIGINS = FRONTEND_URL.split(',').map(origin => origin.trim()).filter(Boolean);
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');

// DATABASE_SSL_MODE controla a conexão TLS com o Postgres:
//   verify    (padrão em produção) exige certificado válido — use
//             DATABASE_CA_CERT se o provedor usar uma CA própria;
//   no-verify criptografa sem conferir quem está do outro lado. Era o
//             comportamento anterior, e só deve ser usado de forma consciente;
//   disable   sem TLS, para desenvolvimento local e para o CI.
const SSL_MODE = process.env.DATABASE_SSL_MODE || (process.env.NODE_ENV === 'production' ? 'verify' : 'disable');
const CA_CERT = process.env.DATABASE_CA_CERT;
const SSL_CONFIG = {
  disable: undefined,
  'no-verify': { rejectUnauthorized: false },
  verify: CA_CERT ? { rejectUnauthorized: true, ca: CA_CERT } : { rejectUnauthorized: true }
}[SSL_MODE];
if (SSL_CONFIG === undefined && SSL_MODE !== 'disable') {
  throw new Error(`DATABASE_SSL_MODE inválido: ${SSL_MODE}. Use verify, no-verify ou disable.`);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: SSL_CONFIG });
app.use(cors({ origin: FRONTEND_ORIGINS.length > 1 ? FRONTEND_ORIGINS : FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const cookie = { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 };

// Rate limit por IP (janela fixa) nos endpoints de autenticação — login
// (força bruta) e register (abuso de criação de contas).
//
// A contagem vive no Postgres, e não num Map em memória. Este backend também
// roda como função serverless (backend/api/index.js na Vercel e
// netlify/functions/api.mjs), onde cada instância teria o próprio Map: o
// limite efetivo passaria a ser o configurado multiplicado pelo número de
// instâncias ativas, e zeraria a cada cold start. No banco, a contagem é única
// e sobrevive ao reinício do processo.
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE || 10);
const RATE_WINDOW_MS = 60_000;

// O projeto não usa ferramenta de migração: o schema é criado por quem opera.
// A tabela é garantida no primeiro uso para que um deploy não exija um passo
// manual antes de o login voltar a funcionar.
let rateLimitTable = null;
function ensureRateLimitTable() {
  if (!rateLimitTable) {
    rateLimitTable = pool
      .query(`CREATE TABLE IF NOT EXISTS auth_rate_limit (
                key text PRIMARY KEY,
                hits integer NOT NULL,
                reset_at timestamptz NOT NULL
              )`)
      .catch(err => { rateLimitTable = null; throw err; });
  }
  return rateLimitTable;
}

// Conta a tentativa e devolve o total da janela. O UPSERT é atômico: duas
// requisições simultâneas do mesmo IP não perdem contagem, inclusive quando
// atendidas por instâncias diferentes.
async function registerAttempt(key) {
  await ensureRateLimitTable();
  const seconds = RATE_WINDOW_MS / 1000;
  const { rows } = await pool.query(
    `INSERT INTO auth_rate_limit (key, hits, reset_at)
     VALUES ($1, 1, now() + make_interval(secs => $2))
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN auth_rate_limit.reset_at <= now() THEN 1 ELSE auth_rate_limit.hits + 1 END,
       reset_at = CASE WHEN auth_rate_limit.reset_at <= now()
                       THEN now() + make_interval(secs => $2)
                       ELSE auth_rate_limit.reset_at END
     RETURNING hits, GREATEST(1, ceil(extract(epoch FROM reset_at - now())))::int AS retry_after`,
    [key, seconds]
  );
  // Limpeza oportunista: sem processo de fundo em serverless, apagar de vez em
  // quando mantém a tabela pequena sem custo perceptível por requisição.
  if (Math.random() < 0.02) {
    pool.query(`DELETE FROM auth_rate_limit WHERE reset_at < now() - interval '1 hour'`).catch(() => {});
  }
  return rows[0];
}

async function rateLimit(req, res, next) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = xff || req.socket?.remoteAddress || 'unknown';
  try {
    const { hits, retry_after: retryAfter } = await registerAttempt(ip);
    if (hits > RATE_LIMIT_PER_MINUTE) {
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
    }
  } catch (err) {
    // Falha aqui é falha de banco, e as rotas protegidas também dependem dele.
    // Responder 429 esconderia a causa real; segue adiante e deixa a rota
    // falhar com o erro verdadeiro.
    console.error('rate limit indisponível:', err);
  }
  next();
}
app.use('/api/auth/login', rateLimit);
app.use('/api/auth/register', rateLimit);
const sign = user => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
const safe = u => ({ id: String(u.id), name: u.name, email: u.email, role: u.role, active: u.active });

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64);
  const expectedBuf = Buffer.from(expected, 'hex');
  return actual.length === expectedBuf.length && crypto.timingSafeEqual(actual, expectedBuf);
}
async function auth(req, res, next) {
  try {
    const token = req.cookies.energy_session;
    if (!token) return res.status(401).json({ error: 'Não autenticado' });
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query('SELECT id,name,email,role,active FROM users WHERE id=$1', [payload.id]);
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Acesso indisponível' });
    req.user = user; next();
  } catch { return res.status(401).json({ error: 'Sessão inválida' }); }
}
function admin(req, res, next) { return req.user?.role === 'ADMIN' ? next() : res.status(403).json({ error: 'Acesso restrito' }); }

app.get('/health', (_req,res)=>res.json({ok:true}));
app.post('/api/auth/register', async (req,res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (name.length < 2 || !email.includes('@') || password.length < 12) return res.status(400).json({ error: 'Preencha nome, e-mail e uma senha com pelo menos 12 caracteres' });
  try {
    const { rows } = await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'USER') RETURNING id,name,email,role,active", [name,email,hashPassword(password)]);
    const user = rows[0]; res.cookie('energy_session', sign(user), cookie).status(201).json({ user: safe(user) });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Este e-mail já está cadastrado' }); console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/auth/login', async (req,res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = rows[0];
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'E-mail ou senha inválidos' });
    res.cookie('energy_session', sign(user), cookie).json({ user: safe(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/auth/logout', (_req,res)=>res.clearCookie('energy_session', cookie).status(204).end());
app.get('/api/auth/me', auth, (req,res)=>res.json({user:safe(req.user)}));

app.get('/api/data', auth, async (req,res)=>{
  const { rows } = await pool.query('SELECT data FROM user_data WHERE user_id=$1',[req.user.id]);
  res.json({ data: rows[0]?.data || {} });
});
app.put('/api/data', auth, async (req,res)=>{
  const data = req.body.data && typeof req.body.data === 'object' ? req.body.data : {};
  await pool.query("INSERT INTO user_data(user_id,data) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()", [req.user.id, JSON.stringify(data)]);
  res.status(204).end();
});

app.delete('/api/account', auth, async (req,res)=>{
  await pool.query('DELETE FROM user_data WHERE user_id=$1',[req.user.id]);
  await pool.query('DELETE FROM users WHERE id=$1',[req.user.id]);
  res.clearCookie('energy_session', cookie).status(204).end();
});

app.get('/api/admin/users', auth, admin, async (_req,res)=>{
  const { rows } = await pool.query("SELECT u.id,u.name,u.email,u.role,u.active,u.created_at, CASE WHEN d.user_id IS NULL THEN false ELSE true END AS has_data FROM users u LEFT JOIN user_data d ON d.user_id=u.id ORDER BY u.created_at DESC");
  res.json({ users: rows.map(safe) });
});
app.patch('/api/admin/users/:id', auth, admin, async (req,res)=>{
  const active = Boolean(req.body.active);
  if (String(req.params.id) === String(req.user.id) && !active) return res.status(400).json({error:'Você não pode desativar sua própria conta'});
  const { rows } = await pool.query('UPDATE users SET active=$1 WHERE id=$2 RETURNING id,name,email,role,active',[active,req.params.id]);
  if (!rows[0]) return res.status(404).json({error:'Usuário não encontrado'});
  res.json({user:safe(rows[0])});
});

app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({error:'Erro interno'}); });

export default app;

// O servidor só sobe quando o arquivo é executado diretamente (node server.js —
// modo Render/local). Detecção pela comparação canônica entre import.meta.url e
// process.argv[1] via pathToFileURL (padrão do Node para "main module" em ESM,
// portável entre SOs). Quando o módulo é apenas importado — caso do handler
// serverless api/index.js na Vercel — nada escuta porta; o app só é exportado.
const isDirectRun = typeof process.argv[1] === 'string'
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  app.listen(PORT, '0.0.0.0', ()=>console.log(`Consumo Energia API on ${PORT}`));
}
