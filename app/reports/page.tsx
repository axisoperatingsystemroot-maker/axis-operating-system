'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
}

type ReportDashboardRow = {
  report_id: string
  tenant_id: string
  report_file_url: string | null
  submission_source: string | null
  email_id: string | null
  email_message_id: string | null
  verified: boolean | null
  verified_by: string | null
  verified_at: string | null
  manual_assignment_complete: boolean | null
  manual_assignment_completed_at: string | null
  manual_assignment_completed_by: string | null
  created_at: string | null
  linked_job_count: number | null
  linked_job_ids: string[] | string | null
}

type JobDashboardRow = {
  job_id: string
  tenant_id: string
  customer_id: string
  customer_name: string | null
  tool_id: string
  serial_number: string | null
  internal_work_order_number: string | null
  customer_work_order_number: string | null
  internal_status: string
  qc_passed: boolean | null
  created_at: string | null
}

type FilterMode =
  | 'incoming'
  | 'linkedOpen'
  | 'unassigned'
  | 'unverified'
  | 'completed'
  | 'all'

type SortMode =
  | 'newest'
  | 'oldest'
  | 'verifiedFirst'
  | 'unverifiedFirst'
  | 'sourceAsc'
  | 'sourceDesc'
  | 'linkedHigh'
  | 'linkedLow'

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

function timeValue(value: string | null | undefined) {
  if (!value) return 0

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 0

  return date.getTime()
}

function safeText(value: string | null | undefined) {
  return value?.toLowerCase() ?? ''
}

