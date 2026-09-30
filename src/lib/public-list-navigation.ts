import { appearanceFilterSearchParamKeys, type AppearanceFilters } from "./appearance-filters";

/** Only search conditions cross page boundaries; history/calendar controls stay on home. */
export function createPublicListHref(pathname: string, filters: AppearanceFilters) {
  const params = new URLSearchParams();
  for (const key of appearanceFilterSearchParamKeys) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function createPublicHomeHref(filters: AppearanceFilters, section: "latest" | "deadlines") {
  return `${createPublicListHref("/", filters)}#${section}`;
}
