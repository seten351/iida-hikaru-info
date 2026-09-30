import type { AdminDeadlineFields } from "@/domain/deadline";
import { formatAdminDate } from "../_components";

export function formatAdminDeadline(value: Pick<AdminDeadlineFields, "deadlinePrecision" | "deadlineAt" | "deadlineOn">) {
  if (value.deadlinePrecision === "unknown") return "締切日時未定";
  if (value.deadlinePrecision === "date") return `${value.deadlineOn}（時刻未確認・日本時間）`;
  return `${formatAdminDate(value.deadlineAt)}（日本時間）`;
}

export const adminDeadlineStateLabels = { scheduled: "通常", closed: "受付終了", cancelled: "中止" } as const;
