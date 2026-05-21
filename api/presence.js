import { json, requireDb, requireUser } from './_db.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const db = requireDb(res);
  if (!db) return;

  await db`update users set last_seen = now() where id = ${user.id}`;
  return json(res, 200, { ok: true });
}
