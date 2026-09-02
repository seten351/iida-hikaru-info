import type { AppearanceImportItem } from "../src/domain/appearance";
import { eventAppearances } from "./appearance-import-data/events";
import { regularProgramAppearances } from "./appearance-import-data/programs";
import { voiceAppearances } from "./appearance-import-data/voice";

export const appearanceImportData = [
  ...eventAppearances,
  ...regularProgramAppearances,
  ...voiceAppearances,
] satisfies readonly AppearanceImportItem[];
