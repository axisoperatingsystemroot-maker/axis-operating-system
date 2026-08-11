'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
}

type ToolRow = {
  id: string
  tenant_id: string
  customer_id: string
  serial_number: string
  tool_type: string
  blade_count: number | null
  nominal_body_od: number | null
  notes: string | null
  active: boolean | null
  created_at: string | null
}

type CustomerRow = {
  id: string
  name: string
}

type JobDashboardRow = {
  job_id: string
  tenant_id: string
  customer_id: string
  customer_name: string | null
  tool_id: string | null
  serial_number: string | null
  internal_work_order_number: string | null
  customer_work_order_number: string | null
  internal_status: string
  qc_passed: boolean | null
  created_at: string | null
}

type SortMode =
  | 'newest'
  | 'oldest'
  | 'customerAsc'
  | 'customerDesc'
  | 'stageAsc'
  | 'stageDesc'
  | 'internalWoAsc'
  | 'internalWoDesc'

type JobStatusFilter = 'open' | 'closed' | 'all'

const TERMINAL_JOB_STAGES = ['CLOSED', 'SCRAPPED']

function isClosedJob(job: JobDashboardRow) {
  return TERMINAL_JOB_STAGES.includes(job.internal_status)
}

function normalizeStatusFilter(value: string | null): JobStatusFilter {
  if (value === 'open') return 'open'
  if (value === 'closed') return 'closed'
  return 'all'
}

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

