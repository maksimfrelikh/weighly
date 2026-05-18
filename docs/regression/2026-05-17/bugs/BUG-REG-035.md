# BUG-REG-035: PATCH product/category to `archived` не каскадирует на placements (data integrity + limbo state после BUG-REG-026 fix)

- Severity: high
- Area: api/catalog
- Role: admin
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-18 (manager pre-merge audit BUG-REG-026, adjacent gap #2 + #3)
- Related: BUG-REG-026 (closed, e0f1ade); block-07 SUMMARY (cascade archive отсутствует — был помечен как related finding, теперь поднят в отдельный bug)

## Шаги воспроизведения

1. Logged in as qa-admin.
2. В Main catalog: создан root `CAT_R` (status=active), product `PROD_X` (status=active), placement `PLC_X` в `CAT_R` (status=active).
3. PATCH `/products/PROD_X` body `{status:"archived"}` → 200.
4. GET `/stores/:id/catalog/placements` (без `?status`) → `PLC_X.status=='active'`, `product.status=='archived'`.
5. Аналогично: PATCH `/stores/:id/catalog/categories/CAT_R {status:"archived"}` → 200; placement остаётся `status=active`, `category.status=='archived'`.

## Ожидаемое

PATCH product → archived **должен** каскадировать на все его placements: установить `placement.status='archived'` (или явно отвергнуть PATCH с 409, требуя предварительно archive placements). Аналогично PATCH category → archived: каскад на children categories и на все placements внутри подде­рева.

После каскада инвариант:
- `placement.status='active'` ⇒ `product.status='active'` AND `category.status='active'` AND все предки category.status='active'.

## Фактическое

PATCH product/category → archived обновляет только сам объект. Связанные placements остаются `status='active'`, указывают на archived parent. До BUG-REG-026 fix эти protected записи "протекали" через `GET /placements?status=active`. После BUG-REG-026 fix (e0f1ade) `?status=active` теперь применяет transitive filter — но данные в БД всё равно нарушают инвариант, и появляется новый side-effect: **limbo state**.

## Limbo state (acceptance criterion для closure)

`placement.status='active'` под `category.status='archived'`:
- `GET /placements?status=active` → отбрасывает запись (transitive `category.status='active'` не выполняется).
- `GET /placements?status=archived` → не находит запись (`placement.status` буквально `'active'`).
- `GET /placements` (без фильтра) → возвращает запись, но смешанно со всеми прочими.

Placement остаётся в БД как "невидимый" для status-фильтрующих UI surfaces. Пользователь не может его обнаружить и переместить/архивировать через обычные пути.

**Acceptance criterion BUG-REG-035 closure**: после fix должно быть невозможно создать или оставить запись с `placement.status='active'` AND (`product.status≠'active'` OR `category.status≠'active'` OR любого предка category.status≠'active'). Любой existing limbo placement должен быть migrated на `archived` (data migration в рамках fix).

## Network / Console

```
PATCH /api/products/:productId {status:"archived"}
200 OK — product updated, no cascade

PATCH /api/stores/:storeId/catalog/categories/:categoryId {status:"archived"}
200 OK — category updated, no cascade to children/placements

# Post-BUG-REG-026 (e0f1ade):
GET /api/stores/:storeId/catalog/placements?status=active  → limbo placement не возвращается
GET /api/stores/:storeId/catalog/placements?status=archived → limbo placement не возвращается
GET /api/stores/:storeId/catalog/placements                 → limbo placement виден среди всех
```

## Impact

- Data integrity: БД содержит state, нарушающий бизнес-инвариант (active placement → archived product/category).
- Limbo state: после BUG-REG-026 fix limbo записи невидимы для основных UI surfaces; админ не может их archive/move через обычные пути → требует прямого SQL или нового админ-инструмента.
- Scale device sync: если sync читает не через `?status=active` surface, а напрямую placements таблицу — потенциально пушит archived продукты/категории.
- Audit trail: archive action на product не порождает соответствующий `placement.archived` action для каждого затронутого размещения → события теряются.

## Hypothesis

В service.updateProduct / catalog.service.ts updateCategory нет каскадного перехода status. Нужно либо:
- (A) Каскадировать: при PATCH product/category → archived, в той же транзакции `UPDATE CatalogProductPlacement SET status='archived' WHERE productId=… OR categoryId IN (subtree)` + audit log per placement.
- (B) Отвергать: 409 если у entity есть active placements; требовать клиент сначала archive placements (более consistent с существующим `assertActivePlacementAllowed` invariant).

Также: одноразовая data migration для existing limbo records.

## Evidence

- catalog.service.ts:179-260 updateCategory (отсутствует cascade)
- products module updateProduct (аналогично — отсутствует cascade)
- BUG-REG-026 fix (e0f1ade): transitive filter в listPlacements (catalog.service.ts:341-343) маскирует data integrity но создаёт limbo
- block-07 SUMMARY: cascade archive previously noted as related finding, не отдельный bug

## Out of scope

- Public/scale-device API contract (если он отдельный от admin surface) — нужен отдельный аудит после fix этой.
- Bulk migration UI для existing limbo records (можно разовый script в рамках fix).
