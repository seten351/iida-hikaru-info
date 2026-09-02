CREATE TYPE "public"."appearance_visibility_status" AS ENUM('public', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."content_mode" AS ENUM('bootstrap', 'admin');--> statement-breakpoint
CREATE TYPE "public"."proposal_match_status" AS ENUM('new', 'targeted_update', 'possible_duplicate', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."proposal_operation" AS ENUM('create', 'update', 'hide', 'restore');--> statement-breakpoint
CREATE TYPE "public"."proposal_origin" AS ENUM('collector', 'admin', 'public_submission');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('web', 'youtube', 'niconico', 'x', 'other');--> statement-breakpoint
CREATE TABLE "appearance_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"origin" "proposal_origin" NOT NULL,
	"operation" "proposal_operation" NOT NULL,
	"status" "proposal_status" NOT NULL,
	"appearance_id" text,
	"expected_appearance_version" integer,
	"starts_at" timestamp with time zone,
	"title" text,
	"series_id" text,
	"event_group_id" text,
	"event_title" text,
	"session_label" text,
	"category" "appearance_category",
	"visibility_status" "appearance_visibility_status",
	"match_status" "proposal_match_status" NOT NULL,
	"appearance_fingerprint" text,
	"collector_key" text,
	"extraction_content_hash" text,
	"reviewed_content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "appearance_revisions" (
	"appearance_id" text NOT NULL,
	"version" integer NOT NULL,
	"operation" "proposal_operation" NOT NULL,
	"snapshot_schema_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"proposal_id" text,
	"actor_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appearance_revisions_appearance_version_pk" PRIMARY KEY("appearance_id","version"),
	CONSTRAINT "appearance_revisions_version_positive" CHECK ("appearance_revisions"."version" > 0),
	CONSTRAINT "appearance_revisions_snapshot_schema_version_positive" CHECK ("appearance_revisions"."snapshot_schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "appearance_source_links" (
	"appearance_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_identity_id" text,
	"evidence_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"published_on" date,
	"published_at_precision" "appearance_published_precision",
	"collected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appearance_source_links_evidence_key_normalized" CHECK ("appearance_source_links"."evidence_key" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "appearance_source_links_published_at_precision_valid" CHECK ("appearance_source_links"."published_at_precision" is null
        or ("appearance_source_links"."published_at_precision" = 'exact' and "appearance_source_links"."published_at" is not null and "appearance_source_links"."published_on" is null)
        or ("appearance_source_links"."published_at_precision" = 'date' and "appearance_source_links"."published_at" is null and "appearance_source_links"."published_on" is not null)
        or ("appearance_source_links"."published_at_precision" = 'unknown' and "appearance_source_links"."published_at" is null and "appearance_source_links"."published_on" is null))
);
--> statement-breakpoint
CREATE TABLE "content_management_state" (
	"id" text PRIMARY KEY NOT NULL,
	"content_mode" "content_mode" DEFAULT 'bootstrap' NOT NULL,
	"admin_activated_at" timestamp with time zone,
	"legacy_import_locked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_management_state_singleton" CHECK ("content_management_state"."id" = 'singleton')
);
--> statement-breakpoint
CREATE TABLE "proposal_source_links" (
	"proposal_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_identity_id" text,
	"evidence_key" text NOT NULL,
	"published_at" timestamp with time zone,
	"published_on" date,
	"published_at_precision" "appearance_published_precision",
	"extraction_confidence" integer,
	"review_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_source_links_evidence_key_normalized" CHECK ("proposal_source_links"."evidence_key" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "source_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"external_item_id" text NOT NULL,
	"is_canonical" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_identities_source_name_not_empty" CHECK (length(trim("source_identities"."source_name")) > 0),
	CONSTRAINT "source_identities_external_item_id_not_empty" CHECK (length(trim("source_identities"."external_item_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "source_items" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_url" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"metadata" jsonb,
	"first_collected_at" timestamp with time zone NOT NULL,
	"last_collected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "visibility_status" "appearance_visibility_status";--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "first_visible_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "visibility_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "version" integer;--> statement-breakpoint
ALTER TABLE "appearance_proposals" ADD CONSTRAINT "appearance_proposals_appearance_id_appearances_id_fk" FOREIGN KEY ("appearance_id") REFERENCES "public"."appearances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearance_proposals" ADD CONSTRAINT "appearance_proposals_series_id_appearance_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."appearance_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearance_revisions" ADD CONSTRAINT "appearance_revisions_appearance_id_appearances_id_fk" FOREIGN KEY ("appearance_id") REFERENCES "public"."appearances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearance_revisions" ADD CONSTRAINT "appearance_revisions_proposal_id_appearance_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."appearance_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearance_source_links" ADD CONSTRAINT "appearance_source_links_appearance_id_appearances_id_fk" FOREIGN KEY ("appearance_id") REFERENCES "public"."appearances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearance_source_links" ADD CONSTRAINT "appearance_source_links_source_id_source_items_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearance_source_links" ADD CONSTRAINT "appearance_source_links_source_identity_id_source_identities_id_fk" FOREIGN KEY ("source_identity_id") REFERENCES "public"."source_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_source_links" ADD CONSTRAINT "proposal_source_links_proposal_id_appearance_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."appearance_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_source_links" ADD CONSTRAINT "proposal_source_links_source_id_source_items_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_source_links" ADD CONSTRAINT "proposal_source_links_source_identity_id_source_identities_id_fk" FOREIGN KEY ("source_identity_id") REFERENCES "public"."source_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_identities" ADD CONSTRAINT "source_identities_source_id_source_items_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appearance_proposals_appearance_id_idx" ON "appearance_proposals" USING btree ("appearance_id");--> statement-breakpoint
CREATE INDEX "appearance_proposals_status_idx" ON "appearance_proposals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "appearance_source_links_appearance_source_evidence_unique" ON "appearance_source_links" USING btree ("appearance_id","source_id","evidence_key");--> statement-breakpoint
CREATE INDEX "appearance_source_links_appearance_id_idx" ON "appearance_source_links" USING btree ("appearance_id");--> statement-breakpoint
CREATE INDEX "appearance_source_links_source_id_idx" ON "appearance_source_links" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_source_links_proposal_source_evidence_unique" ON "proposal_source_links" USING btree ("proposal_id","source_id","evidence_key");--> statement-breakpoint
CREATE UNIQUE INDEX "source_identities_name_external_item_unique" ON "source_identities" USING btree ("source_name","external_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_identities_one_canonical_per_source" ON "source_identities" USING btree ("source_id") WHERE "source_identities"."is_canonical" = true;--> statement-breakpoint
CREATE INDEX "source_identities_source_id_idx" ON "source_identities" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_items_canonical_url_unique" ON "source_items" USING btree ("canonical_url");--> statement-breakpoint
INSERT INTO "content_management_state" ("id", "content_mode") VALUES ('singleton', 'bootstrap');
