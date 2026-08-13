-- AOS SECURITY HARDENING APPLIED
-- Seam: dashboard RLS no-policy direct grant hardening
-- Candidate group: RLS_ENABLED_NO_POLICIES
--
-- Completed:
-- - Rollback anchor preserved before mutation.
-- - dashboard_widget_registry and user_dashboard_layout were confirmed to be used through SECURITY DEFINER dashboard functions.
-- - Authenticated INSERT / SELECT / UPDATE removed from direct table access.
-- - Direct privilege validation returned 0 rows.
-- - Effective privilege validation returned 0 rows.
-- - AOS dashboard validated after mutation.
--
-- Applied revoke:

REVOKE INSERT, SELECT, UPDATE
ON TABLE
    public.dashboard_widget_registry,
    public.user_dashboard_layout
FROM authenticated;
