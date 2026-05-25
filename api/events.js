import { ensureSchema, json, readToken, requireDb } from './_db.js';

export default async function handler(req, res) {
  const db = requireDb(res);
  if (!db) return;
  await ensureSchema();

  const query = req.query || Object.fromEntries(new URL(req.url, 'http://localhost').searchParams.entries());
  const friendId = query.friendId;
  const tokenValue = query.token;
  let lastId = Number(query.afterId || 0);

  if (!friendId || !tokenValue) return json(res, 400, { error: 'friendId and token are required' });

  const token = readToken({ headers: { authorization: `Bearer ${tokenValue}` } });
  if (!token) return json(res, 401, { error: 'Unauthorized' });

  const users = await db`select id, username from users where id = ${token.sub} limit 1`;
  const user = users[0];
  if (!user) return json(res, 401, { error: 'Unauthorized' });

  const allowed = await db`
    select 1
    from friendships
    where user_id = ${user.id} and friend_id = ${friendId}
    limit 1
  `;
  if (!allowed[0]) return json(res, 403, { error: 'Friend is not in your list' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  let closed = false;
  let lastTyping = false;

  req.on('close', () => {
    closed = true;
  });

  function send(event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  async function tick() {
    if (closed) return;

    try {
      const rows = await db`
        select id, sender_id, receiver_id, body, created_at
        from messages
        where (
          (sender_id = ${user.id} and receiver_id = ${friendId})
          or (sender_id = ${friendId} and receiver_id = ${user.id})
        )
        and id > ${lastId}
        order by id asc
        limit 50
      `;

      if (rows.length) {
        lastId = Number(rows[rows.length - 1].id);
        send('messages', {
          messages: rows.map((row) => ({
            id: row.id,
            body: row.body,
            mine: row.sender_id === user.id,
            createdAt: row.created_at
          }))
        });
      }

      const typingRows = await db`
        select 1
        from typing_status
        where user_id = ${friendId}
          and friend_id = ${user.id}
          and typing_until > now()
        limit 1
      `;
      const typing = Boolean(typingRows[0]);
      if (typing !== lastTyping) {
        lastTyping = typing;
        send('typing', { typing });
      }

      res.write(': ping\n\n');
    } catch (error) {
      send('error', { message: 'Event stream error' });
    }

    if (!closed) setTimeout(tick, 1000);
  }

  send('ready', { ok: true });
  tick();
}
