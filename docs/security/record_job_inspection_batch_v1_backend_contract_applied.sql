-- AOS BACKEND WRITE CONTRACT APPLIED
-- Seam: Inspection Cycle / Multi-Inspection Capture
-- Function: public.record_job_inspection_batch_v1
--
-- Completed:
-- - Registered record_job_inspection_batch_v1 in system_mutation_registry.
-- - Created record_job_inspection_batch_v1 as SECURITY DEFINER.
-- - Granted EXECUTE to authenticated.
-- - Revoked function access from anon and PUBLIC.
-- - Validation confirmed:
--   function = record_job_inspection_batch_v1
--   security_mode = SECURITY_DEFINER
--   authenticated_execute = true
--   anon_execute = false
--   registry = inspection | surface_write
--
-- Workflow rule:
-- - One inspection sitting creates one job_inspection_sessions row.
-- - Multiple selected inspection checks create multiple job_inspection_results rows.
-- - stage_at_time is captured automatically from the job current stage.
-- - Each inspection check stores inspection_type, PASS/FAIL result, notes, and photo_urls.
-- - PASS may save without photos.
-- - FAIL requires photo evidence.
-- - Existing failed-inspection automation remains active.
--
-- This does not remove or replace record_job_inspection_result_v1.
-- This does not alter stage routing or verified-report logic.

INSERT INTO public.system_mutation_registry (
    function_name,
    domain,
    authority_layer
)
SELECT
    'record_job_inspection_batch_v1',
    'inspection',
    'surface_write'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.system_mutation_registry
    WHERE function_name = 'record_job_inspection_batch_v1'
);

