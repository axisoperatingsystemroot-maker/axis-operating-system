"use client"

import { type ReactNode, useMemo, useRef, useState } from "react"

import styles from "./job-workbench.module.css"

type SummaryItem = {
  label: string
  value: string
  tone?: "neutral" | "info" | "warning"
}

type FeedbackTone = "success" | "warning" | "info"

type FeedbackMessage = {
  tone: FeedbackTone
  text: string
}

type CaptureCheck = {
  id: string
  name: string
  result: "PASS" | "FAIL"
  notes: string
  photos: string
  notesOpen: boolean
  photosOpen: boolean
}

type InspectionResultRow = {
  id: string
  check: string
  result: "PASS" | "FAIL"
  stage: string
  recordedAt: string
  ojt: string
  isCorrection?: boolean
  correctionReason?: string | null
  correctionOfId?: string | null
}

type NoteRow = {
  id: string
  label: string
  time: string
  body: string
}

type HistoryRow = {
  id: string
  time: string
  title: string
  body: string
}

type LedgerCategory =
  | "LABOR"
  | "MATERIAL"
  | "INSPECTION"
  | "STAGE"
  | "COST"
  | "NOTES"
  | "REPORTS"
  | "AI"

type LedgerFilter = "ALL" | LedgerCategory

type LedgerDetailField = {
  label: string
  value: string
}

type LedgerRow = {
  id: string
  time: string
  category: LedgerCategory
  stage: string
  actor: string
  detail: string
  stageTime?: string
  labor?: string
  overtime?: string
  idleWait?: string
  material?: string
  cost?: string
  refNotes?: string
  detailFields?: LedgerDetailField[]
  expandedDetail?: string
}

type InsightTone = "good" | "watch" | "risk" | "info"

type InsightRow = {
  id: string
  time: string
  label: string
  body: string
  tone: InsightTone
}

type StageTimingRow = {
  stage: string
  entered: string
  exited: string | null
  elapsedMinutes: number
  laborHours: number
  overtimeHours: number
  idleMinutes: number
  materialLbs: number
  status: "Complete" | "Active" | "Queued" | "Watch"
}

const availableChecks = [
  "Visual Check",
  "Dimensional Check",
  "Crack Check",
  "Ring Gauge Check",
  "Hard Metal Integrity Check",
  "Bevel Angle Check",
  "NDT MPI",
  "NDT LP",
  "Final QC Check",
  "Customer Required Check",
  "Other",
]

const fakeStageFlow = [
  "PROFILE_GRIND",
  "INTERNAL_QC",
  "THIRD_PARTY_QC",
  "READY_FOR_INVOICE",
] as const

const ledgerFilters: LedgerFilter[] = [
  "ALL",
  "STAGE",
  "LABOR",
  "MATERIAL",
  "INSPECTION",
  "COST",
  "NOTES",
  "REPORTS",
  "AI",
]

const intelligenceEvidence =
  "Evidence: job_stage_history + job_labor_logs + material usage + quote snapshot + inspection results."

const initialSelectedChecks: CaptureCheck[] = [
  {
    id: "capture-visual",
    name: "Visual Check",
    result: "PASS",
    notes: "Surface looks clean after grind finish.",
    photos: "visual-check-1.png",
    notesOpen: false,
    photosOpen: false,
  },
  {
    id: "capture-crack",
    name: "Crack Check",
    result: "PASS",
    notes: "No visible crack propagation on this pass.",
    photos: "crack-check-1.png",
    notesOpen: false,
    photosOpen: false,
  },
  {
    id: "capture-ndt-mpi",
    name: "NDT MPI",
    result: "PASS",
    notes: "MPI sample pass logged.",
    photos: "",
    notesOpen: false,
    photosOpen: false,
  },
]

const initialInspectionResults: InspectionResultRow[] = [
  {
    id: "result-build-visual",
    check: "Visual Check",
    result: "PASS",
    stage: "BUILD",
    recordedAt: "Aug 14, 10:29 PM",
    ojt: "OJT 0",
  },
  {
    id: "result-build-crack",
    check: "Crack Check",
    result: "PASS",
    stage: "BUILD",
    recordedAt: "Aug 14, 10:29 PM",
    ojt: "OJT 0",
  },
  {
    id: "result-initial",
    check: "Initial Inspection",
    result: "PASS",
    stage: "INSPECTION",
    recordedAt: "Aug 14, 6:50 PM",
    ojt: "OJT 0",
  },
]

const initialInternalNotes: NoteRow[] = [
  {
    id: "internal-note-1",
    label: "Private",
    time: "Aug 15, 8:14 AM",
    body: "Operator flagged one area to watch after grind finish. Keep route in PROFILE_GRIND until final check clears.",
  },
]

const initialCustomerNotes: NoteRow[] = [
  {
    id: "customer-note-1",
    label: "Customer Visible",
    time: "Aug 15, 8:20 AM",
    body: "Inspection cycle is active. Current work order remains on track pending final profile confirmation.",
  },
]

const initialHistoryRows: HistoryRow[] = [
  {
    id: "history-1",
    time: "Aug 15, 8:31 AM",
    title: "PROFILE_GRIND batch inspection recorded",
    body: "Visual Check, Crack Check, and NDT MPI were captured in one inspection sitting with signoff requested.",
  },
  {
    id: "history-2",
    time: "Aug 14, 10:29 PM",
    title: "BUILD-stage effective result preserved",
    body: "Visual and Crack checks remain visible as effective rows while older history stays available below.",
  },
]

const initialStageTimingRows: StageTimingRow[] = [
  {
    stage: "INTAKE",
    entered: "Aug 13, 12:20 PM",
    exited: "Aug 13, 2:06 PM",
    elapsedMinutes: 106,
    laborHours: 0.8,
    overtimeHours: 0,
    idleMinutes: 58,
    materialLbs: 0,
    status: "Complete",
  },
  {
    stage: "INSPECTION",
    entered: "Aug 13, 2:06 PM",
    exited: "Aug 14, 6:50 PM",
    elapsedMinutes: 284,
    laborHours: 1.3,
    overtimeHours: 0,
    idleMinutes: 206,
    materialLbs: 0,
    status: "Complete",
  },
  {
    stage: "BUILD",
    entered: "Aug 14, 6:50 PM",
    exited: "Aug 14, 9:05 PM",
    elapsedMinutes: 135,
    laborHours: 1.9,
    overtimeHours: 0,
    idleMinutes: 21,
    materialLbs: 7.6,
    status: "Complete",
  },
  {
    stage: "PROFILE_GRIND",
    entered: "Aug 15, 6:04 AM",
    exited: null,
    elapsedMinutes: 192,
    laborHours: 1.4,
    overtimeHours: 0.5,
    idleMinutes: 108,
    materialLbs: 0,
    status: "Watch",
  },
]

const initialIntelligenceRows: InsightRow[] = [
  {
    id: "insight-1",
    time: "Aug 15, 8:06 AM",
    label: "Wait time high in PROFILE_GRIND",
    body: "PROFILE_GRIND is carrying 1h 48m idle/wait against 1.4h hands-on labor. Queue delay is larger than direct touch time.",
    tone: "watch",
  },
  {
    id: "insight-2",
    time: "Aug 15, 8:08 AM",
    label: "OT Watch on Marcus",
    body: "Marcus has 0.5h overtime active on this stage with an immediate +$22 labor impact. Projected margin drifted from 42% toward 39%.",
    tone: "watch",
  },
  {
    id: "insight-3",
    time: "Aug 15, 8:10 AM",
    label: "Quote learning signal detected",
    body: "Actual labor on similar tools is trending about 18% above quote. Review scheduling before changing the quote model.",
    tone: "info",
  },
  {
    id: "insight-4",
    time: "Aug 15, 8:13 AM",
    label: "Owner approval required",
    body: "AOS Intelligence can flag variance and recommend action, but it must not silently change pricing or quoting assumptions.",
    tone: "risk",
  },
]

