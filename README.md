# Finance Personal Analytic

Локальное веб-приложение для личного финансового учета на React.

## Запуск

```bash
npm install
npm run dev
```

Данные сохраняются в `localStorage` браузера только при локальном запуске без backend API.

При деплое на Vercel данные сохраняются через backend API `/api/finance-data` в Upstash Redis.
`localStorage` используется только как fallback для локального запуска через обычный `npm run dev`.

## Публикация на Vercel

Проект готов к деплою как Vite-приложение.

```bash
npm run build
```

Для приватного доступа включите в настройках проекта Vercel:

1. Project Settings
2. Deployment Protection
3. Vercel Authentication
4. Protection level: All Deployments

В приложении нет frontend-пароля. Приватный доступ должен быть включен на уровне Vercel Deployment Protection.

## Backend-хранилище на Vercel

1. В Vercel откройте проект.
2. Перейдите в Storage / Marketplace.
3. Подключите Upstash Redis к проекту.
4. Убедитесь, что Vercel добавил переменные окружения:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
5. Redeploy проекта после добавления переменных.

API `/api/finance-data` читает и сохраняет весь финансовый JSON на backend. Так данные будут доступны с разных устройств после входа в защищенный Vercel deployment.