CREATE OR REPLACE FUNCTION public.record_job_inspection_batch_v1(p_job_id uuid, p_results jsonb, p_ojt_hours numeric DEFAULT 0, p_requires_signoff boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    current_tenant_id uuid;
    current_profile_id uuid;
    job_record record;
    inspection_item jsonb;
    new_session_id uuid;
    new_result_id uuid;
    normalized_inspection_type text;
    normalized_result text;
    item_notes text;
    cleaned_photo_urls text[];
    seen_inspection_types text[] := ARRAY[]::text[];
BEGIN
    IF public.current_user_has_permission_v1('edit_jobs') IS NOT TRUE THEN
        RAISE EXCEPTION 'Permission denied: edit_jobs is required.';
    END IF;

    current_profile_id := auth.uid();

    IF current_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated user context not found.';
    END IF;

    SELECT p.tenant_id
    INTO current_tenant_id
    FROM public.profiles p
    WHERE p.id = current_profile_id;

    IF current_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant context not found.';
    END IF;

    IF p_job_id IS NULL THEN
        RAISE EXCEPTION 'Job is required.';
    END IF;

    IF p_results IS NULL OR jsonb_typeof(p_results) <> 'array' THEN
        RAISE EXCEPTION 'Inspection batch results must be a JSON array.';
    END IF;

    IF jsonb_array_length(p_results) = 0 THEN
        RAISE EXCEPTION 'At least one inspection check is required.';
    END IF;

    IF COALESCE(p_ojt_hours, 0) < 0 THEN
        RAISE EXCEPTION 'OJT hours cannot be negative.';
    END IF;

    SELECT
        j.id,
        j.tenant_id,
        j.internal_status
    INTO job_record
    FROM public.jobs j
    WHERE j.id = p_job_id
      AND j.tenant_id = current_tenant_id;

    IF job_record.id IS NULL THEN
        RAISE EXCEPTION 'Job not found for current tenant.';
    END IF;

    -- Validate the whole batch before inserting the session.
    FOR inspection_item IN
        SELECT value
        FROM jsonb_array_elements(p_results)
    LOOP
        IF jsonb_typeof(inspection_item) <> 'object' THEN
            RAISE EXCEPTION 'Each inspection batch item must be a JSON object.';
        END IF;

        normalized_inspection_type := upper(
            trim(COALESCE(inspection_item ->> 'inspection_type', ''))
        );

        IF normalized_inspection_type = '' THEN
            RAISE EXCEPTION 'Inspection type is required for every selected check.';
        END IF;

        IF normalized_inspection_type = ANY(seen_inspection_types) THEN
            RAISE EXCEPTION 'Duplicate inspection type in same batch: %', normalized_inspection_type;
        END IF;

        seen_inspection_types := array_append(
            seen_inspection_types,
            normalized_inspection_type
        );

        normalized_result := upper(
            trim(COALESCE(inspection_item ->> 'result', ''))
        );

        IF normalized_result NOT IN ('PASS', 'FAIL') THEN
            RAISE EXCEPTION 'Inspection result must be PASS or FAIL for inspection type %.', normalized_inspection_type;
        END IF;

        IF COALESCE(jsonb_typeof(inspection_item -> 'photo_urls'), 'array') <> 'array' THEN
            RAISE EXCEPTION 'photo_urls must be an array for inspection type %.', normalized_inspection_type;
        END IF;

        SELECT COALESCE(array_agg(cleaned_url), ARRAY[]::text[])
        INTO cleaned_photo_urls
        FROM (
            SELECT NULLIF(trim(photo_url), '') AS cleaned_url
            FROM jsonb_array_elements_text(
                COALESCE(inspection_item -> 'photo_urls', '[]'::jsonb)
            ) AS photo_url
        ) cleaned
        WHERE cleaned_url IS NOT NULL;

        IF normalized_result = 'FAIL'
           AND COALESCE(array_length(cleaned_photo_urls, 1), 0) = 0 THEN
            RAISE EXCEPTION 'Photo evidence is required for failed inspection type %.', normalized_inspection_type;
        END IF;
    END LOOP;

    INSERT INTO public.job_inspection_sessions (
        tenant_id,
        job_id,
        inspector_id,
        stage_at_time,
        ojt_hours,
        requires_signoff
    )
    VALUES (
        current_tenant_id,
        p_job_id,
        current_profile_id,
        job_record.internal_status,
        COALESCE(p_ojt_hours, 0),
        COALESCE(p_requires_signoff, false)
    )
    RETURNING id INTO new_session_id;

    FOR inspection_item IN
        SELECT value
        FROM jsonb_array_elements(p_results)
    LOOP
        normalized_inspection_type := upper(
            trim(COALESCE(inspection_item ->> 'inspection_type', ''))
        );

        normalized_result := upper(
            trim(COALESCE(inspection_item ->> 'result', ''))
        );

        item_notes := NULLIF(trim(COALESCE(inspection_item ->> 'notes', '')), '');

        SELECT COALESCE(array_agg(cleaned_url), ARRAY[]::text[])
        INTO cleaned_photo_urls
        FROM (
            SELECT NULLIF(trim(photo_url), '') AS cleaned_url
            FROM jsonb_array_elements_text(
                COALESCE(inspection_item -> 'photo_urls', '[]'::jsonb)
            ) AS photo_url
        ) cleaned
        WHERE cleaned_url IS NOT NULL;

        INSERT INTO public.job_inspection_results (
            tenant_id,
            session_id,
            inspection_type,
            result,
            notes,
            photo_urls
        )
        VALUES (
            current_tenant_id,
            new_session_id,
            normalized_inspection_type,
            normalized_result,
            item_notes,
            cleaned_photo_urls
        )
        RETURNING id INTO new_result_id;
    END LOOP;

    RETURN new_session_id;
END;
$function$


REVOKE ALL ON FUNCTION public.record_job_inspection_batch_v1(
    uuid,
    jsonb,
    numeric,
    boolean
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.record_job_inspection_batch_v1(
    uuid,
    jsonb,
    numeric,
    boolean
) FROM anon;

GRANT EXECUTE ON FUNCTION public.record_job_inspection_batch_v1(
    uuid,
    jsonb,
    numeric,
    boolean
) TO authenticated;
