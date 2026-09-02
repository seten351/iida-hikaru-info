CREATE TABLE "appearance_series" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appearance_series_id_normalized" CHECK ("appearance_series"."id" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "appearance_series_display_name_not_empty" CHECK (length(trim("appearance_series"."display_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "series_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "appearance_series_display_name_unique" ON "appearance_series" USING btree ("display_name");--> statement-breakpoint
ALTER TABLE "appearances" ADD CONSTRAINT "appearances_series_id_appearance_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."appearance_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appearances_series_id_idx" ON "appearances" USING btree ("series_id");