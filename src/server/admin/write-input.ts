import { appearanceCategories, publishedAtPrecisions } from "@/domain/appearance";

const normalizedIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const timezoneSuffixPattern = /(?:Z|[+-]\d{2}:\d{2})$/;
const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

type Publication = {
  precision: (typeof publishedAtPrecisions)[number];
  publishedAt: string | null;
  publishedOn: string | null;
};

export type AdminSourceInput = Publication & {
  canonicalUrl: string;
  sourceName: string;
  externalItemId: string;
  evidenceKey: string;
};

export type AdminAppearanceFields = {
  id: string;
  startsAtPrecision: "exact" | "date" | "unknown";
  startsAt: string | null;
  startsOn: string | null;
  title: string;
  seriesId: string | null;
  eventGroupId: string | null;
  eventTitle: string | null;
  sessionLabel: string | null;
  category: (typeof appearanceCategories)[number];
};

export type AdminAppearanceMutationInput =
  | {
      kind: "appearance";
      operation: "create";
      expectedVersion: null;
      fields: AdminAppearanceFields;
      source: AdminSourceInput;
    }
  | {
      kind: "appearance";
      operation: "update";
      appearanceId: string;
      expectedVersion: number;
      fields: AdminAppearanceFields;
    }
  | {
      kind: "appearance";
      operation: "hide" | "restore";
      appearanceId: string;
      expectedVersion: number;
    };

export type AdminAppearanceGroupMutationInput = {
  kind: "appearance-group";
  operation: "update";
  eventGroupId: string;
  eventTitle: string;
  targets: Array<{
    appearanceId: string;
    expectedVersion: number;
    title: string;
  }>;
};

export type AdminSourceMutationInput = {
  kind: "source";
  operation: "append" | "replace" | "primary";
  targets: Array<{ appearanceId: string; expectedVersion: number }>;
  source:
    | AdminSourceInput
    | { sourceId: string; evidenceKey: string };
};

export type AdminSeriesMutationInput =
  | {
      kind: "series";
      operation: "create";
      seriesId: string;
      expectedVersion: null;
      displayName: string;
    }
  | {
      kind: "series";
      operation: "update";
      seriesId: string;
      expectedVersion: number;
      displayName: string;
    };

export type AdminWriteInput =
  | AdminAppearanceMutationInput
  | AdminAppearanceGroupMutationInput
  | AdminSourceMutationInput
  | AdminSeriesMutationInput;

export class AdminWriteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminWriteValidationError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminWriteValidationError(`${label}が不正です。`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, max = 500) {
  if (typeof value !== "string") {
    throw new AdminWriteValidationError(`${label}を入力してください。`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new AdminWriteValidationError(`${label}を確認してください。`);
  }
  return normalized;
}

function nullableString(value: unknown, label: string, max = 500) {
  if (value === null || value === undefined || value === "") return null;
  return requiredString(value, label, max);
}

function isBlank(value: unknown) {
  return value === null || value === undefined || value === "";
}

function normalizedId(value: unknown, label: string) {
  const id = requiredString(value, label, 200);
  if (!normalizedIdPattern.test(id)) {
    throw new AdminWriteValidationError(
      `${label}は小文字英数字と単一ハイフンで指定してください。`,
    );
  }
  return id;
}

function positiveVersion(value: unknown, label: string) {
  const version = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new AdminWriteValidationError(`${label}が不正です。`);
  }
  return version;
}

function dateTime(value: unknown, label: string) {
  const text = requiredString(value, label, 100);
  if (!timezoneSuffixPattern.test(text) || Number.isNaN(Date.parse(text))) {
    throw new AdminWriteValidationError(`${label}はtimezone付き日時で指定してください。`);
  }
  return new Date(text).toISOString();
}

function calendarDate(value: unknown, label: string) {
  const text = requiredString(value, label, 10);
  const match = calendarDatePattern.exec(text);
  if (!match) throw new AdminWriteValidationError(`${label}はYYYY-MM-DDで指定してください。`);
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new AdminWriteValidationError(`${label}が実在する日付ではありません。`);
  }
  return text;
}

