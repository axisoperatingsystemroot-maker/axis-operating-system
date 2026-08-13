-- AOS SECURITY HARDENING APPLIED
-- Seam: authenticated security-definer-only table grant hardening
-- Candidate group: CANDIDATE_REVOKE_AFTER_ROLLBACK_SECURITY_DEFINER_ONLY
--
-- Completed:
-- - Rollback anchor preserved before mutation.
-- - Authenticated INSERT / SELECT / UPDATE removed from security-definer-only candidate tables.
-- - Direct privilege validation returned 0 rows.
-- - Effective privilege validation returned 0 rows.
-- - AOS app validated after mutation.
--
-- Applied revoke:

REVOKE INSERT, SELECT, UPDATE
ON TABLE
    public.customer_users,
    public.job_narrative_history,
    public.permission_registry,
    public.role_permission_assignments,
    public.tenant_roles,
    public.user_role_assignments
FROM authenticated;
