import type { AppearanceCard } from "@/lib/appearances";

type SearchParamValue = string | string[] | undefined;

export const appearanceHistoryPageSize = 30;

function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function getAppearanceHistoryPage(
  value: SearchParamValue,
  totalItems: number,
) {
  const totalPages = Math.max(1, Math.ceil(totalItems / appearanceHistoryPageSize));
  const pageValue = firstSearchParam(value);
  const requestedPage =
    pageValue !== undefined && /^(?:[1-9]\d*)$/.test(pageValue)
      ? Number(pageValue)
      : 1;
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(requestedPage, totalPages)
    : totalPages;

  return { page, totalPages };
}

export function paginateAppearanceHistory(
  cards: AppearanceCard[],
  page: number,
) {
  const offset = (page - 1) * appearanceHistoryPageSize;
  return cards.slice(offset, offset + appearanceHistoryPageSize);
}

export function createAppearanceHistoryPageHref(
  pathname: string,
  currentSearchParams: string,
  page: number,
) {
  const searchParams = new URLSearchParams(currentSearchParams);
  searchParams.set("page", String(page));
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
