'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
}

type CustomerOption = {
  customer_id: string
  name: string
}

type ToolDashboardRow = {
  tool_id: string
  tenant_id: string
  customer_id: string
  customer_name: string
  serial_number: string
  tool_type: string
  blade_count: number | null
  nominal_body_od: number | null
  notes: string | null
  active: boolean | null
  created_at: string | null
  job_count: number
  open_job_count: number
  closed_job_count: number
}

export default function ToolsPage() {
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [tools, setTools] = useState<ToolDashboardRow[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [customerId, setCustomerId] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [toolType, setToolType] = useState('stabilizer')
  const [bladeCount, setBladeCount] = useState('')
  const [nominalBodyOd, setNominalBodyOd] = useState('')
  const [notes, setNotes] = useState('')

  const allowedPermissions = useMemo(() => {
    return new Set(
      permissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )
  }, [permissions])

  const canViewTools = allowedPermissions.has('view_tools')
  const canCreateTools = allowedPermissions.has('create_tools')

  const loadPage = async () => {
    setLoading(true)
    setError('')
    setMessage('')

    const { data: permissionData, error: permissionError } = await supabase.rpc(
      'get_current_user_permissions_v1'
    )

    if (permissionError) {
      setError(`Permission load failed: ${permissionError.message}`)
      setPermissions([])
      setTools([])
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

    if (!nextAllowedPermissions.has('view_tools')) {
      setTools([])
      setCustomers([])
      setLoading(false)
      return
    }

    const { data: toolsData, error: toolsError } = await supabase.rpc(
      'get_tools_dashboard_v1'
    )

    if (toolsError) {
      setError(toolsError.message)
      setTools([])
      setCustomers([])
      setLoading(false)
      return
    }

    const { data: customersData, error: customersError } = await supabase.rpc(
      'get_customers_dashboard_v1'
    )

    if (customersError) {
      setError(customersError.message)
      setTools((toolsData ?? []) as ToolDashboardRow[])
      setCustomers([])
      setLoading(false)
      return
    }

    setTools((toolsData ?? []) as ToolDashboardRow[])
    setCustomers(
      (customersData ?? []).map((customer: any) => ({
        customer_id: customer.customer_id,
        name: customer.name,
      }))
    )

    setLoading(false)
  }

  useEffect(() => {
    void loadPage()
  }, [])

  const createTool = async () => {
    if (!canCreateTools) {
      setError('You do not have permission to create tools.')
      return
    }

    setCreating(true)
    setError('')
    setMessage('')

    const parsedBladeCount =
      bladeCount.trim().length === 0 ? null : Number(bladeCount)

    const parsedNominalBodyOd =
      nominalBodyOd.trim().length === 0 ? null : Number(nominalBodyOd)

    const { error } = await supabase.rpc('create_tool_v1', {
      p_customer_id: customerId || null,
      p_serial_number: serialNumber,
      p_tool_type: toolType,
      p_blade_count: parsedBladeCount,
      p_nominal_body_od: parsedNominalBodyOd,
      p_notes: notes || null,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Tool created successfully.')
      setCustomerId('')
      setSerialNumber('')
      setToolType('stabilizer')
      setBladeCount('')
      setNominalBodyOd('')
      setNotes('')
      await loadPage()
    }

    setCreating(false)
  }

  if (loading) {
    return <main className="p-6">Loading tools...</main>
  }

  if (!canViewTools) {
    return (
      <main className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Tools</h1>
        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view the tools registry.
        </div>
      </main>
    )
  }

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tools</h1>
        <p className="text-sm text-gray-400">
          Manage tenant-scoped physical tool records through registered AOS
          surfaces. This page does not create tool lifecycle analytics,
          estimator expansion, inventory mutation, customer portal access,
          invoicing, or accounting automation.
        </p>
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

      {canCreateTools ? (
        <section className="rounded border border-gray-800 bg-gray-900 p-4 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Register Physical Tool</h2>
            <p className="text-sm text-gray-400">
              Create one record for each customer-owned physical tool. Future
              jobs should reuse this tool record instead of creating duplicates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full p-2 bg-black border border-gray-700 rounded"
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.customer_id} value={customer.customer_id}>
                  {customer.name}
                </option>
              ))}
            </select>

            <input
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="Serial number"
              className="w-full p-2 bg-black border border-gray-700 rounded"
            />

            <input
              value={toolType}
              onChange={(e) => setToolType(e.target.value)}
              placeholder="Tool type"
              className="w-full p-2 bg-black border border-gray-700 rounded"
            />

            <input
              value={bladeCount}
              onChange={(e) => setBladeCount(e.target.value)}
              placeholder="Blade count"
              type="number"
              className="w-full p-2 bg-black border border-gray-700 rounded"
            />

            <input
              value={nominalBodyOd}
              onChange={(e) => setNominalBodyOd(e.target.value)}
              placeholder="Nominal body OD"
              type="number"
              step="0.001"
              className="w-full p-2 bg-black border border-gray-700 rounded"
            />

            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="w-full p-2 bg-black border border-gray-700 rounded"
            />
          </div>

          <button
            onClick={createTool}
            disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Register Tool'}
          </button>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Tool Registry</h2>
          <p className="text-sm text-gray-400">
            Showing {tools.length} tool{tools.length === 1 ? '' : 's'}.
          </p>
        </div>

        {tools.length === 0 ? (
          <div className="rounded border border-gray-800 bg-gray-900 p-4">
            No tools found.
          </div>
        ) : (
          <div className="space-y-4">
            {tools.map((tool) => (
              <div
                key={tool.tool_id}
                className="rounded border border-gray-800 bg-gray-900 p-4 space-y-3"
              >
                <div className="space-y-1">
                  <p className="font-semibold">
                    {tool.serial_number} — {tool.tool_type}
                  </p>
                  <p className="text-sm text-gray-400 break-all">
                    Tool ID: {tool.tool_id}
                  </p>
                  <p className="text-sm text-gray-400">
                    Customer: {tool.customer_name}
                  </p>
                  <p className="text-sm text-gray-400">
                    Blade Count: {tool.blade_count ?? 'N/A'}
                  </p>
                  <p className="text-sm text-gray-400">
                    Nominal Body OD: {tool.nominal_body_od ?? 'N/A'}
                  </p>
                  <p className="text-sm text-gray-400">
                    Active: {String(tool.active)}
                  </p>
                  <p className="text-sm text-gray-400">
                    Notes: {tool.notes ?? 'N/A'}
                  </p>
                  <p className="text-sm text-gray-400">
                    Created: {tool.created_at ?? 'Unknown'}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded border border-gray-800 bg-black p-3">
                    <p className="font-semibold">Total Jobs</p>
                    <p>{tool.job_count}</p>
                  </div>

                  <div className="rounded border border-gray-800 bg-black p-3">
                    <p className="font-semibold">Open Jobs</p>
                    <p>{tool.open_job_count}</p>
                  </div>

                  <div className="rounded border border-gray-800 bg-black p-3">
                    <p className="font-semibold">Closed Jobs</p>
                    <p>{tool.closed_job_count}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}