'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
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

type JobGroup =
  | 'active'
  | 'awaitingReport'
  | 'readyForInvoice'
  | 'invoiced'
  | 'arOpen'
  | 'closed'
  | 'all'

type SortMode =
  | 'newest'
  | 'oldest'
  | 'customerAsc'
  | 'customerDesc'
  | 'stageAsc'
  | 'stageDesc'
  | 'serialAsc'
  | 'serialDesc'
  | 'internalWoAsc'
  | 'internalWoDesc'

const ACTIVE_PRODUCTION_STAGES = [
  'INTAKE',
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
]

function formatTimestamp(value: string | null) {
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

function timeValue(value: string | null) {
  if (!value) return 0

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 0

  return date.getTime()
}

function safeText(value: string | null | undefined) {
  return value?.toLowerCase() ?? ''
}

function qcLabel(value: boolean | null) {
  if (value === null) return 'Pending'
  return value ? 'Passed' : 'Failed'
}

export default function JobsPage() {
  const router = useRouter()

  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [jobs, setJobs] = useState<JobDashboardRow[]>([])
  const [activeGroup, setActiveGroup] = useState<JobGroup>('active')
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const allowedPermissions = useMemo(() => {
    return new Set(
      permissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )
  }, [permissions])

  const canViewJobs = allowedPermissions.has('view_jobs')

  const loadJobs = async () => {
    setLoading(true)
    setError('')

    const { data: permissionData, error: permissionError } = await supabase.rpc(
      'get_current_user_permissions_v1'
    )

    if (permissionError) {
      setError(`Permission load failed: ${permissionError.message}`)
      setPermissions([])
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

    if (!nextAllowedPermissions.has('view_jobs')) {
      setJobs([])
      setLoading(false)
      return
    }

    const { data, error: jobsError } = await supabase.rpc(
      'get_jobs_dashboard_v1'
    )

    if (jobsError) {
      setError(jobsError.message)
      setJobs([])
    } else {
      setJobs((data ?? []) as JobDashboardRow[])
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadJobs()
  }, [])

  const activeProductionJobs = useMemo(() => {
    return jobs.filter((job) =>
      ACTIVE_PRODUCTION_STAGES.includes(job.internal_status)
    )
  }, [jobs])

  const awaitingReportJobs = useMemo(() => {
    return jobs.filter(
      (job) => job.internal_status === 'AWAITING_THIRD_PARTY_REPORT'
    )
  }, [jobs])

  const readyForInvoiceJobs = useMemo(() => {
    return jobs.filter((job) => job.internal_status === 'READY_FOR_INVOICE')
  }, [jobs])

  const invoicedJobs = useMemo(() => {
    return jobs.filter((job) => job.internal_status === 'INVOICED')
  }, [jobs])

  const arOpenJobs = useMemo(() => {
    return jobs.filter((job) => job.internal_status === 'AR_OPEN')
  }, [jobs])

  const closedJobs = useMemo(() => {
    return jobs.filter((job) => job.internal_status === 'CLOSED')
  }, [jobs])

  const groupedJobs = useMemo(() => {
    if (activeGroup === 'active') return activeProductionJobs
    if (activeGroup === 'awaitingReport') return awaitingReportJobs
    if (activeGroup === 'readyForInvoice') return readyForInvoiceJobs
    if (activeGroup === 'invoiced') return invoicedJobs
    if (activeGroup === 'arOpen') return arOpenJobs
    if (activeGroup === 'closed') return closedJobs
    return jobs
  }, [
    activeGroup,
    activeProductionJobs,
    awaitingReportJobs,
    readyForInvoiceJobs,
    invoicedJobs,
    arOpenJobs,
    closedJobs,
    jobs,
  ])

  const searchedJobs = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return groupedJobs

    return groupedJobs.filter((job) => {
      const searchable = [
        job.internal_work_order_number,
        job.customer_work_order_number,
        job.customer_name,
        job.serial_number,
        job.internal_status,
        job.job_id,
        job.tenant_id,
        job.customer_id,
        job.tool_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(term)
    })
  }, [groupedJobs, search])

  const visibleJobs = useMemo(() => {
    const sorted = [...searchedJobs]

    sorted.sort((a, b) => {
      if (sortMode === 'newest') {
        return timeValue(b.created_at) - timeValue(a.created_at)
      }

      if (sortMode === 'oldest') {
        return timeValue(a.created_at) - timeValue(b.created_at)
      }

      if (sortMode === 'customerAsc') {
        return safeText(a.customer_name).localeCompare(safeText(b.customer_name))
      }

      if (sortMode === 'customerDesc') {
        return safeText(b.customer_name).localeCompare(safeText(a.customer_name))
      }

      if (sortMode === 'stageAsc') {
        return safeText(a.internal_status).localeCompare(
          safeText(b.internal_status)
        )
      }

      if (sortMode === 'stageDesc') {
        return safeText(b.internal_status).localeCompare(
          safeText(a.internal_status)
        )
      }

      if (sortMode === 'serialAsc') {
        return safeText(a.serial_number).localeCompare(safeText(b.serial_number))
      }

      if (sortMode === 'serialDesc') {
        return safeText(b.serial_number).localeCompare(safeText(a.serial_number))
      }

      if (sortMode === 'internalWoAsc') {
        return safeText(a.internal_work_order_number).localeCompare(
          safeText(b.internal_work_order_number)
        )
      }

      if (sortMode === 'internalWoDesc') {
        return safeText(b.internal_work_order_number).localeCompare(
          safeText(a.internal_work_order_number)
        )
      }

      return 0
    })

    return sorted
  }, [searchedJobs, sortMode])

  const activeTitle = useMemo(() => {
    if (activeGroup === 'active') return 'Active Production'
    if (activeGroup === 'awaitingReport') return 'Awaiting Third Party Report'
    if (activeGroup === 'readyForInvoice') return 'Ready for Invoice'
    if (activeGroup === 'invoiced') return 'Invoiced'
    if (activeGroup === 'arOpen') return 'AR Open'
    if (activeGroup === 'closed') return 'Closed'
    return 'All Jobs'
  }, [activeGroup])

  const groupButtonClass = (group: JobGroup) => {
    return `rounded-full border px-3 py-1.5 text-xs font-semibold ${
      activeGroup === group
        ? 'border-blue-500 bg-blue-950 text-white'
        : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:text-white'
    }`
  }

  const submitSearch = () => {
    setSearch(searchDraft)
  }

  const clearSearch = () => {
    setSearchDraft('')
    setSearch('')
  }

  const selectGroup = (group: JobGroup) => {
    setActiveGroup(group)
    clearSearch()
    setExpandedJobId(null)
  }

  const toggleExpandedJob = (jobId: string) => {
    setExpandedJobId((current) => (current === jobId ? null : jobId))
  }

  const openJob = (jobId: string) => {
    router.push(`/jobs/${jobId}`)
  }

  if (loading) {
    return <main className="p-6">Loading jobs...</main>
  }

  if (!canViewJobs) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Jobs</h1>

        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view jobs.
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <p className="text-xs text-gray-400">
          Customer, serial number, AOS work order, and customer work order. Click
          a row to expand technical IDs.
        </p>
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
            placeholder="Search customer, serial, WO, stage..."
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
            <option value="customerAsc">Customer A-Z</option>
            <option value="customerDesc">Customer Z-A</option>
            <option value="stageAsc">Stage A-Z</option>
            <option value="stageDesc">Stage Z-A</option>
            <option value="serialAsc">Serial A-Z</option>
            <option value="serialDesc">Serial Z-A</option>
            <option value="internalWoAsc">AOS WO low-high</option>
            <option value="internalWoDesc">AOS WO high-low</option>
          </select>
        </div>
      </div>

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

      {error ? (
        <div className="break-words rounded border border-red-700 bg-red-950 p-3 text-red-300">
          {error}
        </div>
      ) : null}

      <section className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => selectGroup('active')}
          className={groupButtonClass('active')}
        >
          Active: {activeProductionJobs.length}
        </button>

        <button
          type="button"
          onClick={() => selectGroup('awaitingReport')}
          className={groupButtonClass('awaitingReport')}
        >
          Awaiting Report: {awaitingReportJobs.length}
        </button>

        <button
          type="button"
          onClick={() => selectGroup('readyForInvoice')}
          className={groupButtonClass('readyForInvoice')}
        >
          Ready Invoice: {readyForInvoiceJobs.length}
        </button>

        <button
          type="button"
          onClick={() => selectGroup('invoiced')}
          className={groupButtonClass('invoiced')}
        >
          Invoiced: {invoicedJobs.length}
        </button>

        <button
          type="button"
          onClick={() => selectGroup('arOpen')}
          className={groupButtonClass('arOpen')}
        >
          AR Open: {arOpenJobs.length}
        </button>

        <button
          type="button"
          onClick={() => selectGroup('closed')}
          className={groupButtonClass('closed')}
        >
          Closed: {closedJobs.length}
        </button>

        <button
          type="button"
          onClick={() => selectGroup('all')}
          className={groupButtonClass('all')}
        >
          All: {jobs.length}
        </button>
      </section>

      <section className="rounded border border-gray-800 bg-gray-900">
        <div className="flex flex-col gap-1 border-b border-gray-800 px-4 py-2">
          <h2 className="text-base font-semibold">{activeTitle}</h2>
          <p className="text-xs text-gray-400">
            Showing {visibleJobs.length} of {jobs.length} jobs.
          </p>
        </div>

        {visibleJobs.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">No jobs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse text-left text-sm">
              <thead className="bg-black text-gray-300">
                <tr>
                  <th className="border-b border-gray-800 px-3 py-2">
                    AOS Work Order
                  </th>
                  <th className="border-b border-gray-800 px-3 py-2">
                    Customer
                  </th>
                  <th className="border-b border-gray-800 px-3 py-2">
                    Serial
                  </th>
                  <th className="border-b border-gray-800 px-3 py-2">
                    Customer WO
                  </th>
                  <th className="border-b border-gray-800 px-3 py-2">
                    Stage
                  </th>
                  <th className="border-b border-gray-800 px-3 py-2">QC</th>
                  <th className="border-b border-gray-800 px-3 py-2">
                    Created
                  </th>
                  <th className="border-b border-gray-800 px-3 py-2">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleJobs.map((job) => {
                  const isExpanded = expandedJobId === job.job_id

                  return (
                    <Fragment key={job.job_id}>
                      <tr
                        onClick={() => toggleExpandedJob(job.job_id)}
                        className="cursor-pointer border-b border-gray-800 hover:bg-gray-800/60"
                      >
                        <td className="px-3 py-2 font-semibold text-white">
                          {job.internal_work_order_number ?? 'Missing'}
                        </td>

                        <td className="px-3 py-2">
                          {job.customer_name ?? 'Unknown Customer'}
                        </td>

                        <td className="px-3 py-2">
                          {job.serial_number ?? 'No serial'}
                        </td>

                        <td className="px-3 py-2">
                          {job.customer_work_order_number ?? 'Not entered'}
                        </td>

                        <td className="px-3 py-2">
                          <span className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-200">
                            {job.internal_status}
                          </span>
                        </td>

                        <td className="px-3 py-2">{qcLabel(job.qc_passed)}</td>

                        <td className="px-3 py-2">
                          {formatTimestamp(job.created_at)}
                        </td>

                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                openJob(job.job_id)
                              }}
                              className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600"
                            >
                              Open Job
                            </button>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleExpandedJob(job.job_id)
                              }}
                              className="rounded border border-gray-700 bg-black px-3 py-1.5 text-xs text-gray-200 hover:border-gray-500 hover:text-white"
                            >
                              {isExpanded ? 'Collapse' : 'Expand'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr className="border-b border-gray-800 bg-black/40">
                          <td colSpan={8} className="px-3 py-2">
                            <div className="grid grid-cols-1 gap-2 text-xs lg:grid-cols-[1.8fr_1.8fr_1.8fr_auto] lg:items-center">
                              <div className="min-w-0">
                                <p className="text-gray-500">Job ID</p>
                                <p
                                  title={job.job_id}
                                  className="truncate font-mono text-gray-300"
                                >
                                  {job.job_id}
                                </p>
                              </div>

                              <div className="min-w-0">
                                <p className="text-gray-500">Customer / Tool</p>
                                <p
                                  title={`Customer ID: ${job.customer_id}`}
                                  className="truncate font-mono text-gray-300"
                                >
                                  Customer: {job.customer_id}
                                </p>
                                <p
                                  title={`Tool ID: ${job.tool_id}`}
                                  className="truncate font-mono text-gray-300"
                                >
                                  Tool: {job.tool_id}
                                </p>
                              </div>

                              <div className="min-w-0">
                                <p className="text-gray-500">Tenant / Status</p>
                                <p
                                  title={`Tenant ID: ${job.tenant_id}`}
                                  className="truncate font-mono text-gray-300"
                                >
                                  Tenant: {job.tenant_id}
                                </p>
                                <p className="truncate text-gray-300">
                                  {job.internal_status} • {qcLabel(job.qc_passed)}
                                </p>
                              </div>

                              <div className="flex justify-start lg:justify-end">
                                <button
                                  type="button"
                                  onClick={() => openJob(job.job_id)}
                                  className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600"
                                >
                                  Open Job
                                </button>
                              </div>
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