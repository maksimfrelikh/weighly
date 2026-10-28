# BUG-REG-072: Баннер не создаётся из UI — загрузка отдаёт относительный `publicUrl`, а API баннеров с BUG-REG-040 принимает только абсолютный http(s)

## Status: FIXED в main (2026-10-28), на проде — после деплоя

Фронтенд переводит `publicUrl` загрузки в абсолютный URL на том же origin, на который ушла загрузка,
и шлёт баннеру его. Правило BUG-REG-040 на бэкенде не менялось. Проверки — в разделе «Проверка».

**Не сделано:** деплой на прод. До него загрузка баннера на https://weighly.frelikh.dev/ по-прежнему
кончается ошибкой 400.

- **Severity:** high: единственный способ создать баннер в UI не работает, без API рекламу не завести
- **Area:** advertising / banners / frontend ↔ backend contract
- **Role:** admin, operator с доступом к магазину (`@RequireRoles('admin', 'operator')` на контроллере баннеров)
- **Environment:** Docker smoke: main @ `1286ff6`, Postgres 18, образы backend и frontend, nginx с TLS вместо хостового
- **Browser/Tool:** Playwright 1.64.1: Chromium 156, Firefox 157, WebKit 27.2
- **Found during:** browser smoke для [BUG-REG-002](../../2026-05-17/bugs/BUG-REG-002.md) (CSP), 2026-10-28
- **Related:** [BUG-REG-040](../../2026-05-17/bugs/BUG-REG-040-banner-imageurl-permissive.md) (правило, о которое споткнулся UI)

## Шаги воспроизведения

1. Войти в админку, открыть карточку магазина.
2. Во вкладке «Рекламные баннеры» выбрать файл в поле «Изображение баннера» (PNG, JPG или WebP до 2 МБ).

## Ожидаемое

Баннер создан и появился в списке с превью, под полем — «Баннер загружен и добавлен…».

## Фактическое

Над формой alert «imageUrl должен быть корректным URL с протоколом http(s)», баннера нет.
Файл при этом загружен: `POST /api/files/images` прошёл, и каждая попытка оставляла `FileAsset`
без баннера.

## Network / Console

```
POST /api/files/images                          → 201 {"fileAsset":{"publicUrl":"/uploads/images/<uuid>.png",…}}
POST /api/stores/<id>/advertising/banners
  body: {"imageUrl":"/uploads/images/<uuid>.png","imageFileAssetId":"<uuid>","status":"active","sortOrder":0}
                                                → 400 {"message":"imageUrl должен быть корректным URL с протоколом http(s)",…}
```

## Причина

- `handleBannerUpload` (`AdvertisingTab`, `frontend/src/main.tsx`) отправлял в `imageUrl` баннера
  `fileAsset.publicUrl` из ответа загрузки как есть.
- `publicUrl` относительный: `FilesService` (`backend/src/files/files.service.ts`) собирает его как
  `/uploads/images/<uuid>.<ext>`.
- С фикса BUG-REG-040 (`4497f57`, 2026-05-19) `validateBannerImageUrl`
  (`backend/src/advertising/image-url.util.ts`) пропускает только то, что `new URL()` разбирает без
  базы и с протоколом `http:`/`https:`. Путь без хоста не проходит, отсюда 400.
- Другого способа создать баннер в UI нет. Через API баннер с абсолютным URL создаётся.

## Решение и почему на фронтенде

`imageUrl` баннера уходит в опубликованный пакет без изменений (`catalog-package.service.ts`:
`imageUrl: banner.imageUrl`), а весы получают только пакет. В PRD (§6.9 «Рекламные баннеры» и
§6.12 «PackageData») `imageUrl` везде абсолютный. Из относительного пути устройство не узнает хост.
Отсюда:

- **Разрешить бэкенду путь `/uploads/images/…`** значит отправить на весы относительный URL. Чтобы
  этого избежать, пакету пришлось бы достраивать хост. Но бэкенд не знает своего публичного origin:
  `FRONTEND_ORIGIN` — это origin SPA (CORS, ссылки в письмах). `/uploads/` лежит на нём только
  потому, что nginx хоста проксирует туда и `/api/`, и `/uploads/`.
