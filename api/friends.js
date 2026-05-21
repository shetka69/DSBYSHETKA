import { json, normalizeUsername, readBody, requireDb, requireUser } from './_db.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  const db = requireDb(res);
  if (!db) return;

  if (req.method === 'GET') {
    const friends = await db`
      select u.id, u.username
      from friendships f
      join users u on u.id = f.friend_id
      where f.user_id = ${user.id}
      order by f.created_at desc
    `;
    const incoming = await db`
      select fr.id, u.id as user_id, u.username, fr.created_at
      from friend_requests fr
      join users u on u.id = fr.sender_id
      where fr.receiver_id = ${user.id} and fr.status = 'pending'
      order by fr.created_at desc
    `;
    const outgoing = await db`
      select fr.id, u.id as user_id, u.username, fr.created_at
      from friend_requests fr
      join users u on u.id = fr.receiver_id
      where fr.sender_id = ${user.id} and fr.status = 'pending'
      order by fr.created_at desc
    `;

    return json(res, 200, { friends, incoming, outgoing });
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
    const target = rows[0];
    if (!target) return json(res, 404, { error: 'Пользователь не найден' });
    if (target.id === user.id) return json(res, 400, { error: 'Нельзя добавить себя' });

    const existingFriend = await db`
      select 1
      from friendships
      where user_id = ${user.id} and friend_id = ${target.id}
      limit 1
    `;
    if (existingFriend[0]) return json(res, 409, { error: 'Вы уже друзья' });

    const incoming = await db`
      select id
      from friend_requests
      where sender_id = ${target.id} and receiver_id = ${user.id} and status = 'pending'
      limit 1
    `;
    if (incoming[0]) {
      return acceptRequest(db, incoming[0].id, user.id, res);
    }

    const request = await db`
      insert into friend_requests (sender_id, receiver_id, status)
      values (${user.id}, ${target.id}, 'pending')
      on conflict (sender_id, receiver_id)
      do update set status = 'pending', updated_at = now()
      returning id
    `;

    return json(res, 200, { request: request[0], message: 'Заявка отправлена' });
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const requestId = Number(body.requestId);
    if (!requestId) return json(res, 400, { error: 'requestId is required' });

    if (body.action === 'accept') {
      return acceptRequest(db, requestId, user.id, res);
    }

    if (body.action === 'decline') {
      const rows = await db`
        update friend_requests
        set status = 'declined', updated_at = now()
        where id = ${requestId} and receiver_id = ${user.id} and status = 'pending'
        returning id
      `;
      if (!rows[0]) return json(res, 404, { error: 'Заявка не найдена' });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'Unknown action' });
  }

  return json(res, 405, { error: 'Method not allowed' });
}

async function acceptRequest(db, requestId, receiverId, res) {
  const rows = await db`
    update friend_requests
    set status = 'accepted', updated_at = now()
    where id = ${requestId} and receiver_id = ${receiverId} and status = 'pending'
    returning sender_id, receiver_id
  `;
  const request = rows[0];
  if (!request) return json(res, 404, { error: 'Заявка не найдена' });

  await db`
    insert into friendships (user_id, friend_id)
    values (${request.sender_id}, ${request.receiver_id})
    on conflict do nothing
  `;
  await db`
    insert into friendships (user_id, friend_id)
    values (${request.receiver_id}, ${request.sender_id})
    on conflict do nothing
  `;

  const friends = await db`
    select id, username
    from users
    where id = ${request.sender_id}
    limit 1
  `;
  return json(res, 200, { friend: friends[0], message: 'Заявка принята' });
}
