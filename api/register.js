import {
  createToken,
  ensureSchema,
  hashPassword,
  json,
  normalizeUsername,
  publicUser,
  readBody,
  requireDb
} from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const db = requireDb(res);
  if (!db) return;
  await ensureSchema();

  try {
    const body = await readBody(req);
    const username = String(body.username || '').trim();
    const usernameLookup = normalizeUsername(username);
    const password = String(body.password || '');

    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) {
      return json(res, 400, { error: 'Ник: 3-24 символа, латиница/цифры/._-' });
    }
    if (password.length < 6) {
      return json(res, 400, { error: 'Пароль минимум 6 символов' });
    }

    const { passwordHash, salt } = hashPassword(password);
    const rows = await db`
      insert into users (username, username_lookup, password_hash, salt)
      values (${username}, ${usernameLookup}, ${passwordHash}, ${salt})
      returning id, username
    `;
    const user = rows[0];
    return json(res, 201, { user: publicUser(user), token: createToken(user) });
  } catch (error) {
    if (String(error.message || '').includes('duplicate key')) {
      return json(res, 409, { error: 'Такой ник уже занят' });
    }
    return json(res, 500, { error: 'Registration failed' });
  }
}
