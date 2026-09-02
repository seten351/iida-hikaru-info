DO $$
DECLARE
	checkpoint_ready boolean;
	violation_count bigint;
	violations text[] := ARRAY[]::text[];
BEGIN
	SELECT completed_at IS NOT NULL AND dual_write_confirmed_at IS NOT NULL
	INTO checkpoint_ready
	FROM appearance_backfill_checkpoints
	WHERE id = 'phase-1b';

	IF NOT coalesce(checkpoint_ready, false) THEN
		violations := array_append(violations, 'Phase 1B checkpoint is incomplete');
	END IF;

	SELECT count(*) INTO violation_count
	FROM appearances
	WHERE source_name IS NULL
		OR source_item_id IS NULL
		OR visibility_status IS NULL
		OR first_visible_at IS NULL
		OR visibility_changed_at IS NULL
		OR version IS NULL;
	IF violation_count > 0 THEN
		violations := array_append(violations, format('appearance required values: %s', violation_count));
	END IF;

	SELECT count(*) INTO violation_count
	FROM appearance_source_links
	WHERE source_identity_id IS NULL
		OR published_at_precision IS NULL
		OR collected_at IS NULL;
	IF violation_count > 0 THEN
		violations := array_append(violations, format('link required values: %s', violation_count));
	END IF;

	SELECT count(*) INTO violation_count
	FROM appearances a
	WHERE (
		SELECT count(*)
		FROM appearance_source_links l
		WHERE l.appearance_id = a.id
			AND l.active
			AND l.is_primary
	) <> 1;
	IF violation_count > 0 THEN
		violations := array_append(violations, format('active primary exactly-one: %s', violation_count));
	END IF;

	SELECT count(*) INTO violation_count
	FROM appearance_source_links l
	LEFT JOIN source_identities i ON i.id = l.source_identity_id
	WHERE i.id IS NULL OR i.source_id IS DISTINCT FROM l.source_id;
	IF violation_count > 0 THEN
		violations := array_append(violations, format('appearance link identity ownership: %s', violation_count));
	END IF;

	SELECT count(*) INTO violation_count
	FROM proposal_source_links l
	LEFT JOIN source_identities i ON i.id = l.source_identity_id
	WHERE l.source_identity_id IS NOT NULL
		AND (i.id IS NULL OR i.source_id IS DISTINCT FROM l.source_id);
	IF violation_count > 0 THEN
		violations := array_append(violations, format('proposal link identity ownership: %s', violation_count));
	END IF;

	SELECT count(*) INTO violation_count
	FROM appearances a
	JOIN appearance_source_links l
		ON l.appearance_id = a.id AND l.active AND l.is_primary
	JOIN source_items s ON s.id = l.source_id
	JOIN source_identities i ON i.id = l.source_identity_id
	WHERE a.source_name IS DISTINCT FROM i.source_name
		OR a.source_item_id IS DISTINCT FROM i.external_item_id
		OR a.source_url IS DISTINCT FROM s.canonical_url
		OR a.published_at IS DISTINCT FROM l.published_at
		OR a.published_on IS DISTINCT FROM l.published_on
		OR a.published_at_precision IS DISTINCT FROM l.published_at_precision;
	IF violation_count > 0 THEN
		violations := array_append(violations, format('legacy mirror mismatch: %s', violation_count));
	END IF;

	SELECT count(*) INTO violation_count
	FROM appearances a
	WHERE NOT EXISTS (
		SELECT 1
		FROM appearance_revisions r
		WHERE r.appearance_id = a.id
			AND r.version = 1
			AND r.snapshot_schema_version = 1
	);
	IF violation_count > 0 THEN
		violations := array_append(violations, format('initial revision schema v1 missing: %s', violation_count));
	END IF;

	IF cardinality(violations) > 0 THEN
		RAISE EXCEPTION 'Phase 1C preflight failed: %', array_to_string(violations, '; ')
			USING ERRCODE = '23514';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "appearance_source_links" DROP CONSTRAINT "appearance_source_links_published_at_precision_valid";--> statement-breakpoint
