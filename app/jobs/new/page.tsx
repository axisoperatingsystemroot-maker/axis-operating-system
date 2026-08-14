'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
}

type CustomerOption = {
  id?: string
  customer_id?: string
  name: string
  email?: string | null
  phone?: string | null
}

type ToolOption = {
  id?: string
  tool_id?: string
  customer_id: string
  customer_name?: string | null
  serial_number: string
  tool_type: string
  blade_count?: number | null
  nominal_body_od?: number | null
  active?: boolean | null
}

function getCustomerId(customer: CustomerOption) {
  return String(customer.customer_id ?? customer.id ?? '').trim()
}

function getToolId(tool: ToolOption) {
  return String(tool.tool_id ?? tool.id ?? '').trim()
}

function parseNullableNumber(value: string) {
  const trimmed = value.trim()

  if (!trimmed) return null

  const parsed = Number(trimmed)

  if (Number.isNaN(parsed)) return null

  return parsed
}

export default function NewJobPage() {
  const router = useRouter()

  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [tools, setTools] = useState<ToolOption[]>([])

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedToolId, setSelectedToolId] = useState('')
  const [toolSearch, setToolSearch] = useState('')
  const [customerWorkOrderNumber, setCustomerWorkOrderNumber] = useState('')
  const [priority, setPriority] = useState('STANDARD')
  const [apiRequired, setApiRequired] = useState(false)
  const [rushJob, setRushJob] = useState(false)
  const [severeDamage, setSevereDamage] = useState(false)
  const [customerThirdPartyOnSite, setCustomerThirdPartyOnSite] =
    useState(false)

  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false)
  const [showQuickAddTool, setShowQuickAddTool] = useState(false)

  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')

  const [newToolSerial, setNewToolSerial] = useState('')
  const [newToolType, setNewToolType] = useState('stabilizer')
  const [newToolBladeCount, setNewToolBladeCount] = useState('')
  const [newToolBodyOd, setNewToolBodyOd] = useState('')
  const [newToolNotes, setNewToolNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const allowedPermissions = useMemo(() => {
    return new Set(
      permissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )
  }, [permissions])

  const canViewJobs = allowedPermissions.has('view_jobs')
  const canEditJobs = allowedPermissions.has('edit_jobs')
  const canCreateCustomers = allowedPermissions.has('create_customers')
  const canCreateTools = allowedPermissions.has('create_tools')

  const customerTools = useMemo(() => {
    if (!selectedCustomerId) return []

    return tools
      .filter((tool) => tool.customer_id === selectedCustomerId)
      .sort((a, b) => a.serial_number.localeCompare(b.serial_number))
  }, [tools, selectedCustomerId])

  const filteredTools = useMemo(() => {
    const term = toolSearch.trim().toLowerCase()

    if (!term) return customerTools.slice(0, 25)

    return customerTools
      .filter((tool) => {
        const searchable = [
          tool.serial_number,
          tool.tool_type,
          tool.customer_name,
          String(tool.blade_count ?? ''),
          String(tool.nominal_body_od ?? ''),
        ]
          .join(' ')
          .toLowerCase()

        return searchable.includes(term)
      })
      .slice(0, 25)
  }, [customerTools, toolSearch])

  const selectedCustomerName = useMemo(() => {
    const customer = customers.find(
      (item) => getCustomerId(item) === selectedCustomerId
    )

    return customer?.name ?? ''
  }, [customers, selectedCustomerId])

  const selectedTool = useMemo(() => {
    return tools.find((item) => getToolId(item) === selectedToolId)
  }, [tools, selectedToolId])

  const selectedToolLabel = useMemo(() => {
    if (!selectedTool) return ''

    return `${selectedTool.serial_number} — ${selectedTool.tool_type}`
  }, [selectedTool])

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
      setCustomers([])
      setTools([])
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
      setCustomers([])
      setTools([])
      setLoading(false)
      return
    }

    const { data: customersData, error: customersError } = await supabase.rpc(
      'get_customers_dashboard_v1'
    )

    if (customersError) {
      setError(`Customers load failed: ${customersError.message}`)
      setCustomers([])
      setTools([])
      setLoading(false)
      return
    }

    const { data: toolsData, error: toolsError } = await supabase.rpc(
      'get_tools_dashboard_v1'
    )

    if (toolsError) {
      setError(`Tools load failed: ${toolsError.message}`)
      setCustomers((customersData ?? []) as CustomerOption[])
      setTools([])
      setLoading(false)
      return
    }

    setCustomers((customersData ?? []) as CustomerOption[])
    setTools((toolsData ?? []) as ToolOption[])
    setLoading(false)
  }

  useEffect(() => {
    void loadPage()
  }, [])

  const createCustomer = async () => {
    if (!canCreateCustomers) {
      setError('You do not have permission to create customers.')
      return
    }

    if (!newCustomerName.trim()) {
      setError('Customer name is required.')
      return
    }

    setWorking(true)
    setError('')
    setMessage('')

    const { data, error: rpcError } = await supabase.rpc('create_customer_v1', {
      p_name: newCustomerName,
      p_email: newCustomerEmail || null,
      p_phone: newCustomerPhone || null,
    })

    if (rpcError) {
      setError(rpcError.message)
      setWorking(false)
      return
    }

    const newId = String(data ?? '')

    setNewCustomerName('')
    setNewCustomerEmail('')
    setNewCustomerPhone('')

    await loadPage()

    if (newId) {
      setSelectedCustomerId(newId)
      setSelectedToolId('')
      setToolSearch('')
    }

    setMessage('Customer created and selected.')
    setWorking(false)
  }

  const createTool = async () => {
    if (!canCreateTools) {
      setError('You do not have permission to create tools.')
      return
    }

    if (!selectedCustomerId) {
      setError('Select or create a customer before registering a tool.')
      return
    }

    if (!newToolSerial.trim()) {
      setError('Tool serial number is required.')
      return
    }

    if (!newToolType.trim()) {
      setError('Tool type is required.')
      return
    }

    setWorking(true)
    setError('')
    setMessage('')

    const { data, error: rpcError } = await supabase.rpc('create_tool_v1', {
      p_customer_id: selectedCustomerId,
      p_serial_number: newToolSerial,
      p_tool_type: newToolType,
      p_blade_count: parseNullableNumber(newToolBladeCount),
      p_nominal_body_od: parseNullableNumber(newToolBodyOd),
      p_notes: newToolNotes || null,
    })

    if (rpcError) {
      setError(rpcError.message)
      setWorking(false)
      return
    }

    const newId = String(data ?? '')

    setNewToolSerial('')
    setNewToolType('stabilizer')
    setNewToolBladeCount('')
    setNewToolBodyOd('')
    setNewToolNotes('')

    await loadPage()

    if (newId) {
      setSelectedToolId(newId)
      setToolSearch('')
    }

    setMessage('Tool registered and selected.')
    setWorking(false)
  }

  const createJob = async () => {
    if (!canEditJobs) {
      setError('You do not have permission to create or edit jobs.')
      return
    }

    if (!selectedCustomerId) {
      setError('Customer is required.')
      return
    }

    if (!selectedToolId) {
      setError('Tool is required.')
      return
    }

    setWorking(true)
    setError('')
    setMessage('')

    const { data, error: rpcError } = await supabase.rpc('create_job_v1', {
      p_customer_id: selectedCustomerId,
      p_tool_id: selectedToolId,
      p_customer_work_order_number: customerWorkOrderNumber || null,
      p_priority: priority,
      p_api_required: apiRequired,
      p_rush_job: rushJob,
      p_severe_damage: severeDamage,
      p_customer_third_party_on_site: customerThirdPartyOnSite,
    })

    if (rpcError) {
      setError(rpcError.message)
      setWorking(false)
      return
    }

    const newJobId = String(data ?? '')

    if (!newJobId) {
      setError('Job was created, but no job id was returned.')
      setWorking(false)
      return
    }

    router.push(`/jobs/${newJobId}`)
  }

  const selectTool = (tool: ToolOption) => {
    setSelectedToolId(getToolId(tool))
    setToolSearch(tool.serial_number)
  }

  const clearToolSelection = () => {
    setSelectedToolId('')
    setToolSearch('')
  }

  if (loading) {
    return <main className="p-6">Loading job intake...</main>
  }

  if (!canViewJobs) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">New Job Intake</h1>

        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view jobs.
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-4 p-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">New Job Intake</h1>
          <p className="text-xs text-gray-400">
            Create an INTAKE-stage job. Search tools by serial instead of
            scrolling long lists.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/jobs')}
          className="rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 hover:border-gray-500 hover:text-white"
        >
          Back to Jobs
        </button>
      </div>

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

      <section className="rounded border border-gray-800 bg-gray-900 p-4">
        <div className="mb-3 flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Job Intake</h2>
          <p className="text-xs text-gray-400">
            Select customer, find tool by serial, set job flags, then create the
            job.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-gray-300">Customer</span>
            <select
              value={selectedCustomerId}
              onChange={(event) => {
                setSelectedCustomerId(event.target.value)
                setSelectedToolId('')
                setToolSearch('')
              }}
              className="w-full rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            >
              <option value="">Select customer</option>
              {customers
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((customer) => {
                  const customerId = getCustomerId(customer)

                  return (
                    <option key={customerId} value={customerId}>
                      {customer.name}
                    </option>
                  )
                })}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-gray-300">Find Tool by Serial</span>
            <input
              value={toolSearch}
              onChange={(event) => {
                setToolSearch(event.target.value)
                setSelectedToolId('')
              }}
              disabled={!selectedCustomerId}
              placeholder={
                selectedCustomerId
                  ? 'Type serial number...'
                  : 'Select customer first'
              }
              className="w-full rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-gray-300">Customer Work Order</span>
            <input
              value={customerWorkOrderNumber}
              onChange={(event) =>
                setCustomerWorkOrderNumber(event.target.value)
              }
              placeholder="Customer WO / PO / verbal reference"
              className="w-full rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-gray-300">Priority</span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="w-full rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            >
              <option value="STANDARD">STANDARD</option>
              <option value="RUSH">RUSH</option>
              <option value="HOLD">HOLD</option>
            </select>
          </label>
        </div>

        {selectedCustomerId ? (
          <div className="mt-3 rounded border border-gray-800 bg-black p-3 text-xs text-gray-400">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
              <p>Selected customer: {selectedCustomerName || 'None'}</p>
              <p>Selected tool: {selectedToolLabel || 'None'}</p>
              <p>
                Matching tools shown: {filteredTools.length} of{' '}
                {customerTools.length}
              </p>
            </div>

            {selectedToolId ? (
              <button
                type="button"
                onClick={clearToolSelection}
                className="mt-2 rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
              >
                Clear selected tool
              </button>
            ) : null}
          </div>
        ) : null}

        {selectedCustomerId && !selectedToolId ? (
          <div className="mt-3 rounded border border-gray-800 bg-black">
            <div className="border-b border-gray-800 px-3 py-2 text-xs text-gray-400">
              Tool matches for selected customer
            </div>

            {filteredTools.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400">
                No matching tools found. Use Quick Add Tool if this is a new
                tool.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                {filteredTools.map((tool) => {
                  const toolId = getToolId(tool)

                  return (
                    <button
                      key={toolId}
                      type="button"
                      onClick={() => selectTool(tool)}
                      className="flex w-full items-center justify-between gap-3 border-b border-gray-900 px-3 py-2 text-left text-sm hover:bg-gray-900"
                    >
                      <span>
                        <span className="font-semibold text-white">
                          {tool.serial_number}
                        </span>{' '}
                        <span className="text-gray-400">
                          — {tool.tool_type}
                        </span>
                      </span>

                      <span className="shrink-0 text-xs text-gray-500">
                        Blades: {tool.blade_count ?? 'N/A'} | Body OD:{' '}
                        {tool.nominal_body_od ?? 'N/A'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
          <label className="flex items-center gap-2 rounded border border-gray-800 bg-black p-3">
            <input
              type="checkbox"
              checked={apiRequired}
              onChange={(event) => setApiRequired(event.target.checked)}
            />
            <span>API required</span>
          </label>

          <label className="flex items-center gap-2 rounded border border-gray-800 bg-black p-3">
            <input
              type="checkbox"
              checked={rushJob}
              onChange={(event) => setRushJob(event.target.checked)}
            />
            <span>Rush job</span>
          </label>

          <label className="flex items-center gap-2 rounded border border-gray-800 bg-black p-3">
            <input
              type="checkbox"
              checked={severeDamage}
              onChange={(event) => setSevereDamage(event.target.checked)}
            />
            <span>Severe damage</span>
          </label>

          <label className="flex items-center gap-2 rounded border border-gray-800 bg-black p-3">
            <input
              type="checkbox"
              checked={customerThirdPartyOnSite}
              onChange={(event) =>
                setCustomerThirdPartyOnSite(event.target.checked)
              }
            />
            <span>Customer inspector on site</span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={createJob}
            disabled={working || !canEditJobs}
            className="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {working ? 'Working...' : 'Create Job'}
          </button>

          {canCreateCustomers ? (
            <button
              type="button"
              onClick={() =>
                setShowQuickAddCustomer((current) => !current)
              }
              className="rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 hover:border-gray-500 hover:text-white"
            >
              {showQuickAddCustomer ? 'Hide Customer Add' : 'Quick Add Customer'}
            </button>
          ) : null}

          {canCreateTools ? (
            <button
              type="button"
              onClick={() => setShowQuickAddTool((current) => !current)}
              className="rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 hover:border-gray-500 hover:text-white"
            >
              {showQuickAddTool ? 'Hide Tool Add' : 'Quick Add Tool'}
            </button>
          ) : null}
        </div>
      </section>

      {showQuickAddCustomer && canCreateCustomers ? (
        <section className="rounded border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-base font-semibold">Quick Add Customer</h2>
          <p className="mb-3 text-xs text-gray-400">
            Use only if the customer does not already exist.
          </p>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <input
              value={newCustomerName}
              onChange={(event) => setNewCustomerName(event.target.value)}
              placeholder="Customer name"
              className="rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            />

            <input
              value={newCustomerEmail}
              onChange={(event) => setNewCustomerEmail(event.target.value)}
              placeholder="Email"
              className="rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            />

            <input
              value={newCustomerPhone}
              onChange={(event) => setNewCustomerPhone(event.target.value)}
              placeholder="Phone"
              className="rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={createCustomer}
            disabled={working}
            className="mt-3 rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create and Select Customer
          </button>
        </section>
      ) : null}

      {showQuickAddTool && canCreateTools ? (
        <section className="rounded border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-base font-semibold">Quick Add Tool</h2>
          <p className="mb-3 text-xs text-gray-400">
            Use only if the selected customer owns a tool that is not already
            registered.
          </p>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            <input
              value={newToolSerial}
              onChange={(event) => setNewToolSerial(event.target.value)}
              placeholder="Serial number"
              className="rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            />

            <input
              value={newToolType}
              onChange={(event) => setNewToolType(event.target.value)}
              placeholder="Tool type"
              className="rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            />

            <input
              value={newToolBladeCount}
              onChange={(event) => setNewToolBladeCount(event.target.value)}
              placeholder="Blade count"
              type="number"
              className="rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            />

            <input
              value={newToolBodyOd}
              onChange={(event) => setNewToolBodyOd(event.target.value)}
              placeholder="Nominal body OD"
              type="number"
              step="0.001"
              className="rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            />

            <input
              value={newToolNotes}
              onChange={(event) => setNewToolNotes(event.target.value)}
              placeholder="Notes"
              className="rounded border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={createTool}
            disabled={working || !selectedCustomerId}
            className="mt-3 rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Register and Select Tool
          </button>
        </section>
      ) : null}
    </main>
  )
}