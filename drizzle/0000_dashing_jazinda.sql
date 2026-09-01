CREATE TYPE "public"."appearance_category" AS ENUM('テレビ', 'ラジオ', '配信', 'イベント', 'その他');--> statement-breakpoint
CREATE TABLE "appearances" (
	"id" text PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"category" "appearance_category" NOT NULL,
	"source_url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"source_name" text,
	"source_item_id" text,
	"collected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "appearances_starts_at_idx" ON "appearances" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "appearances_published_at_idx" ON "appearances" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "appearances_source_item_unique" ON "appearances" USING btree ("source_name","source_item_id") WHERE "appearances"."source_name" is not null and "appearances"."source_item_id" is not null;