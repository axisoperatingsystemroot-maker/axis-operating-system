-- AOS AUTHENTICATED DIRECT TABLE GRANT ROLLBACK ANCHOR
-- Candidate group: CANDIDATE_REVOKE_AFTER_ROLLBACK_NO_APP_DEPENDENCY_FOUND
-- Preserved before removing authenticated SELECT / INSERT / UPDATE / DELETE from candidate tables.
-- Execute only if rollback is deliberately required.

GRANT INSERT, SELECT, UPDATE ON TABLE public.certification_scope_requirements TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.certification_violations TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.employee_certification_lifecycle_events TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.employee_certification_signoffs TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.employee_qualification_events TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.employee_training_records TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.inventory_lot_usage TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.job_welders TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.job_wire_usage TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.stage_time_limits TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.system_engine_heartbeats TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.system_health_events TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.third_party_companies TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.welder_certifications TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.welders TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.wire_certifications TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.wire_inventory TO authenticated;