import { neon } from '@neondatabase/serverless';
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
const appSecret = process.env.APP_SECRET || 'dev-secret-change-me';
let schemaReady = false;

export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(data));
}

export function requireDb(res) {
  if (sql) return sql;
  json(res, 500, { error: 'DATABASE_URL is not configured' });
  return null;
}

export async function ensureSchema() {
  if (schemaReady || !sql) return;

  await sql`create extension if not exists pgcrypto`;

  await sql`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      username text not null unique,
      username_lookup text not null unique,
      password_hash text not null,
      salt text not null,
      last_seen timestamptz,
      active_until timestamptz,
      created_at timestamptz not null default now()
    )
  `;

  await sql`alter table users add column if not exists last_seen timestamptz`;
  await sql`alter table users add column if not exists active_until timestamptz`;

  await sql`
    create table if not exists friendships (
      user_id uuid not null references users(id) on delete cascade,
      friend_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (user_id, friend_id),
      check (user_id <> friend_id)
    )
  `;

  await sql`
    create table if not exists friend_requests (
      id bigserial primary key,
      sender_id uuid not null references users(id) on delete cascade,
      receiver_id uuid not null references users(id) on delete cascade,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (sender_id, receiver_id),
      check (sender_id <> receiver_id),
      check (status in ('pending', 'accepted', 'declined'))
    )
  `;

  await sql`
    create table if not exists messages (
      id bigserial primary key,
      sender_id uuid not null references users(id) on delete cascade,
      receiver_id uuid not null references users(id) on delete cascade,
      body text not null,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists push_subscriptions (
      id bigserial primary key,
      user_id uuid not null references users(id) on delete cascade,
      endpoint text not null unique,
      subscription jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists typing_status (
      user_id uuid not null references users(id) on delete cascade,
      friend_id uuid not null references users(id) on delete cascade,
      typing_until timestamptz not null,
      updated_at timestamptz not null default now(),
      primary key (user_id, friend_id),
      check (user_id <> friend_id)
    )
  `;

  await sql`create index if not exists messages_pair_id_idx on messages (sender_id, receiver_id, id)`;
  await sql`create index if not exists friendships_user_idx on friendships (user_id)`;
  await sql`create index if not exists friend_requests_receiver_status_idx on friend_requests (receiver_id, status)`;
  await sql`create index if not exists typing_status_friend_until_idx on typing_status (friend_id, typing_until)`;

  schemaReady = true;
}

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username
  };
}

export async function updateTokenUser(db, userId) {
  const rows = await db`select id, username from users where id = ${userId} limit 1`;
  return rows[0] || null;
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const passwordHash = pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return { passwordHash, salt };
}

export function verifyPassword(password, salt, passwordHash) {
  const candidate = hashPassword(password, salt).passwordHash;
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(passwordHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createToken(user) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      username: user.username,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30
    })
  ).toString('base64url');
  const signature = createHmac('sha256', appSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readToken(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !token.includes('.')) return null;

  const [payload, signature] = token.split('.');
  const expected = createHmac('sha256', appSecret).update(payload).digest('base64url');
  const sigHash = createHash('sha256').update(signature).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(sigHash, expectedHash)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.sub || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export async function requireUser(req, res) {
  const db = requireDb(res);
  if (!db) return null;
  await ensureSchema();

  const token = readToken(req);
  if (!token) {
    json(res, 401, { error: 'Unauthorized' });
    return null;
  }

  const rows = await db`select id, username from users where id = ${token.sub} limit 1`;
  if (!rows[0]) {
    json(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return rows[0];
}

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
