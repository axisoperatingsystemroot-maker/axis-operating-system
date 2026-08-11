'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
}

type CustomerDashboardRow = {
  id?: string
  customer_id?: string
  tenant_id?: string
  name: string
  email?: string | null
  phone?: string | null
  active?: boolean | null
  created_at?: string | null
}

function getCustomerId(customer: CustomerDashboardRow) {
  return String(customer.customer_id ?? customer.id ?? '').trim()
}

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

export default function CustomersPage() {
  const router = useRouter()

  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [customers, setCustomers] = useState<CustomerDashboardRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const allowedPermissions = useMemo(() => {
    return new Set(
      permissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )
  }, [permissions])

  const canViewCustomers =
    allowedPermissions.has('view_customers') ||
    allowedPermissions.has('view_dashboard')

  const canViewJobs = allowedPermissions.has('view_jobs')

  const loadCustomers = async () => {
    setLoading(true)
    setError('')

    const { data: permissionData, error: permissionError } = await supabase.rpc(
      'get_current_user_permissions_v1'
    )

    if (permissionError) {
      setError(`Permission load failed: ${permissionError.message}`)
      setPermissions([])
      setCustomers([])
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
      !nextAllowedPermissions.has('view_customers') &&
      !nextAllowedPermissions.has('view_dashboard')
    ) {
      setCustomers([])
      setLoading(false)
      return
    }

    const { data, error: customersError } = await supabase.rpc(
      'get_customers_dashboard_v1'
    )

    if (customersError) {
      setError(`Customers load failed: ${customersError.message}`)
      setCustomers([])
    } else {
      setCustomers((data ?? []) as CustomerDashboardRow[])
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadCustomers()
  }, [])

  const visibleCustomers = useMemo(() => {
    const term = search.trim().toLowerCase()

    const sorted = [...customers].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '')
    )

    if (!term) return sorted

    return sorted.filter((customer) => {
      const searchable = [
        customer.name,
        customer.email,
        customer.phone,
        getCustomerId(customer),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(term)
    })
  }, [customers, search])

  const openCustomerJobs = (customer: CustomerDashboardRow) => {
    const customerId = getCustomerId(customer)

    if (!customerId) {
      setError('This customer row is missing a customer id and cannot open jobs.')
      return
    }

    router.push(`/customers/${encodeURIComponent(customerId)}/jobs`)
  }

  if (loading) {
    return <main className="p-6">Loading customers...</main>
  }

  if (!canViewCustomers) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Customers</h1>

        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view customers.
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-xs text-gray-400">
          View customer-specific job history.
        </p>
      </div>

      <div className="flex w-full items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customer, email, phone..."
          className="min-w-0 flex-1 rounded border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />

        <button
          type="button"
          onClick={() => void loadCustomers()}
          className="shrink-0 rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="break-words rounded border border-red-700 bg-red-950 p-3 text-red-300">
          {error}
        </div>
      ) : null}

      <section className="rounded border border-gray-800 bg-gray-900">
        <div className="flex flex-col gap-1 border-b border-gray-800 px-4 py-2">
          <h2 className="text-base font-semibold">Customer List</h2>
          <p className="text-xs text-gray-400">
            Showing {visibleCustomers.length} of {customers.length} customers.
          </p>
        </div>

        {visibleCustomers.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">No customers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-black text-gray-300">
                <tr>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Customer
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Email
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Phone
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Created
                  </th>
                  <th className="border-b border-gray-800 px-4 py-2">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleCustomers.map((customer) => {
                  const customerId = getCustomerId(customer)

                  return (
                    <tr
                      key={customerId || customer.name}
                      className="border-b border-gray-800 hover:bg-gray-800/60"
                    >
                      <td className="px-4 py-2 font-semibold text-white">
                        {customer.name}
                        <p className="mt-1 break-all text-xs font-normal text-gray-500">
                          {customerId || 'Missing customer id'}
                        </p>
                      </td>

                      <td className="px-4 py-2">
                        {customer.email ?? 'No email'}
                      </td>

                      <td className="px-4 py-2">
                        {customer.phone ?? 'No phone'}
                      </td>

                      <td className="px-4 py-2">
                        {formatTimestamp(customer.created_at)}
                      </td>

                      <td className="px-4 py-2">
                        <button
                          type="button"
                          disabled={!customerId || !canViewJobs}
                          onClick={() => openCustomerJobs(customer)}
                          className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Open Jobs
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