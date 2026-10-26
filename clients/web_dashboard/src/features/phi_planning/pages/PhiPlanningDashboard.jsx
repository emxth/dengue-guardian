import { useState, useCallback, useRef, useEffect } from "react";
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
    PlusCircle,
    BarChart3,
    ClipboardCheck,
} from "lucide-react";

import {
    fetchPriorities,
    createSchedule,
    fetchSchedule,
    fetchCompletedInspections,
    confirmSchedule,
    reschedule,
    fetchPhiAvailability,
    setPhiAvailability,
} from "../api/planningApi";
import PriorityTable from "../components/PriorityTable";
import ScheduleTable from "../components/ScheduleTable";
import ReschedulingDetailsTable from "../components/ReschedulingDetailsTable";
import PlanningSummaryCards from "../components/PlanningSummaryCards";
import PrioritySummaryCards from "../components/PrioritySummaryCards";
import LocationDistributionTable from "../components/LocationDistributionTable";
import NewInspectionTaskForm from "../components/NewInspectionTaskForm";
import MonthlyDengueTrends from "../components/MonthlyDengueTrends";
import { cleanLocationLabel, formatLocation } from "../../../shared/utils/locationDisplay";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DATE = "2026-04-01";
const PRIORITY_LIMIT_OPTIONS = [25, 50, 100, 200];

