export type BannerImageUrlValidationResult =
  | { valid: true; value: string }
  | { valid: false; reason: string };

export function validateBannerImageUrl(value: unknown): BannerImageUrlValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, reason: 'imageUrl обязателен' };
  }
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'imageUrl должен быть корректным URL с протоколом http(s)' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'imageUrl должен быть корректным URL с протоколом http(s)' };
  }
  return { valid: true, value: trimmed };
}
