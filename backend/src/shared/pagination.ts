export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export type PaginationInput = {
  limit?: string | number;
  offset?: string | number;
};

export type PaginationMeta = {
  total: number;
  limit: number;
  offset: number;
};

export function parseLimit(
  value: string | number | undefined,
  defaultLimit: number = DEFAULT_LIMIT,
  maxLimit: number = MAX_LIMIT,
): number {
  if (value === undefined || value === null || value === '') return defaultLimit;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(Math.trunc(parsed), maxLimit);
}

export function parseOffset(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

export function buildMeta(total: number, limit: number, offset: number): PaginationMeta {
  return { total, limit, offset };
}
