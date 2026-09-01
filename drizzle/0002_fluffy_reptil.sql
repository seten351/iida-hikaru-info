CREATE TYPE "public"."appearance_published_precision" AS ENUM('exact', 'date', 'unknown');--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "published_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "published_on" date;--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "published_at_precision" "appearance_published_precision" DEFAULT 'exact' NOT NULL;--> statement-breakpoint
UPDATE "appearances" SET "collected_at" = "created_at";--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "collected_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "collected_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "published_at_precision" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "appearances" ADD CONSTRAINT "appearances_published_at_precision_valid" CHECK (("appearances"."published_at_precision" = 'exact' and "appearances"."published_at" is not null and "appearances"."published_on" is null)
        or ("appearances"."published_at_precision" = 'date' and "appearances"."published_at" is null and "appearances"."published_on" is not null)
        or ("appearances"."published_at_precision" = 'unknown' and "appearances"."published_at" is null and "appearances"."published_on" is null));
