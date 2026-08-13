-- AOS BACKEND WRITE CONTRACT APPLIED
-- Seam: Job Intake / Create Job / Quote-to-Job Entry Surface
-- Function: public.create_job_v1
--
-- Completed:
-- - Registered create_job_v1 in system_mutation_registry.
-- - Created create_job_v1 as SECURITY DEFINER.
-- - Granted EXECUTE to authenticated.
-- - Revoked function access from anon and PUBLIC.
-- - Validation confirmed:
--   create_job_v1 exists
--   security_mode = SECURITY_DEFINER
--   authenticated_can_execute = true
--   anon_can_execute = false
--
-- Notes:
-- - Function uses the logged-in user's tenant from profiles.
-- - Function requires edit_jobs permission.
-- - Function validates customer belongs to current tenant.
-- - Function validates tool belongs to selected customer and current tenant.
-- - Function lets jobs_assign_internal_work_order_number_v1 trigger assign the AOS work order number.
-- - Job starts in INTAKE by jobs.internal_status default.

INSERT INTO public.system_mutation_registry (
    function_name,
    domain,
    authority_layer
)
SELECT
    'create_job_v1',
    'jobs',
    'surface_write'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.system_mutation_registry
    WHERE function_name = 'create_job_v1'
);

CREATE OR REPLACE FUNCTION public.create_job_v1(
    p_customer_id uuid,
    p_tool_id uuid,
    p_customer_work_order_number text DEFAULT NULL,
    p_priority text DEFAULT 'STANDARD',
    p_api_required boolean DEFAULT false,
    p_rush_job boolean DEFAULT false,
    p_severe_damage boolean DEFAULT false,
    p_customer_third_party_on_site boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    current_tenant_id uuid;
    new_job_id uuid;
BEGIN
    IF public.current_user_has_permission_v1('edit_jobs') IS NOT TRUE THEN
        RAISE EXCEPTION 'Permission denied: edit_jobs is required.';
    END IF;

    SELECT p.tenant_id
    INTO current_tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF current_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant context not found.';
    END IF;

    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer is required.';
    END IF;

    IF p_tool_id IS NULL THEN
        RAISE EXCEPTION 'Tool is required.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE c.id = p_customer_id
          AND c.tenant_id = current_tenant_id
    ) THEN
        RAISE EXCEPTION 'Customer not found for current tenant.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.tools t
        WHERE t.id = p_tool_id
          AND t.customer_id = p_customer_id
          AND t.tenant_id = current_tenant_id
    ) THEN
        RAISE EXCEPTION 'Tool not found for selected customer and current tenant.';
    END IF;

    INSERT INTO public.jobs (
        tenant_id,
        customer_id,
        tool_id,
        customer_work_order_number,
        priority,
        api_required,
        rush_job,
        severe_damage,
        customer_third_party_on_site
    )
    VALUES (
        current_tenant_id,
        p_customer_id,
        p_tool_id,
        NULLIF(trim(COALESCE(p_customer_work_order_number, '')), ''),
        COALESCE(NULLIF(upper(trim(COALESCE(p_priority, ''))), ''), 'STANDARD'),
        COALESCE(p_api_required, false),
        COALESCE(p_rush_job, false),
        COALESCE(p_severe_damage, false),
        COALESCE(p_customer_third_party_on_site, false)
    )
    RETURNING id INTO new_job_id;

    RETURN new_job_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_job_v1(
    uuid,
    uuid,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_job_v1(
    uuid,
    uuid,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_job_v1(
    uuid,
    uuid,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean
) TO authenticated;
