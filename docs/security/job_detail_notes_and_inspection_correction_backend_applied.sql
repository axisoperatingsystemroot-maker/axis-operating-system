-- AOS BACKEND CONTRACTS APPLIED
-- Seam: Job Intake / Inspection Result Capture + Job Detail Notes
--
-- Completed:
-- - Added override_inspection_results permission.
-- - Added publish_customer_job_notes permission.
-- - Registered all read/write functions in system_mutation_registry.
-- - Created internal-only job notes table.
-- - Created customer-facing job notes table.
-- - Created append-only inspection correction mapping table.
-- - Created read/write RPC surfaces.
-- - Validation confirmed:
--   All six functions are SECURITY_DEFINER.
--   authenticated EXECUTE = true.
--   anon EXECUTE = false.
--   All three new tables have RLS enabled.
--   All three new tables have no direct anon/authenticated grants.
--
-- Rules:
-- - Internal notes are private Axis-only notes.
-- - Customer notes are separate forward-facing notes.
-- - Inspection corrections are append-only.
-- - Original inspection result is never overwritten.
-- - Correction requires override_inspection_results permission and reason.
-- - Customer-facing note publishing requires publish_customer_job_notes.
-- - Verified third-party report logic was not changed.
-- - Stage routing logic was not changed in this mutation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_internal_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    note_text text NOT NULL CHECK (length(trim(note_text)) > 0),
    created_by uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_customer_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    note_text text NOT NULL CHECK (length(trim(note_text)) > 0),
    created_by uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_inspection_result_corrections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    original_result_id uuid NOT NULL REFERENCES public.job_inspection_results(id) ON DELETE RESTRICT,
    correction_result_id uuid NOT NULL UNIQUE REFERENCES public.job_inspection_results(id) ON DELETE RESTRICT,
    correction_reason text NOT NULL CHECK (length(trim(correction_reason)) > 0),
    corrected_by uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, original_result_id)
);

