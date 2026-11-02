// Fixture local/CI para o e2e-forced-change.test.mjs, SEM dump de producao.
// Cria o schema base (users/user_data), aplica a migration 002 e insere os
// dois admins que o e2e espera. Idempotente (IF NOT EXISTS / ON CONFLICT).
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(2); }

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex');
  return `${salt}:${hash}`;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role text NOT NULL DEFAULT 'USER',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS user_data (
    user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`);

const migration = readFileSync(new URL('../migrations/002_forced_password_change.sql', import.meta.url), 'utf8');
await pool.query(migration);

const admin = hashPassword('TempAdmin#2026');
const velho = hashPassword('TempVelho#2026');
await pool.query(
  `INSERT INTO users(name,email,password_hash,role,active,must_change_password) VALUES
     ('Admin Central','admin@consumoenergia.app',$1,'ADMIN',true,true),
     ('Admin Antigo','velho@example.com',$2,'ADMIN',true,false)
   ON CONFLICT (email) DO NOTHING`,
  [admin, velho]
);

await pool.end();
console.log('fixture seed ok');
