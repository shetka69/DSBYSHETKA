import { json } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  return json(res, 200, {
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY || ''
  });
}
