# AOS RLS Hardening Remaining Hold State

## Seam
Remaining RLS / authenticated exposure hardening.

## Current Result
After completed hardening passes, only HOLD groups remain.

## Completed Hardening
- Direct anon grants removed.
- PUBLIC inherited schema/function exposure removed.
- Authenticated REFERENCES / TRIGGER / TRUNCATE removed.
- No-dependency authenticated direct table grants removed.
- Security-definer-only authenticated direct table grants removed.
- Dashboard RLS no-policy direct grants removed.
- RLS-enabled direct grant review group removed.
- SQL validations returned expected results.
- AOS app validated after each mutation.
- Rollback anchors preserved before mutation.
- Applied results preserved after validation.

## Remaining Hold Group 1 — HOLD_DIRECT_FRONTEND_TABLE

These tables remain held because the frontend still directly uses them.

- customers | rls=true | grants=INSERT, SELECT, UPDATE
- jobs | rls=true | grants=INSERT, SELECT, UPDATE
- profiles | rls=true | grants=INSERT, SELECT, UPDATE
- tenants | rls=true | grants=INSERT, SELECT, UPDATE
- third_party_reports | rls=false | grants=INSERT, UPDATE
- tools | rls=true | grants=INSERT, SELECT, UPDATE

Required future path:
- Do not revoke blindly.
- Convert direct frontend access to controlled RPCs where appropriate.
- Validate page behavior after each conversion.
- Then reassess direct table grants.

## Remaining Hold Group 2 — HOLD_SECURITY_INVOKER_RPC_DEPENDENCY

These tables remain held because SECURITY INVOKER functions may rely on authenticated table privileges.

- certification_exports | rls=true | grants=INSERT, SELECT, UPDATE
- compliance_findings | rls=false | grants=INSERT, UPDATE
- compliance_overrides | rls=false | grants=INSERT, UPDATE
- continuity_settings | rls=false | grants=INSERT, SELECT, UPDATE
- employee_certification_lifecycle | rls=false | grants=INSERT, UPDATE
- employee_certifications | rls=false | grants=INSERT, SELECT, UPDATE
- equipment_calibrations | rls=false | grants=INSERT, SELECT, UPDATE
- equipment_registry | rls=false | grants=INSERT, SELECT, UPDATE
- estimator_rate_config | rls=false | grants=INSERT, SELECT
- inspection_emails | rls=false | grants=INSERT, SELECT, UPDATE
- inventory_items | rls=false | grants=INSERT, SELECT, UPDATE
- inventory_lots | rls=false | grants=INSERT, SELECT, UPDATE
- inventory_movements | rls=false | grants=INSERT, SELECT, UPDATE
- job_actual_summary_snapshot | rls=false | grants=INSERT, SELECT
- job_documents | rls=false | grants=INSERT, SELECT, UPDATE
- job_inspection_sessions | rls=true | grants=INSERT, SELECT, UPDATE
- job_intake_inspections | rls=true | grants=INSERT, SELECT, UPDATE
- job_labor_logs | rls=true | grants=INSERT, UPDATE
- job_quote_snapshot | rls=false | grants=INSERT, SELECT
- job_stage_history | rls=true | grants=INSERT, UPDATE
- job_stage_scope_requirements | rls=false | grants=INSERT, UPDATE
- job_stage_transitions | rls=false | grants=INSERT, SELECT, UPDATE
- report_jobs | rls=false | grants=INSERT, UPDATE
- system_mutation_registry | rls=false | grants=INSERT, SELECT, UPDATE
- tenant_settings | rls=false | grants=INSERT, SELECT
- third_party_billing | rls=false | grants=INSERT, UPDATE
- third_party_visits | rls=false | grants=INSERT, UPDATE
- visit_customers | rls=false | grants=INSERT, UPDATE
- visit_jobs | rls=false | grants=INSERT, UPDATE

Required future path:
- Do not revoke blindly.
- Review SECURITY INVOKER functions individually.
- Convert eligible functions to SECURITY DEFINER only when aligned with governance.
- Preserve rollback before any future privilege mutation.
- Validate app and workflow after each controlled change.

## Closure Boundary

This RLS hardening pass is closed at the safe boundary.

Remaining exposure is intentionally held because it is tied to:
1. Direct frontend table access.
2. SECURITY INVOKER RPC dependencies.

No further permission removal should occur until the related app/RPC layer is refactored or reviewed.
