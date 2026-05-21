import { json, readBody, requireUser } from './_db.js';
import { notifyUser } from './_push.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const { requireDb } = await import('./_db.js');
  const db = requireDb(res);
  if (!db) return;

  const friendId = req.query?.friendId || new URL(req.url, 'http://localhost').searchParams.get('friendId');
  if (!friendId) return json(res, 400, { error: 'friendId is required' });

  const allowed = await db`
    select 1
    from friendships
    where user_id = ${user.id} and friend_id = ${friendId}
    limit 1
  `;
  if (!allowed[0]) return json(res, 403, { error: 'Friend is not in your list' });

  async function listMessages() {
    const rows = await db`
      select id, sender_id, receiver_id, body, created_at
      from messages
      where (sender_id = ${user.id} and receiver_id = ${friendId})
         or (sender_id = ${friendId} and receiver_id = ${user.id})
      order by created_at asc
      limit 100
    `;
    return json(res, 200, {
      messages: rows.map((row) => ({
        id: row.id,
        body: row.body,
        mine: row.sender_id === user.id,
        createdAt: row.created_at
      }))
    });
  }

  if (req.method === 'GET') {
    return listMessages();
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (body.action === 'list') {
      return listMessages();
    }

    const text = String(body.body || '').trim();
    if (!text) return json(res, 400, { error: 'Message is empty' });
    if (text.length > 2000) return json(res, 400, { error: 'Message is too long' });

    const rows = await db`
      insert into messages (sender_id, receiver_id, body)
      values (${user.id}, ${friendId}, ${text})
      returning id, sender_id, receiver_id, body, created_at
    `;
    const message = rows[0];
    await notifyUser(db, friendId, {
      title: user.username,
      body: text,
      url: '/'
    });

    return json(res, 201, {
      message: {
        id: message.id,
        body: message.body,
        mine: true,
        createdAt: message.created_at
      }
    });
  }

  return json(res, 405, { error: 'Method not allowed' });
}