const initialLedgerRows: LedgerRow[] = [
  {
    id: "ledger-stage-start-1",
    time: "Aug 15, 6:04 AM",
    category: "STAGE",
    stage: "PROFILE_GRIND",
    actor: "System",
    detail: "Stage start recorded",
    stageTime: "3h12m",
    labor: "1.4h",
    overtime: "0.5h",
    idleWait: "1h48m",
    refNotes: "Entered",
    detailFields: [
      detailField("Stage", "PROFILE_GRIND"),
      detailField("Entered", "Aug 15, 6:04 AM"),
      detailField("Exited", "Active"),
      detailField("Elapsed", "3h12m"),
      detailField("Actual Labor", "1.4h"),
      detailField("Overtime", "0.5h"),
      detailField("Idle / Wait", "1h48m"),
      detailField("Material Used", "0.0 lb"),
      detailField("Delay Reason", "Queue delay larger than hands-on time"),
      detailField("Previous Stage", "BUILD"),
      detailField("Next Stage", "INTERNAL_QC"),
      detailField("Stage Status", "Watch"),
    ],
    expandedDetail: "PROFILE_GRIND became the active queue stage for Job AOS-000020.",
  },
  {
    id: "ledger-labor-start-1",
    time: "Aug 15, 6:12 AM",
    category: "LABOR",
    stage: "PROFILE_GRIND",
    actor: "Marcus",
    detail: "Work session started",
    refNotes: "Labor start",
    detailFields: [
      detailField("Employee", "Marcus"),
      detailField("Action", "Profile grind start"),
      detailField("Stage", "PROFILE_GRIND"),
      detailField("Start", "Aug 15, 6:12 AM"),
      detailField("Stop", "Active"),
      detailField("Regular Labor", "0.0h"),
      detailField("Overtime", "0.0h"),
      detailField("Labor Rate Basis", "Shop floor standard"),
      detailField("Labor Cost Impact", "$0"),
      detailField("OJT", "0h"),
      detailField("Rework", "No"),
      detailField("Notes", "Work session opened from the control panel."),
    ],
    expandedDetail: "Marcus started the current grind session from the floor control panel.",
  },
  {
    id: "ledger-build-material-1",
    time: "Aug 14, 8:36 PM",
    category: "MATERIAL",
    stage: "BUILD",
    actor: "Edil",
    detail: "Steel build-up material used",
    labor: "2.7h",
    material: "7.6 lb steel",
    cost: "+$180",
    refNotes: "Build-up",
    detailFields: [
      detailField("Material Category", "Build-up steel"),
      detailField("Material Type", "Steel rod / build-up wire"),
      detailField("Lot Number", "STL-26-118"),
      detailField("Heat Number", "H4140-7721"),
      detailField("Supplier / Source", "Rack B inventory"),
      detailField("Quantity Used", "7.6 lb"),
      detailField("Unit Cost", "$23.68/lb"),
      detailField("Extended Cost", "$180"),
      detailField("Inventory Source", "Rack B / Lot STL-26-118"),
      detailField("Waste", "0.4 lb"),
      detailField("COC / Cert", "Mill cert on file"),
      detailField("Notes", "Structural build-up on worn blade lands."),
    ],
    expandedDetail: "Steel build-up cycle logged with labor and material weight visible in separate ERP columns.",
  },
  {
    id: "ledger-hardmetal-labor-1",
    time: "Aug 14, 4:18 PM",
    category: "LABOR",
    stage: "HARD_METAL",
    actor: "Carlos",
    detail: "Hard metal application",
    labor: "2.4h",
    material: "4.2 lb HM",
    cost: "+$420",
    refNotes: "Application pass",
    detailFields: [
      detailField("Employee", "Carlos"),
      detailField("Action", "Hard metal application"),
      detailField("Stage", "HARD_METAL"),
      detailField("Regular Labor", "2.4h"),
      detailField("Overtime", "0.0h"),
      detailField("Material Category", "Hard metal"),
      detailField("Material Type", "D0-11 tungsten carbide"),
      detailField("Lot Number", "HM-D011-086"),
      detailField("Batch / COC", "COC-D011-2026-447"),
      detailField("Quantity", "4.2 lb"),
      detailField("Unit Cost", "$100/lb"),
      detailField("Extended Cost", "$420"),
      detailField("Application Process", "PTA"),
      detailField("WPS Reference", "WPS-HM-PTA-01"),
      detailField("Notes", "Hard metal application pass."),
    ],
    expandedDetail: "Hard metal application row shows labor time and HM weight independently instead of collapsing them into one blob.",
  },
  {
    id: "ledger-labor-1",
    time: "Aug 15, 7:12 AM",
    category: "LABOR",
    stage: "PROFILE_GRIND",
    actor: "Marcus",
    detail: "Profile grind pass",
    labor: "1.5h",
    cost: "+$45",
    detailFields: [
      detailField("Employee", "Marcus"),
      detailField("Action", "Profile grind pass"),
      detailField("Stage", "PROFILE_GRIND"),
      detailField("Start", "Aug 15, 6:12 AM"),
      detailField("Stop", "Aug 15, 7:12 AM"),
      detailField("Regular Labor", "1.5h"),
      detailField("Overtime", "0h"),
      detailField("Labor Rate Basis", "Standard grind rate"),
      detailField("Labor Cost Impact", "+$45"),
      detailField("OJT", "0h"),
      detailField("Rework", "No"),
      detailField("Notes", "Profile grind pass before ring gauge verification."),
    ],
    expandedDetail: "Rough-to-finish grind pass logged for preview costing.",
  },
  {
    id: "ledger-ot-1",
    time: "Aug 15, 7:46 AM",
    category: "LABOR",
    stage: "PROFILE_GRIND",
    actor: "Marcus",
    detail: "Overtime labor captured",
    overtime: "0.5h",
    cost: "Margin 42% -> 39%",
    refNotes: "OT watch",
    detailFields: [
      detailField("Employee", "Marcus"),
      detailField("OT Hours", "0.5h"),
      detailField("Multiplier", "1.5x"),
      detailField("Regular Rate Basis", "Standard grind rate"),
      detailField("OT Cost Impact", "+$22"),
      detailField("Projected Margin Before", "42%"),
      detailField("Projected Margin After", "39%"),
      detailField("Status", "OT Watch"),
      detailField("AI / Cost Warning", "Overtime is compressing margin."),
    ],
    expandedDetail: "Labor multiplier moved to 1.5x for the last portion of the grind pass.",
  },
  {
    id: "ledger-material-1",
    time: "Aug 14, 3:42 PM",
    category: "MATERIAL",
    stage: "HARD_METAL",
    actor: "Edil",
    detail: "D0-11 hard metal used",
    material: "4.2 lb HM",
    cost: "+$420",
    refNotes: "Consumable",
    detailFields: [
      detailField("Material Category", "Hard metal"),
      detailField("Material Type", "D0-11 tungsten carbide"),
      detailField("Lot Number", "HM-D011-086"),
      detailField("Heat / Batch", "Batch HM-2026-086"),
      detailField("Supplier / Source", "Axis alloy cage"),
      detailField("Quantity Used", "4.2 lb"),
      detailField("Unit Cost", "$100/lb"),
      detailField("Extended Cost", "$420"),
      detailField("Inventory Lot Ref", "Cage 4 / HM-D011-086"),
      detailField("COC / Cert Ref", "COC-D011-2026-447"),
      detailField("Application Process", "PTA"),
      detailField("Notes", "Consumable allocation for hard metal pass."),
    ],
    expandedDetail: "Consumable allocation applied to hard metal build-up cycle.",
  },
  {
    id: "ledger-inspection-1",
    time: "Aug 14, 10:29 PM",
    category: "INSPECTION",
    stage: "PROFILE_GRIND",
    actor: "Marcus",
    detail: "Ring Gauge Check PASS",
    refNotes: "PASS | 2 photos",
    detailFields: [
      detailField("Inspection Check", "Ring Gauge Check"),
      detailField("Result", "PASS"),
      detailField("Stage At Time", "PROFILE_GRIND"),
      detailField("Inspector", "Marcus"),
      detailField("Inspection Session", "PG-SESSION-2026-08-15-01"),
      detailField("Photos Count", "2"),
      detailField("Photo Refs", "rg-001.jpg, rg-002.jpg"),
      detailField("Notes", "Gauge pass confirmed after grind finish."),
      detailField("Requires Signoff", "No"),
      detailField("Signed Off By", "-"),
      detailField("OJT Hours", "0h"),
      detailField("Related Labor", "Profile grind pass"),
    ],
    expandedDetail: "Inspection pass captured with linked visual evidence.",
  },
  {
    id: "ledger-stage-1",
    time: "Aug 14, 9:05 PM",
    category: "STAGE",
    stage: "BUILD → HARD_METAL",
    actor: "System",
    detail: "Stage advanced",
    stageTime: "2h15m",
    labor: "1.9h",
    idleWait: "0h21m",
    refNotes: "Auto route",
    detailFields: [
      detailField("Stage", "BUILD"),
      detailField("Entered", "Aug 14, 6:50 PM"),
      detailField("Exited", "Aug 14, 9:05 PM"),
      detailField("Elapsed", "2h15m"),
      detailField("Actual Labor", "1.9h"),
      detailField("Overtime", "0h"),
      detailField("Idle / Wait", "0h21m"),
      detailField("Material Used", "7.6 lb"),
      detailField("Delay Reason", "None"),
      detailField("Previous Stage", "INSPECTION"),
      detailField("Next Stage", "HARD_METAL"),
      detailField("Stage Status", "Complete"),
    ],
    expandedDetail: "Preview stage move recorded by the operating queue.",
  },
  {
    id: "ledger-note-1",
    time: "Aug 14, 7:58 PM",
    category: "NOTES",
    stage: "INTERNAL",
    actor: "Marcus",
    detail: "Watch transition shoulder",
    refNotes: "Internal note",
    detailFields: [
      detailField("Note Visibility", "Internal / private"),
      detailField("Author", "Marcus"),
      detailField("Created", "Aug 14, 7:58 PM"),
      detailField("Customer Visible", "No"),
      detailField("Linked Stage", "PROFILE_GRIND"),
      detailField("Note Text", "Watch transition shoulder"),
    ],
    expandedDetail: "Operator note captured for the next inspection pass.",
  },
  {
    id: "ledger-note-2",
    time: "Aug 15, 8:20 AM",
    category: "NOTES",
    stage: "CUSTOMER",
    actor: "Axis Ops",
    detail: "Inspection cycle is active",
    refNotes: "Customer note",
    detailFields: [
      detailField("Note Visibility", "Customer-facing"),
      detailField("Author", "Axis Ops"),
      detailField("Created", "Aug 15, 8:20 AM"),
      detailField("Customer Visible", "Yes"),
      detailField("Linked Stage", "PROFILE_GRIND"),
      detailField("Note Text", "Inspection cycle is active"),
    ],
    expandedDetail: "Customer-facing status note published locally for the preview.",
  },
  {
    id: "ledger-report-1",
    time: "Aug 14, 8:11 PM",
    category: "REPORTS",
    stage: "THIRD_PARTY_QC",
    actor: "System",
    detail: "TP-2026-447 linked",
    refNotes: "TP-2026-447",
    detailFields: [
      detailField("Report ID", "TP-2026-447"),
      detailField("Source", "EMAIL_INGEST"),
      detailField("Linked Job", "AOS-000020"),
      detailField("Verified", "Yes"),
      detailField("Verified By", "Axis Ops"),
      detailField("Verified At", "Aug 14, 8:11 PM"),
      detailField("Assignment Status", "Complete"),
      detailField("File Ref", "third-party-reports/tp-2026-447.pdf"),
    ],
    expandedDetail: "Third-party report reference attached to the preview job.",
  },
  {
    id: "ledger-qc-1",
    time: "Aug 15, 8:24 AM",
    category: "REPORTS",
    stage: "INTERNAL_QC",
    actor: "System",
    detail: "Pass Pending Confirm",
    refNotes: "QC pending confirm",
    detailFields: [
      detailField("Report ID", "QC-INTERNAL-2026-0815"),
      detailField("Source", "INTERNAL_QC"),
      detailField("Linked Job", "AOS-000020"),
      detailField("Verified", "Pending"),
      detailField("Verified By", "Unassigned"),
      detailField("Verified At", "-"),
      detailField("Assignment Status", "Pending confirm"),
      detailField("File Ref", "internal-qc/pending-confirm"),
    ],
    expandedDetail: "Internal QC posture updated locally without any workflow mutation.",
  },
  {
    id: "ledger-cost-1",
    time: "Aug 15, 8:26 AM",
    category: "COST",
    stage: "PROFILE_GRIND",
    actor: "System",
    detail: "Cost snapshot recalculated",
    cost: "Variance -7.4%, Margin 42%",
    refNotes: "Recalc",
    detailFields: [
      detailField("Expected Cost", "$1,420"),
      detailField("Actual Cost", "$1,315"),
      detailField("Projected Final", "$1,510"),
      detailField("Variance", "-7.4%"),
      detailField("Margin Before", "42%"),
      detailField("Margin After", "42%"),
      detailField("Labor Impact", "+$45"),
      detailField("Material Impact", "+$420"),
      detailField("OT Impact", "+$22"),
      detailField("Evidence Source", "labor logs + material logs + quote snapshot"),
    ],
    expandedDetail: "Actual and projected job cost moved after labor and OT deltas were applied in preview mode.",
  },
  {
    id: "ledger-ai-1",
    time: "Aug 15, 8:28 AM",
    category: "AI",
    stage: "PROFILE_GRIND",
    actor: "AOS Intelligence",
    detail: "Queue delay larger than hands-on time",
    refNotes: "Watch | Idle > hands-on labor",
    detailFields: [
      detailField("AI Finding", "Queue delay larger than hands-on time"),
      detailField("Classification", "Idle / wait delay"),
      detailField("Evidence", "stage elapsed 3h12m vs labor 1.4h"),
      detailField("Recommendation", "Review scheduling before changing quote model"),
      detailField("Confidence", "86%"),
      detailField("Owner Approval Required", "Yes for pricing/model changes"),
    ],
    expandedDetail:
      "PROFILE_GRIND is trending as a queue bottleneck more than a direct labor overrun. Review scheduling before quote model changes.",
  },
]

function toneClass(tone?: SummaryItem["tone"]) {
  if (tone === "info") return styles.summaryCellInfo
  if (tone === "warning") return styles.summaryCellWarning
  return ""
}

function statusClass(result: "PASS" | "FAIL") {
  return result === "PASS" ? styles.statusPass : styles.statusPending
}

function timingStatusClass(status: StageTimingRow["status"]) {
  if (status === "Complete") return styles.metricHealthy
  if (status === "Active") return styles.timingActive
  if (status === "Queued") return styles.timingQueued
  if (status === "Watch") return styles.metricWatch
  return styles.metricRisk
}

function intelligenceToneClass(tone: InsightTone) {
  if (tone === "good") return styles.intelligenceToneGood
  if (tone === "risk") return styles.intelligenceToneRisk
  if (tone === "watch") return styles.intelligenceToneWatch
  return styles.intelligenceToneInfo
}

function formatMockTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
}

function formatHours(value: number) {
  return `${value.toFixed(1)}h`
}

function formatWeight(value: number) {
  return `${value.toFixed(1)} lb`
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes.toString().padStart(2, "0")}m`
}

function deriveMarginStatus(margin: number, overtime: number) {
  if (margin < 36 || overtime >= 2.6) return "Risk"
  if (margin < 43 || overtime >= 1.5) return "Watch"
  return "Healthy"
}

function detailField(label: string, value: string): LedgerDetailField {
  return { label, value }
}

function makeCheckRow(name: string): CaptureCheck {
  return {
    id: `capture-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    result: "PASS",
    notes: "",
    photos: "",
    notesOpen: false,
    photosOpen: false,
  }
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>{title}</h2>
          {subtitle ? <p className={styles.panelSubtitle}>{subtitle}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  )
}

function UtilityPanel({
  title,
  label,
  defaultOpen = true,
  children,
}: {
  title: string
  label?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details open={defaultOpen} className={styles.utilityPanel}>
      <summary className={styles.utilitySummary}>
        <div className={styles.utilitySummaryLeft}>
          <h3 className={styles.utilityTitle}>{title}</h3>
          {label ? <span className={styles.utilityBadge}>{label}</span> : null}
        </div>
        <span className={styles.utilityChevron}>
          {defaultOpen ? "Active" : "Collapsed"}
        </span>
      </summary>
      <div className={styles.utilityBody}>{children}</div>
    </details>
  )
}

