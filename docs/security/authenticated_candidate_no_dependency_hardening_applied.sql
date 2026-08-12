-- AOS SECURITY HARDENING APPLIED
-- Seam: authenticated no-dependency table grant hardening
-- Candidate group: CANDIDATE_REVOKE_AFTER_ROLLBACK_NO_APP_DEPENDENCY_FOUND
--
-- Completed:
-- - Rollback anchor preserved before mutation.
-- - Authenticated INSERT / SELECT / UPDATE removed from no-dependency candidate tables.
-- - Direct privilege validation returned expected result.
-- - Effective privilege validation returned expected result.
-- - AOS app validated after mutation.
--
-- Applied revoke:

REVOKE INSERT, SELECT, UPDATE
ON TABLE
    public.certification_scope_requirements,
    public.certification_violations,
    public.employee_certification_lifecycle_events,
    public.employee_certification_signoffs,
    public.employee_qualification_events,
    public.employee_training_records,
    public.inventory_lot_usage,
    public.job_welders,
    public.job_wire_usage,
    public.stage_time_limits,
    public.system_engine_heartbeats,
    public.system_health_events,
    public.third_party_companies,
    public.welder_certifications,
    public.welders,
    public.wire_certifications,
    public.wire_inventory
FROM authenticated;
