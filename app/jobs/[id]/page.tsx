'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
}

type Job = {
  id: string
  internal_status: string
  qc_passed: boolean | null
  tenant_id: string
  override_reason: string | null
  override_by: string | null
  override_at: string | null
  created_at?: string | null
  customer_id?: string | null
  customer_name?: string | null
  tool_id?: string | null
  serial_number?: string | null
  internal_work_order_number?: string | null
  customer_work_order_number?: string | null
}

type JobDashboardRow = {
  job_id: string
  tenant_id: string
  customer_id: string | null
  customer_name: string | null
  tool_id: string | null
  serial_number: string | null
  internal_work_order_number: string | null
  customer_work_order_number: string | null
  internal_status: string
  qc_passed: boolean | null
  created_at: string | null
}

type InboundReport = {
  id: string
  tenant_id: string
  report_file_url: string
  submission_source: string
  email_id: string | null
  email_message_id?: string | null
  verified: boolean | null
  report_version: number | null
  manual_assignment_complete: boolean | null
  created_at: string | null
}

const AXIS_REROUTE_OPTIONS = [
  'INSPECTION',
  'STRIP',
  'CUTDOWN',
  'BUILD',
  'PRE_HARDMETAL_MACHINE',
  'PRE_HARDMETAL_INSPECTION',
  'HARD_METAL',
  'FINAL_MACHINE',
  'PROFILE_GRIND',
  'INTERNAL_QC',
  'THIRD_PARTY_QC',
] as const

const ALL_STAGE_ROUTE_OPTIONS = [
  'INTAKE',
  'INSPECTION',
  'STRIP',
  'CUTDOWN',
  'BUILD',
  'REDRESS',
  'PRE_HARDMETAL_MACHINE',
  'PRE_HARDMETAL_INSPECTION',
  'HARD_METAL',
  'FINAL_MACHINE',
  'PROFILE_GRIND',
  'INTERNAL_QC',
  'THIRD_PARTY_QC',
  'AWAITING_THIRD_PARTY_REPORT',
  'READY_FOR_INVOICE',
  'INVOICED',
  'AR_OPEN',
  'CLOSED',
  'SCRAPPED',
  'CRACK_REPAIR',
] as const

const POST_INSPECTION_OPTIONS = [
  'STRIP',
  'CUTDOWN',
  'BUILD',
  'HARD_METAL',
  'SCRAPPED',
] as const

type RerouteStage = (typeof AXIS_REROUTE_OPTIONS)[number]
type AnyRouteStage = (typeof ALL_STAGE_ROUTE_OPTIONS)[number]
type PostInspectionStage = (typeof POST_INSPECTION_OPTIONS)[number]

const REPORT_BUCKET = 'third-party-reports'

