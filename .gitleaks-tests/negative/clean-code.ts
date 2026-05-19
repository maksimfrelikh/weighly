// Ordinary source code with no secrets — MUST NOT trigger.
export function formatPrice(amountMinor: number): string {
  const rubles = (amountMinor / 100).toFixed(2);
  return `${rubles} ₽`;
}

export class CatalogVersion {
  constructor(
    public readonly id: string,
    public readonly publishedAt: Date,
  ) {}

  isStale(reference: Date): boolean {
    return reference.getTime() - this.publishedAt.getTime() > 24 * 60 * 60 * 1000;
  }
}
