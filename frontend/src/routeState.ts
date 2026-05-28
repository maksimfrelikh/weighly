export type DashboardView =
  | { name: 'overview' }
  | { name: 'stores' }
  | { name: 'store-details'; storeId: string }
  | { name: 'store-create' }
  | { name: 'store-edit'; storeId: string }
  | { name: 'products' }
  | { name: 'product-create' }
  | { name: 'product-edit'; productId: string }
  | { name: 'route-not-found'; returnTo: 'stores' | 'products'; messageKey: 'listInvalid' | 'detailsInvalid' | 'editInvalid' }
  | { name: 'users-access' }
  | { name: 'global-logs' };

export const uuidRouteIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidRouteId(routeId: string): boolean {
  return uuidRouteIdPattern.test(routeId.trim());
}

export function readValidatedHashId(hash: string, prefix: string): string | null {
  if (!hash.startsWith(prefix)) {
    return null;
  }

  const rawId = hash.slice(prefix.length).trim();
  return isValidRouteId(rawId) ? rawId : null;
}

export function routeNotFoundView(
  returnTo: 'stores' | 'products',
  messageKey: 'listInvalid' | 'detailsInvalid' | 'editInvalid',
): DashboardView {
  return { name: 'route-not-found', returnTo, messageKey };
}

export function viewFromHash(hash: string): DashboardView {
  if (hash === '#global-logs') return { name: 'global-logs' };
  if (hash === '#users-access') return { name: 'users-access' };
  if (hash === '#stores') return { name: 'stores' };
  if (hash === '#store-create') return { name: 'store-create' };
  if (hash === '#stores-not-found') {
    return routeNotFoundView('stores', 'listInvalid');
  }
  if (hash.startsWith('#store:')) {
    const storeId = readValidatedHashId(hash, '#store:');
    return storeId
      ? { name: 'store-details', storeId }
      : routeNotFoundView('stores', 'detailsInvalid');
  }
  if (hash.startsWith('#store-edit:')) {
    const storeId = readValidatedHashId(hash, '#store-edit:');
    return storeId
      ? { name: 'store-edit', storeId }
      : routeNotFoundView('stores', 'editInvalid');
  }
  if (hash === '#products') return { name: 'products' };
  if (hash === '#product-create') return { name: 'product-create' };
  if (hash === '#products-not-found') {
    return routeNotFoundView('products', 'listInvalid');
  }
  if (hash.startsWith('#product-edit:')) {
    const productId = readValidatedHashId(hash, '#product-edit:');
    return productId
      ? { name: 'product-edit', productId }
      : routeNotFoundView('products', 'editInvalid');
  }
  return { name: 'overview' };
}

export function hashFromView(view: DashboardView) {
  if (view.name === 'global-logs') return '#global-logs';
  if (view.name === 'users-access') return '#users-access';
  if (view.name === 'stores') return '#stores';
  if (view.name === 'store-create') return '#store-create';
  if (view.name === 'store-details') return `#store:${view.storeId}`;
  if (view.name === 'store-edit') return `#store-edit:${view.storeId}`;
  if (view.name === 'products') return '#products';
  if (view.name === 'product-create') return '#product-create';
  if (view.name === 'product-edit') return `#product-edit:${view.productId}`;
  if (view.name === 'route-not-found') return `#${view.returnTo}-not-found`;
  return '';
}
