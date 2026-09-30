CREATE TYPE "public"."deadline_precision" AS ENUM('exact', 'date', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."deadline_project_type" AS ENUM('official', 'fan');--> statement-breakpoint
CREATE TYPE "public"."deadline_state" AS ENUM('scheduled', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "deadline_appearance_links" (
	"deadline_id" text NOT NULL,
	"appearance_id" text NOT NULL,
	CONSTRAINT "deadline_appearance_links_deadline_id_appearance_id_pk" PRIMARY KEY("deadline_id","appearance_id")
);
--> statement-breakpoint
CREATE TABLE "deadline_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"deadline_id" text,
	"target_deadline_id" text NOT NULL,
	"operation" "proposal_operation" NOT NULL,
	"status" "proposal_status" NOT NULL,
	"expected_version" integer,
	"input" jsonb NOT NULL,
	"reviewed_content_hash" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deadline_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"deadline_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot_schema_version" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deadline_source_links" (
	"deadline_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_identity_id" text NOT NULL,
	"evidence_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"published_at_precision" "appearance_published_precision" NOT NULL,
	"published_at" timestamp with time zone,
	"published_on" date,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadline_source_links_deadline_id_source_id_evidence_key_pk" PRIMARY KEY("deadline_id","source_id","evidence_key"),
	CONSTRAINT "deadline_source_links_evidence_normalized" CHECK ("deadline_source_links"."evidence_key" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "deadline_source_links_precision_valid" CHECK (("deadline_source_links"."published_at_precision" = 'exact' and "deadline_source_links"."published_at" is not null and "deadline_source_links"."published_on" is null)
    or ("deadline_source_links"."published_at_precision" = 'date' and "deadline_source_links"."published_at" is null and "deadline_source_links"."published_on" is not null)
    or ("deadline_source_links"."published_at_precision" = 'unknown' and "deadline_source_links"."published_at" is null and "deadline_source_links"."published_on" is null))
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"project_title" text NOT NULL,
	"organizer" text NOT NULL,
	"project_type" "deadline_project_type" NOT NULL,
	"series_id" text,
	"deadline_precision" "deadline_precision" NOT NULL,
	"deadline_at" timestamp with time zone,
	"deadline_on" date,
	"application_url" text,
	"note" text,
	"state" "deadline_state" DEFAULT 'scheduled' NOT NULL,
	"fingerprint" text NOT NULL,
	"visibility_status" "appearance_visibility_status" DEFAULT 'public' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadlines_id_normalized" CHECK ("deadlines"."id" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "deadlines_required_text" CHECK (length(trim("deadlines"."label")) > 0 and length(trim("deadlines"."project_title")) > 0 and length(trim("deadlines"."organizer")) > 0),
	CONSTRAINT "deadlines_version_positive" CHECK ("deadlines"."version" > 0),
	CONSTRAINT "deadlines_precision_valid" CHECK (("deadlines"."deadline_precision" = 'exact' and "deadlines"."deadline_at" is not null and "deadlines"."deadline_on" is null)
    or ("deadlines"."deadline_precision" = 'date' and "deadlines"."deadline_at" is null and "deadlines"."deadline_on" is not null)
    or ("deadlines"."deadline_precision" = 'unknown' and "deadlines"."deadline_at" is null and "deadlines"."deadline_on" is null))
);
--> statement-breakpoint
ALTER TABLE "deadline_appearance_links" ADD CONSTRAINT "deadline_appearance_links_deadline_id_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadlines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_appearance_links" ADD CONSTRAINT "deadline_appearance_links_appearance_id_appearances_id_fk" FOREIGN KEY ("appearance_id") REFERENCES "public"."appearances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_proposals" ADD CONSTRAINT "deadline_proposals_deadline_id_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadlines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_revisions" ADD CONSTRAINT "deadline_revisions_deadline_id_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadlines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_revisions" ADD CONSTRAINT "deadline_revisions_proposal_id_deadline_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."deadline_proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_source_links" ADD CONSTRAINT "deadline_source_links_deadline_id_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadlines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_source_links" ADD CONSTRAINT "deadline_source_links_source_id_source_items_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_source_links" ADD CONSTRAINT "deadline_source_links_identity_source_fk" FOREIGN KEY ("source_identity_id","source_id") REFERENCES "public"."source_identities"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_series_id_appearance_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."appearance_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deadline_appearance_links_appearance_idx" ON "deadline_appearance_links" USING btree ("appearance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_proposals_idempotency_unique" ON "deadline_proposals" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "deadline_proposals_target_idx" ON "deadline_proposals" USING btree ("target_deadline_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_revisions_version_unique" ON "deadline_revisions" USING btree ("deadline_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_source_links_one_active_primary" ON "deadline_source_links" USING btree ("deadline_id") WHERE "deadline_source_links"."active" = true and "deadline_source_links"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_source_links_active_evidence_unique" ON "deadline_source_links" USING btree ("source_id","evidence_key") WHERE "deadline_source_links"."active" = true;--> statement-breakpoint
CREATE INDEX "deadline_source_links_source_idx" ON "deadline_source_links" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deadlines_fingerprint_unique" ON "deadlines" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "deadlines_cutoff_idx" ON "deadlines" USING btree ("deadline_at","deadline_on");
--> statement-breakpoint
-- Like appearances, a deadline must retain exactly one active primary source.
-- Deferred checks allow replacing sources atomically in the same transaction.
CREATE FUNCTION enforce_deadline_primary_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id text; target_ids text[];
BEGIN
  IF TG_TABLE_NAME = 'deadlines' THEN
    target_ids := ARRAY[NEW.id];
  ELSE
    target_ids := CASE TG_OP
      WHEN 'UPDATE' THEN ARRAY[NEW.deadline_id, OLD.deadline_id]
      WHEN 'DELETE' THEN ARRAY[OLD.deadline_id]
      ELSE ARRAY[NEW.deadline_id] END;
  END IF;
  FOR target_id IN SELECT DISTINCT unnest(target_ids) LOOP
  IF EXISTS (SELECT 1 FROM deadlines WHERE id = target_id)
    AND (SELECT count(*) FROM deadline_source_links
      WHERE deadline_id = target_id AND active AND is_primary) <> 1 THEN
    RAISE EXCEPTION 'Deadline % must have exactly one active primary source', target_id
      USING ERRCODE = '23514';
  END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER deadline_primary_from_deadline
  AFTER INSERT OR UPDATE ON deadlines DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_deadline_primary_source();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER deadline_primary_from_link
  AFTER INSERT OR UPDATE OR DELETE ON deadline_source_links DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_deadline_primary_source();
