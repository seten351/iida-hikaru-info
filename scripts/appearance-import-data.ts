import type { AppearanceImportItem } from "../src/domain/appearance";
import { eventAppearances } from "./appearance-import-data/events";
import { gameAppearances } from "./appearance-import-data/games";
import { regularProgramAppearances } from "./appearance-import-data/programs";
import { publicationCorrections } from "./appearance-import-data/publication-corrections";
import { voiceAppearances } from "./appearance-import-data/voice";

const appearanceImportDataWithoutCorrections = [
  ...eventAppearances,
  ...gameAppearances,
  ...regularProgramAppearances,
  ...voiceAppearances,
] satisfies readonly AppearanceImportItem[];

export const appearanceImportData = appearanceImportDataWithoutCorrections.map((item) => ({
  ...item,
  ...(publicationCorrections[item.id] ?? {}),
})) satisfies readonly AppearanceImportItem[];
