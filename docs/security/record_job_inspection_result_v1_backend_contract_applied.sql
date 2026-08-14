-- AOS BACKEND WRITE CONTRACT APPLIED
-- Seam: Job Intake / Inspection Result Capture
-- Function: public.record_job_inspection_result_v1
--
-- Completed:
-- - Registered record_job_inspection_result_v1 in system_mutation_registry.
-- - Created record_job_inspection_result_v1 as SECURITY DEFINER.
-- - Granted EXECUTE to authenticated.
-- - Revoked function access from anon and PUBLIC.
-- - Validation confirmed:
--   record_job_inspection_result_v1 exists
--   security_mode = SECURITY_DEFINER
--   authenticated_can_execute = true
--   anon_can_execute = false
--
-- Workflow rule:
-- - Inspection result is required before leaving INSPECTION into production.
-- - Intake does not require verified third-party report.
-- - Verified third-party report remains final / READY_FOR_INVOICE-side enforcement.
--
-- Inspection capture:
-- - Creates job_inspection_sessions row.
-- - Creates job_inspection_results row.
-- - Stores PASS / FAIL result.
-- - Stores notes.
-- - Stores photo_urls.
-- - FAIL requires photo evidence.
-- - Existing inspection_fail_trigger remains active.

INSERT INTO public.system_mutation_registry (
    function_name,
    domain,
    authority_layer
)
SELECT
    'record_job_inspection_result_v1',
    'inspection',
    'surface_write'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.system_mutation_registry
    WHERE function_name = 'record_job_inspection_result_v1'
);

CREATE OR REPLACE FUNCTION public.record_job_inspection_result_v1(
    p_job_id uuid,
    p_result text,
    p_inspection_type text DEFAULT 'INITIAL_INSPECTION',
    p_notes text DEFAULT NULL,
    p_photo_urls text[] DEFAULT ARRAY[]::text[],
    p_ojt_hours numeric DEFAULT 0,
    p_requires_signoff boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    current_tenant_id uuid;
    current_profile_id uuid;
    job_record record;
    new_session_id uuid;
    new_result_id uuid;
    normalized_result text;
    normalized_inspection_type text;
    cleaned_photo_urls text[];
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

    normalized_result := upper(trim(COALESCE(p_result, '')));

    IF normalized_result NOT IN ('PASS', 'FAIL') THEN
        RAISE EXCEPTION 'Inspection result must be PASS or FAIL.';
    END IF;

    normalized_inspection_type := upper(
        trim(COALESCE(p_inspection_type, 'INITIAL_INSPECTION'))
    );

    IF normalized_inspection_type = '' THEN
        normalized_inspection_type := 'INITIAL_INSPECTION';
    END IF;

    cleaned_photo_urls := ARRAY(
        SELECT cleaned_url
        FROM (
            SELECT NULLIF(trim(photo_url), '') AS cleaned_url
            FROM unnest(COALESCE(p_photo_urls, ARRAY[]::text[])) AS photo_url
        ) cleaned
        WHERE cleaned_url IS NOT NULL
    );

    IF normalized_result = 'FAIL'
       AND COALESCE(array_length(cleaned_photo_urls, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Photo evidence is required for failed inspections.';
    END IF;

    IF COALESCE(p_ojt_hours, 0) < 0 THEN
        RAISE EXCEPTION 'OJT hours cannot be negative.';
    END IF;

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
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        cleaned_photo_urls
    )
    RETURNING id INTO new_result_id;

    RETURN new_result_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_job_inspection_result_v1(
    uuid,
    text,
    text,
    text,
    text[],
    numeric,
    boolean
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.record_job_inspection_result_v1(
    uuid,
    text,
    text,
    text,
    text[],
    numeric,
    boolean
) FROM anon;

GRANT EXECUTE ON FUNCTION public.record_job_inspection_result_v1(
    uuid,
    text,
    text,
    text,
    text[],
    numeric,
    boolean
) TO authenticated;