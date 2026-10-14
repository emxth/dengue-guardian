import { useState, useCallback, useMemo } from "react";
import {
    RefreshCw,
    CalendarDays,
    ClipboardList,
    RotateCcw,
    AlertTriangle,
    Loader2,
    CheckCircle2,
    Info,
    Search,
    X,
} from "lucide-react";

import {
    fetchPriorities,
    createSchedule,
    reschedule,
} from "../api/planningApi";
import PriorityTable from "../components/PriorityTable";
import ScheduleTable from "../components/ScheduleTable";
import PlanningSummaryCards from "../components/PlanningSummaryCards";
import PrioritySummaryCards from "../components/PrioritySummaryCards";
import LocationDistributionTable from "../components/LocationDistributionTable";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DATE = "2026-04-01";
const PRIORITY_LIMIT_OPTIONS = [25, 50, 100, 200];

// Known PHI identifiers from the synthetic dataset (PHI_Daily table).
// The user can also type any PHI ID manually.
const KNOWN_PHI_IDS = [
    "PHI01", "PHI02", "PHI03", "PHI04", "PHI05",
    "PHI06", "PHI07", "PHI08", "PHI09", "PHI10",
];

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
    { id: "overview", label: "Overview", icon: Info },
    { id: "priorities", label: "Inspection Priorities", icon: ClipboardList },
    { id: "schedule", label: "PHI Scheduling", icon: CalendarDays },
    { id: "reschedule", label: "Adaptive Rescheduling", icon: RotateCcw },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PhiPlanningDashboard() {
    const [activeTab, setActiveTab] = useState("overview");

    // ── Priorities state ──────────────────────────────────────────────────────
    const [priorityLimit, setPriorityLimit] = useState(100);
    const [priorities, setPriorities] = useState(null);
    const [priorityLoading, setPriorityLoading] = useState(false);
    const [priorityError, setPriorityError] = useState(null);

    // ── Schedule state ────────────────────────────────────────────────────────
    const [scheduleDate, setScheduleDate] = useState(DEFAULT_DATE);
    const [scheduleResult, setScheduleResult] = useState(null);
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [scheduleError, setScheduleError] = useState(null);

    // ── Reschedule state ──────────────────────────────────────────────────────
    const [rescheduleDate, setRescheduleDate] = useState(DEFAULT_DATE);
    const [unavailablePhi, setUnavailablePhi] = useState("PHI02");
    const [assumeAllPending, setAssumeAllPending] = useState(true);
    const [rescheduleResult, setRescheduleResult] = useState(null);
    const [rescheduleLoading, setRescheduleLoading] = useState(false);
    const [rescheduleError, setRescheduleError] = useState(null);
    const [showConfirm, setShowConfirm] = useState(false);

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const handleLoadPriorities = useCallback(async () => {
        if (priorityLoading) return;
        setPriorityLoading(true);
        setPriorityError(null);
        try {
            const data = await fetchPriorities(priorityLimit);
            setPriorities(data);
        } catch (err) {
            setPriorityError(err.message);
        } finally {
            setPriorityLoading(false);
        }
    }, [priorityLoading, priorityLimit]);

    const handleGenerateSchedule = useCallback(async () => {
        if (scheduleLoading) return;
        setScheduleLoading(true);
        setScheduleError(null);
        try {
            const data = await createSchedule(scheduleDate);
            setScheduleResult(data);
        } catch (err) {
            setScheduleError(err.message);
        } finally {
            setScheduleLoading(false);
        }
    }, [scheduleLoading, scheduleDate]);

    const handleRescheduleConfirmed = useCallback(async () => {
        setShowConfirm(false);
        if (rescheduleLoading) return;
        setRescheduleLoading(true);
        setRescheduleError(null);
        try {
            const data = await reschedule(
                rescheduleDate,
                unavailablePhi,
                assumeAllPending
            );
            setRescheduleResult(data);
        } catch (err) {
            setRescheduleError(err.message);
        } finally {
            setRescheduleLoading(false);
        }
    }, [rescheduleLoading, rescheduleDate, unavailablePhi, assumeAllPending]);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="bg-mintSurface border-l-4 border-primary p-5 rounded-xl flex flex-wrap gap-4 justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-darkBase">
                        PHI Inspection Planning & Operations
                    </h3>
                    <p className="text-sm text-textMuted mt-0.5">
                        Intelligent inspection task prioritization, officer scheduling, and adaptive resource management.
                    </p>
                </div>
                <span className="bg-surface text-primary border border-primary px-3.5 py-1.5 rounded-full text-xs font-bold">
                    Kaduwela MOH Division
                </span>
            </div>

            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-1.5 border-b border-borderLight pb-0">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        id={`tab-${id}`}
                        onClick={() => setActiveTab(id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold transition border-b-2 -mb-px ${activeTab === id
                            ? "bg-surface border-primary text-primary"
                            : "border-transparent text-textMuted hover:text-darkBase hover:bg-background"
                            }`}
                    >
                        <Icon size={15} />
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Tab: Overview ─────────────────────────────────────────────── */}
            {activeTab === "overview" && (
                <OverviewTab
                    scheduleResult={scheduleResult}
                    priorities={priorities}
                    onLoadPriorities={() => {
                        setActiveTab("priorities");
                        handleLoadPriorities();
                    }}
                    onGenerateSchedule={() => setActiveTab("schedule")}
                    onReschedule={() => setActiveTab("reschedule")}
                />
            )}

            {/* ── Tab: Priorities ───────────────────────────────────────────── */}
            {activeTab === "priorities" && (
                <PrioritiesTab
                    priorities={priorities}
                    loading={priorityLoading}
                    error={priorityError}
                    limit={priorityLimit}
                    onLimitChange={setPriorityLimit}
                    onLoad={handleLoadPriorities}
                />
            )}

            {/* ── Tab: Schedule ─────────────────────────────────────────────── */}
            {activeTab === "schedule" && (
                <ScheduleTab
                    date={scheduleDate}
                    onDateChange={setScheduleDate}
                    result={scheduleResult}
                    loading={scheduleLoading}
                    error={scheduleError}
                    onGenerate={handleGenerateSchedule}
                />
            )}

            {/* ── Tab: Reschedule ───────────────────────────────────────────── */}
            {activeTab === "reschedule" && (
                <RescheduleTab
                    date={rescheduleDate}
                    onDateChange={setRescheduleDate}
                    unavailablePhi={unavailablePhi}
                    onPhiChange={setUnavailablePhi}
                    assumeAllPending={assumeAllPending}
                    onAssumeChange={setAssumeAllPending}
                    result={rescheduleResult}
                    loading={rescheduleLoading}
                    error={rescheduleError}
                    showConfirm={showConfirm}
                    onRequestConfirm={() => setShowConfirm(true)}
                    onConfirm={handleRescheduleConfirmed}
                    onCancelConfirm={() => setShowConfirm(false)}
                    scheduleExists={!!scheduleResult}
                />
            )}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-components (defined here to keep the feature self-contained)
// ═════════════════════════════════════════════════════════════════════════════

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ scheduleResult, priorities, onLoadPriorities, onGenerateSchedule, onReschedule }) {
    const steps = [
        {
            num: 1,
            title: "Load Inspection Priorities",
            desc: "Retrieve provisional priority scores for dengue cases and citizen complaints.",
            action: "Go to Priorities →",
            onClick: onLoadPriorities,
        },
        {
            num: 2,
            title: "Review Priority Tasks",
            desc: "Examine which cases and complaints are ranked High, Medium, or Low by the scoring rules.",
            action: null,
        },
        {
            num: 3,
            title: "Generate a PHI Schedule",
            desc: "Run the scheduling optimization engine to allocate inspection tasks to available PHIs for a chosen date.",
            action: "Go to Scheduling →",
            onClick: onGenerateSchedule,
        },
        {
            num: 4,
            title: "Inspect Scheduling Result",
            desc: "Review assigned PHIs, time slots, and any unscheduled tasks.",
            action: null,
        },
        {
            num: 5,
            title: "Simulate PHI Unavailability",
            desc: "Mark a PHI as unavailable and trigger adaptive rescheduling to redistribute pending tasks.",
            action: "Go to Rescheduling →",
            onClick: onReschedule,
        },
        {
            num: 6,
            title: "Review Rescheduled Plan",
            desc: "Check which tasks were reassigned, which remain unscheduled, and the reason for each.",
            action: null,
        },
    ];

    return (
        <div className="space-y-6">
            {/* Workflow steps */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-sm p-6">
                <h4 className="text-base font-bold text-darkBase mb-4">
                    Planning Workflow
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {steps.map(({ num, title, desc, action, onClick }) => (
                        <div
                            key={num}
                            className="p-4 bg-background rounded-lg border border-borderLight"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <span className="w-7 h-7 rounded-full bg-primary text-surface text-xs font-bold flex items-center justify-center shrink-0">
                                    {num}
                                </span>
                                <p className="text-sm font-bold text-darkBase">{title}</p>
                            </div>
                            <p className="text-xs text-textMuted leading-relaxed mb-3">
                                {desc}
                            </p>
                            {action && (
                                <button
                                    onClick={onClick}
                                    className="text-xs font-bold text-primary hover:text-secondary transition"
                                >
                                    {action}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Latest schedule summary */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-sm p-6">
                <h4 className="text-base font-bold text-darkBase mb-4">
                    Latest Scheduling Result
                </h4>
                {scheduleResult ? (
                    <div className="space-y-4">
                        <PlanningSummaryCards
                            totalTasks={scheduleResult.total_tasks}
                            scheduledTasks={scheduleResult.scheduled_tasks}
                            unscheduledTasks={scheduleResult.unscheduled_tasks}
                            solverStatus={scheduleResult.solver_status}
                        />
                        <p className="text-xs text-textMuted">
                            Planning date: <span className="font-semibold text-darkBase">{scheduleResult.planning_date}</span>
                        </p>
                    </div>
                ) : (
                    <EmptyState message="No schedule has been generated yet. Go to the PHI Scheduling tab and run the solver." />
                )}
            </div>

            {/* Priorities loaded summary */}
            {priorities && (
                <div className="bg-surface rounded-xl border border-borderLight shadow-sm p-6">
                    <h4 className="text-base font-bold text-darkBase mb-2">
                        Loaded Priority Data
                    </h4>
                    <p className="text-sm text-textMuted">
                        {priorities.total_cases} case task
                        {priorities.total_cases !== 1 ? "s" : ""} •{" "}
                        {priorities.total_complaints} complaint task
                        {priorities.total_complaints !== 1 ? "s" : ""}
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Priorities Tab ────────────────────────────────────────────────────────────

function PrioritiesTab({ priorities, loading, error, limit, onLimitChange, onLoad }) {
    // Filter states
    const [categoryFilter, setCategoryFilter] = useState("all"); // "all" | "cases" | "complaints"
    const [priorityFilter, setPriorityFilter] = useState("all"); // "all" | "High" | "Medium" | "Low"
    const [locationFilter, setLocationFilter] = useState("all"); // "all" | location_id
    const [searchQuery, setSearchQuery] = useState("");

    // Extracted raw datasets
    const rawCases = useMemo(() => priorities?.cases ?? [], [priorities]);
    const rawComplaints = useMemo(() => priorities?.complaints ?? [], [priorities]);

    // Current category tasks (before priority/location/search filtering)
    const categoryTasks = useMemo(() => {
        if (!priorities) return [];
        if (categoryFilter === "cases") return rawCases;
        if (categoryFilter === "complaints") return rawComplaints;
        // "all": combine and sort by provisional priority score descending
        return [...rawCases, ...rawComplaints].sort(
            (a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)
        );
    }, [priorities, categoryFilter, rawCases, rawComplaints]);

    // Priority summary counts for currently loaded category dataset
    const { highCount, mediumCount, lowCount, totalLoadedCount } = useMemo(() => {
        let high = 0;
        let medium = 0;
        let low = 0;
        for (const t of categoryTasks) {
            if (t.priority_level === "High") high++;
            else if (t.priority_level === "Medium") medium++;
            else if (t.priority_level === "Low") low++;
        }
        return {
            highCount: high,
            mediumCount: medium,
            lowCount: low,
            totalLoadedCount: categoryTasks.length,
        };
    }, [categoryTasks]);

    // Distinct locations from category tasks
    const availableLocations = useMemo(() => {
        const map = new Map();
        for (const t of categoryTasks) {
            const locId = t.location_id;
            if (locId && !map.has(locId)) {
                map.set(locId, {
                    location_id: locId,
                    location_name: t.location_name || "Name unavailable",
                    location_label: t.location_label || "Synthetic Point",
                });
            }
        }
        return Array.from(map.values()).sort((a, b) =>
            a.location_name.localeCompare(b.location_name)
        );
    }, [categoryTasks]);

    // Filtered tasks for the table
    const filteredTasks = useMemo(() => {
        return categoryTasks.filter((task) => {
            // Priority filter
            if (priorityFilter !== "all" && task.priority_level !== priorityFilter) {
                return false;
            }

            // Location filter
            if (locationFilter !== "all" && task.location_id !== locationFilter) {
                return false;
            }

            // Search query filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchId = String(task.task_id || "").toLowerCase().includes(q);
                const matchLocId = String(task.location_id || "").toLowerCase().includes(q);
                const matchLocName = String(task.location_name || "").toLowerCase().includes(q);
                const matchLocLabel = String(task.location_label || "").toLowerCase().includes(q);
                const matchReason = String(task.priority_reason || "").toLowerCase().includes(q);
                const matchType = String(task.task_type || "").toLowerCase().includes(q);
                const matchComplaintType = String(task.complaint_type || "").toLowerCase().includes(q);

                if (!matchId && !matchLocId && !matchLocName && !matchLocLabel && !matchReason && !matchType && !matchComplaintType) {
                    return false;
                }
            }

            return true;
        });
    }, [categoryTasks, priorityFilter, locationFilter, searchQuery]);

    const handleSelectPriorityFromCard = (level) => {
        if (level === "all") {
            setPriorityFilter("all");
        } else {
            // Toggle
            setPriorityFilter((prev) => (prev === level ? "all" : level));
        }
    };

    const handleSelectLocation = (locId) => {
        setLocationFilter(locId);
    };

    const handleResetFilters = () => {
        setPriorityFilter("all");
        setLocationFilter("all");
        setSearchQuery("");
    };

    const hasActiveFilters =
        priorityFilter !== "all" ||
        locationFilter !== "all" ||
        searchQuery.trim() !== "";

    return (
        <div className="space-y-6">
            {/* Top API fetch control bar */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-xs p-5 flex flex-wrap gap-4 items-end justify-between">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label
                            htmlFor="priority-limit"
                            className="block text-xs font-bold text-textMuted mb-1.5 uppercase"
                        >
                            Records per category
                        </label>
                        <select
                            id="priority-limit"
                            value={limit}
                            onChange={(e) => onLimitChange(Number(e.target.value))}
                            className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
                        >
                            {PRIORITY_LIMIT_OPTIONS.map((n) => (
                                <option key={n} value={n}>
                                    {n} records
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        id="btn-load-priorities"
                        onClick={onLoad}
                        disabled={loading}
                        className="bg-primary hover:bg-secondary disabled:opacity-60 disabled:cursor-not-allowed text-surface px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition"
                    >
                        {loading ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : (
                            <RefreshCw size={15} />
                        )}
                        {loading ? "Loading…" : "Load Priorities"}
                    </button>
                </div>

                {priorities && (
                    <div className="text-xs text-textMuted text-right">
                        <span className="font-semibold text-darkBase">
                            {priorities.total_cases?.toLocaleString()} registered cases • {priorities.total_complaints?.toLocaleString()} complaints
                        </span>
                        <div className="text-[11px] text-textMuted">
                            Kaduwela MOH Surveillance Area
                        </div>
                    </div>
                )}
            </div>

            {/* Error banner */}
            {error && <ApiError message={error} />}

            {/* When data is loaded */}
            {priorities && (
                <div className="space-y-6">
                    {/* 1. Priority Summary Cards */}
                    <PrioritySummaryCards
                        highCount={highCount}
                        mediumCount={mediumCount}
                        lowCount={lowCount}
                        totalCount={totalLoadedCount}
                        activePriority={priorityFilter}
                        onSelectPriority={handleSelectPriorityFromCard}
                        totalCases={priorities.total_cases ?? 0}
                        totalComplaints={priorities.total_complaints ?? 0}
                        category={categoryFilter}
                    />

                    {/* 2. Location-Based Summary */}
                    <LocationDistributionTable
                        tasks={categoryTasks}
                        selectedLocation={locationFilter}
                        onSelectLocation={handleSelectLocation}
                        totalLoadedTasks={totalLoadedCount}
                    />

                    {/* 3. Task Filters & Search Bar */}
                    <div className="bg-surface rounded-xl border border-borderLight shadow-xs p-5 space-y-4">
                        {/* Row 1: Category Filter & Search Bar */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            {/* Task Category Tabs */}
                            <div className="flex items-center gap-1.5 p-1 bg-background rounded-xl border border-borderLight self-start">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCategoryFilter("all");
                                        setLocationFilter("all");
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${categoryFilter === "all"
                                        ? "bg-surface text-primary shadow-xs border border-borderLight"
                                        : "text-textMuted hover:text-darkBase"
                                        }`}
                                >
                                    <span>All Tasks</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-primary/10 text-primary">
                                        {rawCases.length + rawComplaints.length}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setCategoryFilter("cases");
                                        setLocationFilter("all");
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${categoryFilter === "cases"
                                        ? "bg-surface text-primary shadow-xs border border-borderLight"
                                        : "text-textMuted hover:text-darkBase"
                                        }`}
                                >
                                    <span>Dengue Cases</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-700">
                                        {rawCases.length}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setCategoryFilter("complaints");
                                        setLocationFilter("all");
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${categoryFilter === "complaints"
                                        ? "bg-surface text-primary shadow-xs border border-borderLight"
                                        : "text-textMuted hover:text-darkBase"
                                        }`}
                                >
                                    <span>Citizen Complaints</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 text-purple-700">
                                        {rawComplaints.length}
                                    </span>
                                </button>
                            </div>

                            {/* Search bar */}
                            <div className="relative w-full md:w-80">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-textMuted">
                                    <Search size={15} />
                                </div>
                                <input
                                    id="search-tasks"
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search task ID, location, reason..."
                                    className="w-full pl-9 pr-8 py-2 text-xs border border-borderLight rounded-xl bg-background text-darkBase placeholder:text-textMuted/70 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-surface transition"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery("")}
                                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-textMuted hover:text-darkBase cursor-pointer"
                                        title="Clear search"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Row 2: Secondary Dropdown Filters (Priority & Location) + Reset */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-borderLight text-xs">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Priority Dropdown */}
                                <div className="flex items-center gap-2">
                                    <label
                                        htmlFor="priority-select"
                                        className="text-textMuted font-bold uppercase text-[11px]"
                                    >
                                        Priority:
                                    </label>
                                    <select
                                        id="priority-select"
                                        value={priorityFilter}
                                        onChange={(e) => setPriorityFilter(e.target.value)}
                                        className="border border-borderLight rounded-lg px-2.5 py-1.5 text-xs text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
                                    >
                                        <option value="all">All Priorities ({totalLoadedCount})</option>
                                        <option value="High">High Priority ({highCount})</option>
                                        <option value="Medium">Medium Priority ({mediumCount})</option>
                                        <option value="Low">Low Priority ({lowCount})</option>
                                    </select>
                                </div>

                                {/* Location Dropdown */}
                                <div className="flex items-center gap-2">
                                    <label
                                        htmlFor="location-select"
                                        className="text-textMuted font-bold uppercase text-[11px]"
                                    >
                                        Location:
                                    </label>
                                    <select
                                        id="location-select"
                                        value={locationFilter}
                                        onChange={(e) => setLocationFilter(e.target.value)}
                                        className="border border-borderLight rounded-lg px-2.5 py-1.5 text-xs text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 max-w-xs font-semibold"
                                    >
                                        <option value="all">
                                            All Locations ({availableLocations.length})
                                        </option>
                                        {availableLocations.map((loc) => (
                                            <option key={loc.location_id} value={loc.location_id}>
                                                {loc.location_name} ({loc.location_id})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={handleResetFilters}
                                        className="text-primary hover:text-secondary font-bold text-xs underline flex items-center gap-1 cursor-pointer"
                                    >
                                        <X size={12} />
                                        Reset all filters
                                    </button>
                                )}
                            </div>

                            {/* Result counts */}
                            <div className="text-textMuted font-medium">
                                Showing <strong>{filteredTasks.length}</strong> of <strong>{totalLoadedCount}</strong> tasks
                                {hasActiveFilters && (
                                    <span className="text-[11px] text-textMuted/80 italic ml-1.5">
                                        (filtered)
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 4. Priority Tasks Table */}
                    <div className="bg-surface rounded-xl border border-borderLight shadow-xs overflow-hidden">
                        <PriorityTable
                            rows={filteredTasks}
                            taskType={categoryFilter}
                            emptyLabel={
                                hasActiveFilters
                                    ? "No tasks match the active filters. Try adjusting your priority, location, or search terms."
                                    : "No tasks were returned by the API."
                            }
                        />
                    </div>
                </div>
            )}

            {!priorities && !loading && !error && (
                <EmptyState message="Click 'Load Priorities' to view inspection task priority rankings." />
            )}
        </div>
    );
}

