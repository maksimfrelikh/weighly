# BUG-REG-036: `?status=` (empty string) тихо игнорируется, `?status=invalid` → 400 — inconsistent input validation на /catalog/categories и /catalog/placements

- Severity: low (cosmetic / DX inconsistency, не data integrity)
- Area: api/catalog
- Role: admin / api-client
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-18 (manager pre-merge audit BUG-REG-026, adjacent gap #4)
- Related: BUG-REG-026 (closed, e0f1ade)

## Шаги воспроизведения

1. Logged in as qa-admin.
2. GET `/stores/:id/catalog/categories?status=` (явный пустой)
3. GET `/stores/:id/catalog/categories?status=invalid`
4. То же для `/catalog/placements`.

## Ожидаемое

Однозначное поведение для query параметра:
- (A) `?status=` (empty) валиден и эквивалентен отсутствию параметра → 200 с full list. И `?status=invalid` → также 200 с full list (либо 400, но **consistent** с empty).
- (B) Любая попытка указать `status=` (даже empty) → strict validation → 400 если значение не в enum `{active,inactive,archived}`.

PRD #2321 от Максима: "без параметра → возвращать ВСЁ". Пустая строка — пограничный случай, явно не сформулирован.

## Фактическое

После BUG-REG-026 fix (e0f1ade):
- `?status=` → handler видит `input.status === ''`, truthy check `input.status ? … : undefined` даёт `undefined`, валидация `requireCategoryStatus` не вызывается → возвращает full list (zero-breaking path).
- `?status=invalid` → truthy, `requireCategoryStatus('invalid')` → `BadRequestException` (HTTP 400).

Inconsistency: malformed input (empty) silently OK, malformed input (non-enum string) → 400. Клиент, формирующий запрос динамически, получает разное поведение в зависимости от того, как формируется query string.

## Network / Console

```
GET /api/stores/:id/catalog/categories?status=
200 OK — full list (status параметр трактуется как отсутствующий)

GET /api/stores/:id/catalog/categories?status=invalid
400 Bad Request — "Category status must be one of active|inactive|archived"

GET /api/stores/:id/catalog/placements?status=
200 OK — full list

GET /api/stores/:id/catalog/placements?status=invalid
400 Bad Request — "Placement status must be one of active|inactive|archived"
```

## Impact

- Cosmetic / DX. Клиент с динамическим `?status=${selectedFilter}` где `selectedFilter` может быть `''` (no filter selected) и `'invalid'` (баг в клиенте) получает разное поведение. Скрывает client-side bugs.
- Не data integrity, не auth, не утечка. Без блокировки.

## Hypothesis

В catalog.service.ts:122 и :330 проверка `input.status ? this.requireCategoryStatus(input.status) : undefined` использует truthy check. Пустая строка — falsy → undefined. Если поменять на `input.status !== undefined ? ...` или `typeof input.status === 'string' ? ...` — empty string также пойдёт в validator и получит 400.

Решение (low effort):
- (A) Strict path: изменить guard на `input.status !== undefined`. Empty string → 400. Consistent.
- (B) Lenient path: добавить trim+empty check в requireCategoryStatus → empty → undefined (treat as no-op). Document явно.

Рекомендуется (A) — strict validation на boundary, легче ловить client-side bugs.

## Evidence

- catalog.service.ts:122 (`listCategoryTree`: `input.status ? this.requireCategoryStatus(input.status) : undefined`)
- catalog.service.ts:330 (`listPlacements`: то же)
- catalog.service.ts:764 (`requireCategoryStatus` — нет проверки на empty)
- catalog.service.ts:773 (`requirePlacementStatus` — нет проверки на empty)

## Out of scope

- Другие endpoints с query-параметрами и truthy-check (audit отдельно).
- OpenAPI spec обновление (если есть schema validation на routing-level — может уже задавать enum).
