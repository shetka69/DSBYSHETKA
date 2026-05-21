import { json, normalizeUsername, readBody, requireDb, requireUser } from './_db.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  const db = requireDb(res);
  if (!db) return;

  if (req.method === 'GET') {
    const rows = await db`
      select u.id, u.username
      from friendships f
      join users u on u.id = f.friend_id
      where f.user_id = ${user.id}
      order by f.created_at desc
    `;
    return json(res, 200, { friends: rows });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const usernameLookup = normalizeUsername(body.username);
    const rows = await db`
      select id, username
      from users
      where username_lookup = ${usernameLookup}
      limit 1
    `;
    const friend = rows[0];
    if (!friend) return json(res, 404, { error: 'Пользователь не найден' });
    if (friend.id === user.id) return json(res, 400, { error: 'Нельзя добавить себя' });

    await db`
      insert into friendships (user_id, friend_id)
      values (${user.id}, ${friend.id})
      on conflict do nothing
    `;
    await db`
      insert into friendships (user_id, friend_id)
      values (${friend.id}, ${user.id})
      on conflict do nothing
    `;

    return json(res, 200, { friend });
  }

  return json(res, 405, { error: 'Method not allowed' });
}
