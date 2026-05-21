# DSBYSHETKA Voice

Discord-like мобильный чат с аккаунтами, друзьями по нику, сообщениями и экраном звонка.

Backend сделан как Vercel Serverless Functions и использует Neon Postgres.

## Переменные окружения

Создай `.env.local` для локального запуска через Vercel:

```bash
DATABASE_URL=postgresql://...
APP_SECRET=replace-with-long-random-string
WEB_PUSH_PUBLIC_KEY=replace-with-vapid-public-key
WEB_PUSH_PRIVATE_KEY=replace-with-vapid-private-key
WEB_PUSH_SUBJECT=mailto:you@example.com
```

## Запуск

```bash
npm install
npx vercel dev
```

## Деплой на Vercel

1. Залить проект в репозиторий `DSBYSHETKA`.
2. В Vercel выбрать импорт GitHub-репозитория.
3. Framework Preset: `Vite`.
4. Build Command: `npm run build`.
5. Output Directory: `dist`.
6. Добавить Environment Variables: `DATABASE_URL`, `APP_SECRET`.