function getLocalDateInputValue() {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${today.getFullYear()}-${month}-${day}`;
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
    { id: "overview", label: "Overview", icon: Info },
    { id: "priorities", label: "Inspection Priorities", icon: ClipboardList },
    { id: "trends", label: "Dengue Trends", icon: BarChart3 },
    { id: "schedule", label: "PHI Scheduling", icon: CalendarDays },
    { id: "reschedule", label: "Adaptive Rescheduling", icon: RotateCcw },
    { id: "completed", label: "Inspections Covered", icon: ClipboardCheck },
    { id: "new-task", label: "New Inspection Task", icon: PlusCircle },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PhiPlanningDashboard() {
    const [activeTab, setActiveTab] = useState("overview");

    // ── Priorities state ──────────────────────────────────────────────────────
    const [priorityLimit, setPriorityLimit] = useState(200);
    const [priorityDate, setPriorityDate] = useState("");
    const [taskDateFrom, setTaskDateFrom] = useState("");
    const [taskDateTo, setTaskDateTo] = useState("");
    const [priorities, setPriorities] = useState(null);
    const [priorityDateCoverage, setPriorityDateCoverage] = useState(null);
    const [priorityLoading, setPriorityLoading] = useState(false);
    const [priorityError, setPriorityError] = useState(null);
    const priorityRequestRef = useRef({ id: 0, key: null, promise: null });

    // ── Schedule state ────────────────────────────────────────────────────────
    const [scheduleDate, setScheduleDate] = useState(DEFAULT_DATE);
    const [scheduleResult, setScheduleResult] = useState(null);
    const [originalSchedulePlan, setOriginalSchedulePlan] = useState(null);
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [scheduleError, setScheduleError] = useState(null);
    const [confirmationLoading, setConfirmationLoading] = useState(false);

    // ── Completed inspection state ───────────────────────────────────────────
    const [completedDate, setCompletedDate] = useState(getLocalDateInputValue);
    const [completedReports, setCompletedReports] = useState([]);
    const [completedLoading, setCompletedLoading] = useState(false);
    const [completedError, setCompletedError] = useState("");
    const [selectedCompletedReport, setSelectedCompletedReport] = useState(null);

    // ── Reschedule state ──────────────────────────────────────────────────────
    const [rescheduleDate, setRescheduleDate] = useState(DEFAULT_DATE);
    const [unavailablePhi, setUnavailablePhi] = useState("");
    const [rescheduleResult, setRescheduleResult] = useState(null);
    const [rescheduleLoading, setRescheduleLoading] = useState(false);
    const [rescheduleError, setRescheduleError] = useState(null);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        if (activeTab !== "completed" || !completedDate) return undefined;
        let active = true;
        const timer = setTimeout(() => {
            setCompletedLoading(true);
            setCompletedError("");
            fetchCompletedInspections(completedDate)
                .then((data) => {
                    if (active) setCompletedReports(data.reports ?? []);
                })
                .catch((err) => {
                    if (active) {
                        setCompletedReports([]);
                        setCompletedError(err.message);
                    }
                })
                .finally(() => {
                    if (active) setCompletedLoading(false);
                });
        }, 0);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [activeTab, completedDate]);

    useEffect(() => {
        let active = true;
        fetchSchedule(scheduleDate)
            .then((data) => {
                if (!active) return;
                setScheduleResult(data);
                setOriginalSchedulePlan(data.tasks ?? []);
                setRescheduleDate(data.planning_date);
                const assignedPhis = [...new Set(
                    (data.tasks ?? [])
                        .map((task) => task.assigned_phi?.trim())
                        .filter(Boolean)
                )];
                setUnavailablePhi(assignedPhis[0] ?? "");
                setScheduleError(null);
            })
            .catch((err) => {
                if (!active) return;
                if (err.status === 404) {
                    setScheduleResult(null);
                    setOriginalSchedulePlan(null);
                    setScheduleError(null);
                } else {
                    setScheduleError(err.message);
                }
            });
        return () => {
            active = false;
        };
    }, [scheduleDate]);

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const handleLoadPriorities = useCallback((query = {}) => {
        const params = {
            limit: query.limit ?? priorityLimit,
            offset: query.offset ?? 0,
            planningDate: query.planningDate ?? priorityDate,
            dateFrom: query.dateFrom ?? taskDateFrom,
            dateTo: query.dateTo ?? taskDateTo,
            task_type: query.task_type ?? "all",
            priority_level: query.priority_level ?? "all",
            location_id: query.location_id ?? "",
            search: query.search ?? "",
        };
        const key = JSON.stringify(params);
        if (priorityRequestRef.current.key === key && priorityRequestRef.current.promise) {
            return priorityRequestRef.current.promise;
        }
        const requestId = priorityRequestRef.current.id + 1;
        priorityRequestRef.current = { id: requestId, key, promise: null };
        setPriorityLoading(true);
        setPriorityError(null);
        const promise = fetchPriorities(
            params.limit,
            params.planningDate,
            params.dateFrom,
            params.dateTo,
            params.offset,
            params,
        )
            .then((data) => {
                if (priorityRequestRef.current.id === requestId) {
                    setPriorities(data);
                    if (data.date_coverage) {
                        setPriorityDateCoverage(data.date_coverage);
                        setTaskDateFrom((current) => current || data.date_coverage.task_date_from || "");
                        setTaskDateTo((current) => current || data.date_coverage.task_date_to || "");
                        setPriorityDate((current) => current || data.date_coverage.score_as_of_max || "");
                    }
                }
            })
            .catch((err) => {
                if (priorityRequestRef.current.id === requestId) setPriorityError(err.message);
            })
            .finally(() => {
                if (priorityRequestRef.current.id === requestId) {
                    setPriorityLoading(false);
                    priorityRequestRef.current.promise = null;
                }
            });
        priorityRequestRef.current.promise = promise;
        return promise;
    }, [priorityLimit, priorityDate, taskDateFrom, taskDateTo]);

    const handleInspectionTaskCreated = useCallback(async (createdTask) => {
        if (createdTask?.planning_date) {
            setPriorityDate(createdTask.planning_date);
            setScheduleDate(createdTask.planning_date);
        }
        setScheduleResult(null);
        setOriginalSchedulePlan(null);
        setRescheduleResult(null);
        setPriorities(null);
        setPriorityError(null);
        setPriorityLoading(true);
        try {
            const data = await fetchPriorities(
                priorityLimit,
                createdTask?.planning_date ?? priorityDate,
                taskDateFrom,
                taskDateTo,
                0,
                {task_type: "all", priority_level: "all", location_id: "", search: ""},
            );
            setPriorities(data);
        } catch (err) {
            setPriorityError(err.message);
        } finally {
            setPriorityLoading(false);
        }
    }, [priorityLimit, priorityDate, taskDateFrom, taskDateTo]);

    const handleGenerateSchedule = useCallback(async () => {
        if (scheduleLoading) return;
        setScheduleLoading(true);
        setScheduleError(null);
        try {
            const data = await createSchedule(scheduleDate);
            setScheduleResult(data);
            if (data?.tasks) {
                setOriginalSchedulePlan(data.tasks);
                setRescheduleDate(data.planning_date);
                const assignedPhis = [...new Set(
                    data.tasks
                        .map((task) => task.assigned_phi?.trim())
                        .filter(Boolean)
                )];
                setUnavailablePhi(assignedPhis[0] ?? "");
            }
        } catch (err) {
            setScheduleResult(null);
            setOriginalSchedulePlan(null);
            setRescheduleResult(null);
            setUnavailablePhi("");
            setScheduleError(err.message);
        } finally {
            setScheduleLoading(false);
        }
    }, [scheduleLoading, scheduleDate]);

    const handleConfirmSchedule = useCallback(async (date) => {
        setConfirmationLoading(true);
        setScheduleError(null);
        setRescheduleError(null);
        try {
            const response = await confirmSchedule(date);
            setScheduleResult((current) => current?.planning_date === date
                ? { ...current, schedule_state: response.schedule_state }
                : current);
            setRescheduleResult((current) => current?.planning_date === date
                ? { ...current, schedule_state: response.schedule_state }
                : current);
        } catch (err) {
            setScheduleError(err.message);
            setRescheduleError(err.message);
        } finally {
            setConfirmationLoading(false);
        }
    }, []);

    const handleRescheduleConfirmed = useCallback(async () => {
        setShowConfirm(false);
        if (rescheduleLoading) return;
        // Preserve original plan before rescheduling
        if (scheduleResult?.tasks && scheduleResult.planning_date === rescheduleDate) {
            setOriginalSchedulePlan(scheduleResult.tasks);
        }
        setRescheduleLoading(true);
        setRescheduleError(null);
        try {
            const data = await reschedule(
                rescheduleDate,
                unavailablePhi,
                false
            );
            setRescheduleResult(data);
        } catch (err) {
            setRescheduleResult(null);
            setRescheduleError(err.message);
        } finally {
            setRescheduleLoading(false);
        }
    }, [rescheduleLoading, rescheduleDate, unavailablePhi, scheduleResult]);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="bg-mintSurface border-l-4 border-primary p-5 rounded-xl flex flex-wrap gap-4 justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-darkBase">
                        PHI Inspection Planning & Operations
                    </h3>
                </div>

            </div>
            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-1.5 border-b border-borderLight pb-0">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
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
                    planningDate={priorityDate}
                    dateCoverage={priorityDateCoverage}
                    onPlanningDateChange={(nextDate) => {
                        setPriorityDate(nextDate);
                    }}
                    dateFrom={taskDateFrom}
                    dateTo={taskDateTo}
                    onDateRangeChange={(nextFrom, nextTo) => {
                        setTaskDateFrom(nextFrom);
                        setTaskDateTo(nextTo);
                    }}
                    onLoad={handleLoadPriorities}
                />
            )}

            {activeTab === "trends" && <MonthlyDengueTrends />}

            {activeTab === "completed" && (
                <CompletedInspectionsTab
                    date={completedDate}
                    onDateChange={setCompletedDate}
                    reports={completedReports}
                    loading={completedLoading}
                    error={completedError}
                    onOpenDetails={setSelectedCompletedReport}
                />
            )}

            {selectedCompletedReport && (
                <InspectionDetailsDialog
                    report={selectedCompletedReport}
                    onClose={() => setSelectedCompletedReport(null)}
                />
            )}

            {/* ── Tab: Schedule ─────────────────────────────────────────────── */}
            {activeTab === "schedule" && (
                <ScheduleTab
                    date={scheduleDate}
                    onDateChange={(nextDate) => {
                        setScheduleDate(nextDate);
                        setScheduleResult(null);
                        setOriginalSchedulePlan(null);
                        setRescheduleResult(null);
                        setUnavailablePhi("");
                    }}
                    result={scheduleResult}
                    loading={scheduleLoading}
                    error={scheduleError}
                    onGenerate={handleGenerateSchedule}
                    onConfirmSchedule={handleConfirmSchedule}
                    confirmationLoading={confirmationLoading}
                />
            )}

            {/* ── Tab: Reschedule ───────────────────────────────────────────── */}
            {activeTab === "reschedule" && (
                <RescheduleTab
                    date={rescheduleDate}
                    unavailablePhi={unavailablePhi}
                    onPhiChange={setUnavailablePhi}
                    result={rescheduleResult}
                    originalTasks={
                        rescheduleResult?.original_tasks ||
                        originalSchedulePlan ||
                        (scheduleResult?.planning_date === rescheduleDate ? scheduleResult.tasks : [])
                    }
                    loading={rescheduleLoading}
                    error={rescheduleError}
                    showConfirm={showConfirm}
                    onRequestConfirm={() => setShowConfirm(true)}
                    onConfirm={handleRescheduleConfirmed}
                    onConfirmSchedule={handleConfirmSchedule}
                    confirmationLoading={confirmationLoading}
                    onCancelConfirm={() => setShowConfirm(false)}
                    scheduleExists={
                        scheduleResult?.planning_date === rescheduleDate ||
                        rescheduleResult?.planning_date === rescheduleDate
                    }
                />
            )}

            {activeTab === "new-task" && (
                <NewInspectionTaskForm
                    onTaskCreated={handleInspectionTaskCreated}
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
            desc: "Retrieve priority scores for dengue cases and citizen complaints.",
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
            desc: "Review assigned PHIs and time slots; open Pending for Later to see unassigned work.",
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
                            newTasks={scheduleResult.new_tasks}
                            scheduledTasks={scheduleResult.scheduled_tasks}
                            unscheduledTasks={scheduleResult.unscheduled_tasks}
                            completedTasks={scheduleResult.completed_tasks}
                            cancelledTasks={scheduleResult.cancelled_tasks}
                            carriedForwardTasks={scheduleResult.carried_forward_tasks}
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

function PrioritiesTab({
    priorities,
    loading,
    error,
    limit,
    onLimitChange,
    planningDate,
    onPlanningDateChange,
    dateCoverage,
    dateFrom,
    dateTo,
    onDateRangeChange,
    onLoad,
}) {
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState("all");
    const [locationFilter, setLocationFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [pageIndex, setPageIndex] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => {
            onLoad({
                limit,
                offset: pageIndex * limit,
                planningDate,
                dateFrom,
                dateTo,
                task_type: categoryFilter,
                priority_level: priorityFilter,
                location_id: locationFilter,
                search: searchQuery.trim(),
            });
        }, searchQuery ? 250 : 0);
        return () => clearTimeout(timer);
    }, [
        onLoad,
        limit,
        pageIndex,
        planningDate,
        dateFrom,
        dateTo,
        categoryFilter,
        priorityFilter,
        locationFilter,
        searchQuery,
    ]);

    const pageRows = priorities?.tasks ?? [];
    const summary = priorities?.summary ?? {};
    const locationOptions = Object.values(priorities?.locations ?? {}).sort(
        (first, second) => first.location_name.localeCompare(second.location_name)
    );
    const totalMatching = priorities?.total_matching ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalMatching / limit));
    const currentPage = Math.min(pageIndex + 1, totalPages);
    const highCount = summary.high ?? 0;
    const mediumCount = summary.medium ?? 0;
    const lowCount = summary.low ?? 0;
    const reviewCount = summary.review ?? 0;
    const totalLoadedCount = summary.total ?? 0;

    const handleSelectPriorityFromCard = (level) => {
        setPageIndex(0);
        if (level === "all") {
            setPriorityFilter("all");
        } else {
            // Toggle
            setPriorityFilter((prev) => (prev === level ? "all" : level));
        }
    };

    const handleSelectLocation = (locId) => {
        setLocationFilter(locId === "all" ? "" : locId);
        setPageIndex(0);
    };

    const handleResetFilters = () => {
        setPriorityFilter("all");
        setLocationFilter("");
        setSearchQuery("");
        setPageIndex(0);
    };

    const hasActiveFilters =
        categoryFilter !== "all" ||
        priorityFilter !== "all" ||
        Boolean(locationFilter) ||
        searchQuery.trim() !== "";

    return (
        <div className="space-y-6">
            {/* Top API fetch control bar */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-xs p-5 flex flex-wrap gap-4 items-end justify-between">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor="task-date-from" className="block text-xs font-bold text-textMuted mb-1.5 uppercase">
                            Task date from
                        </label>
                        <input
                            id="task-date-from"
                            type="date"
                            value={dateFrom}
                            max={dateTo || undefined}
                            onChange={(event) => {
                                setPageIndex(0);
                                onDateRangeChange(event.target.value, dateTo);
                            }}
                            className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>
                    <div>
                        <label htmlFor="task-date-to" className="block text-xs font-bold text-textMuted mb-1.5 uppercase">
                            Task date through
                        </label>
                        <input
                            id="task-date-to"
                            type="date"
                            value={dateTo}
                            min={dateFrom || undefined}
                            max={dateCoverage?.task_date_to || undefined}
                            onChange={(event) => {
                                setPageIndex(0);
                                onDateRangeChange(dateFrom, event.target.value);
                            }}
                            className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="priority-planning-date"
                            className="block text-xs font-bold text-textMuted mb-1.5 uppercase"
                        >
                            Score as of (data through {dateCoverage?.score_as_of_max || "available coverage"})
                        </label>
                        <input
                            id="priority-planning-date"
                            type="date"
                            value={planningDate}
                            max={dateCoverage?.score_as_of_max || undefined}
                            onChange={(event) => {
                                setPageIndex(0);
                                onPlanningDateChange(event.target.value);
                            }}
                            required
                            className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="priority-limit"
                            className="block text-xs font-bold text-textMuted mb-1.5 uppercase"
                        >
                            Matching records
                        </label>
                        <select
                            id="priority-limit"
                            value={limit}
                            onChange={(e) => {
                                setPageIndex(0);
                                onLimitChange(Number(e.target.value));
                            }}
                            className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
                        >
                            {PRIORITY_LIMIT_OPTIONS.map((n) => (
                                <option key={n} value={n}>
                                    {`${n} per page`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        id="btn-load-priorities"
                        onClick={() => onLoad({
                            limit,
                            offset: pageIndex * limit,
                            planningDate,
                            dateFrom,
                            dateTo,
                            task_type: categoryFilter,
                            priority_level: priorityFilter,
                            location_id: locationFilter,
                            search: searchQuery.trim(),
                        })}
                        disabled={loading}
                        className="bg-primary hover:bg-secondary disabled:opacity-60 disabled:cursor-not-allowed text-surface px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition"
                    >
                        {loading ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : (
                            <RefreshCw size={15} />
                        )}
                                                {loading
                                                        ? "Loading…"
                                                        : priorities
                                                            ? "Refresh Priorities"
                                                            : "Load Priorities"}
                    </button>
                </div>

                {priorities && (
                    <div className="text-xs text-textMuted text-right">
                        <span className="font-semibold text-darkBase">
                            {priorities.total_cases?.toLocaleString()} cases • {priorities.total_complaints?.toLocaleString()} complaints in selected range
                        </span>
                        <div className="text-[11px] text-textMuted">
                            Kaduwela MOH Surveillance Area
                        </div>
                    </div>
                )}
            </div>

            {/* Error banner */}
            {loading && priorities && (
                <div className="flex items-center gap-2 rounded-lg border border-borderLight bg-background px-4 py-2 text-xs text-textMuted" role="status">
                    <Loader2 size={14} className="animate-spin text-primary" />
                    Loading priorities… Previous results remain visible.
                </div>
            )}
            {error && (
                <div className="flex items-center gap-3">
                    <div className="flex-1"><ApiError message={error} /></div>
                    <button
                        type="button"
                        onClick={() => onLoad({
                            limit,
                            offset: pageIndex * limit,
                            planningDate,
                            dateFrom,
                            dateTo,
                            task_type: categoryFilter,
                            priority_level: priorityFilter,
                            location_id: locationFilter,
                            search: searchQuery.trim(),
                        })}
                        disabled={loading}
                        className="rounded-lg border border-borderLight px-3 py-2 text-xs font-bold text-primary disabled:opacity-50"
                    >
                        Retry
                    </button>
                </div>
            )}
            {!priorities && loading && (
                <div className="py-12 text-center text-sm text-textMuted" role="status">
                    <Loader2 size={22} className="mx-auto mb-2 animate-spin text-primary" />
                    Loading priorities…
                </div>
            )}

            {/* When data is loaded */}
            {priorities && (
                <div className="space-y-6">
                    {/* 1. Priority Summary Cards */}
                    <PrioritySummaryCards
                        highCount={highCount}
                        mediumCount={mediumCount}
                        lowCount={lowCount}
                        reviewCount={reviewCount}
                        totalCount={totalLoadedCount}
                        activePriority={priorityFilter}
                        onSelectPriority={handleSelectPriorityFromCard}
                        totalCases={priorities.total_cases ?? 0}
                        totalComplaints={priorities.total_complaints ?? 0}
                        category={categoryFilter}
                    />

                    {/* 2. Location-Based Summary */}
                    <LocationDistributionTable
                        locationSummary={priorities.location_summary ?? []}
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
                                        setPageIndex(0);
                                        setCategoryFilter("all");
                                        setLocationFilter("");
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${categoryFilter === "all"
                                        ? "bg-surface text-primary shadow-xs border border-borderLight"
                                        : "text-textMuted hover:text-darkBase"
                                        }`}
                                >
                                    <span>All Tasks</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-primary/10 text-primary">
                                        {priorities.total_cases + priorities.total_complaints}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setPageIndex(0);
                                        setCategoryFilter("cases");
                                        setLocationFilter("");
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${categoryFilter === "cases"
                                        ? "bg-surface text-primary shadow-xs border border-borderLight"
                                        : "text-textMuted hover:text-darkBase"
                                        }`}
                                >
                                    <span>Dengue Cases</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-700">
                                        {priorities.total_cases}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setPageIndex(0);
                                        setCategoryFilter("complaints");
                                        setLocationFilter("");
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${categoryFilter === "complaints"
                                        ? "bg-surface text-primary shadow-xs border border-borderLight"
                                        : "text-textMuted hover:text-darkBase"
                                        }`}
                                >
                                    <span>Citizen Complaints</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 text-purple-700">
                                        {priorities.total_complaints}
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
                                    onChange={(e) => {
                                        setPageIndex(0);
                                        setSearchQuery(e.target.value);
                                    }}
                                    placeholder="Search task ID, location, reason..."
                                    className="w-full pl-9 pr-8 py-2 text-xs border border-borderLight rounded-xl bg-background text-darkBase placeholder:text-textMuted/70 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-surface transition"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPageIndex(0);
                                            setSearchQuery("");
                                        }}
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
                                        onChange={(e) => {
                                            setPageIndex(0);
                                            setPriorityFilter(e.target.value);
                                        }}
                                        className="border border-borderLight rounded-lg px-2.5 py-1.5 text-xs text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 font-semibold"
                                    >
                                        <option value="all">All Priorities ({totalLoadedCount})</option>
                                        <option value="High">High Priority ({highCount})</option>
                                        <option value="Medium">Medium Priority ({mediumCount})</option>
                                        <option value="Low">Low Priority ({lowCount})</option>
                                        <option value="Review">Review ({reviewCount})</option>
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
                                        value={locationFilter || "all"}
                                        onChange={(e) => {
                                            setPageIndex(0);
                                            setLocationFilter(e.target.value === "all" ? "" : e.target.value);
                                        }}
                                        className="border border-borderLight rounded-lg px-2.5 py-1.5 text-xs text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 max-w-xs font-semibold"
                                    >
                                        <option value="all">
                                            All Locations ({locationOptions.length})
                                        </option>
                                        {locationOptions.map((loc) => (
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
                                Showing <strong>{priorities.page_start}-{priorities.page_end}</strong> of <strong>{totalMatching}</strong> tasks
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
                            rows={pageRows}
                            taskType={categoryFilter}
                            emptyLabel={
                                hasActiveFilters
                                    ? "No tasks match the active filters. Try adjusting your priority, location, or search terms."
                                    : "No tasks were returned by the API."
                            }
                        />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borderLight px-2 pt-4 text-sm">
                        <p className="text-textMuted">
                            Page <strong className="text-darkBase">{currentPage}</strong> of <strong className="text-darkBase">{totalPages}</strong> · {totalMatching.toLocaleString()} matching tasks
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPageIndex((page) => Math.max(0, page - 1))}
                                disabled={pageIndex === 0 || loading}
                                className="rounded-lg border border-borderLight px-3 py-2 text-xs font-bold text-darkBase disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                onClick={() => setPageIndex((page) => Math.min(totalPages - 1, page + 1))}
                                disabled={!priorities.has_next || loading}
                                className="rounded-lg border border-borderLight px-3 py-2 text-xs font-bold text-darkBase disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
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

function ScheduleTab({ date, onDateChange, result, loading, error, onGenerate, onConfirmSchedule, confirmationLoading }) {
    const [scheduleViewState, setScheduleViewState] = useState({
        date,
        view: "appointments",
    });
    const scheduleView = scheduleViewState.date === date
        ? scheduleViewState.view
        : "appointments";
    const scheduleState = result?.schedule_state ?? {};
    const reschedulingBlocked = scheduleState.rescheduling_required
        && !scheduleState.rescheduling_processed;
    const appointments = (result?.tasks ?? []).filter((task) =>
        task.assigned_phi && task.start_time && task.end_time
        && ["Scheduled", "In Progress", "Completed"].includes(task.status)
    );
    const caseAppointments = appointments.filter(
        (task) => task.task_type === "Dengue Case Inspection"
    ).length;
    const complaintAppointments = appointments.filter(
        (task) => task.task_type === "Citizen Complaint"
    ).length;
    const pendingQueue = (result?.tasks ?? []).filter((task) =>
        ["Unscheduled", "Pending rescheduling"].includes(task.status)
        && task.task_status === "Pending"
    );
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
                        onChange={(e) => onDateChange(e.target.value)}
                        required
                        className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
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
                    {loading ? "Building Schedule…" : "Generate Schedule"}
                </button>
            </div>

            {loading && (
                <div
                    className="rounded-lg border border-primary/20 bg-surface px-4 py-3"
                    role="status"
                    aria-live="polite"
                >
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-darkBase">
                            Building the {date} schedule
                        </span>
                        <span className="text-textMuted">Cases · complaints · PHI capacity</span>
                    </div>
                    <progress
                        className="schedule-progress block w-full"
                        aria-label={`Generating schedule for ${date}`}
                    />
                    <p className="mt-2 text-[11px] text-textMuted">
                        Matching tasks to their location areas and fitting appointments into available slots.
                    </p>
                </div>
            )}

            {/* Error */}
            {error && <ApiError message={error} />}

            {/* Result */}
            {result && (
                <div className="space-y-4">
                    {error ? (
                        <div className="rounded-md border border-riskMedium bg-amber-50 px-4 py-3 text-sm text-darkBase" role="status">
                            Showing the last saved schedule for {result.planning_date}; the latest request failed.
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-borderLight bg-background px-4 py-3">
                            <p className="text-sm text-darkBase">
                                <span className="font-bold">
                                    {scheduleState.confirmed ? "Schedule confirmed" : "Schedule ready for review"}
                                </span>{" "}
                                · {result.planning_date}
                            </p>
                            {!scheduleState.confirmed && (
                                <button
                                    type="button"
                                    onClick={() => onConfirmSchedule(date)}
                                    disabled={confirmationLoading || reschedulingBlocked}
                                    title={reschedulingBlocked ? "Adaptive rescheduling must be completed first." : "Confirm this schedule for the selected date."}
                                    className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-surface disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {confirmationLoading ? "Confirming…" : "Confirm Schedule"}
                                </button>
                            )}
                        </div>
                    )}
                    {reschedulingBlocked && (
                        <p className="text-xs font-semibold text-riskMedium">
                            Adaptive rescheduling is required before this schedule can be confirmed.
                        </p>
                    )}

                    {/* KPI cards */}
                    <PlanningSummaryCards
                        totalTasks={result.total_tasks}
                        newTasks={result.new_tasks}
                        scheduledTasks={result.scheduled_tasks}
                        unscheduledTasks={result.unscheduled_tasks}
                        completedTasks={result.completed_tasks}
                        cancelledTasks={result.cancelled_tasks}
                        carriedForwardTasks={result.carried_forward_tasks}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borderLight pb-3">
                        <div className="flex items-center gap-1 rounded-lg border border-borderLight bg-background p-1">
                            <button
                                type="button"
                                onClick={() => setScheduleViewState({ date, view: "appointments" })}
                                aria-pressed={scheduleView === "appointments"}
                                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold ${
                                    scheduleView === "appointments"
                                        ? "bg-primary text-surface"
                                        : "text-textMuted hover:bg-surface hover:text-darkBase"
                                }`}
                            >
                                <CalendarDays size={14} />
                                PHI Appointments ({appointments.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setScheduleViewState({ date, view: "pending" })}
                                aria-pressed={scheduleView === "pending"}
                                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold ${
                                    scheduleView === "pending"
                                        ? "bg-primary text-surface"
                                        : "text-textMuted hover:bg-surface hover:text-darkBase"
                                }`}
                            >
                                <ClipboardCheck size={14} />
                                Pending for Later ({pendingQueue.length})
                            </button>
                        </div>
                        {scheduleView === "pending" && (
                            <p className="text-xs text-textMuted">
                                Unassigned Pending tasks remain in the queue for a later planning date.
                            </p>
                        )}
                    </div>
                    {/* Task table */}
                    <div className="bg-surface rounded-xl border border-borderLight shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-borderLight flex items-center justify-between">
                            <h4 className="text-sm font-bold text-darkBase">
                                {scheduleView === "appointments" ? "PHI Appointments" : "Pending Tasks for Later Dates"}
                            </h4>
                            <span className="text-xs text-textMuted">
                                {scheduleView === "appointments"
                                    ? `${appointments.length} appointments · ${caseAppointments} cases · ${complaintAppointments} complaints`
                                    : `${pendingQueue.length} rows`}
                            </span>
                        </div>
                        <ScheduleTable
                            tasks={scheduleView === "appointments" ? appointments : pendingQueue}
                            emptyLabel={scheduleView === "appointments"
                                ? "No PHI appointments were assigned for this date."
                                : "There are no unassigned Pending tasks waiting for a later date."}
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

// ── Completed Inspections Tab ────────────────────────────────────────────────

function CompletedInspectionsTab({ date, onDateChange, reports, loading, error, onOpenDetails }) {
    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4 border-y border-borderLight bg-surface px-4 py-3">
                <div>
                    <label htmlFor="completed-inspection-date" className="mb-1.5 block text-xs font-bold uppercase text-textMuted">Inspection date</label>
                    <input id="completed-inspection-date" type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className="rounded-md border border-borderLight bg-background px-3 py-2 text-sm text-darkBase" />
                </div>
                <p className="text-sm font-semibold text-darkBase">{loading ? "Loading completed inspections…" : `${reports.length} completed ${reports.length === 1 ? "inspection" : "inspections"}`}</p>
            </div>
            {error && <ApiError message={error} />}
            {!loading && !error && reports.length === 0 && <EmptyState message="No submitted inspection reports were found for this date." />}
            {reports.length > 0 && (
                <div className="overflow-x-auto border-y border-borderLight bg-surface">
                    <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                        <thead className="border-b border-borderLight bg-background text-[11px] font-bold uppercase text-textMuted"><tr><th className="px-3 py-2.5">Task</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Location</th><th className="px-3 py-2.5">PHI</th><th className="px-3 py-2.5">Submitted</th><th className="px-3 py-2.5">Details</th></tr></thead>
                        <tbody className="divide-y divide-borderLight">
                            {reports.map((report, index) => (
                                <tr key={`${report.task?.scenario_task_id || report.task?.source_id || index}-${report.submitted_at || index}`}>
                                    <td className="px-3 py-3 text-xs font-semibold text-darkBase">{report.task?.scenario_task_id || report.task?.source_id || "Inspection"}</td>
                                    <td className="px-3 py-3 text-xs text-textMuted">{report.task?.task_type || "Inspection"}</td>
                                    <td className="px-3 py-3 text-xs text-darkBase">{cleanLocationLabel(report.task?.location_label) || cleanLocationLabel(report.task?.village_area) || cleanLocationLabel(report.task?.moh_area) || "Not recorded"}</td>
                                    <td className="px-3 py-3 text-xs font-semibold text-darkBase">{report.phi_id || "Not recorded"}</td>
                                    <td className="px-3 py-3 text-xs text-textMuted">{report.submitted_at ? new Date(report.submitted_at).toLocaleString() : "Not recorded"}</td>
                                    <td className="px-3 py-3"><button type="button" onClick={() => onOpenDetails(report)} className="rounded-md border border-borderLight px-3 py-1.5 text-xs font-bold text-primary hover:bg-background">View details</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function InspectionDetailsDialog({ report, onClose }) {
    const form = report.form || {};
    const task = report.task || {};
    const caseInfo = form.case_investigation || {};
    const yesNo = (value) => value === true ? "Yes" : value === false ? "No" : "Not assessed";
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="inspection-details-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-borderLight bg-surface shadow-xl">
                <header className="sticky top-0 flex items-center justify-between border-b border-borderLight bg-surface px-5 py-4"><div><h2 id="inspection-details-title" className="text-base font-bold text-darkBase">Inspection report details</h2><p className="mt-1 text-xs text-textMuted">{task.scenario_task_id || task.source_id || "Inspection"} · {form.inspection_date || report.inspection_date || "Date not recorded"}</p></div><button type="button" onClick={onClose} aria-label="Close details" className="h-8 w-8 rounded-md border border-borderLight text-textMuted hover:bg-background">×</button></header>
                <div className="grid gap-5 p-5 sm:grid-cols-2">
                    <DetailSection title="Assignment"><Detail label="PHI" value={report.phi_id} /><Detail label="Task type" value={task.task_type} /><Detail label="Location" value={formatLocation(task.location_label, task.village_area, task.moh_area)} /><Detail label="Case reference" value={form.patient_case_reference} /><Detail label="Time" value={form.inspection_time} /></DetailSection>
                    <DetailSection title="Case investigation"><Detail label="Status" value={caseInfo.investigation_status} /><Detail label="Onset" value={caseInfo.disease_onset_date} /><Detail label="Hospital" value={caseInfo.hospital_name} /><Detail label="Discharge" value={caseInfo.discharge_date} /><Detail label="Outcome" value={caseInfo.case_outcome} /><Detail label="Laboratory findings" value={caseInfo.laboratory_findings} /><Detail label="Advice" value={caseInfo.isolation_or_advice} /></DetailSection>
                    <DetailSection title="Contacts"><Detail label="Household investigated" value={yesNo(form.household_contacts_investigated)} /><Detail label="Other contacts investigated" value={yesNo(form.other_contacts_investigated)} />{(form.contacts || []).map((contact, index) => <div key={index} className="border-t border-borderLight pt-2"><Detail label={`Contact ${index + 1}`} value={[contact.contact_type, contact.contact_reference, contact.age_years == null ? "" : `${contact.age_years} years`, contact.date_seen].filter(Boolean).join(" · ")} /><Detail label="Symptoms / observations" value={contact.symptoms || contact.observation} /></div>)}</DetailSection>
                    <DetailSection title="Environmental findings"><Detail label="Assessment complete" value={yesNo(form.environmental_assessment_complete)} />{(form.breeding_sites || []).map((site, index) => <div key={index} className="border-t border-borderLight pt-2"><Detail label={`Site ${index + 1}`} value={`${site.site_type || "Site"} · ${site.location_description || "Location not recorded"}`} /><Detail label="Water / larvae" value={`${site.standing_water || "Not assessed"} / ${site.larvae_pupae || "Not assessed"}`} /><Detail label="Severity / count" value={`${site.severity || "Not assessed"} / ${site.count ?? "Not recorded"}`} /><Detail label="Observation" value={site.observation} /></div>)}<Detail label="Waste / storage" value={form.waste_or_storage_observations} /></DetailSection>
                    <DetailSection title="Actions and follow-up"><Detail label="Actions taken" value={form.actions_taken} /><Detail label="Sources corrected" value={yesNo(form.breeding_sources_corrected)} /><Detail label="Education provided" value={yesNo(form.prevention_education_provided)} /><Detail label="Follow-up required" value={form.follow_up_required ? "Yes" : "No"} /><Detail label="Follow-up date" value={form.follow_up_date} /><Detail label="Follow-up notes" value={form.follow_up_notes} /><Detail label="Additional notes" value={form.additional_notes} /></DetailSection>
                </div>
            </section>
        </div>
    );
}

function DetailSection({ title, children }) {
    return <section className="space-y-2 border-t border-borderLight pt-3 first:border-0 first:pt-0"><h3 className="text-xs font-bold uppercase text-textMuted">{title}</h3>{children}</section>;
}

function Detail({ label, value }) {
    if (value === undefined || value === null || value === "") return null;
    return <p className="text-xs leading-5 text-darkBase"><span className="font-semibold text-textMuted">{label}: </span>{String(value)}</p>;
}

// ── Reschedule Tab ────────────────────────────────────────────────────────────

function RescheduleTab({
    date,
    unavailablePhi,
    onPhiChange,
    result,
    originalTasks = [],
    loading,
    error,
    showConfirm,
    onRequestConfirm,
    onConfirm,
    onConfirmSchedule,
    confirmationLoading,
    onCancelConfirm,
    scheduleExists,
}) {
    const [availabilityResult, setAvailabilityResult] = useState({
        planningDate: "",
        phis: [],
        error: "",
    });
    const availabilityLoading = availabilityResult.planningDate !== date;
    const availabilityError = availabilityResult.planningDate === date
        ? availabilityResult.error
        : "";
    const phiAvailability = availabilityResult.planningDate === date
        ? availabilityResult.phis
        : [];
    const [availabilitySaving, setAvailabilitySaving] = useState(false);

    useEffect(() => {
        let active = true;
        fetchPhiAvailability(date)
            .then((response) => {
                if (active) {
                    setAvailabilityResult({
                        planningDate: date,
                        phis: response.phis ?? [],
                        error: "",
                    });
                }
            })
            .catch((requestError) => {
                if (active) {
                    setAvailabilityResult({
                        planningDate: date,
                        phis: [],
                        error: requestError.message,
                    });
                }
            });
        return () => {
            active = false;
        };
    }, [date, result?.schedule_state?.updated_at]);

    async function restorePhiAvailability(phiId) {
        setAvailabilitySaving(true);
        try {
            await setPhiAvailability(date, phiId, "Available");
            const response = await fetchPhiAvailability(date);
            setAvailabilityResult({
                planningDate: date,
                phis: response.phis ?? [],
                error: "",
            });
        } catch (requestError) {
            setAvailabilityResult((current) => ({
                ...current,
                planningDate: date,
                error: requestError.message,
            }));
        } finally {
            setAvailabilitySaving(false);
        }
    }

    const scheduledPhis = [...new Set(
        originalTasks
            .map((task) => task.assigned_phi?.trim())
            .filter(Boolean)
    )];
    const affectedResults = (result?.tasks ?? []).filter(
        (task) => task.previous_assigned_phi === result?.unavailable_phi
    );
    const affectedSummary = {
        affected_tasks: affectedResults.length,
        reassigned_tasks: affectedResults.filter((task) => task.reassignment_classification === "Reassigned").length,
        deferred_tasks: affectedResults.filter((task) => task.reassignment_classification === "Deferred").length,
        remaining_unscheduled_tasks: affectedResults.filter((task) => task.reassignment_classification === "Unscheduled").length,
        unchanged_tasks: affectedResults.filter((task) => task.reassignment_classification === "Unchanged").length,
        protected_tasks: affectedResults.filter((task) => ["Completed", "In Progress"].includes(task.task_status)).length,
    };

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
                            readOnly
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
                        <select
                            id="unavailable-phi"
                            value={unavailablePhi}
                            onChange={(e) => onPhiChange(e.target.value)}
                            disabled={!scheduleExists || scheduledPhis.length === 0}
                            className="border border-borderLight rounded-lg px-3 py-2 text-sm text-darkBase bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
                        >
                            <option value="">
                                {scheduledPhis.length
                                    ? "Select an assigned PHI"
                                    : "Generate a schedule first"}
                            </option>
                            {scheduledPhis.map((phi) => (
                                <option key={phi} value={phi}>
                                    {phi}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <button
                    id="btn-request-reschedule"
                    onClick={onRequestConfirm}
                    disabled={
                        loading ||
                        !scheduleExists ||
                        !scheduledPhis.includes(unavailablePhi)
                    }
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

            <section className="rounded-lg border border-borderLight bg-surface px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borderLight pb-2">
                    <h4 className="text-sm font-bold text-darkBase">Availability for {date}</h4>
                    <span className="text-xs text-textMuted">Date-specific</span>
                </div>
                {availabilityError && <ApiError message={availabilityError} />}
                {availabilityLoading ? (
                    <p className="py-3 text-xs text-textMuted">Loading availability…</p>
                ) : phiAvailability.length === 0 ? (
                    <p className="py-3 text-xs text-textMuted">No PHI availability records for this date.</p>
                ) : (
                    <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                        {phiAvailability.map((phi) => (
                            <div key={phi.phi_id} className="flex items-center justify-between gap-3 border-b border-borderLight py-2 text-xs">
                                <span className="font-semibold text-darkBase">{phi.phi_id}</span>
                                <div className="flex items-center gap-2">
                                    <span className={phi.availability === "Unavailable" ? "font-bold text-riskHigh" : "text-riskCleared"}>
                                        {phi.availability}
                                    </span>
                                    {phi.availability === "Unavailable" && (
                                        <button
                                            type="button"
                                            disabled={availabilitySaving}
                                            onClick={() => restorePhiAvailability(phi.phi_id)}
                                            className="rounded border border-borderLight px-2 py-1 font-semibold text-primary disabled:opacity-50"
                                        >
                                            Restore Available
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

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

            {/* Result: Transparent Rescheduling Table */}
            {result && (
                <div className="space-y-4">
                    {/* Success notification */}
                    <div className="flex items-center gap-3 bg-mintSurface border border-riskCleared rounded-xl px-4 py-3">
                        <CheckCircle2 size={18} className="text-riskCleared shrink-0" />
                        <p className="text-sm text-darkBase">
                            <span className="font-bold">Rescheduling complete</span> — Tasks for PHI{" "}
                            <span className="font-bold text-primary">{result.unavailable_phi}</span> on{" "}
                            {result.planning_date} have been processed.
                        </p>
                    </div>

                    {/* Transparent task redistribution table with KPI cards and filters */}
                    <ReschedulingDetailsTable
                        tasks={affectedResults}
                        originalTasks={result.original_tasks ?? originalTasks ?? []}
                        unavailablePhi={result.unavailable_phi}
                        planningDate={result.planning_date}
                        summary={affectedSummary}
                    />
                    {!result.schedule_state?.confirmed && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-borderLight bg-background px-4 py-3">
                            <p className="text-sm text-darkBase">
                                <span className="font-bold">Revised schedule ready for review</span>
                                {result.schedule_state?.rescheduling_processed
                                    ? " · Required rescheduling processed"
                                    : ""}
                            </p>
                            <button
                                type="button"
                                onClick={() => onConfirmSchedule(result.planning_date)}
                                disabled={confirmationLoading || result.schedule_state?.rescheduling_required}
                                className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-surface disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {confirmationLoading ? "Confirming…" : "Confirm Revised Schedule"}
                            </button>
                        </div>
                    )}
                    {result.schedule_state?.confirmed && (
                        <>
                            <p className="rounded-md border border-riskCleared bg-mintSurface px-4 py-3 text-sm font-bold text-darkBase">
                                Revised schedule confirmed for {result.planning_date}.
                            </p>
                            <section className="overflow-hidden rounded-lg border border-borderLight bg-surface">
                                <div className="border-b border-borderLight px-4 py-3">
                                    <h4 className="text-sm font-bold text-darkBase">
                                        Full Revised PHI Schedule
                                    </h4>
                                    <p className="mt-1 text-xs text-textMuted">
                                        Review the confirmed assignments by PHI. This schedule is displayed here; it has not been sent to officers.
                                    </p>
                                </div>
                                <ScheduleTable
                                    tasks={(result.tasks ?? []).filter(
                                        (task) => task.status === "Scheduled" && task.assigned_phi?.trim()
                                    )}
                                    emptyLabel="No assigned tasks are available for this date."
                                />
                            </section>
                        </>
                    )}
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
