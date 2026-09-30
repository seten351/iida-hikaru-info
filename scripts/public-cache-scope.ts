import { databaseCacheScope } from "../src/server/public-cache/policy";

try {
  if (!process.env.DATABASE_URL) throw new Error("missing");
  console.log(databaseCacheScope(process.env.DATABASE_URL));
} catch {
  console.error("DATABASE_URLが未設定または不正です。接続情報は出力しません。");
  process.exitCode = 1;
}
