import type commonRu from '../locales/ru/common.json';
import type authRu from '../locales/ru/auth.json';
import type dashboardRu from '../locales/ru/dashboard.json';
import type navigationRu from '../locales/ru/navigation.json';
import type validationRu from '../locales/ru/validation.json';
import type storesRu from '../locales/ru/stores.json';
import type productsRu from '../locales/ru/products.json';
import type catalogRu from '../locales/ru/catalog.json';
import type pricesRu from '../locales/ru/prices.json';
import type advertisingRu from '../locales/ru/advertising.json';
import type publishingRu from '../locales/ru/publishing.json';
import type scalesRu from '../locales/ru/scales.json';
import type logsRu from '../locales/ru/logs.json';
import type usersRu from '../locales/ru/users.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof commonRu;
      auth: typeof authRu;
      dashboard: typeof dashboardRu;
      navigation: typeof navigationRu;
      validation: typeof validationRu;
      stores: typeof storesRu;
      products: typeof productsRu;
      catalog: typeof catalogRu;
      prices: typeof pricesRu;
      advertising: typeof advertisingRu;
      publishing: typeof publishingRu;
      scales: typeof scalesRu;
      logs: typeof logsRu;
      users: typeof usersRu;
    };
  }
}

export {};
