# BUG-REG-073: Картинка товара попадает в опубликованный пакет путём без хоста — весы не могут её загрузить

## Status: FIXED, на проде с 2026-10-28 (деплой `666f0ed`)

Форма товара переводит `publicUrl` загрузки в абсолютный URL так же, как вкладка баннеров после
[BUG-REG-072](BUG-REG-072-banner-upload-relative-image-url.md). Бэкенд товаров принимает в `imageUrl`
только пустое значение или абсолютный http(s) URL — то же правило, что у баннеров с BUG-REG-040.
Проверки — в разделе «Проверка».

**Прод:** деплой `666f0ed` 2026-10-28, 07:20 UTC, вместе с BUG-REG-072; до него прод был на `1286ff6`.
После деплоя `/api/version` отдаёт `666f0ed`. Страница отдаёт бандл `index-BA_EWBAR.js`, тот же, что
прошёл smoke ниже. В контейнере backend скомпилирована новая проверка `imageUrl`. Данные после деплоя
те же, что до него (раздел «Данные прода»). Сохранение товара на самом проде не прогоняли.

- **Severity:** medium: в админке всё выглядит рабочим, но весы получают в пакете URL, который не могут загрузить
- **Area:** products / publishing package / frontend ↔ backend contract
- **Role:** admin, operator (`@RequireRoles('admin', 'operator')` на контроллере товаров)
- **Environment:** Docker smoke: main @ `799ec46`, Postgres 18, образы backend и frontend, nginx с TLS вместо хостового
- **Browser/Tool:** Playwright 1.64.1: Chromium 156, Firefox 157, WebKit 27.2
- **Found during:** browser smoke для [BUG-REG-072](BUG-REG-072-banner-upload-relative-image-url.md), 2026-10-28
- **Related:** [BUG-REG-072](BUG-REG-072-banner-upload-relative-image-url.md) (тот же путь у баннеров),
  [BUG-REG-040](../../2026-05-17/bugs/BUG-REG-040-banner-imageurl-permissive.md) (правило для URL картинки),
  [BUG-REG-019](../../2026-05-17/bugs/BUG-REG-019.md) (`javascript:` в `imageUrl` товара, закрыт этим же правилом)

## Шаги воспроизведения

1. Войти в админку, «Товары» → «Создать товар».
2. Заполнить PLU, название и короткое название, в поле «Загрузка изображения товара» выбрать PNG, JPG
   или WebP до 2 МБ, сохранить.
3. Разместить товар в активном каталоге магазина, задать цену, опубликовать каталог.
4. Взять `items[].imageUrl` из `packageData` опубликованной версии и сделать GET, как весы: без сессии
   и без базового URL.

## Ожидаемое

В `items[].imageUrl` абсолютный URL, как в PRD §6.12 (`"imageUrl": "https://example.com/uploads/apple.webp"`),
и GET отдаёт картинку.

## Фактическое

Товар сохранён с `imageUrl: "/uploads/images/<uuid>.png"`, в пакете тот же путь, GET падает с
`Invalid URL`. В админке ошибки не видно: превью грузится, потому что браузер разрешает путь от origin
страницы.

## Network

```
POST /api/files/images                          → 201 {"fileAsset":{"publicUrl":"/uploads/images/<uuid>.png",…}}
POST /api/products
  body: {…,"imageUrl":"/uploads/images/<uuid>.png","imageFileAssetId":"<uuid>"}
                                                → 201 {"product":{…,"imageUrl":"/uploads/images/<uuid>.png"}}
POST /api/stores/<id>/publishing/catalog-publish → 201, packageData…items[].imageUrl: "/uploads/images/<uuid>.png"
GET /uploads/images/<uuid>.png без базового URL  → apiRequestContext.get: Invalid URL
```

## Причина

- `handleImageUpload` (`ProductForm`, `frontend/src/main.tsx`) клал в `imageUrl` товара
  `fileAsset.publicUrl` из ответа загрузки как есть.
- `publicUrl` относительный: `FilesService` (`backend/src/files/files.service.ts`) собирает его как
  `/uploads/images/<uuid>.<ext>`.
- `ProductsService` (`backend/src/products/products.service.ts`) сохранял в `imageUrl` любую строку,
  только обрезав пробелы. Так же проходило всё, что набрано в текстовом поле «URL изображения» или
  прислано в API.
- `CatalogPackageService` (`backend/src/publishing/catalog-package.service.ts`) копирует
  `product.imageUrl` в `items[].imageUrl` без изменений. Валидация каталога картинки товаров не смотрит.
- Весы получают только пакет: `ScalesService` отдаёт сохранённый `packageData`. Хост взять неоткуда.

## Решение

Объём согласован с владельцем 2026-10-28: форма и правило на бэкенде; что делать с уже сохранёнными
путями — решать после проверки прода.

