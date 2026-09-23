import type { AppearanceImportItem } from "../src/domain/appearance";
import { eventAppearances } from "./appearance-import-data/events";
import { gameAppearances } from "./appearance-import-data/games";
import { regularProgramAppearances } from "./appearance-import-data/programs";
import { voiceAppearances } from "./appearance-import-data/voice";

export const appearanceImportData = [
  ...eventAppearances,
  ...gameAppearances,
  ...regularProgramAppearances,
  ...voiceAppearances,
] satisfies readonly AppearanceImportItem[];

