import { getReceptionFields, type AdminDeadlineFields, type ReceptionFields } from "@/domain/deadline";
import { formatAdminDate } from "../_components";

export function formatAdminDeadline(value: Pick<AdminDeadlineFields, "deadlinePrecision" | "deadlineAt" | "deadlineOn">) {
  if (value.deadlinePrecision === "unknown") return "締切日時未定";
  if (value.deadlinePrecision === "date") return `${value.deadlineOn}（時刻未確認・日本時間）`;
  return `${formatAdminDate(value.deadlineAt)}（日本時間）`;
}

export function formatAdminReceptionStart(value: Partial<ReceptionFields>) {
  const fields = getReceptionFields(value);
  if (fields.startsAtPrecision === "unknown") return "開始日時未確認";
  if (fields.startsAtPrecision === "date") return `${fields.startsOn}（時刻未確認・日本時間）`;
  return `${formatAdminDate(fields.startsAt)}（日本時間）`;
}

export function formatAdminReceptionEnd(value: Pick<AdminDeadlineFields, "deadlinePrecision" | "deadlineAt" | "deadlineOn">) {
  return value.deadlinePrecision === "unknown" ? "終了日時未確認" : formatAdminDeadline(value);
}

export const adminDeadlineStateLabels = { scheduled: "通常（自動判定）", closed: "終了", cancelled: "中止", sold_out: "完売" } as const;