export default function ToolJobsPage() {
  const router = useRouter()
  const params = useParams<{ id: string | string[] }>()

  const toolId = Array.isArray(params.id) ? params.id[0] : params.id

  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [tool, setTool] = useState<ToolRow | null>(null)
  const [customerName, setCustomerName] = useState('Unknown Customer')
  const [jobs, setJobs] = useState<JobDashboardRow[]>([])
  const [statusFilter, setStatusFilter] = useState<JobStatusFilter>('all')
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const nextStatusFilter = normalizeStatusFilter(
      new URLSearchParams(window.location.search).get('status')
    )

    setStatusFilter(nextStatusFilter)
  }, [])

  const allowedPermissions = useMemo(() => {
    return new Set(
      permissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )
  }, [permissions])

  const canViewTools = allowedPermissions.has('view_tools')
  const canViewJobs = allowedPermissions.has('view_jobs')
  const canViewCustomers = allowedPermissions.has('view_customers')

  const loadToolJobs = async () => {
    setLoading(true)
    setError('')

    const { data: permissionData, error: permissionError } = await supabase.rpc(
      'get_current_user_permissions_v1'
    )

    if (permissionError) {
      setError(`Permission load failed: ${permissionError.message}`)
      setPermissions([])
      setTool(null)
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

    if (
      !nextAllowedPermissions.has('view_tools') ||
      !nextAllowedPermissions.has('view_jobs')
    ) {
      setTool(null)
      setJobs([])
      setLoading(false)
      return
    }

    if (!toolId) {
      setError('Missing tool id.')
      setTool(null)
      setJobs([])
      setLoading(false)
      return
    }

    const { data: toolData, error: toolError } = await supabase
      .from('tools')
      .select(
        'id, tenant_id, customer_id, serial_number, tool_type, blade_count, nominal_body_od, notes, active, created_at'
      )
      .eq('id', toolId)
      .single()

    if (toolError) {
      setError(`Tool load failed: ${toolError.message}`)
      setTool(null)
      setJobs([])
      setLoading(false)
      return
    }

    const nextTool = toolData as ToolRow
    setTool(nextTool)

    if (nextAllowedPermissions.has('view_customers')) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('id, name')
        .eq('id', nextTool.customer_id)
        .single()

      if (customerData) {
        setCustomerName((customerData as CustomerRow).name)
      } else {
        setCustomerName('Unknown Customer')
      }
    } else {
      setCustomerName('Customer restricted')
    }

    const { data: jobsData, error: jobsError } = await supabase.rpc(
      'get_jobs_dashboard_v1'
    )

    if (jobsError) {
      setError(`Tool jobs load failed: ${jobsError.message}`)
      setJobs([])
    } else {
      const nextJobs = ((jobsData ?? []) as JobDashboardRow[]).filter(
        (job) => job.tool_id === nextTool.id
      )

      setJobs(nextJobs)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (!toolId) return

    void loadToolJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId])

  const openJobs = useMemo(() => {
    return jobs.filter((job) => !isClosedJob(job))
  }, [jobs])

  const closedJobs = useMemo(() => {
    return jobs.filter((job) => isClosedJob(job))
  }, [jobs])

  const statusFilteredJobs = useMemo(() => {
    if (statusFilter === 'open') return openJobs
    if (statusFilter === 'closed') return closedJobs
    return jobs
  }, [statusFilter, openJobs, closedJobs, jobs])

  const searchedJobs = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return statusFilteredJobs

    return statusFilteredJobs.filter((job) => {
      const searchable = [
        job.internal_work_order_number,
        job.customer_work_order_number,
        job.customer_name,
        job.serial_number,
        job.internal_status,
        job.job_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(term)
    })
  }, [statusFilteredJobs, search])

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

  const submitSearch = () => {
    setSearch(searchDraft)
  }

  const clearSearch = () => {
    setSearchDraft('')
    setSearch('')
  }

  const selectStatusFilter = (nextFilter: JobStatusFilter) => {
    if (!toolId) return

    setStatusFilter(nextFilter)
    clearSearch()

    const suffix = nextFilter === 'all' ? '' : `?status=${nextFilter}`
    router.push(`/tools/${encodeURIComponent(toolId)}/jobs${suffix}`)
  }

  const filterButtonClass = (filter: JobStatusFilter) => {
    return `rounded-full border px-3 py-1.5 text-xs font-semibold ${
      statusFilter === filter
        ? 'border-blue-500 bg-blue-950 text-white'
        : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:text-white'
    }`
  }

  if (loading) {
    return <main className="p-6">Loading tool jobs...</main>
  }

  if (!canViewTools || !canViewJobs) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Tool Jobs</h1>

        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view tool job history.
        </div>
      </main>
    )
  }

  if (!tool) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Tool Not Found</h1>

        {error ? (
          <div className="break-words rounded border border-red-700 bg-red-950 p-3 text-red-300">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => router.push('/tools')}
          className="rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 hover:border-gray-500 hover:text-white"
        >
          Back to Tools
        </button>
      </main>
    )
  }

  return (
    <main className="space-y-4 p-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Tool Jobs — {tool.serial_number}
          </h1>
          <p className="text-xs text-gray-400">
            {customerName} • {tool.tool_type}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push('/tools')}
            className="rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 hover:border-gray-500 hover:text-white"
          >
            Back to Tools
          </button>

          <button
            type="button"
            onClick={() => router.push('/jobs')}
            className="rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 hover:border-gray-500 hover:text-white"
          >
            All Jobs
          </button>

          {tool.customer_id && canViewCustomers ? (
            <button
              type="button"
              onClick={() => router.push(`/customers/${tool.customer_id}/jobs`)}
              className="rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 hover:border-gray-500 hover:text-white"
            >
              Customer Jobs
            </button>
          ) : null}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <div className="rounded border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Serial Number</p>
          <p className="text-lg font-semibold">{tool.serial_number}</p>
        </div>

        <div className="rounded border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Customer</p>
          <p className="text-lg font-semibold">{customerName}</p>
        </div>

        <div className="rounded border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Tool Type</p>
          <p className="text-lg font-semibold">{tool.tool_type}</p>
        </div>

        <div className="rounded border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Jobs</p>
          <p className="text-lg font-semibold">{jobs.length}</p>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => selectStatusFilter('open')}
          className={filterButtonClass('open')}
        >
          Open: {openJobs.length}
        </button>

        <button
          type="button"
          onClick={() => selectStatusFilter('closed')}
          className={filterButtonClass('closed')}
        >
          Closed: {closedJobs.length}
        </button>

        <button
          type="button"
          onClick={() => selectStatusFilter('all')}
          className={filterButtonClass('all')}
        >
          Total: {jobs.length}
        </button>
      </section>

      <div className="flex w-full flex-col gap-2 xl:flex-row xl:items-center">
        <input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submitSearch()
            }
          }}
          placeholder="Search AOS WO, customer WO, stage..."
          className="min-w-0 flex-1 rounded border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />

        <div className="flex shrink-0 gap-2">
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
            <option value="internalWoAsc">AOS WO low-high</option>
            <option value="internalWoDesc">AOS WO high-low</option>
          </select>

          <button
            type="button"
            onClick={submitSearch}
            className="rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600"
          >
            Search
          </button>
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

      <section className="rounded border border-gray-800 bg-gray-900">
        <div className="flex flex-col gap-1 border-b border-gray-800 px-4 py-2">
          <h2 className="text-base font-semibold">Tool Job History</h2>
          <p className="text-xs text-gray-400">
            Showing {visibleJobs.length} of {jobs.length} jobs for this tool.
          </p>
        </div>

        {visibleJobs.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">
            No jobs found for this tool.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <thead className="bg-black text-gray-300">
                <tr>
                  <th className="border-b border-gray-800 px-4 py-2">
                    AOS Work Order
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Customer
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Customer WO
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Stage
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">QC</th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Created
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleJobs.map((job) => (
                  <tr
                    key={job.job_id}
                    className="border-b border-gray-800 hover:bg-gray-800/60"
                  >
                    <td className="px-4 py-2 font-semibold text-white">
                      {job.internal_work_order_number ?? 'Missing'}
                      <p className="mt-1 break-all text-xs font-normal text-gray-500">
                        {job.job_id}
                      </p>
                    </td>

                    <td className="px-4 py-2">
                      {job.customer_name ?? 'Unknown Customer'}
                    </td>

                    <td className="px-4 py-2">
                      {job.customer_work_order_number ?? 'Not entered'}
                    </td>

                    <td className="px-4 py-2">
                      <span className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-200">
                        {job.internal_status}
                      </span>
                    </td>

                    <td className="px-4 py-2">
                      {job.qc_passed === null
                        ? 'Pending'
                        : job.qc_passed
                          ? 'Passed'
                          : 'Failed'}
                    </td>

                    <td className="px-4 py-2">
                      {formatTimestamp(job.created_at)}
                    </td>

                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/jobs/${job.job_id}`)}
                        className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600"
                      >
                        Open Job
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}