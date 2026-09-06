CREATE TABLE "appearance_series_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"operation" "series_revision_operation" NOT NULL,
	"status" "proposal_status" NOT NULL,
	"series_id" text,
	"target_series_id" text NOT NULL,
	"expected_series_version" integer,
	"display_name" text NOT NULL,
	"reviewed_content_hash" text NOT NULL,
	"review_note" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "appearance_series_proposals_target_id_normalized" CHECK ("appearance_series_proposals"."target_series_id" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "appearance_series_proposals_display_name_not_empty" CHECK (length(trim("appearance_series_proposals"."display_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "appearance_proposals" ADD COLUMN "admin_batch_id" text;--> statement-breakpoint
ALTER TABLE "appearance_series_revisions" ADD COLUMN "proposal_id" text;--> statement-breakpoint
ALTER TABLE "appearance_series_proposals" ADD CONSTRAINT "appearance_series_proposals_series_id_appearance_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."appearance_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appearance_series_proposals_idempotency_key_unique" ON "appearance_series_proposals" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "appearance_series_proposals_status_idx" ON "appearance_series_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appearance_series_proposals_series_id_idx" ON "appearance_series_proposals" USING btree ("series_id");--> statement-breakpoint
ALTER TABLE "appearance_series_revisions" ADD CONSTRAINT "appearance_series_revisions_proposal_id_appearance_series_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."appearance_series_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appearance_proposals_admin_batch_id_idx" ON "appearance_proposals" USING btree ("admin_batch_id");