import type { AdminWriteInput } from "@/server/admin/write-input";

export type AdminWriteActionState =
  | { stage: "idle" }
  | { stage: "preview"; token: string; input: AdminWriteInput }
  | {
      stage: "complete";
      status: "approved" | "rejected" | "superseded";
      message: string;
      proposalIds: string[];
    }
  | { stage: "error"; message: string };

export const initialAdminWriteState: AdminWriteActionState = { stage: "idle" };