export default function JobWorkbenchPreviewPage() {
  const captureRef = useRef<HTMLDivElement | null>(null)
  const currentStageIndex = fakeStageFlow.indexOf("PROFILE_GRIND")

  const [currentStage, setCurrentStage] = useState<(typeof fakeStageFlow)[number]>(
    fakeStageFlow[currentStageIndex]
  )
  const [qcStatus, setQcStatus] = useState("Pending")
  const [inspectionStatus, setInspectionStatus] = useState("Active")
  const [routingPosture, setRoutingPosture] = useState("Awaiting Release")
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null)

  const [captureOpen, setCaptureOpen] = useState(true)
  const [checklistOpen, setChecklistOpen] = useState(true)
  const [captureChecks, setCaptureChecks] = useState<CaptureCheck[]>(
    initialSelectedChecks
  )
  const [ojtHours, setOjtHours] = useState("0.5")
  const [requiresSignoff, setRequiresSignoff] = useState(true)

  const [inspectionResults, setInspectionResults] = useState<InspectionResultRow[]>(
    initialInspectionResults
  )
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>(initialHistoryRows)

  const [activeCorrectionId, setActiveCorrectionId] = useState<string | null>(null)
  const [correctionResult, setCorrectionResult] = useState<"PASS" | "FAIL">("PASS")
  const [correctionReason, setCorrectionReason] = useState("")

  const [internalNotes, setInternalNotes] = useState<NoteRow[]>(initialInternalNotes)
  const [customerNotes, setCustomerNotes] = useState<NoteRow[]>(initialCustomerNotes)
  const [newInternalNote, setNewInternalNote] = useState("")
  const [newCustomerNote, setNewCustomerNote] = useState("")

  const [reportLinked, setReportLinked] = useState(true)
  const [verifiedUploadReady, setVerifiedUploadReady] = useState(true)
  const [reportStatus, setReportStatus] = useState("Linked report present")

  const [qcPanelStatus, setQcPanelStatus] = useState("Internal QC pending")
  const [thirdPartyStatus, setThirdPartyStatus] = useState("Third-party not engaged")

  const [routeOpen, setRouteOpen] = useState(false)
  const [routeTarget, setRouteTarget] = useState("INTERNAL_QC")
  const [routeReason, setRouteReason] = useState("")

  const [laborActive, setLaborActive] = useState(false)
  const [laborHours, setLaborHours] = useState(14.5)
  const [quotedLaborHours] = useState(18)
  const [overtimeHours, setOvertimeHours] = useState(2)
  const [materialLbs, setMaterialLbs] = useState(22.8)
  const [quotedMaterialLbs] = useState(25)
  const [expectedCost] = useState(1420)
  const [actualCost, setActualCost] = useState(1315)
  const [projectedFinalCost, setProjectedFinalCost] = useState(1510)
  const [profit, setProfit] = useState(1090)
  const [marginPercent, setMarginPercent] = useState(42)
  const [marginStatus, setMarginStatus] = useState("Watch")
  const [stageTimingRows, setStageTimingRows] =
    useState<StageTimingRow[]>(initialStageTimingRows)
  const [intelligenceRows, setIntelligenceRows] =
    useState<InsightRow[]>(initialIntelligenceRows)
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("ALL")
  const [expandedLedgerId, setExpandedLedgerId] = useState<string | null>(null)
  const [showStageRollupDetails, setShowStageRollupDetails] = useState(false)
  const [executionLedger, setExecutionLedger] =
    useState<LedgerRow[]>(initialLedgerRows)

  const summaryItems = useMemo<SummaryItem[]>(
    () => [
      { label: "Customer", value: "Test Customer" },
      { label: "Serial", value: "785522" },
      { label: "Customer WO", value: "789398" },
      { label: "Current Stage", value: currentStage, tone: "warning" },
      { label: "QC Status", value: qcStatus, tone: "warning" },
      { label: "Created", value: "Aug 13, 2026, 12:20 PM" },
    ],
    [currentStage, qcStatus]
  )

  const variancePercent = useMemo(() => {
    const variance = ((actualCost - expectedCost) / expectedCost) * 100
    return formatPercent(variance)
  }, [actualCost, expectedCost])

  const overtimeImpact = useMemo(() => Math.round(overtimeHours * 43), [overtimeHours])

  const marginAfterOvertime = useMemo(
    () => Math.max(marginPercent - overtimeHours * 2, 0),
    [marginPercent, overtimeHours]
  )

  const filteredLedgerRows = useMemo(() => {
    if (ledgerFilter === "ALL") {
      return executionLedger
    }

    return executionLedger.filter((row) => row.category === ledgerFilter)
  }, [executionLedger, ledgerFilter])

  const currentStageTiming = useMemo(
    () =>
      stageTimingRows.find((row) => row.stage === currentStage) ??
      stageTimingRows[stageTimingRows.length - 1],
    [currentStage, stageTimingRows]
  )

  const appendLedgerRow = (row: Omit<LedgerRow, "id">) => {
    setExecutionLedger((current) => [
      {
        ...row,
        id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
      ...current,
    ])
  }

  const addIntelligence = ({
    label,
    body,
    tone,
    stage = currentStage,
    refNotes = "Insight",
    detailFields,
  }: {
    label: string
    body: string
    tone: InsightTone
    stage?: string
    refNotes?: string
    detailFields?: LedgerDetailField[]
  }) => {
    const time = formatMockTimestamp()

    setIntelligenceRows((current) => [
      {
        id: `insight-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time,
        label,
        body,
        tone,
      },
      ...current,
    ].slice(0, 6))

    appendLedgerRow({
      time,
      category: "AI",
      stage,
      actor: "AOS Intelligence",
      detail: label,
      refNotes,
      detailFields,
      expandedDetail: `${body} ${intelligenceEvidence}`,
    })
  }

  const updateStageTimingRow = (
    stageName: string,
    updater: (row: StageTimingRow) => StageTimingRow
  ) => {
    setStageTimingRows((current) =>
      current.map((row) => (row.stage === stageName ? updater(row) : row))
    )
  }

  const ensureStageTimingRow = (stageName: string, enteredAt: string) => {
    setStageTimingRows((current) => {
      if (current.some((row) => row.stage === stageName)) {
        return current.map((row) =>
          row.stage === stageName && row.exited
            ? { ...row, exited: null, status: "Active" }
            : row
        )
      }

      return [
        ...current,
        {
          stage: stageName,
          entered: enteredAt,
          exited: null,
          elapsedMinutes: 0,
          laborHours: 0,
          overtimeHours: 0,
          idleMinutes: 0,
          materialLbs: 0,
          status: "Active",
        },
      ]
    })
  }

  const formatStageImpact = (row?: StageTimingRow | null) => {
    if (!row) {
      return "Elapsed -- | Labor -- | OT -- | Wait --"
    }

    return `Elapsed ${formatDuration(row.elapsedMinutes)} | Labor ${formatHours(
      row.laborHours
    )} | OT ${formatHours(row.overtimeHours)} | Wait ${formatDuration(
      row.idleMinutes
    )}`
  }

  const stageTimingCells = (row?: StageTimingRow | null) => {
    if (!row) {
      return {
        stageTime: "-",
        labor: "-",
        overtime: "-",
        idleWait: "-",
        material: "-",
      }
    }

    return {
      stageTime: formatDuration(row.elapsedMinutes),
      labor: formatHours(row.laborHours),
      overtime: row.overtimeHours > 0 ? formatHours(row.overtimeHours) : "-",
      idleWait: formatDuration(row.idleMinutes),
      material: row.materialLbs > 0 ? formatWeight(row.materialLbs) : "-",
    }
  }

  const applyOperationalDelta = ({
    laborDelta = 0,
    overtimeDelta = 0,
    materialDelta = 0,
    actualCostDelta = 0,
    projectedCostDelta = 0,
    profitDelta = 0,
    marginDelta = 0,
  }: {
    laborDelta?: number
    overtimeDelta?: number
    materialDelta?: number
    actualCostDelta?: number
    projectedCostDelta?: number
    profitDelta?: number
    marginDelta?: number
  }) => {
    const nextLabor = Number((laborHours + laborDelta).toFixed(1))
    const nextOvertime = Number((overtimeHours + overtimeDelta).toFixed(1))
    const nextMaterial = Number((materialLbs + materialDelta).toFixed(1))
    const nextActualCost = Number((actualCost + actualCostDelta).toFixed(0))
    const nextProjectedFinalCost = Number(
      (projectedFinalCost + projectedCostDelta).toFixed(0)
    )
    const nextProfit = Number((profit + profitDelta).toFixed(0))
    const nextMargin = Number((marginPercent + marginDelta).toFixed(1))

    setLaborHours(nextLabor)
    setOvertimeHours(nextOvertime)
    setMaterialLbs(nextMaterial)
    setActualCost(nextActualCost)
    setProjectedFinalCost(nextProjectedFinalCost)
    setProfit(nextProfit)
    setMarginPercent(nextMargin)
    setMarginStatus(deriveMarginStatus(nextMargin, nextOvertime))
  }

  const openCapture = (message?: string) => {
    setCaptureOpen(true)
    setChecklistOpen(true)
    setInspectionStatus("Active")
    if (message) {
      setFeedback({ tone: "info", text: message })
    }
    captureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const resetCaptureSession = (message?: string) => {
    setCaptureChecks([])
    setChecklistOpen(true)
    setCaptureOpen(true)
    setOjtHours("0.5")
    setRequiresSignoff(false)
    setInspectionStatus("Active")
    if (message) {
      setFeedback({ tone: "info", text: message })
    }
    captureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const toggleCheckSelection = (name: string) => {
    setCaptureChecks((current) => {
      const existing = current.find((check) => check.name === name)

      if (existing) {
        return current.filter((check) => check.name !== name)
      }

      return [...current, makeCheckRow(name)]
    })
  }

  const updateCheck = (
    id: string,
    changes: Partial<CaptureCheck> | ((current: CaptureCheck) => Partial<CaptureCheck>)
  ) => {
    setCaptureChecks((current) =>
      current.map((check) => {
        if (check.id !== id) return check
        const nextChanges =
          typeof changes === "function" ? changes(check) : changes
        return { ...check, ...nextChanges }
      })
    )
  }

  const handleStartWork = () => {
    if (laborActive) {
      setFeedback({
        tone: "warning",
        text: "Mock labor session is already active for Marcus.",
      })
      return
    }

    const time = formatMockTimestamp()
    setLaborActive(true)
    setRoutingPosture("Work session active")
    appendLedgerRow({
      time,
      category: "LABOR",
      stage: currentStage,
      actor: "Marcus",
      detail: "Work session started",
      ...stageTimingCells(currentStageTiming),
      refNotes: "Labor start",
      detailFields: [
        detailField("Employee", "Marcus"),
        detailField("Action", "Start work"),
        detailField("Stage", currentStage),
        detailField("Start", time),
        detailField("Stop", "Active"),
        detailField("Regular Labor", "0.0h"),
        detailField("Overtime", "0.0h"),
        detailField("Labor Rate Basis", "Shop floor standard"),
        detailField("Labor Cost Impact", "$0"),
        detailField("OJT", "0h"),
        detailField("Rework", "No"),
        detailField("Notes", "Work session opened from labor controls."),
      ],
      expandedDetail:
        "Mock labor start captured locally with employee, job, stage, and action context.",
    })
    addIntelligence({
      label: "Labor session opened",
      body: `Marcus started Profile Grind on ${currentStage}. AOS is now watching elapsed time, OT drift, and cost impact in preview mode.`,
      tone: "info",
      refNotes: "Labor start",
      detailFields: [
        detailField("AI Finding", "Labor session opened"),
        detailField("Classification", "Operational start"),
        detailField("Evidence", `employee Marcus entered ${currentStage}`),
        detailField("Recommendation", "Monitor elapsed vs labor before pricing changes"),
        detailField("Confidence", "82%"),
        detailField("Owner Approval Required", "Yes for pricing/model changes"),
      ],
    })
    setFeedback({
      tone: "info",
      text: "Mock labor session started for Marcus.",
    })
  }

  const handleStopWork = () => {
    if (!laborActive) {
      setFeedback({
        tone: "warning",
        text: "Start Work before logging a stop event in the preview controls.",
      })
      return
    }

    const time = formatMockTimestamp()
    const nextMargin = Number((marginPercent - 1.2).toFixed(1))
    setLaborActive(false)
    setRoutingPosture("Labor pass logged")
    setInspectionStatus("Active")
    updateStageTimingRow(currentStage, (row) => ({
      ...row,
      elapsedMinutes: row.elapsedMinutes + 66,
      laborHours: Number((row.laborHours + 1.1).toFixed(1)),
      overtimeHours: Number((row.overtimeHours + 0.5).toFixed(1)),
      idleMinutes: row.idleMinutes + 12,
      status: "Watch",
    }))
    applyOperationalDelta({
      laborDelta: 1.1,
      overtimeDelta: 0.5,
      actualCostDelta: 108,
      projectedCostDelta: 64,
      profitDelta: -54,
      marginDelta: -1.2,
    })
    appendLedgerRow({
      time,
      category: "LABOR",
      stage: currentStage,
      actor: "Marcus",
      detail: "Profile grind labor logged",
      labor: "1.1h",
      cost: "+$108",
      detailFields: [
        detailField("Employee", "Marcus"),
        detailField("Action", "Profile grind labor"),
        detailField("Stage", currentStage),
        detailField("Start", "Aug 15, 7:12 AM"),
        detailField("Stop", time),
        detailField("Regular Labor", "1.1h"),
        detailField("Overtime", "0.0h"),
        detailField("Labor Rate Basis", "Profile grind standard"),
        detailField("Labor Cost Impact", "+$108"),
        detailField("OJT", "0h"),
        detailField("Rework", "No"),
        detailField("Linked Inspection", "Pending"),
      ],
      expandedDetail:
        "Mock stop event appended regular labor into the execution ledger and stage timing strip.",
    })
    appendLedgerRow({
      time,
      category: "LABOR",
      stage: currentStage,
      actor: "Marcus",
      detail: "Marcus in overtime",
      overtime: "0.5h",
      cost: `Margin ${marginPercent.toFixed(0)}% -> ${nextMargin.toFixed(0)}%`,
      refNotes: "OT watch",
      detailFields: [
        detailField("Employee", "Marcus"),
        detailField("OT Hours", "0.5h"),
        detailField("Multiplier", "1.5x"),
        detailField("Regular Rate Basis", "Profile grind standard"),
        detailField("OT Cost Impact", "+$22"),
        detailField("Projected Margin Before", `${marginPercent.toFixed(0)}%`),
        detailField("Projected Margin After", `${nextMargin.toFixed(0)}%`),
        detailField("Status", "OT Watch"),
        detailField("AI / Cost Warning", "Overtime is compressing margin."),
      ],
      expandedDetail:
        "Overtime delta applied locally with 1.5x labor impact visible in the admin metric strip.",
    })
    appendLedgerRow({
      time,
      category: "COST",
      stage: currentStage,
      actor: "System",
      detail: "Actual cost recalculated",
      cost: `Variance ${formatPercent(((actualCost + 108 - expectedCost) / expectedCost) * 100)}, Margin ${nextMargin.toFixed(0)}%`,
      refNotes: "Recalc",
      detailFields: [
        detailField("Expected Cost", formatCurrency(expectedCost)),
        detailField("Actual Cost", formatCurrency(actualCost + 108)),
        detailField("Projected Final", formatCurrency(projectedFinalCost + 64)),
        detailField(
          "Variance",
          formatPercent(((actualCost + 108 - expectedCost) / expectedCost) * 100)
        ),
        detailField("Margin Before", `${marginPercent.toFixed(0)}%`),
        detailField("Margin After", `${nextMargin.toFixed(0)}%`),
        detailField("Labor Impact", "+$108"),
        detailField("Material Impact", "$0"),
        detailField("OT Impact", "+$22"),
        detailField("Evidence Source", "labor logs + OT watch + quote snapshot"),
      ],
      expandedDetail:
        "Local cost snapshot moved after labor and OT deltas were logged from the workbench controls.",
    })
    addIntelligence({
      label: "OT Watch escalated on Marcus",
      body: `Marcus is now carrying ${formatHours(overtimeHours + 0.5)} overtime with a projected labor impact of +${formatCurrency(108)} and margin pressure drifting lower.`,
      tone: "watch",
      refNotes: "OT watch",
      detailFields: [
        detailField("AI Finding", "OT Watch escalated on Marcus"),
        detailField("Classification", "Overtime margin pressure"),
        detailField("Evidence", `OT ${formatHours(overtimeHours + 0.5)} with +${formatCurrency(108)} impact`),
        detailField("Recommendation", "Review labor sequencing before changing quote model"),
        detailField("Confidence", "88%"),
        detailField("Owner Approval Required", "Yes for pricing/model changes"),
      ],
    })
    setFeedback({
      tone: "success",
      text: "Mock labor stop recorded. Labor, overtime, cost, and ledger rows updated locally.",
    })
  }

  const handleLogMaterial = () => {
    const time = formatMockTimestamp()
    const nextMargin = Number((marginPercent - 0.4).toFixed(1))
    updateStageTimingRow(currentStage, (row) => ({
      ...row,
      materialLbs: Number((row.materialLbs + 1.2).toFixed(1)),
      elapsedMinutes: row.elapsedMinutes + 8,
      status: row.status === "Complete" ? row.status : "Watch",
    }))
    applyOperationalDelta({
      materialDelta: 1.2,
      actualCostDelta: 58,
      projectedCostDelta: 28,
      profitDelta: -31,
      marginDelta: -0.4,
    })
    appendLedgerRow({
      time,
      category: "MATERIAL",
      stage: currentStage,
      actor: "Edil",
      detail: "Profile grind consumable logged",
      material: "1.2 lb",
      cost: "+$58",
      refNotes: "Consumable",
      detailFields: [
        detailField("Material Category", "Grinding consumable"),
        detailField("Material Type", "Abrasive belt / wheel usage"),
        detailField("Lot Number", "GRIND-26-019"),
        detailField("Heat / Batch", "Batch GR-2026-019"),
        detailField("Supplier / Source", "Tool crib"),
        detailField("Quantity Used", "1.2 lb"),
        detailField("Unit Cost", "$48.33/lb"),
        detailField("Extended Cost", "$58"),
        detailField("Inventory Lot Ref", "Crib A / GRIND-26-019"),
        detailField("Waste / Overage", "0.1 lb"),
        detailField("COC / Cert Ref", "N/A"),
        detailField("Notes", "Profile grind consumable usage logged."),
      ],
      expandedDetail:
        "Mock material event appended to the execution ledger and stage timing table.",
    })
    appendLedgerRow({
      time,
      category: "COST",
      stage: currentStage,
      actor: "System",
      detail: "Material cost updated",
      cost: `Variance ${formatPercent(((actualCost + 58 - expectedCost) / expectedCost) * 100)}, Margin ${nextMargin.toFixed(0)}%`,
      refNotes: "Material delta",
      detailFields: [
        detailField("Expected Cost", formatCurrency(expectedCost)),
        detailField("Actual Cost", formatCurrency(actualCost + 58)),
        detailField("Projected Final", formatCurrency(projectedFinalCost + 28)),
        detailField(
          "Variance",
          formatPercent(((actualCost + 58 - expectedCost) / expectedCost) * 100)
        ),
        detailField("Margin Before", `${marginPercent.toFixed(0)}%`),
        detailField("Margin After", `${nextMargin.toFixed(0)}%`),
        detailField("Labor Impact", "$0"),
        detailField("Material Impact", "+$58"),
        detailField("OT Impact", "$0"),
        detailField("Evidence Source", "material logs + quote snapshot"),
      ],
      expandedDetail:
        "Actual and projected cost changed after the local material event was recorded.",
    })
    addIntelligence({
      label: "Material moved but quote headroom remains",
      body: `Material usage increased by ${formatWeight(1.2)} on ${currentStage}. The job is still inside quoted material allowance, but actual cost moved upward.`,
      tone: "info",
      refNotes: "Material delta",
      detailFields: [
        detailField("AI Finding", "Material moved but quote headroom remains"),
        detailField("Classification", "Material variance"),
        detailField("Evidence", `material increased ${formatWeight(1.2)} on ${currentStage}`),
        detailField("Recommendation", "Track repeat consumable deltas before quote changes"),
        detailField("Confidence", "81%"),
        detailField("Owner Approval Required", "Yes for pricing/model changes"),
      ],
    })
    setFeedback({
      tone: "success",
      text: "Mock material event logged locally.",
    })
  }

  const handleCompleteStage = () => {
    const time = formatMockTimestamp()
    const currentRow = stageTimingRows.find((row) => row.stage === currentStage)
    const completedRow = currentRow
      ? {
          ...currentRow,
          exited: currentRow.exited ?? time,
          elapsedMinutes: currentRow.elapsedMinutes + 18,
          idleMinutes: currentRow.idleMinutes + 10,
          status: "Complete" as const,
        }
      : null

    updateStageTimingRow(currentStage, (row) => ({
      ...row,
      exited: row.exited ?? time,
      elapsedMinutes: row.elapsedMinutes + 18,
      idleMinutes: row.idleMinutes + 10,
      status: "Complete",
    }))
    setInspectionStatus("Captured")
    setRoutingPosture(`${currentStage} complete - ready to advance`)
    appendLedgerRow({
      time,
      category: "STAGE",
      stage: currentStage,
      actor: "System",
      detail: "Stage complete",
      ...stageTimingCells(completedRow),
      refNotes: completedRow?.status ?? "Complete",
      detailFields: [
        detailField("Stage", currentStage),
        detailField("Entered", currentRow?.entered ?? time),
        detailField("Exited", time),
        detailField("Elapsed", completedRow ? formatDuration(completedRow.elapsedMinutes) : "-"),
        detailField("Labor", completedRow ? formatHours(completedRow.laborHours) : "-"),
        detailField("OT", completedRow ? formatHours(completedRow.overtimeHours) : "-"),
        detailField("Idle / Wait", completedRow ? formatDuration(completedRow.idleMinutes) : "-"),
        detailField("Material", completedRow ? formatWeight(completedRow.materialLbs) : "-"),
        detailField(
          "Delay Reason",
          currentRow && currentRow.idleMinutes + 10 > currentRow.laborHours * 60
            ? "Queue delay larger than hands-on time"
            : "No major delay recorded"
        ),
        detailField("Previous Stage", currentStage),
        detailField("Next Stage", "Pending advance"),
        detailField("Stage Status", completedRow?.status ?? "Complete"),
      ],
      expandedDetail:
        "Mock stage completion appended to the execution ledger without advancing production routing.",
    })

    if (currentRow) {
      const laborMinutes = currentRow.laborHours * 60
      const nextIdleMinutes = currentRow.idleMinutes + 10

      addIntelligence({
        label:
          nextIdleMinutes > laborMinutes
            ? "Queue delay larger than hands-on time"
            : "Stage labor held inside expected band",
        body:
          nextIdleMinutes > laborMinutes
            ? `${currentStage} is closing with ${formatDuration(nextIdleMinutes)} idle/wait against ${formatHours(currentRow.laborHours)} labor. Review scheduling before quote model changes.`
            : `${currentStage} completed with labor carrying more weight than queue delay. Monitor margin before changing the quote model.`,
        tone: nextIdleMinutes > laborMinutes ? "watch" : "good",
        refNotes: "Stage timing",
        detailFields: [
          detailField(
            "AI Finding",
            nextIdleMinutes > laborMinutes
              ? "Queue delay larger than hands-on time"
              : "Stage labor held inside expected band"
          ),
          detailField(
            "Classification",
            nextIdleMinutes > laborMinutes ? "Idle / wait delay" : "Stage labor health"
          ),
          detailField(
            "Evidence",
            `${formatDuration(nextIdleMinutes)} idle/wait vs ${formatHours(currentRow.laborHours)} labor`
          ),
          detailField("Recommendation", "Review scheduling before changing quote model"),
          detailField("Confidence", nextIdleMinutes > laborMinutes ? "86%" : "74%"),
          detailField("Owner Approval Required", "Yes for pricing/model changes"),
        ],
      })
    }

    setFeedback({
      tone: "success",
      text: "Mock stage completion captured. Stage timing and execution ledger updated locally.",
    })
  }

  const handleSaveInspection = () => {
    if (captureChecks.length === 0) {
      setFeedback({
        tone: "warning",
        text: "Select at least one inspection check before saving the preview batch.",
      })
      return
    }

    const missingFailPhoto = captureChecks.find(
      (check) => check.result === "FAIL" && !check.photos.trim()
    )

    if (missingFailPhoto) {
      setFeedback({
        tone: "warning",
        text: `Photo path is required for failed check ${missingFailPhoto.name}.`,
      })
      return
    }

    const recordedAt = formatMockTimestamp()
    const photoCount = captureChecks.filter((check) => check.photos.trim()).length
    const failingCount = captureChecks.filter((check) => check.result === "FAIL").length
    const nextMargin = Number((marginPercent - 0.6).toFixed(1))
    const inspectionCostDelta =
      captureChecks.length * 37 + (requiresSignoff ? 24 : 0)
    const nextResults = captureChecks.map((check, index) => ({
      id: `result-${Date.now()}-${index}-${check.name.toLowerCase()}`,
      check: check.name,
      result: check.result,
      stage: currentStage,
      recordedAt,
      ojt: `OJT ${ojtHours || "0"}`,
    }))

    setInspectionResults((current) => [...nextResults, ...current])
    setHistoryRows((current) => [
      {
        id: `history-${Date.now()}`,
        time: recordedAt,
        title: `${currentStage} inspection batch recorded`,
        body: `${captureChecks.map((check) => check.name).join(", ")} saved in one mock inspection sitting.`,
      },
      ...current,
    ])
    setCaptureChecks([])
    setChecklistOpen(false)
    setCaptureOpen(false)
    setRequiresSignoff(false)
    setInspectionStatus("Captured")
    setRoutingPosture("Inspection batch saved")
    updateStageTimingRow(currentStage, (row) => ({
      ...row,
      elapsedMinutes: row.elapsedMinutes + 24,
      laborHours: Number((row.laborHours + captureChecks.length * 0.4).toFixed(1)),
      status: "Watch",
    }))
    applyOperationalDelta({
      laborDelta: captureChecks.length * 0.4,
      actualCostDelta: captureChecks.length * 37 + (requiresSignoff ? 24 : 0),
      projectedCostDelta: captureChecks.length * 19,
      profitDelta: -captureChecks.length * 16,
      marginDelta: -0.6,
    })
    appendLedgerRow({
      time: recordedAt,
      category: "INSPECTION",
      stage: currentStage,
      actor: "Marcus",
      detail: `Inspection batch saved: ${captureChecks
        .map((check) => check.name)
        .join(", ")}`,
      refNotes: `${failingCount > 0 ? "FAIL mix" : "PASS"} | ${photoCount} photos`,
      detailFields: [
        detailField("Inspection Check", captureChecks.map((check) => check.name).join(", ")),
        detailField("Result", failingCount > 0 ? "Mixed / includes FAIL" : "PASS"),
        detailField("Inspector", "Marcus"),
        detailField("Stage", currentStage),
        detailField("Inspection Session", `SESSION-${Date.now().toString().slice(-6)}`),
        detailField("Photos", `${photoCount}`),
        detailField(
          "Photo Refs",
          captureChecks
            .map((check) => check.photos.trim())
            .filter(Boolean)
            .join(", ") || "None"
        ),
        detailField(
          "Notes",
          captureChecks
            .map((check) => check.notes.trim())
            .filter(Boolean)
            .join(" | ") || "No additional notes"
        ),
        detailField("Requires Signoff", requiresSignoff ? "Yes" : "No"),
        detailField("Signed Off By", requiresSignoff ? "Pending" : "-"),
        detailField("OJT Hours", `${ojtHours || "0"}h`),
        detailField("Related Labor", "Profile grind pass"),
      ],
      expandedDetail:
        "Mock inspection save appended locally to results, history, and costing.",
    })
    appendLedgerRow({
      time: recordedAt,
      category: "COST",
      stage: currentStage,
      actor: "System",
      detail: "Inspection cost delta applied",
      cost: `Variance ${formatPercent(((actualCost + inspectionCostDelta - expectedCost) / expectedCost) * 100)}, Margin ${nextMargin.toFixed(0)}%`,
      refNotes: "Inspection delta",
      detailFields: [
        detailField("Expected Cost", formatCurrency(expectedCost)),
        detailField("Actual Cost", formatCurrency(actualCost + inspectionCostDelta)),
        detailField("Projected Final", formatCurrency(projectedFinalCost + captureChecks.length * 19)),
        detailField(
          "Variance",
          formatPercent(((actualCost + inspectionCostDelta - expectedCost) / expectedCost) * 100)
        ),
        detailField("Margin Before", `${marginPercent.toFixed(0)}%`),
        detailField("Margin After", `${nextMargin.toFixed(0)}%`),
        detailField("Labor Impact", `+${formatCurrency(captureChecks.length * 37)}`),
        detailField("Material Impact", "$0"),
        detailField("OT Impact", requiresSignoff ? "+$24" : "$0"),
        detailField("Evidence Source", "inspection logs + quote snapshot"),
      ],
      expandedDetail:
        "Inspection capture changed actual labor cost and projected final cost in the preview admin strip.",
    })
    addIntelligence({
      label: "Inspection activity fed costing",
      body: `${captureChecks.length} selected checks updated effective inspection history and nudged labor/cost metrics upward without touching production data.`,
      tone: "info",
      refNotes: "Inspection delta",
      detailFields: [
        detailField("AI Finding", "Inspection activity fed costing"),
        detailField("Classification", "Inspection cost signal"),
        detailField("Evidence", `${captureChecks.length} checks with ${photoCount} photo refs`),
        detailField("Recommendation", "Watch repeated inspection additions before quote changes"),
        detailField("Confidence", "79%"),
        detailField("Owner Approval Required", "Yes for pricing/model changes"),
      ],
    })
    setFeedback({
      tone: "success",
      text: "Mock inspection batch saved locally. Results, history, metrics, and the execution ledger were updated without any backend call.",
    })
  }

  const handleOpenCorrection = (row: InspectionResultRow) => {
    setActiveCorrectionId(row.id)
    setCorrectionResult(row.result)
    setCorrectionReason("")
    setFeedback({
      tone: "info",
      text: `Correction opened for ${row.check}. Corrections append to history and do not overwrite earlier rows.`,
    })
  }

  const handleSaveCorrection = (row: InspectionResultRow) => {
    if (!correctionReason.trim()) {
      setFeedback({
        tone: "warning",
        text: "Correction reason is required before saving a mock correction.",
      })
      return
    }

    const recordedAt = formatMockTimestamp()
    const correctionRow: InspectionResultRow = {
      id: `correction-${Date.now()}`,
      check: row.check,
      result: correctionResult,
      stage: currentStage,
      recordedAt,
      ojt: row.ojt,
      isCorrection: true,
      correctionReason: correctionReason.trim(),
      correctionOfId: row.id,
    }

    setInspectionResults((current) => [correctionRow, ...current])
    setHistoryRows((current) => [
      {
        id: `history-correction-${Date.now()}`,
        time: recordedAt,
        title: `${row.check} correction appended`,
        body: `Correction saved with reason: ${correctionReason.trim()}. Original preview row remains preserved below it.`,
      },
      ...current,
    ])
    setActiveCorrectionId(null)
    setCorrectionReason("")
    setRoutingPosture("Correction appended")
    appendLedgerRow({
      time: recordedAt,
      category: "INSPECTION",
      stage: currentStage,
      actor: "Marcus",
      detail: `${row.check} correction saved`,
      refNotes: correctionReason.trim(),
      detailFields: [
        detailField("Inspection Check", row.check),
        detailField("Result", correctionResult),
        detailField("Inspector", "Marcus"),
        detailField("Stage", currentStage),
        detailField("Inspection Session", `CORR-${Date.now().toString().slice(-6)}`),
        detailField("Photos Count", "0"),
        detailField("Photo Refs", "No new photos"),
        detailField("Notes", correctionReason.trim()),
        detailField("Requires Signoff", "No"),
        detailField("Signed Off By", "-"),
        detailField("OJT Hours", row.ojt.replace("OJT ", "")),
        detailField("Related Labor", "Correction review"),
      ],
      expandedDetail:
        "Append-only correction entry saved in preview mode with the original row preserved.",
    })
    setFeedback({
      tone: "success",
      text: "Mock correction appended locally. The earlier result row was preserved.",
    })
  }

  const handleAddInternalNote = () => {
    if (!newInternalNote.trim()) {
      setFeedback({
        tone: "warning",
        text: "Enter an internal note before adding it to the preview rail.",
      })
      return
    }

    const noteBody = newInternalNote.trim()
    const time = formatMockTimestamp()
    setInternalNotes((current) => [
      {
        id: `internal-${Date.now()}`,
        label: "Private",
        time,
        body: noteBody,
      },
      ...current,
    ])
    setNewInternalNote("")
    appendLedgerRow({
      time,
      category: "NOTES",
      stage: "INTERNAL",
      actor: "Marcus",
      detail: noteBody,
      refNotes: "Internal note",
      detailFields: [
        detailField("Note Visibility", "Internal / private"),
        detailField("Author", "Marcus"),
        detailField("Created Time", time),
        detailField("Customer Visible", "No"),
        detailField("Linked Stage", currentStage),
        detailField("Note Text", noteBody),
      ],
      expandedDetail: "Private job note appended locally in the preview rail.",
    })
    setFeedback({
      tone: "success",
      text: "Mock internal note added locally.",
    })
  }

  const handleAddCustomerNote = () => {
    if (!newCustomerNote.trim()) {
      setFeedback({
        tone: "warning",
        text: "Enter a customer-facing note before publishing it in the preview.",
      })
      return
    }

    const noteBody = newCustomerNote.trim()
    const time = formatMockTimestamp()
    setCustomerNotes((current) => [
      {
        id: `customer-${Date.now()}`,
        label: "Customer Visible",
        time,
        body: noteBody,
      },
      ...current,
    ])
    setNewCustomerNote("")
    appendLedgerRow({
      time,
      category: "NOTES",
      stage: "CUSTOMER",
      actor: "Axis Ops",
      detail: noteBody,
      refNotes: "Customer note",
      detailFields: [
        detailField("Note Visibility", "Customer-facing"),
        detailField("Author", "Axis Ops"),
        detailField("Created Time", time),
        detailField("Customer Visible", "Yes"),
        detailField("Linked Stage", currentStage),
        detailField("Note Text", noteBody),
      ],
      expandedDetail:
        "Customer-visible note appended locally in the preview rail.",
    })
    setFeedback({
      tone: "success",
      text: "Mock customer-facing note published locally.",
    })
  }

  const handleAdvanceStage = () => {
    const time = formatMockTimestamp()
    let fromStage = currentStage
    let nextStage = currentStage
    const currentStageSnapshot =
      stageTimingRows.find((row) => row.stage === currentStage) ?? currentStageTiming

    setCurrentStage((current) => {
      const currentIndex = fakeStageFlow.indexOf(current)
      fromStage = current
      nextStage = fakeStageFlow[(currentIndex + 1) % fakeStageFlow.length]
      return nextStage
    })

    updateStageTimingRow(fromStage, (row) => ({
      ...row,
      exited: row.exited ?? time,
      status: "Complete",
    }))
    ensureStageTimingRow(nextStage, time)
    setRoutingPosture("Mock stage advance queued")
    appendLedgerRow({
      time,
      category: "STAGE",
      stage: `${fromStage} → ${nextStage}`,
      actor: "System",
      detail: "Stage advanced",
      ...stageTimingCells(currentStageSnapshot),
      refNotes: "Preview only",
      detailFields: [
        detailField("Stage", fromStage),
        detailField("Entered", currentStageSnapshot.entered),
        detailField("Exited", time),
        detailField("Elapsed", formatDuration(currentStageSnapshot.elapsedMinutes)),
        detailField("Actual Labor", formatHours(currentStageSnapshot.laborHours)),
        detailField("Overtime", formatHours(currentStageSnapshot.overtimeHours)),
        detailField("Idle / Wait", formatDuration(currentStageSnapshot.idleMinutes)),
        detailField("Material Used", formatWeight(currentStageSnapshot.materialLbs)),
        detailField("Delay Reason", "Mock stage advance queued"),
        detailField("Previous Stage", fromStage),
        detailField("Next Stage", nextStage),
        detailField("Stage Status", "Complete"),
      ],
      expandedDetail:
        "Mock stage movement queued locally without routing or RPC execution.",
    })
    addIntelligence({
      label: "Stage hand-off updated",
      body: `${fromStage} advanced toward ${nextStage}. AI is watching for cost drift and queue buildup, but cannot change pricing or routing rules.`,
      tone: "info",
      stage: `${fromStage} → ${nextStage}`,
      refNotes: "Stage movement",
      detailFields: [
        detailField("AI Finding", "Stage hand-off updated"),
        detailField("Classification", "Stage movement"),
        detailField("Evidence", `${fromStage} advanced toward ${nextStage}`),
        detailField("Recommendation", "Watch queue buildup before quote changes"),
        detailField("Confidence", "77%"),
        detailField("Owner Approval Required", "Yes for pricing/model changes"),
      ],
    })
    setFeedback({
      tone: "info",
      text: "Mock stage advance queued. No navigation or RPC was triggered.",
    })
  }

  const handlePreviewNoop = (label: string) => {
    setFeedback({
      tone: "info",
      text: `${label} is a preview-only control in this prototype. No navigation was triggered.`,
    })
  }

  const handleToggleReportLinked = () => {
    setReportLinked((current) => {
      const next = !current
      setReportStatus(next ? "Report linked" : "Linked report removed")
      appendLedgerRow({
        time: formatMockTimestamp(),
        category: "REPORTS",
        stage: "THIRD_PARTY_QC",
        actor: "System",
        detail: next ? "TP-2026-447 linked" : "TP-2026-447 unlinked",
        refNotes: next ? "TP-2026-447" : "Report cleared",
        detailFields: [
          detailField("Report ID", "TP-2026-447"),
          detailField("Source", "EMAIL_INGEST"),
          detailField("Linked Job", "AOS-000020"),
          detailField("Verified Status", next ? "Yes" : "No"),
          detailField("Verified By", next ? "Axis Ops" : "-"),
          detailField("Verified At", next ? formatMockTimestamp() : "-"),
          detailField("Assignment Status", next ? "Complete" : "Removed"),
          detailField("File Path / Ref", "third-party-reports/tp-2026-447.pdf"),
        ],
        expandedDetail:
          "Mock report link state updated locally in the preview reports panel.",
      })
      setFeedback({
        tone: "info",
        text: next
          ? "Mock report linked state enabled."
          : "Mock report linked state cleared.",
      })
      return next
    })
  }

  const handleToggleVerifiedUpload = () => {
    setVerifiedUploadReady((current) => {
      const next = !current
      setReportStatus(next ? "Verified upload ready" : "Verified upload not ready")
      appendLedgerRow({
        time: formatMockTimestamp(),
        category: "REPORTS",
        stage: "THIRD_PARTY_QC",
        actor: "System",
        detail: next ? "Verified upload ready" : "Verified upload cleared",
        refNotes: "Upload state",
        detailFields: [
          detailField("Report ID", "TP-2026-447"),
          detailField("Source", "EMAIL_INGEST"),
          detailField("Linked Job", "AOS-000020"),
          detailField("Verified Status", next ? "Ready" : "Cleared"),
          detailField("Verified By", "Axis Ops"),
          detailField("Verified At", formatMockTimestamp()),
          detailField("Assignment Status", next ? "Ready for review" : "Pending"),
          detailField("File Path / Ref", "third-party-reports/tp-2026-447.pdf"),
        ],
        expandedDetail:
          "Mock verified upload state toggled locally with no file transfer.",
      })
      setFeedback({
        tone: "info",
        text: next
          ? "Mock verified upload state enabled."
          : "Mock verified upload state cleared.",
      })
      return next
    })
  }

  const handleQcToggle = (value: string, message: string) => {
    setQcPanelStatus(value)
    setQcStatus(value.includes("Pass") ? "Passed" : "Pending")
    appendLedgerRow({
      time: formatMockTimestamp(),
      category: "REPORTS",
      stage: "INTERNAL_QC",
      actor: "System",
      detail: value,
      refNotes: "QC decision",
      detailFields: [
        detailField("Report ID", "QC-INTERNAL-2026-0815"),
        detailField("Source", "INTERNAL_QC"),
        detailField("Linked Job", "AOS-000020"),
        detailField("Verified Status", value),
        detailField("Verified By", "QC Lead"),
        detailField("Verified At", formatMockTimestamp()),
        detailField("Assignment Status", "QC decision recorded"),
        detailField("File Path / Ref", "internal-qc/preview"),
      ],
      expandedDetail: "Mock QC status updated in the preview utility rail.",
    })
    setFeedback({ tone: "info", text: message })
  }

  const handleThirdPartyToggle = (value: string, message: string) => {
    setThirdPartyStatus(value)
    appendLedgerRow({
      time: formatMockTimestamp(),
      category: "REPORTS",
      stage: "THIRD_PARTY_QC",
      actor: "System",
      detail: value,
      refNotes: "Third-party",
      detailFields: [
        detailField("Report ID", "TP-2026-447"),
        detailField("Source", "THIRD_PARTY_QC"),
        detailField("Linked Job", "AOS-000020"),
        detailField("Verified Status", value),
        detailField("Verified By", "Third-party pending"),
        detailField("Verified At", "-"),
        detailField("Assignment Status", value),
        detailField("File Path / Ref", "third-party-reports/pending"),
      ],
      expandedDetail:
        "Mock third-party state updated locally in the preview utility rail.",
    })
    setFeedback({ tone: "info", text: message })
  }

  const handleRoutePreview = () => {
    if (!routeReason.trim()) {
      setFeedback({
        tone: "warning",
        text: "Route reason is required before updating the mock routing posture.",
      })
      return
    }

    setRoutingPosture(`Route preview: ${routeTarget}`)
    setRouteOpen(false)
    appendLedgerRow({
      time: formatMockTimestamp(),
      category: "STAGE",
      stage: routeTarget,
      actor: "System",
      detail: "Alternate route preview updated",
      refNotes: routeReason.trim(),
      detailFields: [
        detailField("Stage", routeTarget),
        detailField("Entered", formatMockTimestamp()),
        detailField("Exited", "Preview only"),
        detailField("Elapsed", "-"),
        detailField("Actual Labor", "-"),
        detailField("Overtime", "-"),
        detailField("Idle / Wait", "-"),
        detailField("Material Used", "-"),
        detailField("Delay Reason", routeReason.trim()),
        detailField("Previous Stage", currentStage),
        detailField("Next Stage", routeTarget),
        detailField("Stage Status", "Route preview"),
      ],
      expandedDetail:
        "Mock alternate route posture updated locally without invoking route logic.",
    })
    setFeedback({
      tone: "success",
      text: `Mock route updated to ${routeTarget}. No stage function or backend behavior was invoked.`,
    })
  }

  return (
    <section className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <p className={styles.eyebrow}>Axis OS Job Workbench</p>
            <div className={styles.headerTitleRow}>
              <h1 className={styles.title}>Job AOS-000020</h1>
              <div className={styles.headerChips}>
                <span className={`${styles.chip} ${styles.chipStage}`}>
                  {currentStage}
                </span>
                <span className={`${styles.chip} ${styles.chipPending}`}>
                  QC {qcStatus}
                </span>
                <span className={`${styles.chip} ${styles.chipInfo}`}>
                  Inspection {inspectionStatus}
                </span>
              </div>
            </div>
            <p className={styles.subtleLine}>
              Job ID: 3cfd0a6f-aos-preview-000020
            </p>
          </div>

          <div className={styles.summaryStrip}>
            {summaryItems.map((item) => (
              <div
                key={item.label}
                className={`${styles.summaryCell} ${toneClass(item.tone)}`}
              >
                <p className={styles.summaryLabel}>{item.label}</p>
                <p className={styles.summaryValue}>{item.value}</p>
              </div>
            ))}
          </div>

          <div className={styles.commandBar}>
            <div className={styles.commandButtons}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleAdvanceStage}
              >
                Advance Stage
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => openCapture("Inspection capture opened in preview mode.")}
              >
                Record Inspection
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => handlePreviewNoop("Back to Jobs")}
              >
                Back to Jobs
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => handlePreviewNoop("Customer Jobs")}
              >
                Customer Jobs
              </button>
            </div>

            <div className={styles.commandStatus}>
              <div className={styles.adminMetricsGroup}>
                <span className={styles.adminMetricsLabel}>Admin Only</span>
                <div className={`${styles.commandMetric} ${styles.adminMetric}`}>
                  <span className={styles.commandMetricLabel}>Labor</span>
                  <strong>
                    {formatHours(laborHours)} actual / {formatHours(quotedLaborHours)} quoted
                  </strong>
                </div>
                <div className={`${styles.commandMetric} ${styles.adminMetric}`}>
                  <span className={styles.commandMetricLabel}>OT</span>
                  <strong>{formatHours(overtimeHours)} active</strong>
                </div>
                <div className={`${styles.commandMetric} ${styles.adminMetric}`}>
                  <span className={styles.commandMetricLabel}>Material</span>
                  <strong>
                    {formatWeight(materialLbs)} actual / {formatWeight(quotedMaterialLbs)} quoted
                  </strong>
                </div>
                <div className={`${styles.commandMetric} ${styles.adminMetric}`}>
                  <span className={styles.commandMetricLabel}>Expected Cost</span>
                  <strong>{formatCurrency(expectedCost)}</strong>
                </div>
                <div className={`${styles.commandMetric} ${styles.adminMetric}`}>
                  <span className={styles.commandMetricLabel}>Actual Cost</span>
                  <strong>{formatCurrency(actualCost)}</strong>
                </div>
                <div className={`${styles.commandMetric} ${styles.adminMetric}`}>
                  <span className={styles.commandMetricLabel}>Projected Final</span>
                  <strong>{formatCurrency(projectedFinalCost)}</strong>
                </div>
                <div className={`${styles.commandMetric} ${styles.adminMetric}`}>
                  <span className={styles.commandMetricLabel}>Profit</span>
                  <strong>{formatCurrency(profit)}</strong>
                </div>
                <div className={`${styles.commandMetric} ${styles.adminMetric}`}>
                  <span className={styles.commandMetricLabel}>Variance</span>
                  <strong>{variancePercent}</strong>
                </div>
                <div className={`${styles.commandMetric} ${styles.adminMetric}`}>
                  <span className={styles.commandMetricLabel}>Margin</span>
                  <strong>{marginPercent.toFixed(0)}%</strong>
                </div>
                <div
                  className={`${styles.commandMetric} ${
                    marginStatus === "Healthy"
                      ? styles.metricHealthy
                      : marginStatus === "Risk"
                        ? styles.metricRisk
                        : styles.metricWatch
                  }`}
                >
                  <span className={styles.commandMetricLabel}>Margin Status</span>
                  <strong>{marginStatus}</strong>
                </div>
                <div className={`${styles.commandMetric} ${styles.metricWatch}`}>
                  <div className={styles.metricStack}>
                    <span className={styles.commandMetricLabel}>OT Watch</span>
                    <strong>Marcus in overtime</strong>
                    <span className={styles.metricDetail}>
                      {formatHours(overtimeHours)} OT • 1.5x • +{formatCurrency(overtimeImpact)} • Margin after OT {marginAfterOvertime.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
              <div className={styles.commandMetric}>
                <span className={styles.commandMetricLabel}>Effective</span>
                <strong>{inspectionResults.length} Rows</strong>
              </div>
              <div className={styles.commandMetric}>
                <span className={styles.commandMetricLabel}>Routing</span>
                <strong>{routingPosture}</strong>
              </div>
            </div>
          </div>

          {feedback ? (
            <div
              className={`${styles.messageBar} ${
                feedback.tone === "success"
                  ? styles.messageSuccess
                  : feedback.tone === "warning"
                    ? styles.messageWarning
                    : styles.messageInfo
              }`}
            >
              {feedback.text}
            </div>
          ) : null}
        </header>

        <div className={styles.workbenchGrid}>
          <main className={styles.mainColumn}>
            <Panel
              title="Workflow State"
              subtitle="Slim operational strip for the current job posture."
              action={
                <div className={styles.headerChips}>
                  <span className={`${styles.chip} ${styles.chipNeutral}`}>
                    {routingPosture}
                  </span>
                </div>
              }
            >
              <div className={styles.workflowStrip}>
                <div className={styles.workflowItem}>
                  <span className={styles.workflowLabel}>Stage</span>
                  <strong>{currentStage}</strong>
                </div>
                <span className={styles.workflowDivider} />
                <div className={styles.workflowItem}>
                  <span className={styles.workflowLabel}>Inspection</span>
                  <strong>{inspectionStatus}</strong>
                </div>
                <span className={styles.workflowDivider} />
                <div className={styles.workflowItem}>
                  <span className={styles.workflowLabel}>QC</span>
                  <strong>{qcStatus}</strong>
                </div>
                <span className={styles.workflowDivider} />
                <div className={styles.workflowItem}>
                  <span className={styles.workflowLabel}>Batch</span>
                  <strong>{captureChecks.length} Checks</strong>
                </div>
              </div>
            </Panel>

            <Panel
              title="Labor Controls"
              subtitle="Employee-friendly local controls tied to timing, cost, and ledger behavior."
              action={
                <span className={`${styles.chip} ${laborActive ? styles.chipInfo : styles.chipNeutral}`}>
                  {laborActive ? "Labor Active" : "Ready"}
                </span>
              }
            >
              <div className={styles.opsStrip}>
                <div className={styles.opsContext}>
                  <span className={styles.opsChip}>Employee Marcus</span>
                  <span className={styles.opsChip}>Job AOS-000020</span>
                  <span className={styles.opsChip}>Stage {currentStage}</span>
                  <span className={styles.opsChip}>Action Profile Grind</span>
                </div>
                <div className={styles.utilityButtonRow}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleStartWork}
                  >
                    Start Work
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleStopWork}
                  >
                    Stop Work / Log Time
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={handleLogMaterial}
                  >
                    Log Material
                  </button>
                  <button
                    type="button"
                    className={styles.smallAction}
                    onClick={handleCompleteStage}
                  >
                    Complete Stage
                  </button>
                </div>
              </div>
            </Panel>

            <div ref={captureRef}>
              <Panel
                title="Inspection Capture"
                subtitle="Local-state prototype for checklist capture, validation, and append-only preview save."
                action={
                  <div className={styles.capturePanelActionGroup}>
                    <span className={`${styles.chip} ${styles.chipInfo}`}>
                      Local Preview Only
                    </span>
                    {!captureOpen ? (
                      <button
                        type="button"
                        className={styles.smallAction}
                        onClick={() =>
                          resetCaptureSession("Blank inspection capture session opened.")
                        }
                      >
                        Record Additional Inspection
                      </button>
                    ) : null}
                  </div>
                }
              >
                {captureOpen ? (
                  <>
                    <div className={styles.captureTop}>
                      <div className={styles.selectMock}>
                        <button
                          type="button"
                          className={styles.selectTrigger}
                          onClick={() => setChecklistOpen((current) => !current)}
                        >
                          <span>Select Checks</span>
                          <span className={styles.selectMeta}>
                            {checklistOpen ? "Hide" : "Open"} | {captureChecks.length} selected
                          </span>
                        </button>
                        {checklistOpen ? (
                          <div className={styles.checklistMenu}>
                            {availableChecks.map((check) => {
                              const checked = captureChecks.some(
                                (selected) => selected.name === check
                              )

                              return (
                                <button
                                  key={check}
                                  type="button"
                                  className={styles.checklistButton}
                                  onClick={() => toggleCheckSelection(check)}
                                >
                                  <span
                                    className={`${styles.checkIndicator} ${
                                      checked ? styles.checkIndicatorActive : ""
                                    }`}
                                  />
                                  <span>{check}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>

                      <div className={styles.captureInfo}>
                        <div className={styles.captureInfoCard}>
                          <span className={styles.captureInfoLabel}>PASS</span>
                          <strong>Photos optional</strong>
                        </div>
                        <div className={styles.captureInfoCard}>
                          <span className={styles.captureInfoLabel}>FAIL</span>
                          <strong>Photos required</strong>
                        </div>
                        <div className={styles.captureInfoCard}>
                          <span className={styles.captureInfoLabel}>Inspector</span>
                          <strong>Axis Floor Lead</strong>
                        </div>
                      </div>
                    </div>

                    <div className={styles.table}>
                      <div className={`${styles.row} ${styles.tableHead}`}>
                        <span>Check</span>
                        <span>Result</span>
                        <span>Notes</span>
                        <span>Photos</span>
                        <span>Remove</span>
                      </div>
                      {captureChecks.length === 0 ? (
                        <div className={styles.emptyStateRow}>
                          Select checks from the preview dropdown to build a new local inspection batch.
                        </div>
                      ) : null}
                      {captureChecks.map((check) => (
                        <div key={check.id} className={styles.captureGroup}>
                          <div className={styles.row}>
                            <span className={styles.cellPrimary}>{check.name}</span>
                            <span className={styles.resultPillWrap}>
                              <select
                                value={check.result}
                                className={styles.resultControl}
                                onChange={(event) =>
                                  updateCheck(check.id, {
                                    result: event.target.value as "PASS" | "FAIL",
                                  })
                                }
                              >
                                <option value="PASS">PASS</option>
                                <option value="FAIL">FAIL</option>
                              </select>
                            </span>
                            <button
                              type="button"
                              className={styles.inlineActionButton}
                              onClick={() =>
                                updateCheck(check.id, (current) => ({
                                  notesOpen: !current.notesOpen,
                                }))
                              }
                            >
                              {check.notesOpen ? "Hide Notes" : check.notes ? "Notes" : "Add Notes"}
                            </button>
                            <button
                              type="button"
                              className={styles.inlineActionButton}
                              onClick={() =>
                                updateCheck(check.id, (current) => ({
                                  photosOpen: !current.photosOpen,
                                }))
                              }
                            >
                              {check.photosOpen
                                ? "Hide Photos"
                                : check.photos
                                  ? "Photos"
                                  : "Add Photos"}
                            </button>
                            <button
                              type="button"
                              className={styles.inlineDangerButton}
                              onClick={() =>
                                setCaptureChecks((current) =>
                                  current.filter((row) => row.id !== check.id)
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>

                          {check.notesOpen || check.photosOpen ? (
                            <div className={styles.inlineEditors}>
                              {check.notesOpen ? (
                                <label className={styles.inlineEditor}>
                                  <span className={styles.editorLabel}>Notes</span>
                                  <input
                                    value={check.notes}
                                    onChange={(event) =>
                                      updateCheck(check.id, {
                                        notes: event.target.value,
                                      })
                                    }
                                    className={styles.fieldInput}
                                    placeholder="Mock note for this check"
                                  />
                                </label>
                              ) : null}
                              {check.photosOpen ? (
                                <label className={styles.inlineEditor}>
                                  <span className={styles.editorLabel}>Photo Path</span>
                                  <input
                                    value={check.photos}
                                    onChange={(event) =>
                                      updateCheck(check.id, {
                                        photos: event.target.value,
                                      })
                                    }
                                    className={styles.fieldInput}
                                    placeholder="storage/path-or-file.png"
                                  />
                                </label>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className={styles.captureActionRow}>
                      <div className={styles.captureMetaGroup}>
                        <label className={styles.captureMetaField}>
                          <span className={styles.captureMetaLabel}>OJT Hours</span>
                          <input
                            value={ojtHours}
                            onChange={(event) => setOjtHours(event.target.value)}
                            className={styles.fieldInput}
                          />
                        </label>
                        <button
                          type="button"
                          className={`${styles.toggleChip} ${
                            requiresSignoff ? styles.toggleChipActive : ""
                          }`}
                          onClick={() => setRequiresSignoff((current) => !current)}
                        >
                          Requires Signoff: {requiresSignoff ? "Yes" : "No"}
                        </button>
                      </div>
                      <div className={styles.captureActionButtons}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => setCaptureOpen(false)}
                        >
                          Collapse
                        </button>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={handleSaveInspection}
                        >
                          Save Inspection
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={styles.captureCollapsedState}>
                    <div>
                      <p className={styles.collapsedStateTitle}>
                        Inspection capture is collapsed.
                      </p>
                      <p className={styles.collapsedStateText}>
                        Open a new local inspection sitting without touching production behavior.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() =>
                        resetCaptureSession("Record Additional Inspection opened in preview mode.")
                      }
                    >
                      Record Additional Inspection
                    </button>
                  </div>
                )}
              </Panel>
            </div>

            <Panel
              title="Inspection Results"
              subtitle="Effective inspection rows stay dense and interactive in preview mode."
              action={
                <button
                  type="button"
                  className={styles.smallAction}
                  onClick={() =>
                    resetCaptureSession("New blank inspection session opened from the results deck.")
                  }
                >
                  Record Additional Inspection
                </button>
              }
            >
              <div className={styles.table}>
                <div className={`${styles.row} ${styles.tableHead} ${styles.resultsHead}`}>
                  <span>Check Type</span>
                  <span>Result</span>
                  <span>Stage</span>
                  <span>Recorded</span>
                  <span>OJT</span>
                  <span>Action</span>
                </div>
                {inspectionResults.map((row) => (
                  <div key={row.id} className={styles.resultGroup}>
                    <div className={`${styles.row} ${styles.resultsRow}`}>
                      <span className={styles.cellPrimary}>
                        {row.check}
                        {row.isCorrection ? (
                          <span className={styles.appendTag}>Correction</span>
                        ) : null}
                      </span>
                      <span className={`${styles.resultBadge} ${statusClass(row.result)}`}>
                        {row.result}
                      </span>
                      <span>{row.stage}</span>
                      <span>{row.recordedAt}</span>
                      <span>{row.ojt}</span>
                      <button
                        type="button"
                        className={styles.smallAction}
                        onClick={() => handleOpenCorrection(row)}
                      >
                        {activeCorrectionId === row.id ? "Editing" : "Correct"}
                      </button>
                    </div>

                    {row.isCorrection && row.correctionReason ? (
                      <div className={styles.appendOnlyNotice}>
                        Append-only correction reason: {row.correctionReason}
                      </div>
                    ) : null}

                    {activeCorrectionId === row.id ? (
                      <div className={styles.correctionEditor}>
                        <div className={styles.correctionFields}>
                          <label className={styles.inlineEditor}>
                            <span className={styles.editorLabel}>Corrected Result</span>
                            <select
                              value={correctionResult}
                              className={styles.resultControl}
                              onChange={(event) =>
                                setCorrectionResult(
                                  event.target.value as "PASS" | "FAIL"
                                )
                              }
                            >
                              <option value="PASS">PASS</option>
                              <option value="FAIL">FAIL</option>
                            </select>
                          </label>
                          <label className={styles.inlineEditor}>
                            <span className={styles.editorLabel}>Reason</span>
                            <input
                              value={correctionReason}
                              onChange={(event) =>
                                setCorrectionReason(event.target.value)
                              }
                              className={styles.fieldInput}
                              placeholder="Required reason for append-only correction"
                            />
                          </label>
                        </div>
                        <div className={styles.correctionActions}>
                          <button
                            type="button"
                            className={styles.ghostButton}
                            onClick={() => setActiveCorrectionId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => handleSaveCorrection(row)}
                          >
                            Save Correction
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Execution Ledger"
              subtitle="Stage rollup and dense activity feed for labor, material, inspection, stage, cost, notes, reports, and AI intelligence."
              action={
                <span className={`${styles.chip} ${styles.chipNeutral}`}>
                  Job Intelligence
                </span>
              }
            >
              <div className={styles.stageRollup}>
                <div className={styles.stageRollupHeader}>
                  <div className={styles.stageStrip}>
                    <span className={styles.stageStripLead}>
                      Current Stage: {currentStageTiming?.stage ?? currentStage}
                    </span>
                    <span className={styles.stageStripMetric}>
                      Elapsed {formatDuration(currentStageTiming?.elapsedMinutes ?? 0)}
                    </span>
                    <span className={styles.stageStripMetric}>
                      Labor {formatHours(currentStageTiming?.laborHours ?? 0)}
                    </span>
                    <span className={styles.stageStripMetric}>
                      OT {formatHours(currentStageTiming?.overtimeHours ?? 0)}
                    </span>
                    <span className={styles.stageStripMetric}>
                      Wait {formatDuration(currentStageTiming?.idleMinutes ?? 0)}
                    </span>
                    <span className={styles.stageStripMetric}>
                      Material {formatWeight(currentStageTiming?.materialLbs ?? 0)}
                    </span>
                    <span
                      className={`${styles.stageStripStatus} ${timingStatusClass(
                        currentStageTiming?.status ?? "Active"
                      )}`}
                    >
                      Status {currentStageTiming?.status ?? "Active"}
                    </span>
                  </div>
                  {ledgerFilter === "STAGE" ? (
                    <button
                      type="button"
                      className={styles.stageRollupToggle}
                      onClick={() =>
                        setShowStageRollupDetails((current) => !current)
                      }
                    >
                      {showStageRollupDetails ? "Hide stage rollup" : "Show stage rollup"}
                    </button>
                  ) : null}
                </div>
                {ledgerFilter === "STAGE" && showStageRollupDetails ? (
                  <div className={styles.stageMiniList}>
                    {stageTimingRows.map((row) => (
                      <div key={row.stage} className={styles.stageMiniRow}>
                        <span className={styles.stageMiniStage}>{row.stage}</span>
                        <span>{row.entered}</span>
                        <span>{row.exited ?? "Active"}</span>
                        <span>{formatStageImpact(row)}</span>
                        <span>{formatWeight(row.materialLbs)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={styles.ledgerFiltersInline}>
                {ledgerFilters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`${styles.ledgerFilterButton} ${
                      ledgerFilter === filter ? styles.ledgerFilterActive : ""
                    }`}
                    onClick={() => setLedgerFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
                </div>

              <div className={styles.ledgerTable}>
                <div className={`${styles.ledgerRow} ${styles.ledgerHead}`}>
                  <span>Time</span>
                  <span>Type</span>
                  <span>Stage</span>
                  <span>Person</span>
                  <span>Detail</span>
                  <span>Stage Time</span>
                  <span>Labor</span>
                  <span>OT</span>
                  <span>Idle / Wait</span>
                  <span>Material</span>
                  <span>Cost</span>
                  <span>Ref / Notes</span>
                </div>
                {filteredLedgerRows.length === 0 ? (
                  <div className={styles.emptyStateRow}>
                    No preview rows match the selected ledger filter.
                  </div>
                ) : null}
                {filteredLedgerRows.map((row) => (
                  <div key={row.id} className={styles.ledgerGroup}>
                    <button
                      type="button"
                      className={styles.ledgerRowButton}
                      onClick={() =>
                        setExpandedLedgerId((current) =>
                          current === row.id ? null : row.id
                        )
                      }
                    >
                      <div className={styles.ledgerRow}>
                        <span>{row.time}</span>
                        <span className={styles.ledgerType}>{row.category}</span>
                        <span>{row.stage}</span>
                        <span>{row.actor}</span>
                        <span className={styles.ledgerDetail}>{row.detail}</span>
                        <span className={styles.ledgerMetricCell}>{row.stageTime ?? "-"}</span>
                        <span className={styles.ledgerMetricCell}>{row.labor ?? "-"}</span>
                        <span className={styles.ledgerMetricCell}>{row.overtime ?? "-"}</span>
                        <span className={styles.ledgerMetricCell}>{row.idleWait ?? "-"}</span>
                        <span className={styles.ledgerMetricCell}>{row.material ?? "-"}</span>
                        <span className={styles.ledgerMetricCell}>{row.cost ?? "-"}</span>
                        <span className={styles.ledgerMetricCell}>{row.refNotes ?? "-"}</span>
                      </div>
                    </button>
                    {expandedLedgerId === row.id ? (
                      <div className={styles.ledgerExpanded}>
                        <div className={styles.ledgerExpandedContent}>
                          {row.detailFields?.length ? (
                            <div className={styles.ledgerDetailGrid}>
                              {row.detailFields.map((field, index) => (
                                <div
                                  key={`${row.id}-${field.label}-${index}`}
                                  className={styles.ledgerDetailField}
                                >
                                  <span className={styles.ledgerDetailLabel}>
                                    {field.label}
                                  </span>
                                  <span className={styles.ledgerDetailValue}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {row.expandedDetail ? (
                            <p className={styles.ledgerExpandedNote}>
                              {row.expandedDetail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Inspection History"
              subtitle="History stays visible as a compact trail below the effective ledger."
            >
              <div className={styles.historyList}>
                {historyRows.map((row) => (
                  <details key={row.id} className={styles.historyItem}>
                    <summary className={styles.historySummary}>
                      <div>
                        <p className={styles.historyTitle}>{row.title}</p>
                        <p className={styles.historyTime}>{row.time}</p>
                      </div>
                      <span className={styles.historyToggle}>Expand</span>
                    </summary>
                    <p className={styles.historyBody}>{row.body}</p>
                  </details>
                ))}
              </div>
            </Panel>
          </main>

          <aside className={styles.utilityRail}>
            <UtilityPanel title="Operational AI" label="Admin Only">
              <div className={styles.intelligenceList}>
                {intelligenceRows.map((row) => (
                  <div
                    key={row.id}
                    className={`${styles.intelligenceItem} ${intelligenceToneClass(row.tone)}`}
                  >
                    <div className={styles.noteHeader}>
                      <span className={styles.intelligenceLabel}>{row.label}</span>
                      <span className={styles.noteTime}>{row.time}</span>
                    </div>
                    <p className={styles.noteBody}>{row.body}</p>
                  </div>
                ))}
              </div>
              <p className={styles.intelligenceEvidence}>{intelligenceEvidence}</p>
            </UtilityPanel>

            <UtilityPanel title="Internal Axis Notes" label="Private">
              <div className={styles.noteComposer}>
                <input
                  value={newInternalNote}
                  onChange={(event) => setNewInternalNote(event.target.value)}
                  className={styles.fieldInput}
                  placeholder="Add internal note..."
                />
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleAddInternalNote}
                >
                  Add
                </button>
              </div>
              {internalNotes.map((note) => (
                <div key={note.id} className={styles.noteRow}>
                  <div className={styles.noteHeader}>
                    <span className={styles.noteTag}>{note.label}</span>
                    <span className={styles.noteTime}>{note.time}</span>
                  </div>
                  <p className={styles.noteBody}>{note.body}</p>
                </div>
              ))}
            </UtilityPanel>

            <UtilityPanel title="Customer-Facing Notes" label="Customer Visible">
              <div className={styles.noteComposer}>
                <input
                  value={newCustomerNote}
                  onChange={(event) => setNewCustomerNote(event.target.value)}
                  className={styles.fieldInput}
                  placeholder="Publish customer note..."
                />
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleAddCustomerNote}
                >
                  Publish
                </button>
              </div>
              {customerNotes.map((note) => (
                <div key={note.id} className={styles.noteRow}>
                  <div className={styles.noteHeader}>
                    <span className={styles.noteTag}>{note.label}</span>
                    <span className={styles.noteTime}>{note.time}</span>
                  </div>
                  <p className={styles.noteBody}>{note.body}</p>
                </div>
              ))}
            </UtilityPanel>

            <UtilityPanel title="Reports" label="Utility">
              <div className={styles.utilityStack}>
                <div className={styles.utilityCard}>
                  <span className={styles.utilityCardLabel}>Linked report</span>
                  <strong>{reportLinked ? "Present" : "Not linked"}</strong>
                  <p>{reportStatus}</p>
                </div>
                <div className={styles.utilityCard}>
                  <span className={styles.utilityCardLabel}>Verified upload</span>
                  <strong>{verifiedUploadReady ? "Ready" : "Pending"}</strong>
                  <p>Toggle mock report states without any upload.</p>
                </div>
                <div className={styles.utilityButtonRow}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleToggleReportLinked}
                  >
                    {reportLinked ? "Unlink Report" : "Link Report"}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={handleToggleVerifiedUpload}
                  >
                    {verifiedUploadReady ? "Clear Upload" : "Set Upload Ready"}
                  </button>
                </div>
              </div>
            </UtilityPanel>

            <UtilityPanel title="QC / Third Party" label="Action Rail">
              <div className={styles.utilityStack}>
                <div className={styles.utilityCard}>
                  <span className={styles.utilityCardLabel}>Internal QC</span>
                  <strong>{qcPanelStatus}</strong>
                  <p>Mock-only QC posture updates the preview state chips.</p>
                </div>
                <div className={styles.utilityCard}>
                  <span className={styles.utilityCardLabel}>Third-party</span>
                  <strong>{thirdPartyStatus}</strong>
                  <p>External QC actions stay local to the prototype.</p>
                </div>
                <div className={styles.utilityButtonRow}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      handleQcToggle(
                        "Pass Pending Confirm",
                        "Mock Internal QC pass state enabled."
                      )
                    }
                  >
                    Internal Pass
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() =>
                      handleQcToggle(
                        "Pending Review",
                        "Mock Internal QC reset to pending."
                      )
                    }
                  >
                    Reset QC
                  </button>
                </div>
                <div className={styles.utilityButtonRow}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      handleThirdPartyToggle(
                        "Visit Scheduled",
                        "Mock third-party visit state enabled."
                      )
                    }
                  >
                    Schedule Visit
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() =>
                      handleThirdPartyToggle(
                        "Awaiting report",
                        "Mock third-party awaiting-report state enabled."
                      )
                    }
                  >
                    Await Report
                  </button>
                </div>
              </div>
            </UtilityPanel>

            <details
              className={`${styles.utilityPanel} ${styles.utilityCollapsed}`}
              open={routeOpen}
              onToggle={(event) =>
                setRouteOpen((event.currentTarget as HTMLDetailsElement).open)
              }
            >
              <summary className={styles.utilitySummary}>
                <div className={styles.utilitySummaryLeft}>
                  <h3 className={styles.utilityTitle}>Alternate Route</h3>
                  <span className={styles.utilityBadge}>
                    {routeOpen ? "Active" : "Collapsed"}
                  </span>
                </div>
                <span className={styles.utilityChevron}>
                  {routeOpen ? "Collapse" : "Expand"}
                </span>
              </summary>
              <div className={styles.utilityBody}>
                <div className={styles.routeForm}>
                  <label className={styles.inlineEditor}>
                    <span className={styles.editorLabel}>Target Stage</span>
                    <select
                      value={routeTarget}
                      className={styles.resultControl}
                      onChange={(event) => setRouteTarget(event.target.value)}
                    >
                      <option value="INTERNAL_QC">INTERNAL_QC</option>
                      <option value="THIRD_PARTY_QC">THIRD_PARTY_QC</option>
                      <option value="READY_FOR_INVOICE">READY_FOR_INVOICE</option>
                    </select>
                  </label>
                  <label className={styles.inlineEditor}>
                    <span className={styles.editorLabel}>Reason</span>
                    <input
                      value={routeReason}
                      onChange={(event) => setRouteReason(event.target.value)}
                      className={styles.fieldInput}
                      placeholder="Mock route reason"
                    />
                  </label>
                  <div className={styles.utilityButtonRow}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={handleRoutePreview}
                    >
                      Route Preview
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </aside>
        </div>
      </div>
    </section>
  )
}
