import { createAppearanceHistoryPageHref } from "@/lib/appearance-pagination";

export function ListPagination({ currentPage, totalPages, currentSearchParams, pathname, label }: {
  currentPage: number;
  totalPages: number;
  currentSearchParams: string;
  pathname: string;
  label: string;
}) {
  if (totalPages <= 1) return null;
  const hrefFor = (page: number) => createAppearanceHistoryPageHref(pathname, currentSearchParams, page);
  return (
    <nav className="appearance-pagination" aria-label={label}>
      {currentPage > 1 ? <a className="appearance-pagination__link" href={hrefFor(currentPage - 1)}>前へ</a> : <span className="appearance-pagination__link" aria-disabled="true">前へ</span>}
      <p className="appearance-pagination__status" aria-live="polite"><span>{currentPage}</span> / {totalPages} ページ</p>
      {currentPage < totalPages ? <a className="appearance-pagination__link" href={hrefFor(currentPage + 1)}>次へ</a> : <span className="appearance-pagination__link" aria-disabled="true">次へ</span>}
    </nav>
  );
}
