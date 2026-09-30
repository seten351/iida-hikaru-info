export type AppearanceGuestInfo = {
  /** false is a confirmed non-guest role; null means unconfirmed. */
  isHikaruGuest: boolean | null;
  /** Other guests only, in official announcement order. */
  guestNames: string[];
};

export function emptyGuestInfo(): AppearanceGuestInfo {
  return { isHikaruGuest: null, guestNames: [] };
}

export function normalizeGuestInfo(value: unknown): AppearanceGuestInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ゲスト情報が不正です。");
  }
  const input = value as Record<string, unknown>;
  if (input.isHikaruGuest !== null && typeof input.isHikaruGuest !== "boolean") {
    throw new Error("本人のゲスト区分はtrue・false・nullで指定してください。");
  }
  if (!Array.isArray(input.guestNames) || input.guestNames.length > 100) {
    throw new Error("他ゲストは100名以内の配列で指定してください。");
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const name of input.guestNames) {
    if (typeof name !== "string") throw new Error("ゲスト名が不正です。");
    const normalized = name.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!normalized || normalized.length > 200) throw new Error("ゲスト名は1〜200文字で指定してください。");
    if (normalized.replace(/\s/gu, "") === "飯田ヒカル") {
      throw new Error("飯田ヒカル本人は本人のゲスト区分に指定してください。");
    }
    if (!seen.has(normalized)) names.push(normalized);
    seen.add(normalized);
  }
  return { isHikaruGuest: input.isHikaruGuest, guestNames: names };
}

export function sameGuestInfo(a: AppearanceGuestInfo | undefined, b: AppearanceGuestInfo | undefined) {
  const left = a ?? emptyGuestInfo();
  const right = b ?? emptyGuestInfo();
  return left.isHikaruGuest === right.isHikaruGuest &&
    left.guestNames.length === right.guestNames.length &&
    left.guestNames.every((name, index) => name === right.guestNames[index]);
}
