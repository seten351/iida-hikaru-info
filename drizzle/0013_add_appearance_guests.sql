ALTER TABLE "appearance_proposals" ADD COLUMN "guest_info" jsonb;--> statement-breakpoint
ALTER TABLE "appearances" ADD COLUMN "guest_info" jsonb DEFAULT '{"isHikaruGuest":null,"guestNames":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ADD CONSTRAINT "appearances_guest_info_valid" CHECK ((
      jsonb_typeof("appearances"."guest_info") = 'object'
      and "appearances"."guest_info" ? 'isHikaruGuest' and "appearances"."guest_info" ? 'guestNames'
      and jsonb_typeof("appearances"."guest_info"->'isHikaruGuest') in ('boolean', 'null')
      and jsonb_typeof("appearances"."guest_info"->'guestNames') = 'array'
      and not jsonb_path_exists("appearances"."guest_info", '$.guestNames[*] ? (@.type() != "string" || @ == "")')
    ) is true);