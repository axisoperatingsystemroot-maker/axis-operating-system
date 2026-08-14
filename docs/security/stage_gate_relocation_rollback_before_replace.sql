-- AOS STAGE GATE RELOCATION ROLLBACK ANCHOR
-- Function: public.enforce_job_stage_transition()
-- Preserved before moving inspection-result gate from INTAKE exit to INSPECTION exit.
-- Execute only if rollback is deliberately required.

CREATE OR REPLACE FUNCTION public.enforce_job_stage_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
    current_role user_role;
    transition_allowed boolean;
    intake_exists boolean;
    visit_completed boolean;
    report_exists boolean;
    billing_required boolean;
    compliance_status text;
begin

    if new.internal_status = old.internal_status then
        return new;
    end if;

    ------------------------------------------------------------
    -- INTAKE ENFORCEMENT
    ------------------------------------------------------------
    if old.internal_status = 'INTAKE' then
        select exists (
            select 1
            from job_intake_inspections
            where job_id = old.id
        ) into intake_exists;

        if not intake_exists then
            raise exception 'Cannot leave INTAKE without completed intake inspection.';
        end if;
    end if;

    ------------------------------------------------------------
    -- COMPLIANCE GATE
    -- ONLY APPLY WHEN ENTERING READY_FOR_INVOICE
    ------------------------------------------------------------
    if new.internal_status = 'READY_FOR_INVOICE' then

        compliance_status := get_job_compliance_status(old.id);

        if compliance_status = 'BLOCKED' then

            select role
            into current_role
            from profiles
            where id = auth.uid();

            if current_role not in ('owner','foreman') then
                raise exception 'Job is BLOCKED by compliance rules.';
            end if;

            if new.override_reason is null
               or length(trim(new.override_reason)) = 0 then
                raise exception 'Override reason required for compliance block bypass.';
            end if;

            insert into compliance_overrides (
                tenant_id,
                finding_id,
                job_id,
                override_reason,
                approved_by
            )
            select
                cf.tenant_id,
                cf.id,
                old.id,
                new.override_reason,
                auth.uid()
            from compliance_findings cf
            where cf.entity_type = 'JOB'
              and cf.entity_id = old.id
              and cf.severity = 'BLOCK'
              and cf.resolved = false;

            new.override_by := auth.uid();
            new.override_at := now();

        end if;

    end if;

    ------------------------------------------------------------
    -- BLOCK LEAVING THIRD_PARTY_QC WITHOUT VISIT
    ------------------------------------------------------------
    if old.internal_status = 'THIRD_PARTY_QC'
       and new.internal_status = 'AWAITING_THIRD_PARTY_REPORT' then

        select exists (
            select 1
            from visit_jobs vj
            join third_party_visits v on v.id = vj.visit_id
            where vj.job_id = old.id
              and v.status = 'COMPLETED'
        ) into visit_completed;

        if not visit_completed then
            raise exception 'Cannot leave THIRD_PARTY_QC without completed visit.';
        end if;

    end if;

    ------------------------------------------------------------
    -- READY_FOR_INVOICE ENFORCEMENT
    ------------------------------------------------------------
    if new.internal_status = 'READY_FOR_INVOICE' then

        if not new.customer_third_party_on_site then

            select exists (
                select 1
                from report_jobs rj
                join third_party_reports r on r.id = rj.report_id
                where rj.job_id = old.id
                  and r.verified = true
            ) into report_exists;

            if not report_exists then
                raise exception 'Verified third-party report required.';
            end if;

            select exists (
                select 1
                from report_jobs rj
                join third_party_reports r on r.id = rj.report_id
                join visit_customers vc on vc.id = r.visit_customer_id
                where rj.job_id = old.id
                  and vc.billing_model = 'THROUGH_US'
            ) into billing_required;

            if billing_required then
                if not exists (
                    select 1
                    from third_party_billing b
                    where b.job_id = old.id
                ) then
                    raise exception 'Third-party billing required.';
                end if;
            end if;

        end if;

    end if;

    ------------------------------------------------------------
    -- STANDARD TRANSITION VALIDATION
    -- Alternate routed transitions require permission + reason.
    ------------------------------------------------------------
    select exists (
        select 1
        from job_stage_transitions
        where from_stage = old.internal_status
          and to_stage = new.internal_status
    ) into transition_allowed;

    if not transition_allowed then
        if new.override_reason is null
           or length(trim(new.override_reason)) = 0 then
            raise exception 'Invalid stage transition from % to %. Reason required for alternate routing.',
                old.internal_status, new.internal_status;
        end if;

        if public.current_user_has_permission_v1('route_jobs_any_stage') is not true then
            raise exception 'Permission denied: route_jobs_any_stage is required.';
        end if;

        transition_allowed := true;
    end if;

    ------------------------------------------------------------
    -- AUTO-LOG STAGE CHANGE
    ------------------------------------------------------------
    insert into job_stage_history (
        tenant_id,
        job_id,
        from_stage,
        to_stage,
        changed_by,
        override_flag,
        override_reason
    )
    values (
        old.tenant_id,
        old.id,
        old.internal_status,
        new.internal_status,
        auth.uid(),
        new.override_reason is not null,
        new.override_reason
    );

    return new;

end;
$function$