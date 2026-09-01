export const appearanceCategories = [
  "テレビ",
  "ラジオ",
  "配信",
  "イベント",
  "その他",
] as const;

export type AppearanceCategory = (typeof appearanceCategories)[number];

export type Appearance = {
  id: string;
  startsAt: string;
  title: string;
  category: AppearanceCategory;
  sourceUrl: string;
  publishedAt: string;
};
