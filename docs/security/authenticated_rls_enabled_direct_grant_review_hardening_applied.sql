-- AOS SECURITY HARDENING APPLIED
-- Seam: authenticated RLS-enabled direct grant review hardening
-- Candidate group: RLS_ENABLED_DIRECT_GRANT_REVIEW
--
-- Completed:
-- - Rollback anchor preserved before mutation.
-- - employee_permissions, job_inspection_results, job_ndt_inspections,
--   job_qc_decisions, and test_table were reviewed.
-- - These tables already had RLS enabled.
-- - Authenticated INSERT / SELECT / UPDATE removed from direct table access.
-- - Direct privilege validation returned 0 rows.
-- - Effective privilege validation returned 0 rows.
-- - AOS app validated after mutation.
--
-- Applied revoke:

REVOKE INSERT, SELECT, UPDATE
ON TABLE
    public.employee_permissions,
    public.job_inspection_results,
    public.job_ndt_inspections,
    public.job_qc_decisions,
    public.test_table
FROM authenticated;
