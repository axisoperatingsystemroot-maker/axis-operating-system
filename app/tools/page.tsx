'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  | 'serialAsc'
  | 'serialDesc'
  | 'customerAsc'
  | 'customerDesc'
  | 'typeAsc'
  | 'typeDesc'
  | 'newest'
  | 'oldest'

type JobStatusFilter = 'open' | 'closed' | 'all'

const TERMINAL_JOB_STAGES = ['CLOSED', 'SCRAPPED']

function isClosedJob(job: JobDashboardRow) {
  return TERMINAL_JOB_STAGES.includes(job.internal_status)
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

export default function ToolsPage() {
  const router = useRouter()

  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [tools, setTools] = useState<ToolRow[]>([])
  const [jobs, setJobs] = useState<JobDashboardRow[]>([])
  const [customersById, setCustomersById] = useState<Record<string, string>>({})
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('serialAsc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const loadTools = async () => {
    setLoading(true)
    setError('')

    const { data: permissionData, error: permissionError } = await supabase.rpc(
      'get_current_user_permissions_v1'
    )

    if (permissionError) {
      setError(`Permission load failed: ${permissionError.message}`)
      setPermissions([])
      setTools([])
      setJobs([])
      setCustomersById({})
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

    if (!nextAllowedPermissions.has('view_tools')) {
      setTools([])
      setJobs([])
      setCustomersById({})
      setLoading(false)
      return
    }

    const { data: toolsData, error: toolsError } = await supabase
      .from('tools')
      .select(
        'id, tenant_id, customer_id, serial_number, tool_type, blade_count, nominal_body_od, notes, active, created_at'
      )
      .order('serial_number', { ascending: true })

    if (toolsError) {
      setError(`Tools load failed: ${toolsError.message}`)
      setTools([])
      setJobs([])
      setCustomersById({})
      setLoading(false)
      return
    }

    setTools((toolsData ?? []) as ToolRow[])

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

    if (nextAllowedPermissions.has('view_customers')) {
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id, name')
        .order('name', { ascending: true })

      if (customersError) {
        setCustomersById({})
      } else {
        const nextCustomersById: Record<string, string> = {}

        ;((customersData ?? []) as CustomerRow[]).forEach((customer) => {
          nextCustomersById[customer.id] = customer.name
        })

        setCustomersById(nextCustomersById)
      }
    } else {
      setCustomersById({})
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadTools()
  }, [])

  const getCustomerName = (tool: ToolRow) => {
    if (!canViewCustomers) return 'Customer restricted'
    return customersById[tool.customer_id] ?? 'Unknown Customer'
  }

  const jobCountsByToolId = useMemo(() => {
    const counts: Record<string, { open: number; closed: number; total: number }> =
      {}

    jobs.forEach((job) => {
      if (!job.tool_id) return

      if (!counts[job.tool_id]) {
        counts[job.tool_id] = {
          open: 0,
          closed: 0,
          total: 0,
        }
      }

      counts[job.tool_id].total += 1

      if (isClosedJob(job)) {
        counts[job.tool_id].closed += 1
      } else {
        counts[job.tool_id].open += 1
      }
    })

    return counts
  }, [jobs])

  const getToolJobCounts = (toolId: string) => {
    return (
      jobCountsByToolId[toolId] ?? {
        open: 0,
        closed: 0,
        total: 0,
      }
    )
  }

  const searchedTools = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return tools

    return tools.filter((tool) => {
      const searchable = [
        tool.id,
        tool.serial_number,
        tool.tool_type,
        tool.notes,
        tool.active === false ? 'inactive' : 'active',
        getCustomerName(tool),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(term)
    })
  }, [tools, search, customersById, canViewCustomers])

  const visibleTools = useMemo(() => {
    const sorted = [...searchedTools]

    sorted.sort((a, b) => {
      if (sortMode === 'serialAsc') {
        return safeText(a.serial_number).localeCompare(safeText(b.serial_number))
      }

      if (sortMode === 'serialDesc') {
        return safeText(b.serial_number).localeCompare(safeText(a.serial_number))
      }

      if (sortMode === 'customerAsc') {
        return safeText(getCustomerName(a)).localeCompare(
          safeText(getCustomerName(b))
        )
      }

      if (sortMode === 'customerDesc') {
        return safeText(getCustomerName(b)).localeCompare(
          safeText(getCustomerName(a))
        )
      }

      if (sortMode === 'typeAsc') {
        return safeText(a.tool_type).localeCompare(safeText(b.tool_type))
      }

      if (sortMode === 'typeDesc') {
        return safeText(b.tool_type).localeCompare(safeText(a.tool_type))
      }

      if (sortMode === 'newest') {
        return timeValue(b.created_at) - timeValue(a.created_at)
      }

      if (sortMode === 'oldest') {
        return timeValue(a.created_at) - timeValue(b.created_at)
      }

      return 0
    })

    return sorted
  }, [searchedTools, sortMode, customersById, canViewCustomers])

  const submitSearch = () => {
    setSearch(searchDraft)
  }

  const clearSearch = () => {
    setSearchDraft('')
    setSearch('')
  }

  const openToolJobs = (tool: ToolRow, filter: JobStatusFilter) => {
    const suffix = filter === 'all' ? '' : `?status=${filter}`
    router.push(`/tools/${encodeURIComponent(tool.id)}/jobs${suffix}`)
  }

  const toggleExpandedTool = (toolId: string) => {
    setExpandedToolId((current) => (current === toolId ? null : toolId))
  }

  if (loading) {
    return <main className="p-6">Loading tools...</main>
  }

  if (!canViewTools) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Tools</h1>

        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view tools.
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Tools</h1>
      </div>

      <div className="flex w-full flex-col gap-2 xl:flex-row xl:items-center">
        <input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submitSearch()
            }
          }}
          placeholder="Search serial, customer, type, notes..."
          className="min-w-0 flex-1 rounded border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />

        <div className="flex shrink-0 gap-2">
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="rounded border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          >
            <option value="serialAsc">Serial A-Z</option>
            <option value="serialDesc">Serial Z-A</option>
            <option value="customerAsc">Customer A-Z</option>
            <option value="customerDesc">Customer Z-A</option>
            <option value="typeAsc">Type A-Z</option>
            <option value="typeDesc">Type Z-A</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
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
          <h2 className="text-base font-semibold">Tool List</h2>
          <p className="text-xs text-gray-400">
            Showing {visibleTools.length} of {tools.length} tools. Click a row to
            expand details.
          </p>
        </div>

        {visibleTools.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">No tools found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead className="bg-black text-gray-300">
                <tr>
                  <th className="border-b border-gray-800 px-4 py-2">Serial</th>
                  <th className="border-b border-gray-800 px-4 py-2">Customer</th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Tool Type
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Open Jobs
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Closed Jobs
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Total Jobs
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">Status</th>
                  <th className="border-b border-gray-800 px-4 py-2">Action</th>
                </tr>
              </thead>

              <tbody>
                {visibleTools.map((tool) => {
                  const isExpanded = expandedToolId === tool.id
                  const counts = getToolJobCounts(tool.id)

                  return (
                    <Fragment key={tool.id}>
                      <tr
                        onClick={() => toggleExpandedTool(tool.id)}
                        className="cursor-pointer border-b border-gray-800 hover:bg-gray-800/60"
                      >
                        <td className="px-4 py-2 font-semibold text-white">
                          {tool.serial_number}
                        </td>

                        <td className="px-4 py-2">{getCustomerName(tool)}</td>

                        <td className="px-4 py-2">{tool.tool_type}</td>

                        <td className="px-4 py-2">
                          <button
                            type="button"
                            disabled={!canViewJobs}
                            onClick={(event) => {
                              event.stopPropagation()
                              openToolJobs(tool, 'open')
                            }}
                            className="rounded bg-blue-950 px-3 py-1 text-xs text-blue-200 hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {canViewJobs ? counts.open : 'Restricted'}
                          </button>
                        </td>

                        <td className="px-4 py-2">
                          <button
                            type="button"
                            disabled={!canViewJobs}
                            onClick={(event) => {
                              event.stopPropagation()
                              openToolJobs(tool, 'closed')
                            }}
                            className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-200 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {canViewJobs ? counts.closed : 'Restricted'}
                          </button>
                        </td>

                        <td className="px-4 py-2">
                          <button
                            type="button"
                            disabled={!canViewJobs}
                            onClick={(event) => {
                              event.stopPropagation()
                              openToolJobs(tool, 'all')
                            }}
                            className="rounded bg-green-950 px-3 py-1 text-xs text-green-200 hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {canViewJobs ? counts.total : 'Restricted'}
                          </button>
                        </td>

                        <td className="px-4 py-2">
                          <span
                            className={`rounded px-2 py-1 text-xs ${
                              tool.active === false
                                ? 'bg-red-950 text-red-300'
                                : 'bg-green-950 text-green-300'
                            }`}
                          >
                            {tool.active === false ? 'Inactive' : 'Active'}
                          </span>
                        </td>

                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleExpandedTool(tool.id)
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
                                <p className="text-xs text-gray-500">Tool ID</p>
                                <p className="break-all text-sm text-gray-300">
                                  {tool.id}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">
                                  Blade Count
                                </p>
                                <p className="text-sm text-gray-300">
                                  {tool.blade_count ?? 'Not entered'}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">
                                  Nominal OD
                                </p>
                                <p className="text-sm text-gray-300">
                                  {tool.nominal_body_od ?? 'Not entered'}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">Created</p>
                                <p className="text-sm text-gray-300">
                                  {formatTimestamp(tool.created_at)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4">
                              <p className="text-xs text-gray-500">Notes</p>
                              <p className="whitespace-pre-wrap text-sm text-gray-300">
                                {tool.notes ?? 'No notes'}
                              </p>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!canViewJobs}
                                onClick={() => openToolJobs(tool, 'open')}
                                className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Open Jobs
                              </button>

                              <button
                                type="button"
                                disabled={!canViewJobs}
                                onClick={() => openToolJobs(tool, 'closed')}
                                className="rounded bg-gray-700 px-3 py-1.5 text-xs text-white hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Closed Jobs
                              </button>

                              <button
                                type="button"
                                disabled={!canViewJobs}
                                onClick={() => openToolJobs(tool, 'all')}
                                className="rounded bg-green-700 px-3 py-1.5 text-xs text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Total Jobs
                              </button>
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