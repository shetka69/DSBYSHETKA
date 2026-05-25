import {
  createToken,
  hashPassword,
  json,
  normalizeUsername,
  publicUser,
  readBody,
  requireDb,
  requireUser,
  updateTokenUser,
  verifyPassword
} from './_db.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method !== 'PATCH') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const db = requireDb(res);
  if (!db) return;

  const body = await readBody(req);
  const rows = await db`
    select id, username, password_hash, salt
    from users
    where id = ${user.id}
    limit 1
  `;
  const current = rows[0];
  if (!current) return json(res, 404, { error: 'Пользователь не найден' });

  const currentPassword = String(body.currentPassword || '');
  if (!verifyPassword(currentPassword, current.salt, current.password_hash)) {
    return json(res, 401, { error: 'Текущий пароль неверный' });
  }

  const nextUsername = String(body.username || current.username).trim();
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(nextUsername)) {
    return json(res, 400, { error: 'Ник: 3-24 символа, латиница/цифры/._-' });
  }

  let passwordHash = current.password_hash;
  let salt = current.salt;
  const nextPassword = String(body.newPassword || '');
  if (nextPassword) {
    if (nextPassword.length < 6) {
      return json(res, 400, { error: 'Новый пароль минимум 6 символов' });
    }
    const hashed = hashPassword(nextPassword);
    passwordHash = hashed.passwordHash;
    salt = hashed.salt;
  }

  try {
    await db`
      update users
      set
        username = ${nextUsername},
        username_lookup = ${normalizeUsername(nextUsername)},
        password_hash = ${passwordHash},
        salt = ${salt}
      where id = ${user.id}
    `;
  } catch (error) {
    if (String(error.message || '').includes('duplicate key')) {
      return json(res, 409, { error: 'Такой ник уже занят' });
    }
    throw error;
  }

  const updated = await updateTokenUser(db, user.id);
  return json(res, 200, { user: publicUser(updated), token: createToken(updated) });
}
