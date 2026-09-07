CREATE TYPE "public"."appearance_start_precision" AS ENUM('exact', 'date', 'unknown');--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "appearances" WHERE "starts_at" IS NULL) THEN
		RAISE EXCEPTION 'start precision migration requires every existing appearance to have starts_at'
			USING ERRCODE = '23514';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "appearance_proposals" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "appearance_proposals" ADD COLUMN "starts_at_precision" "appearance_start_precision";--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "starts_at_precision" "appearance_start_precision" DEFAULT 'exact' NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "starts_at_precision" DROP DEFAULT;--> statement-breakpoint
UPDATE "appearance_proposals"
SET "starts_at_precision" = 'exact'
WHERE "starts_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "starts_at" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "appearances_starts_on_idx" ON "appearances" USING btree ("starts_on");--> statement-breakpoint
ALTER TABLE "appearance_proposals" ADD CONSTRAINT "appearance_proposals_starts_at_precision_valid" CHECK (("appearance_proposals"."starts_at_precision" is null and "appearance_proposals"."starts_at" is null and "appearance_proposals"."starts_on" is null)
        or ("appearance_proposals"."starts_at_precision" = 'exact' and "appearance_proposals"."starts_at" is not null and "appearance_proposals"."starts_on" is null)
        or ("appearance_proposals"."starts_at_precision" = 'date' and "appearance_proposals"."starts_at" is null and "appearance_proposals"."starts_on" is not null)
        or ("appearance_proposals"."starts_at_precision" = 'unknown' and "appearance_proposals"."starts_at" is null and "appearance_proposals"."starts_on" is null));--> statement-breakpoint
ALTER TABLE "appearances" ADD CONSTRAINT "appearances_starts_at_precision_valid" CHECK (("appearances"."starts_at_precision" = 'exact' and "appearances"."starts_at" is not null and "appearances"."starts_on" is null)
        or ("appearances"."starts_at_precision" = 'date' and "appearances"."starts_at" is null and "appearances"."starts_on" is not null)
        or ("appearances"."starts_at_precision" = 'unknown' and "appearances"."starts_at" is null and "appearances"."starts_on" is null));