// ── Schedule Tab ──────────────────────────────────────────────────────────────

function ScheduleTab({ date, onDateChange, result, loading, error, onGenerate }) {
    return (
        <div className="space-y-5">
            {/* Controls */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-sm p-5 flex flex-wrap gap-4 items-end">
                <div>
                    <label
                        htmlFor="schedule-date"
                        className="block text-xs font-bold text-textMuted mb-1.5 uppercase"
                    >
                        Planning Date
                    </label>
                    <input
                        id="schedule-date"
                        type="date"
                        value={date}
                        min="2026-04-01"
                        max="2026-09-30"
                        onChange={(e) => onDateChange(e.target.value)}
                        className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <p className="text-xs text-textMuted mt-1">
                        Date Range: 2026-04-01 → 2026-09-30
                    </p>
                </div>

                <button
                    id="btn-generate-schedule"
                    onClick={onGenerate}
                    disabled={loading}
                    className="bg-primary hover:bg-secondary disabled:opacity-60 disabled:cursor-not-allowed text-surface px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition"
                >
                    {loading ? (
                        <Loader2 size={15} className="animate-spin" />
                    ) : (
                        <CalendarDays size={15} />
                    )}
                    {loading ? "Running Solver…" : "Generate Schedule"}
                </button>
            </div>

            {/* Error */}
            {error && <ApiError message={error} />}

            {/* Result */}
            {result && (
                <div className="space-y-4">
                    {/* Success notice */}
                    <div className="flex items-center gap-3 bg-mintSurface border border-riskCleared rounded-xl px-4 py-3">
                        <CheckCircle2 size={18} className="text-riskCleared shrink-0" />
                        <p className="text-sm text-darkBase">
                            <span className="font-bold">Schedule generated successfully</span> for{" "}
                            {result.planning_date} (Status:{" "}
                            <span className="font-bold text-primary">
                                {result.solver_status}
                            </span>)
                        </p>
                    </div>

                    {/* KPI cards */}
                    <PlanningSummaryCards
                        totalTasks={result.total_tasks}
                        scheduledTasks={result.scheduled_tasks}
                        unscheduledTasks={result.unscheduled_tasks}
                        solverStatus={result.solver_status}
                    />

                    {/* Task table */}
                    <div className="bg-surface rounded-xl border border-borderLight shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-borderLight flex items-center justify-between">
                            <h4 className="text-sm font-bold text-darkBase">
                                Scheduled Task Details
                            </h4>
                            <span className="text-xs text-textMuted">
                                {result.tasks?.length ?? 0} rows
                            </span>
                        </div>
                        <ScheduleTable
                            tasks={result.tasks ?? []}
                            emptyLabel="No tasks were returned in the schedule response."
                        />
                    </div>
                </div>
            )}

            {!result && !loading && !error && (
                <EmptyState message="Select a planning date and click 'Generate Schedule' to create officer inspection routes." />
            )}
        </div>
    );
}

// ── Reschedule Tab ────────────────────────────────────────────────────────────

function RescheduleTab({
    date,
    onDateChange,
    unavailablePhi,
    onPhiChange,
    assumeAllPending,
    onAssumeChange,
    result,
    loading,
    error,
    showConfirm,
    onRequestConfirm,
    onConfirm,
    onCancelConfirm,
    scheduleExists,
}) {
    return (
        <div className="space-y-5">
            {/* Prerequisite notice */}
            {!scheduleExists && (
                <div className="flex items-start gap-3 bg-amber-50 border border-riskMedium rounded-xl px-4 py-3">
                    <AlertTriangle size={18} className="text-riskMedium mt-0.5 shrink-0" />
                    <p className="text-sm text-textMuted">
                        <span className="font-bold text-darkBase">
                            Schedule required first.{" "}
                        </span>
                        Please generate a schedule from the PHI Scheduling tab before running
                        adaptive rescheduling for the selected date.
                    </p>
                </div>
            )}

            {/* Controls */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-sm p-5 space-y-4">
                <h4 className="text-sm font-bold text-darkBase">
                    Rescheduling Parameters
                </h4>

                <div className="flex flex-wrap gap-5 items-end">
                    {/* Date */}
                    <div>
                        <label
                            htmlFor="reschedule-date"
                            className="block text-xs font-bold text-textMuted mb-1.5 uppercase"
                        >
                            Planning Date
                        </label>
                        <input
                            id="reschedule-date"
                            type="date"
                            value={date}
                            min="2026-04-01"
                            max="2026-09-30"
                            onChange={(e) => onDateChange(e.target.value)}
                            className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>

                    {/* PHI selector */}
                    <div>
                        <label
                            htmlFor="unavailable-phi"
                            className="block text-xs font-bold text-textMuted mb-1.5 uppercase"
                        >
                            Unavailable PHI
                        </label>
                        <div className="flex gap-2">
                            <select
                                id="unavailable-phi"
                                value={KNOWN_PHI_IDS.includes(unavailablePhi) ? unavailablePhi : ""}
                                onChange={(e) => {
                                    if (e.target.value) onPhiChange(e.target.value);
                                }}
                                className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                                <option value="">Select or type below</option>
                                {KNOWN_PHI_IDS.map((id) => (
                                    <option key={id} value={id}>
                                        {id}
                                    </option>
                                ))}
                            </select>
                            <input
                                id="unavailable-phi-manual"
                                type="text"
                                placeholder="or type PHI ID"
                                value={unavailablePhi}
                                onChange={(e) => onPhiChange(e.target.value)}
                                className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 w-32"
                            />
                        </div>
                    </div>
                </div>

                {/* Assume all pending toggle */}
                <div className="flex items-start gap-3 p-3 bg-background rounded-lg border border-borderLight">
                    <input
                        id="assume-all-pending"
                        type="checkbox"
                        checked={assumeAllPending}
                        onChange={(e) => onAssumeChange(e.target.checked)}
                        className="mt-0.5 accent-primary w-4 h-4 rounded"
                    />
                    <div>
                        <label
                            htmlFor="assume-all-pending"
                            className="text-sm font-bold text-darkBase cursor-pointer"
                        >
                            Include remaining uncompleted tasks
                        </label>
                        <p className="text-xs text-textMuted mt-0.5">
                            Treats pending tasks as eligible for dynamic redistribution to other available officers.
                        </p>
                    </div>
                </div>

                <button
                    id="btn-request-reschedule"
                    onClick={onRequestConfirm}
                    disabled={loading || !unavailablePhi.trim()}
                    className="bg-primary hover:bg-secondary disabled:opacity-60 disabled:cursor-not-allowed text-surface px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition"
                >
                    {loading ? (
                        <Loader2 size={15} className="animate-spin" />
                    ) : (
                        <RotateCcw size={15} />
                    )}
                    {loading ? "Rescheduling…" : "Reschedule Tasks"}
                </button>
            </div>

            {/* Confirmation dialog */}
            {showConfirm && (
                <div className="bg-amber-50 border border-riskMedium rounded-xl px-5 py-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="text-riskMedium mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-darkBase">
                                Confirm Task Redistribution
                            </p>
                            <p className="text-sm text-textMuted mt-1">
                                Marking{" "}
                                <span className="font-bold text-darkBase">
                                    {unavailablePhi}
                                </span>{" "}
                                as unavailable on{" "}
                                <span className="font-bold text-darkBase">{date}</span> will
                                reallocate their assigned inspection tasks to available officers in the division.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            id="btn-confirm-reschedule"
                            onClick={onConfirm}
                            className="bg-primary hover:bg-secondary text-surface px-4 py-2 rounded-lg text-sm font-bold transition"
                        >
                            Confirm & Reschedule
                        </button>
                        <button
                            id="btn-cancel-reschedule"
                            onClick={onCancelConfirm}
                            className="bg-surface border border-borderLight text-textMuted hover:text-darkBase px-4 py-2 rounded-lg text-sm font-bold transition"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && <ApiError message={error} />}

            {/* Result */}
            {result && (
                <div className="space-y-4">
                    {/* Success header */}
                    <div className="flex items-center gap-3 bg-mintSurface border border-riskCleared rounded-xl px-4 py-3">
                        <CheckCircle2 size={18} className="text-riskCleared shrink-0" />
                        <p className="text-sm text-darkBase">
                            <span className="font-bold">Rescheduling complete</span> — Tasks for PHI{" "}
                            <span className="font-bold text-primary">{result.unavailable_phi}</span> on{" "}
                            {result.planning_date} have been successfully redistributed.
                        </p>
                    </div>

                    {/* Summary counts */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <StatCard label="Total Tasks" value={result.total_tasks} />
                        <StatCard
                            label="Scheduled"
                            value={result.scheduled_tasks}
                            color="text-riskCleared"
                        />
                        <StatCard
                            label="Unscheduled"
                            value={result.unscheduled_tasks}
                            color="text-riskHigh"
                        />
                        <StatCard
                            label="Pending Rescheduling"
                            value={result.pending_rescheduling_tasks}
                            color="text-riskMedium"
                        />
                    </div>

                    {/* Task table */}
                    <div className="bg-surface rounded-xl border border-borderLight shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-borderLight flex items-center justify-between">
                            <h4 className="text-sm font-bold text-darkBase">
                                Updated Task Assignments
                            </h4>
                            <span className="text-xs text-textMuted">
                                {result.tasks?.length ?? 0} rows
                            </span>
                        </div>
                        <ScheduleTable
                            tasks={result.tasks ?? []}
                            emptyLabel="No tasks were returned in the rescheduling response."
                        />
                    </div>
                </div>
            )}

            {!result && !loading && !error && (
                <EmptyState message="Select an unavailable officer and date, then click 'Reschedule Tasks' to reallocate pending tasks." />
            )}
        </div>
    );
}

// ─── Helper components ────────────────────────────────────────────────────────

function ApiError({ message }) {
    return (
        <div className="flex items-start gap-3 bg-red-50 border border-riskHigh rounded-xl px-4 py-3">
            <AlertTriangle size={18} className="text-riskHigh mt-0.5 shrink-0" />
            <div>
                <p className="text-sm font-bold text-riskHigh">API Error</p>
                <p className="text-sm text-textMuted mt-0.5">{message}</p>
            </div>
        </div>
    );
}

function EmptyState({ message }) {
    return (
        <div className="bg-surface rounded-xl border border-borderLight shadow-sm p-10 text-center text-sm text-textMuted">
            <Info size={28} className="mx-auto mb-3 text-borderLight" />
            {message}
        </div>
    );
}


function StatCard({ label, value, color = "text-darkBase" }) {
    return (
        <div className="bg-surface rounded-xl border border-borderLight shadow-sm p-4">
            <p className="text-xs font-bold uppercase text-textMuted mb-1">{label}</p>
            <p className={`text-2xl font-extrabold ${color}`}>{value ?? "—"}</p>
        </div>
    );
}
