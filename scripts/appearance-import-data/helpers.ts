import type { AppearanceImportItem } from "../../src/domain/appearance";

export type Publication = Pick<
  AppearanceImportItem,
  "publishedAtPrecision" | "publishedAt" | "publishedOn"
>;

type CommonInput = Pick<
  AppearanceImportItem,
  | "id"
  | "startsAt"
  | "title"
  | "seriesId"
  | "category"
  | "sourceUrl"
  | "sourceName"
  | "sourceItemId"
> & { publication?: Publication };

type SessionInput = CommonInput & {
  eventGroupId: string;
  eventTitle: string;
  sessionLabel: string;
};

export const unknownPublication = {
  publishedAtPrecision: "unknown",
  publishedAt: null,
  publishedOn: null,
} as const satisfies Publication;

export function publishedOn(value: string): Publication {
  return {
    publishedAtPrecision: "date",
    publishedAt: null,
    publishedOn: value,
  };
}

export function publishedAt(value: string): Publication {
  return {
    publishedAtPrecision: "exact",
    publishedAt: value,
    publishedOn: null,
  };
}

export function single(input: CommonInput): AppearanceImportItem {
  const { publication = unknownPublication, ...item } = input;
  return {
    ...item,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
    ...publication,
  };
}

export function session(input: SessionInput): AppearanceImportItem {
  const { publication = unknownPublication, ...item } = input;
  return { ...item, ...publication };
}