function parsePublication(value: Record<string, unknown>): Publication {
  const precision = value.precision;
  if (!publishedAtPrecisions.includes(precision as Publication["precision"])) {
    throw new AdminWriteValidationError("公開日時の精度が不正です。");
  }
  if (precision === "exact") {
    return {
      precision,
      publishedAt: dateTime(value.publishedAt, "公開日時"),
      publishedOn: null,
    };
  }
  if (precision === "date") {
    return {
      precision,
      publishedAt: null,
      publishedOn: calendarDate(value.publishedOn, "公開日"),
    };
  }
  if (
    !isBlank(value.publishedAt) ||
    !isBlank(value.publishedOn)
  ) {
    throw new AdminWriteValidationError("精度unknownには公開日時を指定できません。");
  }
  return { precision: "unknown", publishedAt: null, publishedOn: null };
}

function parseSource(value: unknown): AdminSourceInput {
  const input = record(value, "情報源");
  const canonicalUrl = requiredString(input.canonicalUrl, "URL", 2048);
  let parsed: URL;
  try {
    parsed = new URL(canonicalUrl);
  } catch {
    throw new AdminWriteValidationError("URLが不正です。");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AdminWriteValidationError("URLはHTTP(S)のみ指定できます。");
  }
  parsed.hash = "";
  parsed.searchParams.sort();
  return {
    canonicalUrl: parsed.toString(),
    sourceName: requiredString(input.sourceName, "source name", 200),
    externalItemId: requiredString(input.externalItemId, "external item ID", 500),
    evidenceKey: normalizedId(input.evidenceKey, "evidence key"),
    ...parsePublication(input),
  };
}

function parseAppearanceFields(value: unknown): AdminAppearanceFields {
  const input = record(value, "出演情報");
  const startsAtPrecision = input.startsAtPrecision;
  if (
    startsAtPrecision !== "exact" &&
    startsAtPrecision !== "date" &&
    startsAtPrecision !== "unknown"
  ) {
    throw new AdminWriteValidationError("開始日時の精度が不正です。");
  }
  let startsAt: string | null = null;
  let startsOn: string | null = null;
  if (startsAtPrecision === "exact") {
    if (!isBlank(input.startsOn)) {
      throw new AdminWriteValidationError("精度exactには開始日を指定できません。");
    }
    startsAt = dateTime(input.startsAt, "開始日時");
  } else if (startsAtPrecision === "date") {
    if (!isBlank(input.startsAt)) {
      throw new AdminWriteValidationError("精度dateには開始日時を指定できません。");
    }
    startsOn = calendarDate(input.startsOn, "開始日");
  } else if (!isBlank(input.startsAt) || !isBlank(input.startsOn)) {
    throw new AdminWriteValidationError(
      "精度unknownには開始日時・開始日を指定できません。",
    );
  }
  const category = input.category;
  if (!appearanceCategories.includes(category as AdminAppearanceFields["category"])) {
    throw new AdminWriteValidationError("カテゴリが不正です。");
  }
  const eventGroupId = nullableString(input.eventGroupId, "event group ID", 200);
  const eventTitle = nullableString(input.eventTitle, "event title", 500);
  const sessionLabel = nullableString(input.sessionLabel, "session label", 200);
  const groupValues = [eventGroupId, eventTitle, sessionLabel];
  if (groupValues.some(Boolean) && groupValues.some((item) => item === null)) {
    throw new AdminWriteValidationError(
      "event group ID・event title・session labelは3項目すべてを指定してください。",
    );
  }
  return {
    id: normalizedId(input.id, "appearance ID"),
    startsAtPrecision,
    startsAt,
    startsOn,
    title: requiredString(input.title, "タイトル", 500),
    seriesId: isBlank(input.seriesId)
      ? null
      : normalizedId(input.seriesId, "series ID"),
    eventGroupId,
    eventTitle,
    sessionLabel,
    category: category as AdminAppearanceFields["category"],
  };
}

