import { json, readBody, requireDb, requireUser } from './_db.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const db = requireDb(res);
  if (!db) return;

  const body = await readBody(req).catch(() => ({}));
  const visible = body.visible !== false;

  await db`
    update users
    set
      last_seen = now(),
      active_until = case when ${visible} then now() + interval '25 seconds' else now() end
    where id = ${user.id}
  `;
  return json(res, 200, { ok: true });
}