function formatTimestamp(value: string | null | undefined) {
  if (!value) return 'Unknown'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = String(params?.id ?? '')

  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [internalFailReason, setInternalFailReason] = useState('')
  const [internalFailReroute, setInternalFailReroute] =
    useState<RerouteStage>('PROFILE_GRIND')

  const [thirdPartyFailReason, setThirdPartyFailReason] = useState('')
  const [thirdPartyFailReroute, setThirdPartyFailReroute] =
    useState<RerouteStage>('THIRD_PARTY_QC')

  const [verifiedFailReason, setVerifiedFailReason] = useState('')
  const [verifiedFailReroute, setVerifiedFailReroute] =
    useState<RerouteStage>('THIRD_PARTY_QC')

  const [alternateTargetStage, setAlternateTargetStage] =
    useState<AnyRouteStage>('INTERNAL_QC')
  const [alternateRouteReason, setAlternateRouteReason] = useState('')

  const [reportDeclaredResult, setReportDeclaredResult] =
    useState<'PASS' | 'FAIL'>('PASS')
  const [reportInspectionDate, setReportInspectionDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [reportFile, setReportFile] = useState<File | null>(null)

  const [visitDate, setVisitDate] = useState(
    new Date().toISOString().slice(0, 10)
  )

  const [availableInboundReports, setAvailableInboundReports] = useState<
    InboundReport[]
  >([])
  const [selectedInboundReportId, setSelectedInboundReportId] = useState('')

  const allowedPermissions = useMemo(() => {
    return new Set(
      permissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )
  }, [permissions])

  const canViewJobs = allowedPermissions.has('view_jobs')
  const canRouteAnyStage = allowedPermissions.has('route_jobs_any_stage')

  const isQcControlledStage = useMemo(() => {
    return (
      job?.internal_status === 'INTERNAL_QC' ||
      job?.internal_status === 'THIRD_PARTY_QC' ||
      job?.internal_status === 'AWAITING_THIRD_PARTY_REPORT'
    )
  }, [job?.internal_status])

  const isInspectionStage = useMemo(() => {
    return job?.internal_status === 'INSPECTION'
  }, [job?.internal_status])

  const isReadyForInvoiceStage = useMemo(() => {
    return job?.internal_status === 'READY_FOR_INVOICE'
  }, [job?.internal_status])

  const isInvoicedStage = useMemo(() => {
    return job?.internal_status === 'INVOICED'
  }, [job?.internal_status])

  const isArOpenStage = useMemo(() => {
    return job?.internal_status === 'AR_OPEN'
  }, [job?.internal_status])

  const isClosedStage = useMemo(() => {
    return job?.internal_status === 'CLOSED'
  }, [job?.internal_status])

  const canShowAlternateRoute = useMemo(() => {
    return canRouteAnyStage && job?.internal_status !== 'CLOSED'
  }, [canRouteAnyStage, job?.internal_status])

  const loadPermissions = async () => {
    const { data, error } = await supabase.rpc('get_current_user_permissions_v1')

    if (error) {
      setError(`Permission load failed: ${error.message}`)
      setPermissions([])
      return new Set<string>()
    }

    const nextPermissions = (data ?? []) as PermissionRow[]
    setPermissions(nextPermissions)

    return new Set(
      nextPermissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )
  }

  const loadInboundReports = async () => {
    const { data, error } = await supabase.rpc(
      'get_available_emailed_reports_v1'
    )

    if (error) {
      setError(`Existing emailed report load failed: ${error.message}`)
      setAvailableInboundReports([])
      return
    }

    setAvailableInboundReports((data ?? []) as InboundReport[])
  }

  const mapDashboardRowToJob = (row: JobDashboardRow): Job => {
    return {
      id: row.job_id,
      tenant_id: row.tenant_id,
      internal_status: row.internal_status,
      qc_passed: row.qc_passed,
      created_at: row.created_at,
      override_reason: null,
      override_by: null,
      override_at: null,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      tool_id: row.tool_id,
      serial_number: row.serial_number,
      internal_work_order_number: row.internal_work_order_number,
      customer_work_order_number: row.customer_work_order_number,
    }
  }

  const loadJob = async () => {
    if (!jobId) {
      setError('Missing job id.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    const nextAllowedPermissions = await loadPermissions()

    if (!nextAllowedPermissions.has('view_jobs')) {
      setError('You do not have permission to view jobs.')
      setJob(null)
      setAvailableInboundReports([])
      setLoading(false)
      return
    }

    const { data: dashboardJobs, error: dashboardError } = await supabase.rpc(
      'get_jobs_dashboard_v1'
    )

    if (!dashboardError) {
      const matchingJob = ((dashboardJobs ?? []) as JobDashboardRow[]).find(
        (row) => row.job_id === jobId
      )

      if (matchingJob) {
        const nextJob = mapDashboardRowToJob(matchingJob)
        setJob(nextJob)
        await loadInboundReports()
        setLoading(false)
        return
      }
    }

    const { data, error } = await supabase
      .from('jobs')
      .select(
        'id, internal_status, qc_passed, tenant_id, override_reason, override_by, override_at, created_at, customer_id, tool_id, internal_work_order_number, customer_work_order_number'
      )
      .eq('id', jobId)
      .single()

    if (error) {
      setError(dashboardError?.message ?? error.message)
      setJob(null)
      setAvailableInboundReports([])
    } else {
      const nextJob = data as Job
      setJob(nextJob)
      await loadInboundReports()
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadJob()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const runGenericAdvance = async () => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    const { error } = await supabase.rpc('job_stage_transition_v1', {
      p_job_id: job.id,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Stage advanced successfully.')
      await loadJob()
    }

    setWorking(false)
  }

  const runConfirmInvoiceSent = async () => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    const { error } = await supabase.rpc('job_stage_transition_v1', {
      p_job_id: job.id,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Invoice sent confirmation recorded. Job moved to INVOICED.')
      await loadJob()
    }

    setWorking(false)
  }

  const runMoveToArOpen = async () => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    const { error } = await supabase.rpc('job_stage_transition_v1', {
      p_job_id: job.id,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Open receivable confirmation recorded. Job moved to AR_OPEN.')
      await loadJob()
    }

    setWorking(false)
  }

  const runConfirmPaymentCloseJob = async () => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    const { error } = await supabase.rpc('job_stage_transition_v1', {
      p_job_id: job.id,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Payment / closeout confirmation recorded. Job moved to CLOSED.')
      await loadJob()
    }

    setWorking(false)
  }

  const runPostInspectionSelection = async (nextStage: PostInspectionStage) => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    const { error } = await supabase.rpc('select_post_inspection_stage_v1', {
      p_job_id: job.id,
      p_next_stage: nextStage,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage(`Post-inspection stage set to ${nextStage}.`)
      await loadJob()
    }

    setWorking(false)
  }

  const runAlternateRoute = async () => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    if (!alternateRouteReason.trim()) {
      setError('Reason is required for alternate stage routing.')
      setWorking(false)
      return
    }

    if (alternateTargetStage === job.internal_status) {
      setError('Target stage cannot be the same as the current stage.')
      setWorking(false)
      return
    }

    const { error } = await supabase.rpc('route_job_stage_with_reason_v1', {
      p_job_id: job.id,
      p_target_stage: alternateTargetStage,
      p_reason: alternateRouteReason.trim(),
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage(
        `Alternate route recorded. Job moved from ${job.internal_status} to ${alternateTargetStage}. Admin review flag created.`
      )
      setAlternateRouteReason('')
      await loadJob()
    }

    setWorking(false)
  }

  const runQcDecision = async (
    decisionSource:
      | 'INTERNAL_QC'
      | 'THIRD_PARTY_PROVISIONAL'
      | 'THIRD_PARTY_VERIFIED',
    outcome: 'PASS' | 'FAIL' | 'PENDING_REPORT',
    rerouteStage?: RerouteStage,
    reason?: string
  ) => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    const { error } = await supabase.rpc('record_job_qc_decision_v1', {
      p_job_id: job.id,
      p_decision_source: decisionSource,
      p_outcome: outcome,
      p_reroute_stage: rerouteStage ?? null,
      p_reason: reason?.trim() ? reason.trim() : null,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('QC decision recorded successfully.')
      setInternalFailReason('')
      setThirdPartyFailReason('')
      setVerifiedFailReason('')
      await loadJob()
    }

    setWorking(false)
  }

  const runCreateAndLinkReport = async () => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    if (!reportFile) {
      setError('Report file is required.')
      setWorking(false)
      return
    }

    const safeFileName = reportFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${job.id}/${Date.now()}-${safeFileName}`

    const { error: uploadError } = await supabase.storage
      .from(REPORT_BUCKET)
      .upload(storagePath, reportFile, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      setError(uploadError.message)
      setWorking(false)
      return
    }

    const { error } = await supabase.rpc(
      'create_and_link_third_party_report_v1',
      {
        p_job_id: job.id,
        p_report_file_url: storagePath,
        p_declared_result: reportDeclaredResult,
        p_inspection_date: reportInspectionDate || null,
        p_mark_verified: true,
      }
    )

    if (error) {
      setError(error.message)
    } else {
      setMessage(
        'Verified third-party report uploaded, created, and linked successfully.'
      )
      setReportFile(null)
      await loadJob()
    }

    setWorking(false)
  }

  const runCreateAndLinkVisit = async () => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    if (!visitDate) {
      setError('Visit date is required.')
      setWorking(false)
      return
    }

    const { error } = await supabase.rpc(
      'create_and_link_third_party_visit_v1',
      {
        p_job_id: job.id,
        p_visit_date: visitDate,
        p_mark_completed: true,
      }
    )

    if (error) {
      setError(error.message)
    } else {
      setMessage('Completed third-party visit created and linked successfully.')
      await loadJob()
    }

    setWorking(false)
  }

  const runLinkExistingInboundReport = async () => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    if (!selectedInboundReportId) {
      setError('Select an emailed report first.')
      setWorking(false)
      return
    }

    const { error } = await supabase.rpc(
      'link_existing_third_party_report_to_job_v1',
      {
        p_report_id: selectedInboundReportId,
        p_job_id: job.id,
      }
    )

    if (error) {
      setError(error.message)
    } else {
      setMessage('Existing emailed report linked successfully.')
      await loadJob()
    }

    setWorking(false)
  }

  const runMarkInboundReportAssignmentComplete = async () => {
    if (!job) return

    setWorking(true)
    setError('')
    setMessage('')

    if (!selectedInboundReportId) {
      setError('Select an emailed report first.')
      setWorking(false)
      return
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      setError(userError?.message ?? 'Unable to identify current user.')
      setWorking(false)
      return
    }

    const { error } = await supabase
      .from('third_party_reports')
      .update({
        manual_assignment_complete: true,
        manual_assignment_completed_at: new Date().toISOString(),
        manual_assignment_completed_by: userData.user.id,
      })
      .eq('id', selectedInboundReportId)
      .eq('tenant_id', job.tenant_id)
      .eq('submission_source', 'EMAIL_INGEST')

    if (error) {
      setError(error.message)
    } else {
      setMessage('Emailed report assignment marked complete.')
      setSelectedInboundReportId('')
      await loadJob()
    }

    setWorking(false)
  }

  if (loading) {
    return <div className="p-6">Loading job...</div>
  }

  if (!canViewJobs) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Job Detail</h1>

        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view jobs.
        </div>

        {error ? (
          <div className="rounded border border-red-700 bg-red-950 p-3 text-red-300 break-words">
            {error}
          </div>
        ) : null}
      </main>
    )
  }

  if (!job) {
    return (
      <div className="p-6">
        <p className="text-red-400">Job not found or unavailable.</p>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

        <button
          type="button"
          onClick={() => router.push('/jobs')}
          className="mt-4 px-4 py-2 border border-gray-700 rounded"
        >
          Back to Jobs
        </button>
      </div>
    )
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Job {job.internal_work_order_number ?? 'Detail'}
          </h1>
          <p className="text-sm text-gray-400 break-all">Job ID: {job.id}</p>

          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
            <span>{job.customer_name ?? 'Unknown Customer'}</span>
            <span>•</span>
            <span>{job.serial_number ? `Serial ${job.serial_number}` : 'No serial'}</span>
            <span>•</span>
            <span>
              {job.customer_work_order_number
                ? `Customer WO ${job.customer_work_order_number}`
                : 'No customer WO'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push('/jobs')}
            className="px-4 py-2 border border-gray-700 rounded"
          >
            Back to Jobs
          </button>

          {job.customer_id ? (
            <button
              type="button"
              onClick={() => router.push(`/customers/${job.customer_id}/jobs`)}
              className="px-4 py-2 border border-gray-700 rounded"
            >
              Customer Jobs
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">AOS Work Order</p>
          <p className="text-lg font-semibold">
            {job.internal_work_order_number ?? 'Missing'}
          </p>
        </div>

        <div className="rounded border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Customer</p>
          <p className="text-lg font-semibold">
            {job.customer_name ?? 'Unknown Customer'}
          </p>
        </div>

        <div className="rounded border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Serial Number</p>
          <p className="text-lg font-semibold">
            {job.serial_number ?? 'No serial'}
          </p>
        </div>

        <div className="rounded border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Customer Work Order</p>
          <p className="text-lg font-semibold">
            {job.customer_work_order_number ?? 'Not entered'}
          </p>
        </div>
      </div>

      <div className="rounded border border-gray-800 bg-gray-900 p-4 space-y-2">
        <p>
          <span className="font-semibold">Current Stage:</span>{' '}
          {job.internal_status}
        </p>

        <p>
          <span className="font-semibold">QC Passed compatibility field:</span>{' '}
          {job.qc_passed === null ? 'NULL' : String(job.qc_passed)}
        </p>

        <p>
          <span className="font-semibold">Created:</span>{' '}
          {formatTimestamp(job.created_at)}
        </p>

        {job.override_reason ? (
          <p>
            <span className="font-semibold">Last Override Reason:</span>{' '}
            {job.override_reason}
          </p>
        ) : null}
      </div>

      {message ? (
        <div className="rounded border border-green-700 bg-green-950 p-3 text-green-300">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-700 bg-red-950 p-3 text-red-300 break-words">
          {error}
        </div>
      ) : null}

      {isInspectionStage ? (
        <div className="rounded border border-gray-800 bg-gray-900 p-4 space-y-3">
          <h2 className="text-xl font-semibold">Post-Inspection Stage Selection</h2>
          <p className="text-sm text-gray-400">
            Inspection requires explicit stage selection before normal progression continues.
          </p>

          <div className="flex flex-wrap gap-3">
            {POST_INSPECTION_OPTIONS.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => runPostInspectionSelection(stage)}
                disabled={working}
                className={`px-4 py-2 text-white rounded disabled:opacity-50 ${
                  stage === 'SCRAPPED' ? 'bg-red-700' : 'bg-zinc-700'
                }`}
              >
                {working ? 'Working...' : stage}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!isInspectionStage && !isQcControlledStage && !isClosedStage ? (
        <div className="rounded border border-gray-800 bg-gray-900 p-4 space-y-3">
          <h2 className="text-xl font-semibold">Stage Action</h2>

          <p className="text-sm text-gray-400">
            This stage uses the standard transition path.
          </p>

          <button
            type="button"
            onClick={
              isReadyForInvoiceStage
                ? runConfirmInvoiceSent
                : isInvoicedStage
                  ? runMoveToArOpen
                  : isArOpenStage
                    ? runConfirmPaymentCloseJob
                    : runGenericAdvance
            }
            disabled={working}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {working
              ? 'Working...'
              : isReadyForInvoiceStage
                ? 'Confirm Invoice Sent'
                : isInvoicedStage
                  ? 'Move to AR Open'
                  : isArOpenStage
                    ? 'Confirm Payment / Close Job'
                    : 'Advance Stage'}
          </button>
        </div>
      ) : null}

      {isClosedStage ? (
        <div className="rounded border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xl font-semibold">Closed Job</h2>
          <p className="text-sm text-gray-400">
            This job is closed. No standard stage action is available.
          </p>
        </div>
      ) : null}

      {canShowAlternateRoute ? (
        <div className="rounded border border-yellow-800 bg-yellow-950/30 p-4 space-y-3">
          <h2 className="text-xl font-semibold">Alternate Stage Route</h2>
          <p className="text-sm text-gray-400">
            Controlled override. Requires reason and creates an admin review flag.
          </p>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr_auto]">
            <select
              value={alternateTargetStage}
              onChange={(event) =>
                setAlternateTargetStage(event.target.value as AnyRouteStage)
              }
              className="rounded border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            >
              {ALL_STAGE_ROUTE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>

            <input
              value={alternateRouteReason}
              onChange={(event) => setAlternateRouteReason(event.target.value)}
              placeholder="Required reason for alternate route..."
              className="rounded border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            />

            <button
              type="button"
              disabled={working}
              onClick={() => void runAlternateRoute()}
              className="rounded bg-yellow-700 px-4 py-2 text-sm text-white hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Route
            </button>
          </div>
        </div>
      ) : null}

      {job.internal_status === 'INTERNAL_QC' ? (
        <div className="rounded border border-gray-800 bg-gray-900 p-4 space-y-4">
          <h2 className="text-xl font-semibold">Internal QC Decision</h2>

          <div>
            <button
              type="button"
              onClick={() => runQcDecision('INTERNAL_QC', 'PASS')}
              disabled={working}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              {working ? 'Working...' : 'Pass Internal QC'}
            </button>
          </div>

          <div className="space-y-3 border-t border-gray-800 pt-4">
            <p className="font-semibold">Fail Internal QC</p>

            <select
              value={internalFailReroute}
              onChange={(event) =>
                setInternalFailReroute(event.target.value as RerouteStage)
              }
              className="w-full p-2 bg-black border border-gray-700 rounded"
            >
              {AXIS_REROUTE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>

            <textarea
              value={internalFailReason}
              onChange={(event) => setInternalFailReason(event.target.value)}
              placeholder="Reason for internal QC failure"
              className="w-full p-2 bg-black border border-gray-700 rounded min-h-[100px]"
            />

            <button
              type="button"
              onClick={() =>
                runQcDecision('INTERNAL_QC', 'FAIL', internalFailReroute, internalFailReason)
              }
              disabled={working}
              className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
            >
              {working ? 'Working...' : 'Record Internal QC Fail'}
            </button>
          </div>
        </div>
      ) : null}

      {job.internal_status === 'THIRD_PARTY_QC' ? (
        <div className="rounded border border-gray-800 bg-gray-900 p-4 space-y-4">
          <h2 className="text-xl font-semibold">Third Party QC Decision</h2>

          <div className="space-y-3 border-b border-gray-800 pb-4">
            <p className="font-semibold">Create / Link Completed Third Party Visit</p>

            <input
              type="date"
              value={visitDate}
              onChange={(event) => setVisitDate(event.target.value)}
              className="w-full p-2 bg-black border border-gray-700 rounded"
            />

            <button
              type="button"
              onClick={runCreateAndLinkVisit}
              disabled={working}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              {working ? 'Working...' : 'Create / Link Completed Visit'}
            </button>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => runQcDecision('THIRD_PARTY_PROVISIONAL', 'PASS')}
              disabled={working}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50 mr-3"
            >
              {working ? 'Working...' : 'Provisional Pass'}
            </button>

            <button
              type="button"
              onClick={() =>
                runQcDecision('THIRD_PARTY_PROVISIONAL', 'PENDING_REPORT')
              }
              disabled={working}
              className="px-4 py-2 bg-yellow-600 text-white rounded disabled:opacity-50"
            >
              {working ? 'Working...' : 'Awaiting Report'}
            </button>
          </div>

          <div className="space-y-3 border-t border-gray-800 pt-4">
            <p className="font-semibold">Fail Third Party QC</p>

            <select
              value={thirdPartyFailReroute}
              onChange={(event) =>
                setThirdPartyFailReroute(event.target.value as RerouteStage)
              }
              className="w-full p-2 bg-black border border-gray-700 rounded"
            >
              {AXIS_REROUTE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>

            <textarea
              value={thirdPartyFailReason}
              onChange={(event) => setThirdPartyFailReason(event.target.value)}
              placeholder="Reason for third party QC failure"
              className="w-full p-2 bg-black border border-gray-700 rounded min-h-[100px]"
            />

            <button
              type="button"
              onClick={() =>
                runQcDecision(
                  'THIRD_PARTY_PROVISIONAL',
                  'FAIL',
                  thirdPartyFailReroute,
                  thirdPartyFailReason
                )
              }
              disabled={working}
              className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
            >
              {working ? 'Working...' : 'Record Third Party QC Fail'}
            </button>
          </div>
        </div>
      ) : null}

      {job.internal_status === 'AWAITING_THIRD_PARTY_REPORT' ? (
        <div className="rounded border border-gray-800 bg-gray-900 p-4 space-y-4">
          <h2 className="text-xl font-semibold">Third Party Report & Verified Decision</h2>

          <div className="space-y-3 border-b border-gray-800 pb-4">
            <p className="font-semibold">Link Existing Emailed Report</p>
            <p className="text-sm text-gray-400">
              Emailed reports remain selectable until assignment is manually marked complete.
              Reports already linked to other jobs are still valid for multi-job assignment.
            </p>

            <select
              value={selectedInboundReportId}
              onChange={(event) => setSelectedInboundReportId(event.target.value)}
              className="w-full p-2 bg-black border border-gray-700 rounded"
            >
              <option value="">Select an emailed report</option>
              {availableInboundReports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.id} | {report.report_file_url}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={runLinkExistingInboundReport}
                disabled={working}
                className="px-4 py-2 bg-zinc-700 text-white rounded disabled:opacity-50"
              >
                {working ? 'Working...' : 'Link Existing Emailed Report'}
              </button>

              <button
                type="button"
                onClick={runMarkInboundReportAssignmentComplete}
                disabled={working}
                className="px-4 py-2 bg-yellow-700 text-white rounded disabled:opacity-50"
              >
                {working ? 'Working...' : 'Mark Report Assignment Complete'}
              </button>
            </div>
          </div>

          <div className="space-y-3 border-b border-gray-800 pb-4">
            <p className="font-semibold">Upload / Link Verified Third Party Report</p>

            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) => setReportFile(event.target.files?.[0] ?? null)}
              className="w-full p-2 bg-black border border-gray-700 rounded"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={reportDeclaredResult}
                onChange={(event) =>
                  setReportDeclaredResult(event.target.value as 'PASS' | 'FAIL')
                }
                className="w-full p-2 bg-black border border-gray-700 rounded"
              >
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>

              <input
                type="date"
                value={reportInspectionDate}
                onChange={(event) => setReportInspectionDate(event.target.value)}
                className="w-full p-2 bg-black border border-gray-700 rounded"
              />
            </div>

            <button
              type="button"
              onClick={runCreateAndLinkReport}
              disabled={working}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              {working ? 'Working...' : 'Upload / Link Verified Report'}
            </button>
          </div>

          <div>
            <button
              type="button"
              onClick={() => runQcDecision('THIRD_PARTY_VERIFIED', 'PASS')}
              disabled={working}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              {working ? 'Working...' : 'Verified Pass - Ready for Invoice'}
            </button>
          </div>

          <div className="space-y-3 border-t border-gray-800 pt-4">
            <p className="font-semibold">Verified Fail</p>

            <select
              value={verifiedFailReroute}
              onChange={(event) =>
                setVerifiedFailReroute(event.target.value as RerouteStage)
              }
              className="w-full p-2 bg-black border border-gray-700 rounded"
            >
              {AXIS_REROUTE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>

            <textarea
              value={verifiedFailReason}
              onChange={(event) => setVerifiedFailReason(event.target.value)}
              placeholder="Reason for verified report failure"
              className="w-full p-2 bg-black border border-gray-700 rounded min-h-[100px]"
            />

            <button
              type="button"
              onClick={() =>
                runQcDecision(
                  'THIRD_PARTY_VERIFIED',
                  'FAIL',
                  verifiedFailReroute,
                  verifiedFailReason
                )
              }
              disabled={working}
              className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
            >
              {working ? 'Working...' : 'Record Verified Fail'}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}