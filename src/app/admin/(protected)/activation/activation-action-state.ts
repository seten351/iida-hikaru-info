export type ActivationReauthActionState =
  | { stage: "idle" }
  | { stage: "ready"; proof: string }
  | { stage: "error"; message: string };

export type ActivationActionState =
  | { stage: "idle" }
  | { stage: "complete"; message: string }
  | { stage: "error"; message: string };

export const initialActivationReauthState: ActivationReauthActionState = {
  stage: "idle",
};
export const initialActivationState: ActivationActionState = { stage: "idle" };
