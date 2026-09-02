CREATE TYPE "public"."admin_auth_purpose" AS ENUM('login', 'activation');--> statement-breakpoint
CREATE TYPE "public"."series_revision_operation" AS ENUM('create', 'update');--> statement-breakpoint
CREATE TABLE "admin_auth_attempts" (
	"purpose" "admin_auth_purpose" NOT NULL,
	"ip_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_auth_attempts_purpose_ip_hash_pk" PRIMARY KEY("purpose","ip_hash"),
	CONSTRAINT "admin_auth_attempts_ip_hash_not_empty" CHECK (length("admin_auth_attempts"."ip_hash") > 0),
	CONSTRAINT "admin_auth_attempts_failed_count_nonnegative" CHECK ("admin_auth_attempts"."failed_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "appearance_series_revisions" (
	"series_id" text NOT NULL,
	"version" integer NOT NULL,
	"operation" "series_revision_operation" NOT NULL,
	"snapshot_schema_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appearance_series_revisions_series_version_pk" PRIMARY KEY("series_id","version"),
	CONSTRAINT "appearance_series_revisions_version_positive" CHECK ("appearance_series_revisions"."version" > 0),
	CONSTRAINT "appearance_series_revisions_snapshot_schema_version_positive" CHECK ("appearance_series_revisions"."snapshot_schema_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "appearance_proposals" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "appearance_proposals" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "appearance_series" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_source_links" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appearance_series_revisions" ADD CONSTRAINT "appearance_series_revisions_series_id_appearance_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."appearance_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_auth_attempts_blocked_until_idx" ON "admin_auth_attempts" USING btree ("blocked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "appearance_proposals_idempotency_key_unique" ON "appearance_proposals" USING btree ("idempotency_key") WHERE "appearance_proposals"."idempotency_key" is not null;--> statement-breakpoint
ALTER TABLE "appearance_series" ADD CONSTRAINT "appearance_series_version_positive" CHECK ("appearance_series"."version" > 0);--> statement-breakpoint
INSERT INTO "appearance_series_revisions" (
	"series_id",
	"version",
	"operation",
	"snapshot_schema_version",
	"snapshot",
	"actor_type",
	"created_at"
)
SELECT
	"id",
	"version",
	'create',
	1,
	jsonb_build_object(
		'id', "id",
		'displayName', "display_name",
		'version', "version",
		'createdAt', "created_at",
		'updatedAt', "updated_at"
	),
	'phase2a-migration',
	"created_at"
FROM "appearance_series"
ON CONFLICT ("series_id", "version") DO NOTHING;
