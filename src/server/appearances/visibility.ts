import { eq, isNull, or } from "drizzle-orm";

import { appearancesTable } from "@/db/schema";

export const publicAppearanceCondition = or(
  isNull(appearancesTable.visibilityStatus),
  eq(appearancesTable.visibilityStatus, "public"),
);
