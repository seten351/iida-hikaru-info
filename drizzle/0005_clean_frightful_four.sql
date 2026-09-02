CREATE TABLE "appearance_backfill_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"last_appearance_id" text,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"dual_write_confirmed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appearance_backfill_checkpoints_singleton" CHECK ("appearance_backfill_checkpoints"."id" = 'phase-1b'),
	CONSTRAINT "appearance_backfill_checkpoints_processed_count_nonnegative" CHECK ("appearance_backfill_checkpoints"."processed_count" >= 0)
);--> statement-breakpoint
INSERT INTO "appearance_backfill_checkpoints" ("id") VALUES ('phase-1b');
