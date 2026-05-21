import { json, readBody, requireDb, requireUser } from './_db.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const db = requireDb(res);
  if (!db) return;

  const body = await readBody(req);
  const subscription = body.subscription;
  if (!subscription?.endpoint) {
    return json(res, 400, { error: 'Push subscription is required' });
  }

  await db`
    insert into push_subscriptions (user_id, endpoint, subscription)
    values (${user.id}, ${subscription.endpoint}, ${JSON.stringify(subscription)})
    on conflict (endpoint)
    do update set user_id = ${user.id}, subscription = ${JSON.stringify(subscription)}, updated_at = now()
  `;

  return json(res, 200, { ok: true });
}
