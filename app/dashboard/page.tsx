'use client'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { startTransition, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Responsive,
  useContainerWidth,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from 'react-grid-layout'
import { noCompactor } from 'react-grid-layout/core'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
}

type DashboardWidgetRow = {
  widget_key: string
  title: string
  description: string | null
  required_permission_key: string | null
  is_visible: boolean
  sort_order: number
  widget_size: 'small' | 'medium' | 'large' | 'full'
  x_position: number
  y_position: number
  width_units: number
  height_units: number
}

type JobDashboardRow = {
  job_id: string
  tenant_id: string
  customer_id?: string
  customer_name?: string | null
  tool_id?: string
  serial_number?: string | null
  internal_work_order_number?: string | null
  customer_work_order_number?: string | null
  internal_status: string
  qc_passed: boolean | null
  created_at: string | null
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

type AdminFlagRow = {
  finding_id: string
  tenant_id: string
  entity_type: string
  entity_id: string
  rule_code: string
  severity: string
  description: string | null
  detected_at: string | null
  resolved: boolean | null
  resolved_at: string | null
}

type GlobalSearchResultRow = {
  result_domain: string
  result_label: string
  result_id: string
  title: string
  subtitle: string | null
  route: string
  created_at: string | null
}

type DashboardBreakpoint = 'lg' | 'md' | 'sm' | 'xs' | 'xxs'

const GRID_COLUMNS = 12
const GRID_ROW_HEIGHT = 72
const GRID_MARGIN: [number, number] = [16, 16]
const GRID_PADDING: [number, number] = [0, 0]

const MIN_WIDTH_UNITS = 1
const MIN_HEIGHT_UNITS = 1
const DEFAULT_HEIGHT_UNITS = 3

const BREAKPOINTS: Record<DashboardBreakpoint, number> = {
  lg: 1200,
  md: 900,
  sm: 700,
  xs: 500,
  xxs: 0,
}

const BREAKPOINT_COLS: Record<DashboardBreakpoint, number> = {
  lg: 12,
  md: 12,
  sm: 8,
  xs: 4,
  xxs: 1,
}

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getDefaultWidthUnits(widgetSize: DashboardWidgetRow['widget_size']) {
  if (widgetSize === 'small') return 3
  if (widgetSize === 'medium') return 4
  if (widgetSize === 'large') return 6
  return 12
}

function getFallbackLayout(index: number, widget: DashboardWidgetRow) {
  const width = getDefaultWidthUnits(widget.widget_size)
  const perRow = Math.max(1, Math.floor(GRID_COLUMNS / width))

  return {
    x: (index % perRow) * width,
    y: Math.floor(index / perRow) * DEFAULT_HEIGHT_UNITS,
    w: width,
    h: DEFAULT_HEIGHT_UNITS,
  }
}

function normalizeWidgetLayout(widget: DashboardWidgetRow, index: number) {
  const fallback = getFallbackLayout(index, widget)

  const width = clamp(
    Number.isFinite(widget.width_units) ? widget.width_units : fallback.w,
    MIN_WIDTH_UNITS,
    GRID_COLUMNS
  )

  const x = clamp(
    Number.isFinite(widget.x_position) ? widget.x_position : fallback.x,
    0,
    Math.max(GRID_COLUMNS - width, 0)
  )

  return {
    x,
    y: Math.max(
      0,
      Number.isFinite(widget.y_position) ? widget.y_position : fallback.y
    ),
    w: width,
    h: Math.max(
      MIN_HEIGHT_UNITS,
      Number.isFinite(widget.height_units) ? widget.height_units : fallback.h
    ),
  }
}

function layoutItemsCollide(
  a: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>,
  b: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>
) {
  if (a.x + a.w <= b.x) return false
  if (b.x + b.w <= a.x) return false
  if (a.y + a.h <= b.y) return false
  if (b.y + b.h <= a.y) return false
  return true
}

function cloneLayoutItem(item: LayoutItem): LayoutItem {
  return {
    ...item,
    resizeHandles: ['nw', 'ne', 'sw', 'se'],
  }
}

function widgetIsAllowed(
  widget: DashboardWidgetRow,
  allowedPermissions: Set<string>
) {
  if (widget.required_permission_key) {
    return allowedPermissions.has(widget.required_permission_key)
  }

  if (
    widget.widget_key === 'job_workflow_overview' ||
    widget.widget_key === 'latest_jobs'
  ) {
    return allowedPermissions.has('view_jobs')
  }

  if (
    widget.widget_key === 'third_party_report_overview' ||
    widget.widget_key === 'latest_reports'
  ) {
    return allowedPermissions.has('view_reports')
  }

  return true
}

function getVisibleWidgetsForPermissions(
  sourceWidgets: DashboardWidgetRow[],
  allowedPermissions: Set<string>
) {
  return sourceWidgets
    .filter(
      (widget) => widget.is_visible && widgetIsAllowed(widget, allowedPermissions)
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
}

function getHiddenWidgetsForPermissions(
  sourceWidgets: DashboardWidgetRow[],
  allowedPermissions: Set<string>
) {
  return sourceWidgets
    .filter(
      (widget) => !widget.is_visible && widgetIsAllowed(widget, allowedPermissions)
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
}

function buildDesktopLayout(widgets: DashboardWidgetRow[]): Layout {
  const placed: LayoutItem[] = []

  const ordered = [...widgets].sort((a, b) => {
    const aLayout = normalizeWidgetLayout(a, 0)
    const bLayout = normalizeWidgetLayout(b, 0)

    return (
      aLayout.y - bLayout.y ||
      aLayout.x - bLayout.x ||
      a.sort_order - b.sort_order ||
      a.title.localeCompare(b.title)
    )
  })

  ordered.forEach((widget, index) => {
    let candidate = normalizeWidgetLayout(widget, index)

    while (placed.some((existing) => layoutItemsCollide(candidate, existing))) {
      candidate = {
        ...candidate,
        y: candidate.y + 1,
      }
    }

    placed.push({
      i: widget.widget_key,
      x: candidate.x,
      y: candidate.y,
      w: candidate.w,
      h: candidate.h,
      minW: MIN_WIDTH_UNITS,
      minH: MIN_HEIGHT_UNITS,
      resizeHandles: ['nw', 'ne', 'sw', 'se'],
    })
  })

  return placed
}

function projectLayoutToCols(baseLayout: Layout, cols: number): Layout {
  if (cols === GRID_COLUMNS) {
    return baseLayout.map(cloneLayoutItem)
  }

  const projected: LayoutItem[] = []
  const ordered = [...baseLayout].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.i.localeCompare(b.i)
  )

  ordered.forEach((item) => {
    const minW = Math.min(item.minW ?? MIN_WIDTH_UNITS, cols)

    const nextW =
      cols === 1
        ? 1
        : clamp(
            Math.round((item.w / GRID_COLUMNS) * cols) || minW,
            minW,
            cols
          )

    const nextX =
      cols === 1
        ? 0
        : clamp(
            Math.round((item.x / GRID_COLUMNS) * cols),
            0,
            Math.max(cols - nextW, 0)
          )

    let candidate: LayoutItem = {
      ...cloneLayoutItem(item),
      x: nextX,
      y: item.y,
      w: nextW,
      h: item.h,
      minW,
      minH: MIN_HEIGHT_UNITS,
      resizeHandles: ['nw', 'ne', 'sw', 'se'],
    }

    while (projected.some((existing) => layoutItemsCollide(candidate, existing))) {
      candidate = {
        ...candidate,
        y: candidate.y + 1,
      }
    }

    projected.push(candidate)
  })

  return projected
}

function projectLayoutToCanonical(
  currentLayout: Layout,
  sourceCols: number
): Layout {
  if (sourceCols === GRID_COLUMNS) {
    return currentLayout.map((item) => ({
      ...cloneLayoutItem(item),
      minW: MIN_WIDTH_UNITS,
      minH: MIN_HEIGHT_UNITS,
      resizeHandles: ['nw', 'ne', 'sw', 'se'],
    }))
  }

  const projected: LayoutItem[] = []
  const ordered = [...currentLayout].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.i.localeCompare(b.i)
  )

  ordered.forEach((item) => {
    const nextW =
      sourceCols === 1
        ? GRID_COLUMNS
        : clamp(
            Math.round((item.w / sourceCols) * GRID_COLUMNS) || MIN_WIDTH_UNITS,
            MIN_WIDTH_UNITS,
            GRID_COLUMNS
          )

    const nextX =
      sourceCols === 1
        ? 0
        : clamp(
            Math.round((item.x / sourceCols) * GRID_COLUMNS),
            0,
            Math.max(GRID_COLUMNS - nextW, 0)
          )

    let candidate: LayoutItem = {
      ...cloneLayoutItem(item),
      x: nextX,
      y: Math.max(0, item.y),
      w: nextW,
      h: Math.max(MIN_HEIGHT_UNITS, item.h),
      minW: MIN_WIDTH_UNITS,
      minH: MIN_HEIGHT_UNITS,
      resizeHandles: ['nw', 'ne', 'sw', 'se'],
    }

    while (projected.some((existing) => layoutItemsCollide(candidate, existing))) {
      candidate = {
        ...candidate,
        y: candidate.y + 1,
      }
    }

    projected.push(candidate)
  })

  return projected
}

function buildResponsiveLayouts(
  baseLayout: Layout
): ResponsiveLayouts<DashboardBreakpoint> {
  return {
    lg: projectLayoutToCols(baseLayout, BREAKPOINT_COLS.lg),
    md: projectLayoutToCols(baseLayout, BREAKPOINT_COLS.md),
    sm: projectLayoutToCols(baseLayout, BREAKPOINT_COLS.sm),
    xs: projectLayoutToCols(baseLayout, BREAKPOINT_COLS.xs),
    xxs: projectLayoutToCols(baseLayout, BREAKPOINT_COLS.xxs),
  }
}

function getBreakpointForWidth(width: number): DashboardBreakpoint {
  if (width >= BREAKPOINTS.lg) return 'lg'
  if (width >= BREAKPOINTS.md) return 'md'
  if (width >= BREAKPOINTS.sm) return 'sm'
  if (width >= BREAKPOINTS.xs) return 'xs'
  return 'xxs'
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function DashboardPage() {
  const router = useRouter()
  const { width, containerRef, mounted } = useContainerWidth({
    initialWidth: 1440,
  })

  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [widgets, setWidgets] = useState<DashboardWidgetRow[]>([])
  const [layouts, setLayouts] = useState<
    ResponsiveLayouts<DashboardBreakpoint>
  >({
    lg: [],
    md: [],
    sm: [],
    xs: [],
    xxs: [],
  })
  const [currentBreakpoint, setCurrentBreakpoint] =
    useState<DashboardBreakpoint>('lg')
  const [jobs, setJobs] = useState<JobDashboardRow[]>([])
  const [reports, setReports] = useState<ReportDashboardRow[]>([])
  const [flags, setFlags] = useState<AdminFlagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingLayout, setSavingLayout] = useState(false)
  const [workingWidgetKey, setWorkingWidgetKey] = useState<string | null>(null)
  const [showHiddenWidgets, setShowHiddenWidgets] = useState(false)
  const [error, setError] = useState('')

  const [searchDraft, setSearchDraft] = useState('')
  const [searchResults, setSearchResults] = useState<GlobalSearchResultRow[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [activeSearch, setActiveSearch] = useState('')

  useEffect(() => {
    setCurrentBreakpoint(getBreakpointForWidth(width))
  }, [width])

  const allowedPermissions = useMemo(() => {
    return new Set(
      permissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )
  }, [permissions])

  const canViewDashboard = allowedPermissions.has('view_dashboard')
  const canManageDashboard = allowedPermissions.has('manage_dashboards')
  const canViewJobs = allowedPermissions.has('view_jobs')
  const canViewReports = allowedPermissions.has('view_reports')

  const visibleWidgets = useMemo(() => {
    return getVisibleWidgetsForPermissions(widgets, allowedPermissions)
  }, [widgets, allowedPermissions])

  const hiddenWidgets = useMemo(() => {
    return getHiddenWidgetsForPermissions(widgets, allowedPermissions)
  }, [widgets, allowedPermissions])

  const loadDashboard = async () => {
    setLoading(true)
    setError('')

    const { data: permissionData, error: permissionError } = await supabase.rpc(
      'get_current_user_permissions_v1'
    )

    if (permissionError) {
      setError(`Permission load failed: ${permissionError.message}`)
      setPermissions([])
      setWidgets([])
      setJobs([])
      setReports([])
      setFlags([])
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

    if (!nextAllowedPermissions.has('view_dashboard')) {
      setWidgets([])
      setJobs([])
      setReports([])
      setFlags([])
      setLoading(false)
      return
    }

    const widgetRequest = supabase.rpc('get_my_dashboard_layout_v1')
    const jobsRequest = nextAllowedPermissions.has('view_jobs')
      ? supabase.rpc('get_jobs_dashboard_v1')
      : Promise.resolve({ data: [], error: null })
    const reportsRequest = nextAllowedPermissions.has('view_reports')
      ? supabase.rpc('get_third_party_report_dashboard_v1')
      : Promise.resolve({ data: [], error: null })
    const flagsRequest = supabase.rpc('get_admin_compliance_flags_v1')

    const [widgetResult, jobsResult, reportsResult, flagsResult] =
      await Promise.all([widgetRequest, jobsRequest, reportsRequest, flagsRequest])

    if (widgetResult.error) {
      setError(`Dashboard layout load failed: ${widgetResult.error.message}`)
      setWidgets([])
    } else {
      const nextWidgets = (widgetResult.data ?? []) as DashboardWidgetRow[]
      const nextVisibleWidgets = getVisibleWidgetsForPermissions(
        nextWidgets,
        nextAllowedPermissions
      )

      setWidgets(nextWidgets)
      setLayouts(buildResponsiveLayouts(buildDesktopLayout(nextVisibleWidgets)))
    }

    if (jobsResult.error) {
      setError(`Jobs dashboard load failed: ${jobsResult.error.message}`)
      setJobs([])
    } else {
      setJobs((jobsResult.data ?? []) as JobDashboardRow[])
    }

    if (reportsResult.error) {
      setError(`Reports dashboard load failed: ${reportsResult.error.message}`)
      setReports([])
    } else {
      setReports((reportsResult.data ?? []) as ReportDashboardRow[])
    }

    if (flagsResult.error) {
      setFlags([])
    } else {
      setFlags((flagsResult.data ?? []) as AdminFlagRow[])
    }

    setLoading(false)
  }

  useEffect(() => {
    startTransition(() => {
      void loadDashboard()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistCanonicalLayout = async (currentLayout: Layout) => {
    if (!canManageDashboard) return

    setSavingLayout(true)
    setWorkingWidgetKey(null)
    setError('')

    const sourceCols = BREAKPOINT_COLS[currentBreakpoint]
    const nextDesktopLayout = projectLayoutToCanonical(currentLayout, sourceCols)

    const results = await Promise.all(
      nextDesktopLayout.map(async (item) => {
        const widget = widgets.find(
          (currentWidget) => currentWidget.widget_key === item.i
        )

        if (!widget) {
          return { widgetKey: item.i, error: null as { message: string } | null }
        }

        const { error: rpcError } = await supabase.rpc(
          'set_my_dashboard_grid_layout_v1',
          {
            p_widget_key: widget.widget_key,
            p_is_visible: true,
            p_x_position: clamp(item.x, 0, Math.max(GRID_COLUMNS - item.w, 0)),
            p_y_position: Math.max(0, item.y),
            p_width_units: clamp(item.w, MIN_WIDTH_UNITS, GRID_COLUMNS),
            p_height_units: Math.max(MIN_HEIGHT_UNITS, item.h),
          }
        )

        return { widgetKey: widget.widget_key, error: rpcError }
      })
    )

    const failed = results.find((result) => result.error)

    if (failed?.error) {
      setError(`Dashboard layout save failed: ${failed.error.message}`)
      await loadDashboard()
    } else {
      setWidgets((currentWidgets) =>
        currentWidgets.map((widget) => {
          const updated = nextDesktopLayout.find(
            (item) => item.i === widget.widget_key
          )

          if (!updated) return widget

          return {
            ...widget,
            x_position: updated.x,
            y_position: updated.y,
            width_units: updated.w,
            height_units: updated.h,
          }
        })
      )

      setLayouts(buildResponsiveLayouts(nextDesktopLayout))
    }

    setSavingLayout(false)
  }

  const updateWidgetVisibility = async (
    widget: DashboardWidgetRow,
    nextVisible: boolean
  ) => {
    if (!canManageDashboard) return

    const currentLayout =
      layouts.lg?.find((item) => item.i === widget.widget_key) ??
      ({
        i: widget.widget_key,
        ...normalizeWidgetLayout(widget, 0),
        minW: MIN_WIDTH_UNITS,
        minH: MIN_HEIGHT_UNITS,
        resizeHandles: ['nw', 'ne', 'sw', 'se'],
      } satisfies LayoutItem)

    setWorkingWidgetKey(widget.widget_key)
    setError('')

    const { error: rpcError } = await supabase.rpc(
      'set_my_dashboard_grid_layout_v1',
      {
        p_widget_key: widget.widget_key,
        p_is_visible: nextVisible,
        p_x_position: currentLayout.x,
        p_y_position: currentLayout.y,
        p_width_units: currentLayout.w,
        p_height_units: currentLayout.h,
      }
    )

    if (rpcError) {
      setError(rpcError.message)
    } else {
      await loadDashboard()
    }

    setWorkingWidgetKey(null)
  }

  const submitGlobalSearch = async () => {
    const query = searchDraft.trim()

    setSearchError('')
    setSearchResults([])
    setActiveSearch('')

    if (query.length < 2) {
      setSearchError('Enter at least 2 characters to search.')
      return
    }

    setSearching(true)

    const { data, error: rpcError } = await supabase.rpc(
      'global_system_search_v1',
      {
        p_query: query,
        p_limit: 30,
      }
    )

    if (rpcError) {
      setSearchError(rpcError.message)
      setSearchResults([])
    } else {
      setActiveSearch(query)
      setSearchResults((data ?? []) as GlobalSearchResultRow[])
    }

    setSearching(false)
  }

  const clearGlobalSearch = () => {
    setSearchDraft('')
    setActiveSearch('')
    setSearchResults([])
    setSearchError('')
  }

  const activeProductionJobs = useMemo(
    () => jobs.filter((job) => ACTIVE_PRODUCTION_STAGES.includes(job.internal_status)),
    [jobs]
  )

  const awaitingReportJobs = useMemo(
    () => jobs.filter((job) => job.internal_status === 'AWAITING_THIRD_PARTY_REPORT'),
    [jobs]
  )

  const readyForInvoiceJobs = useMemo(
    () => jobs.filter((job) => job.internal_status === 'READY_FOR_INVOICE'),
    [jobs]
  )

  const invoicedJobs = useMemo(
    () => jobs.filter((job) => job.internal_status === 'INVOICED'),
    [jobs]
  )

  const arOpenJobs = useMemo(
    () => jobs.filter((job) => job.internal_status === 'AR_OPEN'),
    [jobs]
  )

  const closedJobs = useMemo(
    () => jobs.filter((job) => job.internal_status === 'CLOSED'),
    [jobs]
  )

  const incomingReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          report.submission_source === 'EMAIL_INGEST' &&
          !report.manual_assignment_complete
      ),
    [reports]
  )

  const unlinkedReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          report.submission_source === 'EMAIL_INGEST' &&
          !report.manual_assignment_complete &&
          Number(report.linked_job_count) === 0
      ),
    [reports]
  )

  const unverifiedReports = useMemo(
    () => reports.filter((report) => !report.verified),
    [reports]
  )

  const completedAssignments = useMemo(
    () => reports.filter((report) => report.manual_assignment_complete),
    [reports]
  )

  const latestJobs = useMemo(() => jobs.slice(0, 5), [jobs])
  const latestReports = useMemo(() => reports.slice(0, 5), [reports])

  const widgetHeader = (widget: DashboardWidgetRow, subtitle?: string) => {
    return (
      <div className="dashboard-drag-handle shrink-0 cursor-move border-b border-gray-800 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{widget.title}</h2>
            {subtitle ? <p className="text-sm text-gray-400">{subtitle}</p> : null}
          </div>

          {canManageDashboard ? (
            <button
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              onClick={() => void updateWidgetVisibility(widget, false)}
              disabled={savingLayout || workingWidgetKey === widget.widget_key}
              className="dashboard-widget-action shrink-0 rounded border border-gray-700 bg-black px-3 py-1.5 text-sm text-gray-300 transition hover:border-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {workingWidgetKey === widget.widget_key ? 'Saving...' : 'Hide'}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const renderWidgetContents = (widget: DashboardWidgetRow) => {
    const bodyClass =
      'dashboard-widget-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4'

    if (widget.widget_key === 'admin_compliance_flags') {
      return (
        <>
          {widgetHeader(widget, 'Unresolved flags requiring admin review.')}

          <div className={bodyClass}>
            <div className="space-y-4">
              <p className="text-3xl font-semibold">{flags.length}</p>

              {flags.length > 0 ? (
                <div className="space-y-2">
                  {flags.slice(0, 20).map((flag) => (
                    <div
                      key={flag.finding_id}
                      className="rounded border border-yellow-800 bg-black p-3"
                    >
                      <p className="font-semibold">
                        {flag.severity} - {flag.rule_code}
                      </p>
                      <p className="break-words text-sm text-gray-400">
                        {flag.description ?? 'No description provided.'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-300">
                  No unresolved admin flags found.
                </p>
              )}

              <button
                type="button"
                onClick={() => router.push('/admin/flags')}
                className="dashboard-widget-action rounded bg-yellow-700 px-4 py-2 text-white transition hover:bg-yellow-600"
              >
                Open Flags
              </button>
            </div>
          </div>
        </>
      )
    }

    if (widget.widget_key === 'job_workflow_overview' && canViewJobs) {
      return (
        <>
          {widgetHeader(widget, 'Stage counts from the registered jobs dashboard surface.')}

          <div className={bodyClass}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['Active', activeProductionJobs.length, 'Shop workflow'],
                ['Awaiting Report', awaitingReportJobs.length, 'Needs report action'],
                ['Ready Invoice', readyForInvoiceJobs.length, 'Cleared for billing'],
                ['Invoiced', invoicedJobs.length, 'Invoice sent'],
                ['AR Open', arOpenJobs.length, 'Awaiting payment'],
                ['Closed', closedJobs.length, 'Terminal state'],
                ['All Jobs', jobs.length, 'Full list'],
              ].map(([label, count, subtext]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => router.push('/jobs')}
                  className="dashboard-widget-action rounded border border-gray-800 bg-black p-3 text-left transition hover:border-blue-500"
                >
                  <p className="font-semibold">{label}</p>
                  <p className="text-2xl">{count}</p>
                  <p className="text-xs text-gray-400">{subtext}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )
    }

    if (widget.widget_key === 'third_party_report_overview' && canViewReports) {
      return (
        <>
          {widgetHeader(
            widget,
            'Report workload from the registered third-party report dashboard surface.'
          )}

          <div className={bodyClass}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['Incoming', incomingReports.length, 'Open emailed reports'],
                ['Unlinked', unlinkedReports.length, 'Needs job assignment'],
                ['Unverified', unverifiedReports.length, 'Needs verification'],
                ['Completed', completedAssignments.length, 'Assignment closed'],
                ['All Reports', reports.length, 'Full history'],
              ].map(([label, count, subtext]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => router.push('/reports')}
                  className="dashboard-widget-action rounded border border-gray-800 bg-black p-3 text-left transition hover:border-blue-500"
                >
                  <p className="font-semibold">{label}</p>
                  <p className="text-2xl">{count}</p>
                  <p className="text-xs text-gray-400">{subtext}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )
    }

    if (widget.widget_key === 'latest_jobs' && canViewJobs) {
      return (
        <>
          {widgetHeader(widget, 'Latest job records from the dashboard surface.')}

          <div className={bodyClass}>
            {latestJobs.length === 0 ? (
              <p className="text-sm text-gray-400">No jobs found.</p>
            ) : (
              <div className="space-y-3">
                {latestJobs.map((job) => (
                  <button
                    key={job.job_id}
                    type="button"
                    onClick={() => router.push(`/jobs/${job.job_id}`)}
                    className="dashboard-widget-action w-full rounded border border-gray-800 bg-black p-3 text-left transition hover:border-blue-500"
                  >
                    <p className="break-all font-semibold">
                      {job.internal_work_order_number ?? job.job_id}
                    </p>
                    <p className="text-sm text-gray-400">
                      Stage: {job.internal_status}
                    </p>
                    <p className="text-sm text-gray-400">
                      Created: {formatTimestamp(job.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <div className="pt-4">
              <button
                type="button"
                onClick={() => router.push('/jobs')}
                className="dashboard-widget-action rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 transition hover:border-blue-500 hover:text-white"
              >
                Open Jobs
              </button>
            </div>
          </div>
        </>
      )
    }

    if (widget.widget_key === 'latest_reports' && canViewReports) {
      return (
        <>
          {widgetHeader(widget, 'Latest third-party report records.')}

          <div className={bodyClass}>
            {latestReports.length === 0 ? (
              <p className="text-sm text-gray-400">No reports found.</p>
            ) : (
              <div className="space-y-3">
                {latestReports.map((report) => (
                  <button
                    key={report.report_id}
                    type="button"
                    onClick={() => router.push('/reports')}
                    className="dashboard-widget-action w-full rounded border border-gray-800 bg-black p-3 text-left transition hover:border-blue-500"
                  >
                    <p className="break-all font-semibold">{report.report_id}</p>
                    <p className="break-all text-sm text-gray-400">
                      File: {report.report_file_url}
                    </p>
                    <p className="text-sm text-gray-400">
                      Source: {report.submission_source}
                    </p>
                    <p className="text-sm text-gray-400">
                      Created: {formatTimestamp(report.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <div className="pt-4">
              <button
                type="button"
                onClick={() => router.push('/reports')}
                className="dashboard-widget-action rounded border border-gray-700 bg-black px-4 py-2 text-sm text-gray-200 transition hover:border-blue-500 hover:text-white"
              >
                Open Reports
              </button>
            </div>
          </div>
        </>
      )
    }

    return null
  }

  if (loading) {
    return <main className="p-6">Loading dashboard...</main>
  }

  if (!canViewDashboard) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        <div className="rounded border border-red-700 bg-red-950 p-4 text-red-300">
          You do not have permission to view the dashboard.
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section className="space-y-3 rounded border border-gray-800 bg-gray-900 p-4">
        <div className="flex w-full items-center gap-2">
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void submitGlobalSearch()
              }
            }}
            placeholder="Search jobs, customers, tools, reports..."
            className="min-w-0 flex-1 rounded border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          />

          <button
            type="button"
            onClick={() => void submitGlobalSearch()}
            disabled={searching}
            className="shrink-0 rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {activeSearch ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Search active: {activeSearch}</span>
            <button
              type="button"
              onClick={clearGlobalSearch}
              className="rounded border border-gray-700 px-2 py-1 text-gray-300 hover:border-gray-500 hover:text-white"
            >
              Clear
            </button>
          </div>
        ) : null}

        {searchError ? (
          <div className="break-words rounded border border-red-700 bg-red-950 p-3 text-sm text-red-300">
            {searchError}
          </div>
        ) : null}

        {activeSearch ? (
          <div className="rounded border border-gray-800 bg-black">
            <div className="border-b border-gray-800 px-4 py-2">
              <p className="text-sm font-semibold">Search Results</p>
              <p className="text-xs text-gray-400">
                Showing {searchResults.length} permission-scoped results.
              </p>
            </div>

            {searchResults.length === 0 ? (
              <div className="p-4 text-sm text-gray-400">No results found.</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {searchResults.map((result) => (
                  <button
                    key={`${result.result_domain}-${result.result_id}-${result.route}`}
                    type="button"
                    onClick={() => router.push(result.route)}
                    className="block w-full border-b border-gray-800 px-4 py-3 text-left hover:bg-gray-800/70"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-blue-950 px-2 py-1 text-xs text-blue-200">
                        {result.result_label}
                      </span>
                      <span className="font-semibold">{result.title}</span>
                    </div>

                    {result.subtitle ? (
                      <p className="mt-1 text-xs text-gray-400">
                        {result.subtitle}
                      </p>
                    ) : null}

                    <p className="mt-1 text-xs text-gray-600">{result.route}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="break-words rounded border border-red-700 bg-red-950 p-3 text-red-300">
          {error}
        </div>
      ) : null}

      {canManageDashboard && hiddenWidgets.length > 0 ? (
        <section className="space-y-3 rounded border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Hidden Widgets</h2>

            <button
              type="button"
              onClick={() => setShowHiddenWidgets(!showHiddenWidgets)}
              className="rounded bg-gray-700 px-4 py-2 text-white transition hover:bg-gray-600"
            >
              {showHiddenWidgets ? 'Hide List' : 'Show Hidden'}
            </button>
          </div>

          {showHiddenWidgets ? (
            <div className="flex flex-wrap gap-3">
              {hiddenWidgets.map((widget) => (
                <button
                  key={widget.widget_key}
                  type="button"
                  onClick={() => void updateWidgetVisibility(widget, true)}
                  disabled={workingWidgetKey === widget.widget_key}
                  className="rounded border border-gray-700 bg-black px-4 py-2 text-sm transition hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {workingWidgetKey === widget.widget_key
                    ? 'Restoring...'
                    : `Restore ${widget.title}`}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {visibleWidgets.length === 0 ? (
        <section className="rounded border border-gray-800 bg-gray-900 p-6 text-gray-300">
          No dashboard widgets are currently visible.
        </section>
      ) : (
        <div
          ref={containerRef}
          className={`dashboard-grid${canManageDashboard ? ' can-manage' : ''}`}
        >
          {mounted ? (
            <Responsive
              width={width}
              layouts={layouts}
              breakpoints={BREAKPOINTS}
              cols={BREAKPOINT_COLS}
              rowHeight={GRID_ROW_HEIGHT}
              margin={GRID_MARGIN}
              containerPadding={GRID_PADDING}
              autoSize
              compactor={noCompactor}
              dragConfig={{
                enabled: canManageDashboard && !savingLayout,
                bounded: false,
                handle: '.dashboard-drag-handle',
                cancel: '.dashboard-widget-action',
                threshold: 4,
              }}
              resizeConfig={{
                enabled: canManageDashboard && !savingLayout,
                handles: ['nw', 'ne', 'sw', 'se'],
              }}
              onBreakpointChange={(nextBreakpoint) => {
                setCurrentBreakpoint(nextBreakpoint as DashboardBreakpoint)
              }}
              onLayoutChange={(currentLayout, nextLayouts) => {
                setLayouts(nextLayouts as ResponsiveLayouts<DashboardBreakpoint>)
              }}
              onDragStop={(currentLayout) => {
                if (!canManageDashboard) return
                void persistCanonicalLayout(currentLayout)
              }}
              onResizeStop={(currentLayout) => {
                if (!canManageDashboard) return
                void persistCanonicalLayout(currentLayout)
              }}
            >
              {visibleWidgets.map((widget) => (
                <section
                  key={widget.widget_key}
                  className={`dashboard-grid-item relative flex h-full w-full min-h-0 flex-col overflow-hidden rounded border border-gray-800 bg-gray-900 text-white shadow-sm ${
                    widget.widget_key === 'admin_compliance_flags'
                      ? 'border-yellow-800 bg-yellow-950/30'
                      : ''
                  }`}
                >
                  {renderWidgetContents(widget)}
                </section>
              ))}
            </Responsive>
          ) : null}
        </div>
      )}

      <style jsx global>{`
        .dashboard-grid .react-grid-layout {
          min-height: 720px;
        }

        .dashboard-grid .react-grid-item.dashboard-grid-item {
          min-height: 0 !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
        }

        .dashboard-grid .react-grid-item.dashboard-grid-item.react-draggable-dragging,
        .dashboard-grid .react-grid-item.dashboard-grid-item.resizing {
          z-index: 40;
        }

        .dashboard-grid .react-grid-item.react-grid-placeholder {
          background: rgba(59, 130, 246, 0.18);
          border: 1px dashed rgba(96, 165, 250, 0.95);
          border-radius: 0.75rem;
          opacity: 1;
        }

        .dashboard-drag-handle {
          touch-action: none;
          user-select: none;
          flex-shrink: 0;
        }

        .dashboard-widget-scroll {
          flex: 1 1 0 !important;
          min-height: 0 !important;
          max-height: 100% !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          scrollbar-width: auto;
          scrollbar-color: #3b82f6 #020617;
          overscroll-behavior: contain;
        }

        .dashboard-widget-scroll::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        .dashboard-widget-scroll::-webkit-scrollbar-track {
          background: #020617;
        }

        .dashboard-widget-scroll::-webkit-scrollbar-thumb {
          background: #3b82f6;
          border-radius: 9999px;
        }

        .dashboard-grid.can-manage
          .react-grid-item.dashboard-grid-item
          > .react-resizable-handle {
          opacity: 0 !important;
          display: block !important;
          visibility: visible !important;
          z-index: 60 !important;
          width: 22px !important;
          height: 22px !important;
          border-radius: 9999px;
          border: 1px solid rgba(191, 219, 254, 0.95);
          background: rgba(37, 99, 235, 0.9);
          transition: opacity 120ms ease;
        }

        .dashboard-grid.can-manage
          .react-grid-item.dashboard-grid-item
          > .react-resizable-handle:hover,
        .dashboard-grid.can-manage
          .react-grid-item.dashboard-grid-item.resizing
          > .react-resizable-handle {
          opacity: 1 !important;
        }

        .dashboard-grid.can-manage
          .react-grid-item.dashboard-grid-item
          > .react-resizable-handle::after {
          width: 8px;
          height: 8px;
          border-right: 2px solid rgba(255, 255, 255, 0.95);
          border-bottom: 2px solid rgba(255, 255, 255, 0.95);
        }

        .dashboard-grid.can-manage .react-resizable-handle-nw {
          left: 3px !important;
          top: 3px !important;
          cursor: nw-resize;
        }

        .dashboard-grid.can-manage .react-resizable-handle-ne {
          right: 3px !important;
          top: 3px !important;
          cursor: ne-resize;
        }

        .dashboard-grid.can-manage .react-resizable-handle-sw {
          left: 3px !important;
          bottom: 3px !important;
          cursor: sw-resize;
        }

        .dashboard-grid.can-manage .react-resizable-handle-se {
          right: 3px !important;
          bottom: 3px !important;
          cursor: se-resize;
        }
      `}</style>
    </main>
  )
}