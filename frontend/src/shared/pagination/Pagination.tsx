import { type ChangeEvent } from 'react';

export type PaginationMeta = {
  total: number;
  limit: number;
  offset: number;
};

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export type PaginationProps = {
  meta: PaginationMeta;
  onOffsetChange: (offset: number) => void;
  onLimitChange: (limit: number) => void;
  pageSizeOptions?: readonly number[];
  label?: string;
};

export function Pagination({
  meta,
  onOffsetChange,
  onLimitChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  label = 'items',
}: PaginationProps) {
  const { total, limit, offset } = meta;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  const atStart = offset <= 0;
  const atEnd = offset + limit >= total;

  const handlePrev = () => {
    if (atStart) return;
    onOffsetChange(Math.max(0, offset - limit));
  };

  const handleNext = () => {
    if (atEnd) return;
    onOffsetChange(offset + limit);
  };

  const handlePageSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextLimit = Number(event.target.value);
    if (Number.isFinite(nextLimit) && nextLimit > 0) {
      onLimitChange(nextLimit);
    }
  };

  return (
    <div className="pagination" data-testid="pagination">
      <span className="pagination__label muted" data-testid="pagination-label">
        {total === 0 ? `0 ${label}` : `${first}–${last} of ${total} ${label}`}
      </span>
      <div className="pagination__controls">
        <button
          type="button"
          className="secondary-button pagination__prev"
          data-testid="pagination-prev"
          onClick={handlePrev}
          disabled={atStart}
        >
          Prev
        </button>
        <button
          type="button"
          className="secondary-button pagination__next"
          data-testid="pagination-next"
          onClick={handleNext}
          disabled={atEnd}
        >
          Next
        </button>
        <label className="pagination__page-size">
          <span className="muted">Per page</span>
          <select value={limit} onChange={handlePageSizeChange} data-testid="pagination-page-size">
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
