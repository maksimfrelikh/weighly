export type BannerImageUrlValidationResult =
  | { valid: true; value: string }
  | { valid: false; reason: string };

export function validateBannerImageUrl(value: unknown): BannerImageUrlValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, reason: 'imageUrl is required' };
  }
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'imageUrl must be a valid http(s) URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'imageUrl must be a valid http(s) URL' };
  }
  return { valid: true, value: trimmed };
}