- **Форма** переводит `publicUrl` в абсолютный URL через `resolveBackendUrl()`
  (`frontend/src/shared/api/backendApi.ts`), как вкладка баннеров. База — та же, что у вызовов API; на
  проде это origin страницы, его же разрешает `img-src 'self'`. Почему URL достраивает клиент, а не
  бэкенд, — в BUG-REG-072, раздел «Решение и почему на фронтенде».
- **Бэкенд** принимает в `imageUrl` товара пустое значение (хранится `null`) или абсолютный http(s)
  URL. Остальное — 400 `errors.products.imageUrlMustBeHttpUrl` («imageUrl должен быть корректным URL с
  протоколом http(s)»): путь без хоста, `javascript:`, `//host/…`, мусор. Это закрывает текстовое поле
  и API, а заодно BUG-REG-019 (`javascript:` в `imageUrl` товара). Проверка — `isHttpUrl()` в `backend/src/advertising/image-url.util.ts`; через неё же теперь
  работает `validateBannerImageUrl` (BUG-REG-040), так что правило для баннеров и товаров одно.
- **Сборка пакета не менялась:** `imageUrl` по-прежнему копируется как есть, защита стоит на записи.
- **Следствие для строк, сохранённых до фикса.** Форма при каждом сохранении отправляет сохранённый
  `imageUrl` обратно. Товар с путём без хоста после фикса не сохранится, пока картинку не загрузят
  заново или не исправят URL: 400 с тем же текстом. Повторная загрузка чинит строку (проверено в smoke).

## Данные прода (2026-10-28, до фикса)

Read-only запрос к Postgres прода (netcup, `BEGIN TRANSACTION READ ONLY`, только счётчики): товаров 3,
у всех `imageUrl` пустой; баннеров 0; опубликованных версий каталога 0. Путей без хоста нет ни в
данных, ни в пакетах. Переписывать нечего, и сохранённым товарам следствие выше не грозит.

## Проверка (2026-10-28)

- **Регрессионные тесты.**
  - `backend/test/regression/bug-reg-073-product-image-relative-url.spec.ts` берёт настоящие
    `FilesService`, `ProductsService` и `CatalogPackageService` из `dist/`. Путь загрузки сам по себе
    не разбирается как URL. `createProduct` отклоняет его, а также `apples.png`, `//cdn.example.com/…` и
    `javascript:`, с `errors.products.imageUrlMustBeHttpUrl` и ничего не пишет. `updateProduct` тоже
    отклоняет и сохранённое не трогает. URL, разрешённый от origin сайта, сохраняется, и пакет несёт его
    как URL, который разбирается без базы. Пустой, пробельный и очищенный `imageUrl` дают `null`. На
    сборке `799ec46` (до фикса) два теста на отказ падают, три остальных проходят. Тест идёт в CI.
  - `frontend/src/shared/api/backendApi.test.ts`: блок `resolveBackendUrl` теперь про оба вызова
    (BUG-REG-072, BUG-REG-073). Идёт в CI: с `9519fb2` job фронтенда в `.github/workflows/ci.yml`
    запускает `npm test` перед сборкой.
- **Гейты.** Backend: `nest build` и `node --test 'src/**/*.spec.ts' 'test/regression/**/*.spec.ts'`,
  204/204. Frontend: `npm test` 16/16, `npm run build`.
- **Docker smoke.** Окружение то же, что выше, `FRONTEND_ORIGIN=https://edge`. Один и тот же скрипт
  прогнан сначала на образах `799ec46`, затем на образах с фиксом поверх той же базы. В каждом браузере:
  вход, «Создать товар», загрузка PNG, сохранение. Затем через API: категория, размещение, цена,
  валидация, публикация и GET каждой картинки из пакета без сессии и без базового URL.
  - **До фикса** (бандл `index-M46fPf_h.js`): во всех трёх браузерах отправлен и сохранён
    `/uploads/images/<uuid>.png`, превью отрисовано. Валидация без блокирующих ошибок, публикация 201.
    В пакете три пути без хоста, GET каждого — `Invalid URL`.
  - **После** (бандл `index-BA_EWBAR.js`): во всех трёх в поле и превью
    `https://edge/uploads/images/<uuid>.png` (`naturalWidth` 96), отправлен и сохранён он же, 201.
    Путь, набранный в поле «URL изображения», — 400, alert «imageUrl должен быть корректным URL с
    протоколом http(s)», товар не создан. Товар, сохранённый до фикса с путём без хоста: сохранение как
    есть — 400 и тот же alert, после повторной загрузки — 200 и абсолютный URL. Публикация: в пакете
    шесть товаров, у всех абсолютный URL, GET каждого без сессии — 200 `image/png`. Нарушений CSP нет;
    WebKit пишет только свой ложный `style-src-attr` на `<select>`.

## Не входит в фикс

- Убрать картинку у товара из формы нельзя. Пустое поле `ProductForm` отправляет как `undefined`, RTK
  Query выкидывает такой ключ из JSON, а `updateProduct` поле без значения не трогает. Через API
  `"imageUrl": ""` картинку убирает. Так было и до фикса; в браузере не проверялось.
