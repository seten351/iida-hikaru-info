import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "飯田ヒカル 出演情報",
  description:
    "飯田ヒカルさんの今後の出演予定、新着情報、過去の出演履歴をまとめる非公式サイトです。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