ALTER TABLE "appearance_source_links" DROP CONSTRAINT "appearance_source_links_source_identity_id_source_identities_id_fk";--> statement-breakpoint
ALTER TABLE "proposal_source_links" DROP CONSTRAINT "proposal_source_links_source_identity_id_source_identities_id_fk";--> statement-breakpoint
DROP INDEX "appearances_source_item_unique";--> statement-breakpoint
ALTER TABLE "source_identities" ADD CONSTRAINT "source_identities_id_source_id_unique" UNIQUE("id","source_id");--> statement-breakpoint
ALTER TABLE "appearance_source_links" ALTER COLUMN "source_identity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appearance_source_links" ALTER COLUMN "published_at_precision" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appearance_source_links" ALTER COLUMN "collected_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "source_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "source_item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "visibility_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "first_visible_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "visibility_changed_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appearances" ALTER COLUMN "version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appearance_source_links" ADD CONSTRAINT "appearance_source_links_identity_source_fk" FOREIGN KEY ("source_identity_id","source_id") REFERENCES "public"."source_identities"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_source_links" ADD CONSTRAINT "proposal_source_links_identity_source_fk" FOREIGN KEY ("source_identity_id","source_id") REFERENCES "public"."source_identities"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appearance_source_links_one_active_primary" ON "appearance_source_links" USING btree ("appearance_id") WHERE "appearance_source_links"."active" = true and "appearance_source_links"."is_primary" = true;--> statement-breakpoint
ALTER TABLE "appearance_source_links" ADD CONSTRAINT "appearance_source_links_published_at_precision_valid" CHECK (("appearance_source_links"."published_at_precision" = 'exact' and "appearance_source_links"."published_at" is not null and "appearance_source_links"."published_on" is null)
		or ("appearance_source_links"."published_at_precision" = 'date' and "appearance_source_links"."published_at" is null and "appearance_source_links"."published_on" is not null)
		or ("appearance_source_links"."published_at_precision" = 'unknown' and "appearance_source_links"."published_at" is null and "appearance_source_links"."published_on" is null));--> statement-breakpoint