- **Клиент знает, куда ушла загрузка.** `resolveBackendUrl()` (`frontend/src/shared/api/backendApi.ts`)
  разрешает путь от той же базы, что и вызовы API (`VITE_API_BASE_URL`). На проде она пустая, то есть
  это origin страницы. Прод отдаёт бандл `index-B-ohBGh4.js`, тот же хэш, что у сборки `1286ff6` с
  пустой переменной. Там же nginx хоста отдаёт `/uploads/` бэкенду: проверено curl 2026-10-28,
  на `https://weighly.frelikh.dev/uploads/images/<несуществующий>.png` отвечает Express 404.
  На проде баннер получит `https://weighly.frelikh.dev/uploads/images/<uuid>.<ext>`.
- Правило BUG-REG-040 не тронуто: `javascript:`, `data:`, мусор и путь без хоста по-прежнему дают 400.
- `img-src 'self'` в `frontend/nginx.conf` (BUG-REG-002) соблюдён: URL на origin страницы.

## Проверка (2026-10-28)

- **Регрессионные тесты.**
  - `backend/test/regression/bug-reg-072-banner-upload-relative-url.spec.ts` берёт настоящие
    `FilesService` и `AdvertisingService` из `dist/`. Загрузка отдаёт путь от корня. Этот путь как есть
    `createBanner` отклоняет с `errors.advertising.imageUrlMustBeHttpUrl` и ничего не пишет. Тот же
    путь, разрешённый от origin сайта, создаёт баннер с абсолютным URL. Тест идёт в CI.
  - `frontend/src/shared/api/backendApi.test.ts`, блок `resolveBackendUrl` (BUG-REG-072): путь
    загрузки → абсолютный http(s) на origin страницы, абсолютный URL не меняется, при непустом
    `VITE_API_BASE_URL` берётся его origin. В момент фикса CI их не гонял: job фронтенда в
    `.github/workflows/ci.yml` делал только `npm ci` и `npm run build`. Тем же днём в job добавлен
    `npm test` перед сборкой.
- **Гейты.** Backend: `nest build` и `node --test 'src/**/*.spec.ts' 'test/regression/**/*.spec.ts'`,
  199/199. Frontend: `npm test` 16/16, `npm run build`.
- **Docker smoke.** Окружение то же, что выше, `FRONTEND_ORIGIN=https://edge`. Один и тот же скрипт
  прогнан против двух образов фронтенда. В каждом браузере: вход, карточка магазина, загрузка баннера
  через вкладку.
  - **До фикса** (сборка `1286ff6`, бандл `index-B-ohBGh4.js`): во всех трёх браузерах
    `imageUrl: "/uploads/images/<uuid>.png"` → 400 и alert с текстом выше.
  - **После** (бандл `index-M46fPf_h.js`): во всех трёх 201, отправлен и сохранён
    `https://edge/uploads/images/<uuid>.png`, под полем «Баннер загружен и добавлен…», alert нет,
    превью новой строки отрисовано (`naturalWidth` 96). Нарушений CSP нет; WebKit пишет только свой
    ложный `style-src-attr` на `<select>`.
  - Затем через API: валидация каталога без блокирующих ошибок, публикация. В `packageData.advertising.banners`
    те же три абсолютных URL. GET каждого без сессии, как его сделали бы весы: 200 `image/png`.
    `/uploads/images/…` и `javascript:alert(1)` в `imageUrl` баннера по-прежнему дают 400.

## Не входит в фикс

- **Картинки товаров.** Форма товара так же кладёт в `imageUrl` относительный `publicUrl`. Бэкенд
  товаров его не проверяет, поэтому в UI всё работает. Но в пакет картинка товара уходит путём без
  хоста. В том же smoke `items[].imageUrl` в `packageData` был `/uploads/images/<uuid>.png`, и GET без
  базового URL на нём падает с `Invalid URL`. Это отдельное решение: менять сохранённые данные, форму
  или сборку пакета. Здесь не трогалось.
- Баннеры, созданные из UI до `4497f57`, могли сохраниться с относительным `imageUrl`. Данные прода
  не проверялись.
