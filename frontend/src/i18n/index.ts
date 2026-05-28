import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import commonRu from '../locales/ru/common.json';
import authRu from '../locales/ru/auth.json';
import dashboardRu from '../locales/ru/dashboard.json';
import navigationRu from '../locales/ru/navigation.json';
import validationRu from '../locales/ru/validation.json';
import storesRu from '../locales/ru/stores.json';
import productsRu from '../locales/ru/products.json';
import catalogRu from '../locales/ru/catalog.json';
import pricesRu from '../locales/ru/prices.json';
import advertisingRu from '../locales/ru/advertising.json';
import publishingRu from '../locales/ru/publishing.json';
import scalesRu from '../locales/ru/scales.json';
import logsRu from '../locales/ru/logs.json';
import usersRu from '../locales/ru/users.json';

import commonEn from '../locales/en/common.json';
import authEn from '../locales/en/auth.json';
import dashboardEn from '../locales/en/dashboard.json';
import navigationEn from '../locales/en/navigation.json';
import validationEn from '../locales/en/validation.json';
import storesEn from '../locales/en/stores.json';
import productsEn from '../locales/en/products.json';
import catalogEn from '../locales/en/catalog.json';
import pricesEn from '../locales/en/prices.json';
import advertisingEn from '../locales/en/advertising.json';
import publishingEn from '../locales/en/publishing.json';
import scalesEn from '../locales/en/scales.json';
import logsEn from '../locales/en/logs.json';
import usersEn from '../locales/en/users.json';

export const SUPPORTED_LOCALES = ['ru', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_STORAGE_KEY = 'app.locale';
export const DEFAULT_LOCALE: SupportedLocale = 'ru';

export const I18N_NAMESPACES = [
  'common',
  'auth',
  'dashboard',
  'navigation',
  'validation',
  'stores',
  'products',
  'catalog',
  'prices',
  'advertising',
  'publishing',
  'scales',
  'logs',
  'users',
] as const;

export const resources = {
  ru: {
    common: commonRu,
    auth: authRu,
    dashboard: dashboardRu,
    navigation: navigationRu,
    validation: validationRu,
    stores: storesRu,
    products: productsRu,
    catalog: catalogRu,
    prices: pricesRu,
    advertising: advertisingRu,
    publishing: publishingRu,
    scales: scalesRu,
    logs: logsRu,
    users: usersRu,
  },
  en: {
    common: commonEn,
    auth: authEn,
    dashboard: dashboardEn,
    navigation: navigationEn,
    validation: validationEn,
    stores: storesEn,
    products: productsEn,
    catalog: catalogEn,
    prices: pricesEn,
    advertising: advertisingEn,
    publishing: publishingEn,
    scales: scalesEn,
    logs: logsEn,
    users: usersEn,
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    defaultNS: 'common',
    ns: I18N_NAMESPACES as unknown as string[],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: { useSuspense: true },
  });

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value != null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (!value) {
    return DEFAULT_LOCALE;
  }
  const base = value.split('-')[0].toLowerCase();
  return isSupportedLocale(base) ? base : DEFAULT_LOCALE;
}

export default i18n;
