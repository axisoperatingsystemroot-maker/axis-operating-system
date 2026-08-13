-- AOS AUTHENTICATED RLS-ENABLED DIRECT GRANT ROLLBACK ANCHOR
-- Candidate group: RLS_ENABLED_DIRECT_GRANT_REVIEW
-- Tables:
-- - employee_permissions
-- - job_inspection_results
-- - job_ndt_inspections
-- - job_qc_decisions
-- - test_table
--
-- Preserved before removing authenticated direct INSERT / SELECT / UPDATE.
-- Execute only if rollback is deliberately required.

GRANT INSERT, SELECT, UPDATE ON TABLE public.employee_permissions TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.job_inspection_results TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.job_ndt_inspections TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.job_qc_decisions TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.test_table TO authenticated;