CREATE INDEX IF NOT EXISTS idx_job_internal_notes_job_created
ON public.job_internal_notes (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_customer_notes_job_created
ON public.job_customer_notes (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_inspection_result_corrections_job
ON public.job_inspection_result_corrections (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_inspection_result_corrections_original
ON public.job_inspection_result_corrections (original_result_id);

ALTER TABLE public.job_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_inspection_result_corrections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.job_internal_notes FROM PUBLIC;
REVOKE ALL ON TABLE public.job_internal_notes FROM anon;
REVOKE ALL ON TABLE public.job_internal_notes FROM authenticated;

REVOKE ALL ON TABLE public.job_customer_notes FROM PUBLIC;
REVOKE ALL ON TABLE public.job_customer_notes FROM anon;
REVOKE ALL ON TABLE public.job_customer_notes FROM authenticated;

REVOKE ALL ON TABLE public.job_inspection_result_corrections FROM PUBLIC;
REVOKE ALL ON TABLE public.job_inspection_result_corrections FROM anon;
REVOKE ALL ON TABLE public.job_inspection_result_corrections FROM authenticated;

INSERT INTO public.permission_registry (
    permission_key,
    description
)
SELECT
    'override_inspection_results',
    'Correct or supersede an existing inspection result with required reason. Original inspection records remain preserved.'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.permission_registry
    WHERE permission_key = 'override_inspection_results'
);

INSERT INTO public.permission_registry (
    permission_key,
    description
)
SELECT
    'publish_customer_job_notes',
    'Create customer-facing job notes visible outside internal Axis-only workflow.'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.permission_registry
    WHERE permission_key = 'publish_customer_job_notes'
);

-- Function definitions captured from live database:

CREATE OR REPLACE FUNCTION public.add_job_customer_note_v1(p_job_id uuid, p_note_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    current_tenant_id uuid;
    current_profile_id uuid;
    new_note_id uuid;
BEGIN
    IF public.current_user_has_permission_v1('publish_customer_job_notes') IS NOT TRUE THEN
        RAISE EXCEPTION 'Permission denied: publish_customer_job_notes is required.';
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

    IF p_note_text IS NULL OR length(trim(p_note_text)) = 0 THEN
        RAISE EXCEPTION 'Customer note text is required.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = p_job_id
          AND j.tenant_id = current_tenant_id
    ) THEN
        RAISE EXCEPTION 'Job not found for current tenant.';
    END IF;

    INSERT INTO public.job_customer_notes (
        tenant_id,
        job_id,
        note_text,
        created_by
    )
    VALUES (
        current_tenant_id,
        p_job_id,
        trim(p_note_text),
        current_profile_id
    )
    RETURNING id INTO new_note_id;

    RETURN new_note_id;
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_job_internal_note_v1(p_job_id uuid, p_note_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    current_tenant_id uuid;
    current_profile_id uuid;
    new_note_id uuid;
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

    IF p_note_text IS NULL OR length(trim(p_note_text)) = 0 THEN
        RAISE EXCEPTION 'Internal note text is required.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = p_job_id
          AND j.tenant_id = current_tenant_id
    ) THEN
        RAISE EXCEPTION 'Job not found for current tenant.';
    END IF;

    INSERT INTO public.job_internal_notes (
        tenant_id,
        job_id,
        note_text,
        created_by
    )
    VALUES (
        current_tenant_id,
        p_job_id,
        trim(p_note_text),
        current_profile_id
    )
    RETURNING id INTO new_note_id;

    RETURN new_note_id;
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.correct_job_inspection_result_v1(p_original_result_id uuid, p_result text, p_correction_reason text, p_notes text DEFAULT NULL::text, p_photo_urls text[] DEFAULT ARRAY[]::text[], p_ojt_hours numeric DEFAULT 0, p_requires_signoff boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    current_tenant_id uuid;
    current_profile_id uuid;
    original_row record;
    new_session_id uuid;
    new_result_id uuid;
    normalized_result text;
    cleaned_photo_urls text[];
BEGIN
    IF public.current_user_has_permission_v1('override_inspection_results') IS NOT TRUE THEN
        RAISE EXCEPTION 'Permission denied: override_inspection_results is required.';
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

    IF p_original_result_id IS NULL THEN
        RAISE EXCEPTION 'Original inspection result is required.';
    END IF;

    IF p_correction_reason IS NULL OR length(trim(p_correction_reason)) = 0 THEN
        RAISE EXCEPTION 'Correction reason is required.';
    END IF;

    SELECT
        jir.id AS result_id,
        jir.inspection_type,
        jis.id AS session_id,
        jis.job_id,
        jis.stage_at_time,
        jis.tenant_id
    INTO original_row
    FROM public.job_inspection_results jir
    JOIN public.job_inspection_sessions jis
        ON jis.id = jir.session_id
    WHERE jir.id = p_original_result_id
      AND jir.tenant_id = current_tenant_id
      AND jis.tenant_id = current_tenant_id;

    IF original_row.result_id IS NULL THEN
        RAISE EXCEPTION 'Original inspection result not found for current tenant.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.job_inspection_result_corrections c
        WHERE c.original_result_id = p_original_result_id
          AND c.tenant_id = current_tenant_id
    ) THEN
        RAISE EXCEPTION 'This inspection result has already been corrected. Correct the current effective result instead.';
    END IF;

    normalized_result := upper(trim(COALESCE(p_result, '')));

    IF normalized_result NOT IN ('PASS', 'FAIL') THEN
        RAISE EXCEPTION 'Inspection result must be PASS or FAIL.';
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
        original_row.job_id,
        current_profile_id,
        original_row.stage_at_time,
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
        original_row.inspection_type,
        normalized_result,
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        cleaned_photo_urls
    )
    RETURNING id INTO new_result_id;

    INSERT INTO public.job_inspection_result_corrections (
        tenant_id,
        job_id,
        original_result_id,
        correction_result_id,
        correction_reason,
        corrected_by
    )
    VALUES (
        current_tenant_id,
        original_row.job_id,
        p_original_result_id,
        new_result_id,
        trim(p_correction_reason),
        current_profile_id
    );

    RETURN new_result_id;
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_job_customer_notes_v1(p_job_id uuid)
 RETURNS TABLE(note_id uuid, job_id uuid, note_text text, created_by uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    current_tenant_id uuid;
BEGIN
    IF public.current_user_has_permission_v1('view_jobs') IS NOT TRUE
       AND public.current_user_has_permission_v1('view_customer_portal') IS NOT TRUE THEN
        RAISE EXCEPTION 'Permission denied: view_jobs or view_customer_portal is required.';
    END IF;

    SELECT p.tenant_id
    INTO current_tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF current_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant context not found.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = p_job_id
          AND j.tenant_id = current_tenant_id
    ) THEN
        RAISE EXCEPTION 'Job not found for current tenant.';
    END IF;

    RETURN QUERY
    SELECT
        n.id AS note_id,
        n.job_id,
        n.note_text,
        n.created_by,
        n.created_at
    FROM public.job_customer_notes n
    WHERE n.job_id = p_job_id
      AND n.tenant_id = current_tenant_id
    ORDER BY n.created_at DESC;
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_job_inspection_results_v1(p_job_id uuid)
 RETURNS TABLE(result_id uuid, session_id uuid, job_id uuid, stage_at_time job_stage, inspector_id uuid, inspection_type text, result text, notes text, photo_urls text[], ojt_hours numeric, requires_signoff boolean, signed_off_by uuid, recorded_at timestamp with time zone, is_correction boolean, is_superseded boolean, correction_of_result_id uuid, correction_reason text, corrected_by uuid, corrected_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    current_tenant_id uuid;
BEGIN
    IF public.current_user_has_permission_v1('view_jobs') IS NOT TRUE THEN
        RAISE EXCEPTION 'Permission denied: view_jobs is required.';
    END IF;

    SELECT p.tenant_id
    INTO current_tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF current_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant context not found.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = p_job_id
          AND j.tenant_id = current_tenant_id
    ) THEN
        RAISE EXCEPTION 'Job not found for current tenant.';
    END IF;

    RETURN QUERY
    SELECT
        jir.id AS result_id,
        jis.id AS session_id,
        jis.job_id,
        jis.stage_at_time,
        jis.inspector_id,
        jir.inspection_type,
        jir.result,
        jir.notes,
        jir.photo_urls,
        jis.ojt_hours,
        COALESCE(jis.requires_signoff, false) AS requires_signoff,
        jis.signed_off_by,
        jir.created_at AS recorded_at,
        EXISTS (
            SELECT 1
            FROM public.job_inspection_result_corrections c
            WHERE c.correction_result_id = jir.id
              AND c.tenant_id = current_tenant_id
        ) AS is_correction,
        EXISTS (
            SELECT 1
            FROM public.job_inspection_result_corrections c
            WHERE c.original_result_id = jir.id
              AND c.tenant_id = current_tenant_id
        ) AS is_superseded,
        corr.original_result_id AS correction_of_result_id,
        corr.correction_reason,
        corr.corrected_by,
        corr.created_at AS corrected_at
    FROM public.job_inspection_sessions jis
    JOIN public.job_inspection_results jir
        ON jir.session_id = jis.id
    LEFT JOIN public.job_inspection_result_corrections corr
        ON corr.correction_result_id = jir.id
       AND corr.tenant_id = current_tenant_id
    WHERE jis.job_id = p_job_id
      AND jis.tenant_id = current_tenant_id
      AND jir.tenant_id = current_tenant_id
    ORDER BY jir.created_at DESC;
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_job_internal_notes_v1(p_job_id uuid)
 RETURNS TABLE(note_id uuid, job_id uuid, note_text text, created_by uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    current_tenant_id uuid;
BEGIN
    IF public.current_user_has_permission_v1('view_jobs') IS NOT TRUE THEN
        RAISE EXCEPTION 'Permission denied: view_jobs is required.';
    END IF;

    SELECT p.tenant_id
    INTO current_tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF current_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant context not found.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = p_job_id
          AND j.tenant_id = current_tenant_id
    ) THEN
        RAISE EXCEPTION 'Job not found for current tenant.';
    END IF;

    RETURN QUERY
    SELECT
        n.id AS note_id,
        n.job_id,
        n.note_text,
        n.created_by,
        n.created_at
    FROM public.job_internal_notes n
    WHERE n.job_id = p_job_id
      AND n.tenant_id = current_tenant_id
    ORDER BY n.created_at DESC;
END;
$function$


-- Function access grants:

REVOKE ALL ON FUNCTION public.add_job_internal_note_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_job_internal_note_v1(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_job_internal_note_v1(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.add_job_customer_note_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_job_customer_note_v1(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_job_customer_note_v1(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_job_internal_notes_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_job_internal_notes_v1(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_job_internal_notes_v1(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_job_customer_notes_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_job_customer_notes_v1(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_job_customer_notes_v1(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_job_inspection_results_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_job_inspection_results_v1(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_job_inspection_results_v1(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.correct_job_inspection_result_v1(
    uuid,
    text,
    text,
    text,
    text[],
    numeric,
    boolean
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.correct_job_inspection_result_v1(
    uuid,
    text,
    text,
    text,
    text[],
    numeric,
    boolean
) FROM anon;

GRANT EXECUTE ON FUNCTION public.correct_job_inspection_result_v1(
    uuid,
    text,
    text,
    text,
    text[],
    numeric,
    boolean
) TO authenticated;

COMMIT;
