'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
}

type CustomerJobRow = {
  id?: string
  job_id?: string
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

type SortMode =
  | 'newest'
  | 'oldest'
  | 'stageAsc'
  | 'stageDesc'
  | 'serialAsc'
  | 'serialDesc'
  | 'internalWoAsc'
  | 'internalWoDesc'

function getJobId(job: CustomerJobRow) {
  return String(job.job_id ?? job.id ?? '').trim()
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

function safeText(value: string | null) {
  return value?.toLowerCase() ?? ''
}

export default function CustomerJobsPage() {
  const router = useRouter()
  const params = useParams<{ id: string | string[] }>()

  const customerId = Array.isArray(params.id) ? params.id[0] : params.id

  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [jobs, setJobs] = useState<CustomerJobRow[]>([])
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

  const loadCustomerJobs = async () => {
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

    if (!customerId) {
      setError('Missing customer id.')
      setJobs([])
      setLoading(false)
      return
    }

    const { data, error: jobsError } = await supabase.rpc(
      'get_customer_jobs_v1',
      {
        p_customer_id: customerId,
      }
    )

    if (jobsError) {
      setError(`Customer jobs load failed: ${jobsError.message}`)
      setJobs([])
    } else {
      setJobs((data ?? []) as CustomerJobRow[])
    }

    setLoading(false)
  }

  useEffect(() => {
    if (!customerId) return

    void loadCustomerJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  const customerName = jobs[0]?.customer_name ?? 'Customer'

  const searchedJobs = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return jobs

    return jobs.filter((job) => {
      const searchable = [
        job.internal_work_order_number,
        job.customer_work_order_number,
        job.customer_name,
        job.serial_number,
        job.internal_status,
        getJobId(job),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(term)
    })
  }, [jobs, search])

  const visibleJobs = useMemo(() => {
    const sorted = [...searchedJobs]

    sorted.sort((a, b) => {
      if (sortMode === 'newest') {
        return timeValue(b.created_at) - timeValue(a.created_at)
      }

      if (sortMode === 'oldest') {
        return timeValue(a.created_at) - timeValue(b.created_at)
      }

      if (sortMode === 'stageAsc') {
        return safeText(a.internal_status).localeCompare(safeText(b.internal_status))
      }

      if (sortMode === 'stageDesc') {
        return safeText(b.internal_status).localeCompare(safeText(a.internal_status))
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

  const submitSearch = () => {
    setSearch(searchDraft)
  }

  const clearSearch = () => {
    setSearchDraft('')
    setSearch('')
  }

  const openJob = (job: CustomerJobRow) => {
    const jobId = getJobId(job)

    if (!jobId) {
      setError('This row is missing a job id and cannot be opened.')
      return
    }

    router.push(`/jobs/${encodeURIComponent(jobId)}`)
  }

  if (loading) {
    return <main className="p-6">Loading customer jobs...</main>
  }

  if (!canViewJobs) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Customer Jobs</h1>

        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view jobs.
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-4 p-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{customerName} Jobs</h1>
          <p className="text-xs text-gray-400">
            Customer-specific job history by serial number, AOS work order, and
            customer work order.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push('/customers')}
            className="rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 hover:border-gray-500 hover:text-white"
          >
            Back to Customers
          </button>

          <button
            type="button"
            onClick={() => router.push('/jobs')}
            className="rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 hover:border-gray-500 hover:text-white"
          >
            All Jobs
          </button>
        </div>
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
          placeholder="Search serial, WO, stage..."
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
            <option value="stageAsc">Stage A-Z</option>
            <option value="stageDesc">Stage Z-A</option>
            <option value="serialAsc">Serial A-Z</option>
            <option value="serialDesc">Serial Z-A</option>
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
          <h2 className="text-base font-semibold">Customer Job History</h2>
          <p className="text-xs text-gray-400">
            Showing {visibleJobs.length} of {jobs.length} customer jobs.
          </p>
        </div>

        {visibleJobs.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">
            No jobs found for this customer.
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
                    Serial Number
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Customer WO
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Stage
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    QC
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Created
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Job ID
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleJobs.map((job) => {
                  const normalizedJobId = getJobId(job)

                  return (
                    <tr
                      key={normalizedJobId || `${job.internal_work_order_number}-${job.serial_number}`}
                      className="border-b border-gray-800 hover:bg-gray-800/60"
                    >
                      <td className="px-4 py-2 font-semibold text-white">
                        {job.internal_work_order_number ?? 'Missing'}
                      </td>

                      <td className="px-4 py-2">
                        {job.serial_number ?? 'No serial'}
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
                        <span className="break-all text-xs text-gray-500">
                          {normalizedJobId || 'Missing'}
                        </span>
                      </td>

                      <td className="px-4 py-2">
                        <button
                          type="button"
                          disabled={!normalizedJobId}
                          onClick={() => openJob(job)}
                          className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Open Job
                        </button>
                      </td>
                    </tr>
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