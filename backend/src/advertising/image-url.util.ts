export type BannerImageUrlValidationResult =
  | { valid: true; value: string }
  | { valid: false; reasonKey: 'errors.advertising.imageUrlRequired' | 'errors.advertising.imageUrlMustBeHttpUrl' };

// Banner and product images go into the published package as is, and a scale
// fetches them without a base URL: only an absolute http(s) URL will do
// (BUG-REG-040 for banners, BUG-REG-073 for products).
export function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

export function validateBannerImageUrl(value: unknown): BannerImageUrlValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, reasonKey: 'errors.advertising.imageUrlRequired' };
  }
  const trimmed = value.trim();
  if (!isHttpUrl(trimmed)) {
    return { valid: false, reasonKey: 'errors.advertising.imageUrlMustBeHttpUrl' };
  }
  return { valid: true, value: trimmed };
}
