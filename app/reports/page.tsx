'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
}

type ReportDashboardRow = {
  report_id: string
  tenant_id: string
  report_file_url: string
  submission_source: string
  email_id: string | null
  email_message_id: string | null
  verified: boolean | null
  verified_by: string | null
  verified_at: string | null
  manual_assignment_complete: boolean
  manual_assignment_completed_at: string | null
  manual_assignment_completed_by: string | null
  created_at: string | null
  linked_job_count: number
  linked_job_ids: string[]
}

type ReportGroup =
  | 'incoming'
  | 'openLinked'
  | 'unlinked'
  | 'unverified'
  | 'complete'
  | 'all'

const REPORT_BUCKET = 'third-party-reports'

export default function ReportsPage() {
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [reports, setReports] = useState<ReportDashboardRow[]>([])
  const [activeGroup, setActiveGroup] = useState<ReportGroup>('incoming')
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
  const canVerifyReports = allowedPermissions.has('verify_reports')
  const canCompleteReportAssignment = allowedPermissions.has(
    'complete_report_assignment'
  )

  const loadReports = async () => {
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
      setLoading(false)
      return
    }

    const { data, error } = await supabase.rpc(
      'get_third_party_report_dashboard_v1'
    )

    if (error) {
      setError(error.message)
      setReports([])
    } else {
      setReports((data ?? []) as ReportDashboardRow[])
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadReports()
  }, [])

  const incomingReports = useMemo(() => {
    return reports.filter(
      (report) =>
        report.submission_source === 'EMAIL_INGEST' &&
        !report.manual_assignment_complete
    )
  }, [reports])

  const openLinkedReports = useMemo(() => {
    return reports.filter(
      (report) =>
        report.submission_source === 'EMAIL_INGEST' &&
        !report.manual_assignment_complete &&
        Number(report.linked_job_count) > 0
    )
  }, [reports])

  const unlinkedReports = useMemo(() => {
    return reports.filter(
      (report) =>
        report.submission_source === 'EMAIL_INGEST' &&
        !report.manual_assignment_complete &&
        Number(report.linked_job_count) === 0
    )
  }, [reports])

  const unverifiedReports = useMemo(() => {
    return reports.filter((report) => !report.verified)
  }, [reports])

  const completeReports = useMemo(() => {
    return reports.filter((report) => report.manual_assignment_complete)
  }, [reports])

  const visibleReports = useMemo(() => {
    if (activeGroup === 'incoming') return incomingReports
    if (activeGroup === 'openLinked') return openLinkedReports
    if (activeGroup === 'unlinked') return unlinkedReports
    if (activeGroup === 'unverified') return unverifiedReports
    if (activeGroup === 'complete') return completeReports
    return reports
  }, [
    activeGroup,
    incomingReports,
    openLinkedReports,
    unlinkedReports,
    unverifiedReports,
    completeReports,
    reports,
  ])

  const activeTitle = useMemo(() => {
    if (activeGroup === 'incoming') return 'Incoming Reports'
    if (activeGroup === 'openLinked') return 'Linked / Open Reports'
    if (activeGroup === 'unlinked') return 'Unlinked Reports'
    if (activeGroup === 'unverified') return 'Unverified Reports'
    if (activeGroup === 'complete') return 'Completed Assignments'
    return 'All Reports'
  }, [activeGroup])

  const openReportFile = async (report: ReportDashboardRow) => {
    setError('')
    setMessage('')

    if (!report.report_file_url) {
      setError('Report file path is missing.')
      return
    }

    if (
      report.report_file_url.startsWith('http://') ||
      report.report_file_url.startsWith('https://')
    ) {
      window.open(report.report_file_url, '_blank', 'noopener,noreferrer')
      return
    }

    const { data, error } = await supabase.storage
      .from(REPORT_BUCKET)
      .createSignedUrl(report.report_file_url, 60 * 10)

    if (error) {
      setError(error.message)
      return
    }

    if (!data?.signedUrl) {
      setError('Unable to create report view link.')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const verifyReport = async (reportId: string) => {
    if (!canVerifyReports) {
      setError('You do not have permission to verify reports.')
      return
    }

    setWorkingReportId(reportId)
    setError('')
    setMessage('')

    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      setError(userError?.message ?? 'Unable to identify current user.')
      setWorkingReportId(null)
      return
    }

    const { error } = await supabase.rpc('verify_third_party_report_v1', {
      p_report_id: reportId,
      p_verified_by: userData.user.id,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Report verified successfully.')
      await loadReports()
    }

    setWorkingReportId(null)
  }

  const markAssignmentComplete = async (reportId: string) => {
    if (!canCompleteReportAssignment) {
      setError('You do not have permission to complete report assignments.')
      return
    }

    setWorkingReportId(reportId)
    setError('')
    setMessage('')

    const { error } = await supabase.rpc(
      'mark_third_party_report_assignment_complete_v1',
      {
        p_report_id: reportId,
      }
    )

    if (error) {
      setError(error.message)
    } else {
      setMessage('Report assignment marked complete.')
      await loadReports()
    }

    setWorkingReportId(null)
  }

  const renderReportCard = (report: ReportDashboardRow) => {
    const isEmailIngest = report.submission_source === 'EMAIL_INGEST'
    const canVerify = !report.verified && canVerifyReports
    const canMarkAssignmentComplete =
      isEmailIngest &&
      !report.manual_assignment_complete &&
      canCompleteReportAssignment

    return (
      <div
        key={report.report_id}
        className="rounded border border-gray-800 bg-gray-900 p-4 space-y-3"
      >
        <div className="flex flex-col gap-1">
          <p className="font-semibold break-all">
            Report ID: {report.report_id}
          </p>

          <button
            type="button"
            onClick={() => openReportFile(report)}
            className="text-left text-sm text-blue-300 hover:text-blue-200 underline break-all"
          >
            File: {report.report_file_url}
          </button>

          <p className="text-sm text-gray-400">
            Source: {report.submission_source}
          </p>

          <p className="text-sm text-gray-400">
            Created: {report.created_at ?? 'Unknown'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded border border-gray-800 bg-black p-3">
            <p className="font-semibold">Verification</p>
            <p>{report.verified ? 'Verified' : 'Not Verified'}</p>
            <p className="text-gray-400">
              Verified At: {report.verified_at ?? 'N/A'}
            </p>
            <p className="text-gray-400 break-all">
              Verified By: {report.verified_by ?? 'N/A'}
            </p>
          </div>

          <div className="rounded border border-gray-800 bg-black p-3">
            <p className="font-semibold">Assignment</p>
            <p>
              {report.manual_assignment_complete
                ? 'Assignment Complete'
                : 'Assignment Open'}
            </p>
            <p className="text-gray-400">
              Completed At: {report.manual_assignment_completed_at ?? 'N/A'}
            </p>
          </div>

          <div className="rounded border border-gray-800 bg-black p-3">
            <p className="font-semibold">Linked Jobs</p>
            <p>{report.linked_job_count}</p>
          </div>
        </div>

        <div className="rounded border border-gray-800 bg-black p-3">
          <p className="font-semibold mb-2">Linked Job IDs</p>

          {report.linked_job_ids.length === 0 ? (
            <p className="text-sm text-gray-400">No linked jobs.</p>
          ) : (
            <ul className="space-y-1 text-sm text-gray-400">
              {report.linked_job_ids.map((jobId) => (
                <li key={jobId} className="break-all">
                  {jobId}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {canVerify ? (
            <button
              onClick={() => verifyReport(report.report_id)}
              disabled={workingReportId === report.report_id}
              className="px-4 py-2 bg-green-700 text-white rounded disabled:opacity-50"
            >
              {workingReportId === report.report_id
                ? 'Working...'
                : 'Verify Report'}
            </button>
          ) : null}

          {canMarkAssignmentComplete ? (
            <button
              onClick={() => markAssignmentComplete(report.report_id)}
              disabled={workingReportId === report.report_id}
              className="px-4 py-2 bg-yellow-700 text-white rounded disabled:opacity-50"
            >
              {workingReportId === report.report_id
                ? 'Working...'
                : 'Mark Assignment Complete'}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (loading) {
    return <main className="p-6">Loading reports...</main>
  }

  if (!canViewReports) {
    return (
      <main className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Third Party Reports</h1>
        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view third-party reports.
        </div>
      </main>
    )
  }

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Third Party Reports</h1>
        <p className="text-sm text-gray-400">
          Manage incoming emailed reports, open report assignments, verification,
          linked jobs, and completed report assignment history.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <button
          onClick={() => setActiveGroup('incoming')}
          className={`rounded border p-3 text-left ${
            activeGroup === 'incoming'
              ? 'border-blue-500 bg-blue-950'
              : 'border-gray-800 bg-gray-900'
          }`}
        >
          <p className="font-semibold">Incoming</p>
          <p className="text-2xl">{incomingReports.length}</p>
          <p className="text-xs text-gray-400">Open emailed reports</p>
        </button>

        <button
          onClick={() => setActiveGroup('openLinked')}
          className={`rounded border p-3 text-left ${
            activeGroup === 'openLinked'
              ? 'border-blue-500 bg-blue-950'
              : 'border-gray-800 bg-gray-900'
          }`}
        >
          <p className="font-semibold">Linked / Open</p>
          <p className="text-2xl">{openLinkedReports.length}</p>
          <p className="text-xs text-gray-400">Linked but not complete</p>
        </button>

        <button
          onClick={() => setActiveGroup('unlinked')}
          className={`rounded border p-3 text-left ${
            activeGroup === 'unlinked'
              ? 'border-blue-500 bg-blue-950'
              : 'border-gray-800 bg-gray-900'
          }`}
        >
          <p className="font-semibold">Unlinked</p>
          <p className="text-2xl">{unlinkedReports.length}</p>
          <p className="text-xs text-gray-400">Needs job assignment</p>
        </button>

        <button
          onClick={() => setActiveGroup('unverified')}
          className={`rounded border p-3 text-left ${
            activeGroup === 'unverified'
              ? 'border-blue-500 bg-blue-950'
              : 'border-gray-800 bg-gray-900'
          }`}
        >
          <p className="font-semibold">Unverified</p>
          <p className="text-2xl">{unverifiedReports.length}</p>
          <p className="text-xs text-gray-400">Needs verification</p>
        </button>

        <button
          onClick={() => setActiveGroup('complete')}
          className={`rounded border p-3 text-left ${
            activeGroup === 'complete'
              ? 'border-blue-500 bg-blue-950'
              : 'border-gray-800 bg-gray-900'
          }`}
        >
          <p className="font-semibold">Complete</p>
          <p className="text-2xl">{completeReports.length}</p>
          <p className="text-xs text-gray-400">Assignment closed</p>
        </button>

        <button
          onClick={() => setActiveGroup('all')}
          className={`rounded border p-3 text-left ${
            activeGroup === 'all'
              ? 'border-blue-500 bg-blue-950'
              : 'border-gray-800 bg-gray-900'
          }`}
        >
          <p className="font-semibold">All Reports</p>
          <p className="text-2xl">{reports.length}</p>
          <p className="text-xs text-gray-400">Full history</p>
        </button>
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

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{activeTitle}</h2>
          <p className="text-sm text-gray-400">
            Showing {visibleReports.length} report
            {visibleReports.length === 1 ? '' : 's'}.
          </p>
        </div>

        {visibleReports.length === 0 ? (
          <div className="rounded border border-gray-800 bg-gray-900 p-4">
            No reports in this section.
          </div>
        ) : (
          <div className="space-y-4">
            {visibleReports.map((report) => renderReportCard(report))}
          </div>
        )}
      </section>
    </main>
  )
}