import { json, publicUser, requireUser } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  return json(res, 200, { user: publicUser(user) });
}
