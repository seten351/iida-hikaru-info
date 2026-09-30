import type { AdminDeadlineFields } from "../src/domain/deadline";
import type { AdminSourceInput } from "../src/server/admin/write-input";

export type DeadlineImportItem = {
  fields: AdminDeadlineFields;
  source: AdminSourceInput;
};

/** Add only deadlines supported by a specific official source. */
export const deadlineImportData: readonly DeadlineImportItem[] = [];
