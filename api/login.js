import { createToken, ensureSchema, json, normalizeUsername, publicUser, readBody, requireDb, verifyPassword } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const db = requireDb(res);
  if (!db) return;
  await ensureSchema();

  const body = await readBody(req);
  const usernameLookup = normalizeUsername(body.username);
  const password = String(body.password || '');

  const rows = await db`
    select id, username, password_hash, salt
    from users
    where username_lookup = ${usernameLookup}
    limit 1
  `;
  const user = rows[0];
  if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
    return json(res, 401, { error: 'Неверный ник или пароль' });
  }

  return json(res, 200, { user: publicUser(user), token: createToken(user) });
}