CREATE FUNCTION phase1c_sync_appearance_legacy_mirror(target_appearance_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	UPDATE appearances a
	SET source_name = i.source_name,
		source_item_id = i.external_item_id,
		source_url = s.canonical_url,
		published_at = l.published_at,
		published_on = l.published_on,
		published_at_precision = l.published_at_precision
	FROM appearance_source_links l
	JOIN source_items s ON s.id = l.source_id
	JOIN source_identities i ON i.id = l.source_identity_id
	WHERE a.id = target_appearance_id
		AND l.appearance_id = a.id
		AND l.active
		AND l.is_primary;
END
$$;--> statement-breakpoint
CREATE FUNCTION phase1c_apply_appearance_primary_mirror()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	mirror_source_name text;
	mirror_source_item_id text;
	mirror_source_url text;
	mirror_published_at timestamptz;
	mirror_published_on date;
	mirror_published_at_precision appearance_published_precision;
BEGIN
	SELECT i.source_name,
		i.external_item_id,
		s.canonical_url,
		l.published_at,
		l.published_on,
		l.published_at_precision
	INTO mirror_source_name,
		mirror_source_item_id,
		mirror_source_url,
		mirror_published_at,
		mirror_published_on,
		mirror_published_at_precision
	FROM appearance_source_links l
	JOIN source_items s ON s.id = l.source_id
	JOIN source_identities i ON i.id = l.source_identity_id
	WHERE l.appearance_id = NEW.id
		AND l.active
		AND l.is_primary;

	IF FOUND THEN
		NEW.source_name := mirror_source_name;
		NEW.source_item_id := mirror_source_item_id;
		NEW.source_url := mirror_source_url;
		NEW.published_at := mirror_published_at;
		NEW.published_on := mirror_published_on;
		NEW.published_at_precision := mirror_published_at_precision;
	END IF;

	RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER appearance_primary_mirror_on_insert
	BEFORE INSERT ON appearances
	FOR EACH ROW
	EXECUTE FUNCTION phase1c_apply_appearance_primary_mirror();--> statement-breakpoint
CREATE TRIGGER appearance_primary_mirror_on_update
	BEFORE UPDATE OF source_name, source_item_id, source_url, published_at, published_on, published_at_precision ON appearances
	FOR EACH ROW
	EXECUTE FUNCTION phase1c_apply_appearance_primary_mirror();--> statement-breakpoint
CREATE FUNCTION phase1c_sync_appearance_from_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP <> 'DELETE' THEN
		PERFORM phase1c_sync_appearance_legacy_mirror(NEW.appearance_id);
	END IF;
	IF TG_OP = 'DELETE' THEN
		PERFORM phase1c_sync_appearance_legacy_mirror(OLD.appearance_id);
	ELSIF TG_OP = 'UPDATE' AND OLD.appearance_id IS DISTINCT FROM NEW.appearance_id THEN
		PERFORM phase1c_sync_appearance_legacy_mirror(OLD.appearance_id);
	END IF;
	RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER appearance_primary_mirror_from_link
	AFTER INSERT OR UPDATE OR DELETE ON appearance_source_links
	FOR EACH ROW
	EXECUTE FUNCTION phase1c_sync_appearance_from_link();--> statement-breakpoint
CREATE FUNCTION phase1c_sync_appearances_from_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	target_appearance_id text;
BEGIN
	FOR target_appearance_id IN
		SELECT DISTINCT l.appearance_id
		FROM appearance_source_links l
		WHERE l.source_identity_id = NEW.id
			AND l.active
			AND l.is_primary
	LOOP
		PERFORM phase1c_sync_appearance_legacy_mirror(target_appearance_id);
	END LOOP;
	RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER appearance_primary_mirror_from_identity
	AFTER UPDATE OF source_name, external_item_id ON source_identities
	FOR EACH ROW
	EXECUTE FUNCTION phase1c_sync_appearances_from_identity();--> statement-breakpoint
CREATE FUNCTION phase1c_sync_appearances_from_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	target_appearance_id text;
BEGIN
	FOR target_appearance_id IN
		SELECT DISTINCT l.appearance_id
		FROM appearance_source_links l
		WHERE l.source_id = NEW.id
			AND l.active
			AND l.is_primary
	LOOP
		PERFORM phase1c_sync_appearance_legacy_mirror(target_appearance_id);
	END LOOP;
	RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER appearance_primary_mirror_from_source
	AFTER UPDATE OF canonical_url ON source_items
	FOR EACH ROW
	EXECUTE FUNCTION phase1c_sync_appearances_from_source();--> statement-breakpoint
CREATE FUNCTION phase1c_assert_appearance_invariants(target_appearance_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	active_primary_count integer;
BEGIN
	IF target_appearance_id IS NULL OR NOT EXISTS (
		SELECT 1 FROM appearances WHERE id = target_appearance_id
	) THEN
		RETURN;
	END IF;

	SELECT count(*) INTO active_primary_count
	FROM appearance_source_links
	WHERE appearance_id = target_appearance_id
		AND active
		AND is_primary;

	IF active_primary_count <> 1 THEN
		RAISE EXCEPTION 'appearance % must have exactly one active primary source link, found %', target_appearance_id, active_primary_count
			USING ERRCODE = '23514';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM appearances a
		JOIN appearance_source_links l
			ON l.appearance_id = a.id AND l.active AND l.is_primary
		JOIN source_items s ON s.id = l.source_id
		JOIN source_identities i ON i.id = l.source_identity_id
		WHERE a.id = target_appearance_id
			AND (a.source_name IS DISTINCT FROM i.source_name
				OR a.source_item_id IS DISTINCT FROM i.external_item_id
				OR a.source_url IS DISTINCT FROM s.canonical_url
				OR a.published_at IS DISTINCT FROM l.published_at
				OR a.published_on IS DISTINCT FROM l.published_on
				OR a.published_at_precision IS DISTINCT FROM l.published_at_precision)
	) THEN
		RAISE EXCEPTION 'appearance % legacy mirror does not match its active primary source link', target_appearance_id
			USING ERRCODE = '23514';
	END IF;
END
$$;--> statement-breakpoint
CREATE FUNCTION phase1c_check_appearance_from_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP <> 'DELETE' THEN
		PERFORM phase1c_assert_appearance_invariants(NEW.appearance_id);
	END IF;
	IF TG_OP = 'DELETE' THEN
		PERFORM phase1c_assert_appearance_invariants(OLD.appearance_id);
	ELSIF TG_OP = 'UPDATE' AND OLD.appearance_id IS DISTINCT FROM NEW.appearance_id THEN
		PERFORM phase1c_assert_appearance_invariants(OLD.appearance_id);
	END IF;
	RETURN NULL;
END
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER appearance_active_primary_exactly_one_from_link
	AFTER INSERT OR UPDATE OR DELETE ON appearance_source_links
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW
	EXECUTE FUNCTION phase1c_check_appearance_from_link();--> statement-breakpoint
CREATE FUNCTION phase1c_check_appearance_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM phase1c_assert_appearance_invariants(NEW.id);
	RETURN NULL;
END
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER appearance_active_primary_exactly_one_from_appearance
	AFTER INSERT OR UPDATE ON appearances
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW
	EXECUTE FUNCTION phase1c_check_appearance_row();