function numberValue(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function normalizeLinkedJobIds(value: string[] | string | null | undefined) {
  if (!value) return []

  if (Array.isArray(value)) {
    return value.filter(Boolean)
  }

  return value
    .replace(/[{}"]/g, '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeStoragePath(value: string) {
  let nextPath = value.trim()

  if (nextPath.startsWith(`${REPORT_BUCKET}/`)) {
    nextPath = nextPath.slice(REPORT_BUCKET.length + 1)
  }

  while (nextPath.startsWith('/')) {
    nextPath = nextPath.slice(1)
  }

  return nextPath
}

function reportIsIncoming(report: ReportDashboardRow) {
  return (
    report.submission_source === 'EMAIL_INGEST' &&
    report.manual_assignment_complete !== true
  )
}

function reportIsLinkedOpen(report: ReportDashboardRow) {
  return reportIsIncoming(report) && numberValue(report.linked_job_count) > 0
}

function reportIsUnassigned(report: ReportDashboardRow) {
  return reportIsIncoming(report) && numberValue(report.linked_job_count) === 0
}

function reportIsUnverified(report: ReportDashboardRow) {
  return report.verified !== true
}

function reportIsCompleted(report: ReportDashboardRow) {
  return report.manual_assignment_complete === true
}

function reportStatusLabel(report: ReportDashboardRow) {
  if (report.manual_assignment_complete === true) return 'Completed'

  if (report.verified === true && numberValue(report.linked_job_count) > 0) {
    return 'Linked / Verified'
  }

  if (report.verified === true) return 'Verified'
  if (numberValue(report.linked_job_count) > 0) return 'Linked / Pending'

  return 'Needs Review'
}

export default function ReportsPage() {
  const router = useRouter()

  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [reports, setReports] = useState<ReportDashboardRow[]>([])
  const [jobs, setJobs] = useState<JobDashboardRow[]>([])
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null)
  const [selectedJobByReportId, setSelectedJobByReportId] = useState<
    Record<string, string>
  >({})
  const [filterMode, setFilterMode] = useState<FilterMode>('incoming')
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [workingReportId, setWorkingReportId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const allowedPermissions = useMemo(() => {
    return new Set(
      permissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )
  }, [permissions])

  const canViewReports = allowedPermissions.has('view_reports')
  const canViewJobs = allowedPermissions.has('view_jobs')
  const canVerifyReports = allowedPermissions.has('verify_reports')
  const canCompleteReportAssignment = allowedPermissions.has(
    'complete_report_assignment'
  )

  const loadReportsPage = async () => {
    setLoading(true)
    setError('')
    setMessage('')

    const { data: permissionData, error: permissionError } = await supabase.rpc(
      'get_current_user_permissions_v1'
    )

    if (permissionError) {
      setError(`Permission load failed: ${permissionError.message}`)
      setPermissions([])
      setReports([])
      setJobs([])
      setLoading(false)
      return
    }

    const nextPermissions = (permissionData ?? []) as PermissionRow[]
    setPermissions(nextPermissions)

    const nextAllowedPermissions = new Set(
      nextPermissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )

    if (!nextAllowedPermissions.has('view_reports')) {
      setReports([])
      setJobs([])
      setLoading(false)
      return
    }

    const { data: reportsData, error: reportsError } = await supabase.rpc(
      'get_third_party_report_dashboard_v1'
    )

    if (reportsError) {
      setError(`Reports load failed: ${reportsError.message}`)
      setReports([])
      setJobs([])
      setLoading(false)
      return
    }

    setReports((reportsData ?? []) as ReportDashboardRow[])

    if (nextAllowedPermissions.has('view_jobs')) {
      const { data: jobsData, error: jobsError } = await supabase.rpc(
        'get_jobs_dashboard_v1'
      )

      if (jobsError) {
        setJobs([])
      } else {
        setJobs((jobsData ?? []) as JobDashboardRow[])
      }
    } else {
      setJobs([])
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadReportsPage()
  }, [])

  const incomingReports = useMemo(() => {
    return reports.filter((report) => reportIsIncoming(report))
  }, [reports])

  const linkedOpenReports = useMemo(() => {
    return reports.filter((report) => reportIsLinkedOpen(report))
  }, [reports])

  const unassignedReports = useMemo(() => {
    return reports.filter((report) => reportIsUnassigned(report))
  }, [reports])

  const unverifiedReports = useMemo(() => {
    return reports.filter((report) => reportIsUnverified(report))
  }, [reports])

  const completedReports = useMemo(() => {
    return reports.filter((report) => reportIsCompleted(report))
  }, [reports])

  const filterBaseReports = useMemo(() => {
    if (filterMode === 'incoming') return incomingReports
    if (filterMode === 'linkedOpen') return linkedOpenReports
    if (filterMode === 'unassigned') return unassignedReports
    if (filterMode === 'unverified') return unverifiedReports
    if (filterMode === 'completed') return completedReports
    return reports
  }, [
    filterMode,
    incomingReports,
    linkedOpenReports,
    unassignedReports,
    unverifiedReports,
    completedReports,
    reports,
  ])

  const searchedReports = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return filterBaseReports

    return filterBaseReports.filter((report) => {
      const linkedJobIds = normalizeLinkedJobIds(report.linked_job_ids)

      const linkedJobText = jobs
        .filter((job) => linkedJobIds.includes(job.job_id))
        .map((job) =>
          [
            job.internal_work_order_number,
            job.customer_work_order_number,
            job.customer_name,
            job.serial_number,
            job.internal_status,
            job.job_id,
          ]
            .filter(Boolean)
            .join(' ')
        )
        .join(' ')

      const searchable = [
        report.report_id,
        report.report_file_url,
        report.submission_source,
        report.email_id,
        report.email_message_id,
        reportStatusLabel(report),
        linkedJobIds.join(' '),
        linkedJobText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(term)
    })
  }, [filterBaseReports, search, jobs])

  const visibleReports = useMemo(() => {
    const sorted = [...searchedReports]

    sorted.sort((a, b) => {
      if (sortMode === 'newest') {
        return timeValue(b.created_at) - timeValue(a.created_at)
      }

      if (sortMode === 'oldest') {
        return timeValue(a.created_at) - timeValue(b.created_at)
      }

      if (sortMode === 'verifiedFirst') {
        return Number(b.verified === true) - Number(a.verified === true)
      }

      if (sortMode === 'unverifiedFirst') {
        return Number(a.verified === true) - Number(b.verified === true)
      }

      if (sortMode === 'sourceAsc') {
        return safeText(a.submission_source).localeCompare(
          safeText(b.submission_source)
        )
      }

      if (sortMode === 'sourceDesc') {
        return safeText(b.submission_source).localeCompare(
          safeText(a.submission_source)
        )
      }

      if (sortMode === 'linkedHigh') {
        return numberValue(b.linked_job_count) - numberValue(a.linked_job_count)
      }

      if (sortMode === 'linkedLow') {
        return numberValue(a.linked_job_count) - numberValue(b.linked_job_count)
      }

      return 0
    })

    return sorted
  }, [searchedReports, sortMode])

  const jobOptions = useMemo(() => {
    return [...jobs].sort((a, b) => {
      return safeText(a.internal_work_order_number).localeCompare(
        safeText(b.internal_work_order_number)
      )
    })
  }, [jobs])

  const submitSearch = () => {
    setSearch(searchDraft)
  }

  const clearSearch = () => {
    setSearchDraft('')
    setSearch('')
  }

  const selectFilter = (nextFilter: FilterMode) => {
    setFilterMode(nextFilter)
    clearSearch()
  }

  const toggleExpandedReport = (reportId: string) => {
    setExpandedReportId((current) => (current === reportId ? null : reportId))
  }

  const filterButtonClass = (mode: FilterMode) => {
    return `rounded-full border px-3 py-1.5 text-xs font-semibold ${
      filterMode === mode
        ? 'border-blue-500 bg-blue-950 text-white'
        : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:text-white'
    }`
  }

  const openReportFile = async (report: ReportDashboardRow) => {
    setError('')
    setMessage('')

    const newWindow = window.open('about:blank', '_blank')

    if (!newWindow) {
      setError('Browser blocked the report window. Allow pop-ups and try again.')
      return
    }

    newWindow.opener = null

    const fileUrl = report.report_file_url?.trim()

    if (!fileUrl) {
      newWindow.close()
      setError('This report does not have a file URL.')
      return
    }

    if (/^https?:\/\//i.test(fileUrl)) {
      newWindow.location.href = fileUrl
      return
    }

    const storagePath = normalizeStoragePath(fileUrl)

    const { data, error: signedUrlError } = await supabase.storage
      .from(REPORT_BUCKET)
      .createSignedUrl(storagePath, 60 * 10)

    if (signedUrlError || !data?.signedUrl) {
      newWindow.close()
      setError(signedUrlError?.message ?? 'Unable to open report file.')
      return
    }

    newWindow.location.href = data.signedUrl
  }

  const linkReportToSelectedJob = async (report: ReportDashboardRow) => {
    const selectedJobId = selectedJobByReportId[report.report_id]

    if (!selectedJobId) {
      setError('Select a job before linking the report.')
      return
    }

    setWorkingReportId(report.report_id)
    setError('')
    setMessage('')

    const { error: linkError } = await supabase.rpc(
      'link_existing_third_party_report_to_job_v1',
      {
        p_report_id: report.report_id,
        p_job_id: selectedJobId,
      }
    )

    if (linkError) {
      setError(linkError.message)
    } else {
      setMessage('Report linked to job successfully.')
      setSelectedJobByReportId((current) => ({
        ...current,
        [report.report_id]: '',
      }))
      await loadReportsPage()
    }

    setWorkingReportId(null)
  }

  const verifyReport = async (report: ReportDashboardRow) => {
    if (!canVerifyReports) {
      setError('You do not have permission to verify reports.')
      return
    }

    setWorkingReportId(report.report_id)
    setError('')
    setMessage('')

    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      setError(userError?.message ?? 'Unable to identify current user.')
      setWorkingReportId(null)
      return
    }

    const { error: verifyError } = await supabase.rpc(
      'verify_third_party_report_v1',
      {
        p_report_id: report.report_id,
        p_verified_by: userData.user.id,
      }
    )

    if (verifyError) {
      setError(verifyError.message)
    } else {
      setMessage('Report verified successfully.')
      await loadReportsPage()
    }

    setWorkingReportId(null)
  }

  const markAssignmentComplete = async (report: ReportDashboardRow) => {
    if (!canCompleteReportAssignment) {
      setError('You do not have permission to complete report assignments.')
      return
    }

    setWorkingReportId(report.report_id)
    setError('')
    setMessage('')

    const { error: completeError } = await supabase.rpc(
      'mark_third_party_report_assignment_complete_v1',
      {
        p_report_id: report.report_id,
      }
    )

    if (completeError) {
      setError(completeError.message)
    } else {
      setMessage('Report assignment marked complete.')
      await loadReportsPage()
    }

    setWorkingReportId(null)
  }

  const getLinkedJobs = (report: ReportDashboardRow) => {
    const linkedJobIds = normalizeLinkedJobIds(report.linked_job_ids)
    return jobs.filter((job) => linkedJobIds.includes(job.job_id))
  }

  if (loading) {
    return <main className="p-6">Loading reports...</main>
  }

  if (!canViewReports) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Reports</h1>

        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view reports.
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
      </div>

      <div className="space-y-2">
        <div className="flex w-full items-center gap-2">
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                submitSearch()
              }
            }}
            placeholder="Search report, file, email, customer, serial, job..."
            className="min-w-0 flex-1 rounded border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          />

          <button
            type="button"
            onClick={submitSearch}
            className="shrink-0 rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600"
          >
            Search
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="rounded border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="unverifiedFirst">Unverified first</option>
            <option value="verifiedFirst">Verified first</option>
            <option value="sourceAsc">Source A-Z</option>
            <option value="sourceDesc">Source Z-A</option>
            <option value="linkedHigh">Linked jobs high-low</option>
            <option value="linkedLow">Linked jobs low-high</option>
          </select>
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => selectFilter('incoming')}
          className={filterButtonClass('incoming')}
        >
          Incoming: {incomingReports.length}
        </button>

        <button
          type="button"
          onClick={() => selectFilter('linkedOpen')}
          className={filterButtonClass('linkedOpen')}
        >
          Linked Open: {linkedOpenReports.length}
        </button>

        <button
          type="button"
          onClick={() => selectFilter('unassigned')}
          className={filterButtonClass('unassigned')}
        >
          Unassigned: {unassignedReports.length}
        </button>

        <button
          type="button"
          onClick={() => selectFilter('unverified')}
          className={filterButtonClass('unverified')}
        >
          Unverified: {unverifiedReports.length}
        </button>

        <button
          type="button"
          onClick={() => selectFilter('completed')}
          className={filterButtonClass('completed')}
        >
          Completed: {completedReports.length}
        </button>

        <button
          type="button"
          onClick={() => selectFilter('all')}
          className={filterButtonClass('all')}
        >
          All: {reports.length}
        </button>
      </section>

      {search ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Search active: {search}</span>
          <button
            type="button"
            onClick={clearSearch}
            className="rounded border border-gray-700 px-2 py-1 text-gray-300 hover:border-gray-500 hover:text-white"
          >
            Clear
          </button>
        </div>
      ) : null}

      {message ? (
        <div className="rounded border border-green-700 bg-green-950 p-3 text-green-300">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="break-words rounded border border-red-700 bg-red-950 p-3 text-red-300">
          {error}
        </div>
      ) : null}

      <section className="rounded border border-gray-800 bg-gray-900">
        <div className="flex flex-col gap-1 border-b border-gray-800 px-4 py-2">
          <h2 className="text-base font-semibold">Report List</h2>
          <p className="text-xs text-gray-400">
            Showing {visibleReports.length} of {reports.length} reports. Click a
            row to expand details.
          </p>
        </div>

        {visibleReports.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">No reports found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
              <thead className="bg-black text-gray-300">
                <tr>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Report
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Source
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Verified
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Assignment
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Linked Jobs
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Created
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Status
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleReports.map((report) => {
                  const isExpanded = expandedReportId === report.report_id
                  const linkedJobs = getLinkedJobs(report)
                  const linkedJobIds = normalizeLinkedJobIds(
                    report.linked_job_ids
                  )
                  const isWorking = workingReportId === report.report_id
                  const canVerifyThisReport =
                    report.verified !== true && canVerifyReports
                  const canCompleteThisAssignment =
                    report.submission_source === 'EMAIL_INGEST' &&
                    report.manual_assignment_complete !== true &&
                    canCompleteReportAssignment

                  return (
                    <Fragment key={report.report_id}>
                      <tr
                        onClick={() => toggleExpandedReport(report.report_id)}
                        className="cursor-pointer border-b border-gray-800 hover:bg-gray-800/60"
                      >
                        <td className="px-4 py-2 font-semibold text-white">
                          <span className="block break-all">
                            {report.report_id}
                          </span>
                          <span className="mt-1 block max-w-[320px] truncate text-xs font-normal text-gray-500">
                            {report.report_file_url ?? 'No file URL'}
                          </span>
                        </td>

                        <td className="px-4 py-2">
                          {report.submission_source ?? 'Unknown'}
                        </td>

                        <td className="px-4 py-2">
                          <span
                            className={`rounded px-2 py-1 text-xs ${
                              report.verified === true
                                ? 'bg-green-950 text-green-300'
                                : 'bg-yellow-950 text-yellow-300'
                            }`}
                          >
                            {report.verified === true ? 'Verified' : 'Pending'}
                          </span>
                        </td>

                        <td className="px-4 py-2">
                          <span
                            className={`rounded px-2 py-1 text-xs ${
                              report.manual_assignment_complete === true
                                ? 'bg-green-950 text-green-300'
                                : 'bg-gray-800 text-gray-200'
                            }`}
                          >
                            {report.manual_assignment_complete === true
                              ? 'Complete'
                              : 'Open'}
                          </span>
                        </td>

                        <td className="px-4 py-2">
                          {numberValue(report.linked_job_count)}
                        </td>

                        <td className="px-4 py-2">
                          {formatTimestamp(report.created_at)}
                        </td>

                        <td className="px-4 py-2">
                          {reportStatusLabel(report)}
                        </td>

                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleExpandedReport(report.report_id)
                            }}
                            className="rounded border border-gray-700 bg-black px-3 py-1.5 text-xs text-gray-200 hover:border-gray-500 hover:text-white"
                          >
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </button>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr className="border-b border-gray-800 bg-black/40">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                              <div>
                                <p className="text-xs text-gray-500">Report ID</p>
                                <p className="break-all text-sm text-gray-300">
                                  {report.report_id}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Email ID</p>
                                <p className="break-all text-sm text-gray-300">
                                  {report.email_id ?? 'Not from email ingest'}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">
                                  Email Message ID
                                </p>
                                <p className="break-all text-sm text-gray-300">
                                  {report.email_message_id ?? 'Not entered'}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">
                                  Verified At
                                </p>
                                <p className="text-sm text-gray-300">
                                  {formatTimestamp(report.verified_at)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4">
                              <p className="text-xs text-gray-500">File</p>
                              <p className="break-all text-sm text-gray-300">
                                {report.report_file_url ?? 'No file URL'}
                              </p>
                            </div>

                            <div className="mt-4">
                              <p className="text-xs text-gray-500">
                                Linked Jobs
                              </p>

                              {linkedJobIds.length === 0 ? (
                                <p className="text-sm text-gray-300">
                                  No linked jobs.
                                </p>
                              ) : linkedJobs.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {linkedJobs.map((job) => (
                                    <button
                                      key={job.job_id}
                                      type="button"
                                      onClick={() =>
                                        router.push(`/jobs/${job.job_id}`)
                                      }
                                      className="rounded border border-gray-700 bg-black px-3 py-1.5 text-xs text-gray-200 hover:border-blue-500 hover:text-white"
                                    >
                                      {job.internal_work_order_number ??
                                        job.job_id}
                                      {job.serial_number
                                        ? ` • ${job.serial_number}`
                                        : ''}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {linkedJobIds.map((jobId) => (
                                    <button
                                      key={jobId}
                                      type="button"
                                      onClick={() => router.push(`/jobs/${jobId}`)}
                                      className="rounded border border-gray-700 bg-black px-3 py-1.5 text-xs text-gray-200 hover:border-blue-500 hover:text-white"
                                    >
                                      {jobId}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
                              <select
                                value={
                                  selectedJobByReportId[report.report_id] ?? ''
                                }
                                onChange={(event) =>
                                  setSelectedJobByReportId((current) => ({
                                    ...current,
                                    [report.report_id]: event.target.value,
                                  }))
                                }
                                disabled={!canViewJobs}
                                className="rounded border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <option value="">Select job to link</option>
                                {jobOptions.map((job) => (
                                  <option key={job.job_id} value={job.job_id}>
                                    {(job.internal_work_order_number ??
                                      job.job_id) +
                                      ' | ' +
                                      (job.customer_name ?? 'Unknown Customer') +
                                      ' | ' +
                                      (job.serial_number ?? 'No serial') +
                                      ' | ' +
                                      job.internal_status}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                disabled={!canViewJobs || isWorking}
                                onClick={() => void linkReportToSelectedJob(report)}
                                className="rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isWorking ? 'Working...' : 'Link Selected Job'}
                              </button>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void openReportFile(report)}
                                className="rounded border border-gray-700 bg-black px-3 py-1.5 text-xs text-gray-200 hover:border-blue-500 hover:text-white"
                              >
                                Open File
                              </button>

                              {canVerifyThisReport ? (
                                <button
                                  type="button"
                                  disabled={isWorking}
                                  onClick={() => void verifyReport(report)}
                                  className="rounded bg-green-700 px-3 py-1.5 text-xs text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isWorking ? 'Working...' : 'Verify Report'}
                                </button>
                              ) : null}

                              {report.verified === true ? (
                                <span className="rounded bg-green-950 px-3 py-1.5 text-xs text-green-300">
                                  Verified
                                </span>
                              ) : null}

                              {canCompleteThisAssignment ? (
                                <button
                                  type="button"
                                  disabled={isWorking}
                                  onClick={() =>
                                    void markAssignmentComplete(report)
                                  }
                                  className="rounded bg-yellow-700 px-3 py-1.5 text-xs text-white hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isWorking
                                    ? 'Working...'
                                    : 'Mark Assignment Complete'}
                                </button>
                              ) : null}

                              {report.manual_assignment_complete === true ? (
                                <span className="rounded bg-green-950 px-3 py-1.5 text-xs text-green-300">
                                  Assignment Complete
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}