ALTER TABLE "appearances" ADD COLUMN "event_group_id" text;--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "event_title" text;--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "session_label" text;--> statement-breakpoint
CREATE INDEX "appearances_event_group_id_idx" ON "appearances" USING btree ("event_group_id");--> statement-breakpoint
ALTER TABLE "appearances" ADD CONSTRAINT "appearances_event_group_fields_complete" CHECK (("appearances"."event_group_id" is null and "appearances"."event_title" is null and "appearances"."session_label" is null)
        or ("appearances"."event_group_id" is not null and "appearances"."event_title" is not null and "appearances"."session_label" is not null));