export function parseAdminWriteInput(value: unknown): AdminWriteInput {
  const input = record(value, "変更内容");
  if (input.kind === "appearance") {
    if (input.operation === "create") {
      return {
        kind: "appearance",
        operation: "create",
        expectedVersion: null,
        fields: parseAppearanceFields(input.fields),
        source: parseSource(input.source),
      };
    }
    if (input.operation === "update") {
      const fields = parseAppearanceFields(input.fields);
      const appearanceId = normalizedId(input.appearanceId, "appearance ID");
      if (fields.id !== appearanceId) {
        throw new AdminWriteValidationError("appearance IDは編集できません。");
      }
      return {
        kind: "appearance",
        operation: "update",
        appearanceId,
        expectedVersion: positiveVersion(input.expectedVersion, "version"),
        fields,
      };
    }
    if (input.operation === "hide" || input.operation === "restore") {
      return {
        kind: "appearance",
        operation: input.operation,
        appearanceId: normalizedId(input.appearanceId, "appearance ID"),
        expectedVersion: positiveVersion(input.expectedVersion, "version"),
      };
    }
  }
  if (input.kind === "appearance-group") {
    if (input.operation !== "update") {
      throw new AdminWriteValidationError("event group操作が不正です。");
    }
    if (!Array.isArray(input.targets) || input.targets.length < 2 || input.targets.length > 100) {
      throw new AdminWriteValidationError("event groupの対象appearanceを2〜100件指定してください。");
    }
    const targets = input.targets.map((value) => {
      const target = record(value, "対象appearance");
      return {
        appearanceId: normalizedId(target.appearanceId, "appearance ID"),
        expectedVersion: positiveVersion(target.expectedVersion, "version"),
        title: requiredString(target.title, "タイトル", 500),
      };
    });
    if (new Set(targets.map((target) => target.appearanceId)).size !== targets.length) {
      throw new AdminWriteValidationError("対象appearanceが重複しています。");
    }
    return {
      kind: "appearance-group",
      operation: "update",
      eventGroupId: requiredString(input.eventGroupId, "event group ID", 200),
      eventTitle: requiredString(input.eventTitle, "event title", 500),
      targets,
    };
  }
  if (input.kind === "source") {
    if (!["append", "replace", "primary"].includes(String(input.operation))) {
      throw new AdminWriteValidationError("情報源操作が不正です。");
    }
    if (!Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > 100) {
      throw new AdminWriteValidationError("対象appearanceを1〜100件指定してください。");
    }
    const targets = input.targets.map((value) => {
      const target = record(value, "対象appearance");
      return {
        appearanceId: normalizedId(target.appearanceId, "appearance ID"),
        expectedVersion: positiveVersion(target.expectedVersion, "version"),
      };
    });
    if (new Set(targets.map((target) => target.appearanceId)).size !== targets.length) {
      throw new AdminWriteValidationError("対象appearanceが重複しています。");
    }
    const source =
      input.operation === "primary"
        ? (() => {
            const selected = record(input.source, "情報源");
            return {
              sourceId: requiredString(selected.sourceId, "source ID", 200),
              evidenceKey: normalizedId(selected.evidenceKey, "evidence key"),
            };
          })()
        : parseSource(input.source);
    return {
      kind: "source",
      operation: input.operation as AdminSourceMutationInput["operation"],
      targets,
      source,
    };
  }
  if (input.kind === "series") {
    const seriesId = normalizedId(input.seriesId, "series ID");
    const displayName = requiredString(input.displayName, "表示名", 200);
    if (input.operation === "create") {
      return { kind: "series", operation: "create", seriesId, expectedVersion: null, displayName };
    }
    if (input.operation === "update") {
      return {
        kind: "series",
        operation: "update",
        seriesId,
        expectedVersion: positiveVersion(input.expectedVersion, "version"),
        displayName,
      };
    }
  }
  throw new AdminWriteValidationError("未対応の変更操作です。");
}
