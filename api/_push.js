import webPush from 'web-push';

const subject = process.env.WEB_PUSH_SUBJECT || 'mailto:admin@example.com';
const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || '';
const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';

if (publicKey && privateKey) {
  webPush.setVapidDetails(subject, publicKey, privateKey);
}

export async function notifyUser(db, userId, payload) {
  if (!publicKey || !privateKey) return;

  const rows = await db`
    select id, subscription
    from push_subscriptions
    where user_id = ${userId}
  `;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webPush.sendNotification(row.subscription, JSON.stringify(payload));
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await db`delete from push_subscriptions where id = ${row.id}`;
        }
      }
    })
  );
}
