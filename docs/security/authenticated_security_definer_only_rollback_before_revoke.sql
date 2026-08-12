-- AOS AUTHENTICATED DIRECT TABLE GRANT ROLLBACK ANCHOR
-- Candidate group: CANDIDATE_REVOKE_AFTER_ROLLBACK_SECURITY_DEFINER_ONLY
-- Preserved before removing authenticated direct table access from SECURITY DEFINER-only dependency tables.
-- Execute only if rollback is deliberately required.

GRANT INSERT, SELECT, UPDATE ON TABLE public.customer_users TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.job_narrative_history TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.permission_registry TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.role_permission_assignments TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.tenant_roles TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.user_role_assignments TO authenticated;