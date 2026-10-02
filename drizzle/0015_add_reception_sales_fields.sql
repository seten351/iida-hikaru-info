CREATE TYPE "public"."reception_information_type" AS ENUM('ticket_application', 'event_registration', 'streaming_sale', 'made_to_order', 'online_sale', 'other', 'unspecified');--> statement-breakpoint
CREATE TYPE "public"."reception_phase_override" AS ENUM('auto', 'not_open', 'open');--> statement-breakpoint
CREATE TYPE "public"."reception_sale_mode" AS ENUM('initial', 'resale');--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "information_type" "reception_information_type" DEFAULT 'unspecified' NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "starts_at_precision" "deadline_precision" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "phase_override" "reception_phase_override" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "sale_mode" "reception_sale_mode" DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_start_precision_valid" CHECK (("deadlines"."starts_at_precision" = 'exact' and "deadlines"."starts_at" is not null and "deadlines"."starts_on" is null)
    or ("deadlines"."starts_at_precision" = 'date' and "deadlines"."starts_at" is null and "deadlines"."starts_on" is not null)
    or ("deadlines"."starts_at_precision" = 'unknown' and "deadlines"."starts_at" is null and "deadlines"."starts_on" is null));--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_period_valid" CHECK (("deadlines"."starts_at" is null or "deadlines"."deadline_at" is null or "deadlines"."starts_at" <= "deadlines"."deadline_at")
    and (coalesce("deadlines"."starts_on", ("deadlines"."starts_at" at time zone 'Asia/Tokyo')::date) is null
      or coalesce("deadlines"."deadline_on", ("deadlines"."deadline_at" at time zone 'Asia/Tokyo')::date) is null
      or coalesce("deadlines"."starts_on", ("deadlines"."starts_at" at time zone 'Asia/Tokyo')::date) <= coalesce("deadlines"."deadline_on", ("deadlines"."deadline_at" at time zone 'Asia/Tokyo')::date)));