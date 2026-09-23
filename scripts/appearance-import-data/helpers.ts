import type { AppearanceImportItem } from "../../src/domain/appearance";

export type Publication = Pick<
  AppearanceImportItem,
  "publishedAtPrecision" | "publishedAt" | "publishedOn"
>;

type CommonInput = Pick<
  AppearanceImportItem,
  | "id"
  | "title"
  | "seriesId"
  | "category"
  | "sourceUrl"
  | "sourceName"
  | "sourceItemId"
> & {
  startsAt: string;
  publication?: Publication;
};

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

type DateSingleInput = Pick<
  AppearanceImportItem,
  | "id"
  | "title"
  | "seriesId"
  | "category"
  | "sourceUrl"
  | "sourceName"
  | "sourceItemId"
> & {
  startsOn: string;
  publication?: Publication;
};

export function single(input: CommonInput): AppearanceImportItem {
  const { publication = unknownPublication, ...item } = input;
  return {
    ...item,
    startsAtPrecision: "exact",
    startsOn: null,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
    ...publication,
  };
}

export function singleDate(input: DateSingleInput): AppearanceImportItem {
  const { publication = unknownPublication, ...item } = input;
  return {
    ...item,
    startsAtPrecision: "date",
    startsAt: null,
    startsOn: item.startsOn,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
    ...publication,
  };
}

type UnknownSingleInput = Pick<
  AppearanceImportItem,
  | "id"
  | "title"
  | "seriesId"
  | "category"
  | "sourceUrl"
  | "sourceName"
  | "sourceItemId"
> & {
  publication?: Publication;
};

export function singleUnknown(input: UnknownSingleInput): AppearanceImportItem {
  const { publication = unknownPublication, ...item } = input;
  return {
    ...item,
    startsAtPrecision: "unknown",
    startsAt: null,
    startsOn: null,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
    ...publication,
  };
}

export function session(input: SessionInput): AppearanceImportItem {
  const { publication = unknownPublication, ...item } = input;
  return {
    ...item,
    startsAtPrecision: "exact",
    startsOn: null,
    ...publication,
  };
}

