-- AOS AUTHENTICATED DASHBOARD RLS NO-POLICY ROLLBACK ANCHOR
-- Candidate group: RLS_ENABLED_NO_POLICIES
-- Tables:
-- - dashboard_widget_registry
-- - user_dashboard_layout
--
-- Preserved before removing authenticated direct INSERT / SELECT / UPDATE.
-- Execute only if rollback is deliberately required.

GRANT INSERT, SELECT, UPDATE ON TABLE public.dashboard_widget_registry TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.user_dashboard_layout TO authenticated;
