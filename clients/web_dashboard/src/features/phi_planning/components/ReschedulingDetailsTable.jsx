import { useState, useMemo } from "react";
import {
    Search,
    X,
    ArrowRight,
    User,
    UserCheck,
    UserMinus,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    ShieldCheck,
    AlertCircle,
    CalendarClock,
} from "lucide-react";
import PriorityBadge from "./PriorityBadge";

/**
 * ReschedulingDetailsTable
 *
 * Transparently displays adaptive task redistribution results:
 * - Summary KPI cards (Affected, Reassigned, Deferred, Unscheduled, Unchanged/Protected)
 * - Unavailable PHI banner with solver explanation for unscheduled/deferred tasks
 * - Detailed comparison table: previous PHI -> new PHI, previous time -> new time
 * - Tabbed filters: All Tasks, Reassigned, Deferred, Unscheduled, Unchanged
 * - Search by Task ID and PHI ID
 * - Protected task indicators for completed and in-progress tasks
 */
export default function ReschedulingDetailsTable({
    tasks = [],
    originalTasks = [],
    unavailablePhi = "",
    planningDate = "",
    summary = {},
}) {
    const [statusFilter, setStatusFilter] = useState("all"); // "all" | "reassigned" | "deferred" | "unscheduled" | "unchanged"
    const [searchQuery, setSearchQuery] = useState("");

    // Index original tasks by task ID for instant lookup
    const originalMap = useMemo(() => {
        const map = new Map();
        for (const t of originalTasks) {
            const id = t.scenario_task_id || t.source_id;
            if (id) map.set(id, t);
        }
        return map;
    }, [originalTasks]);

    // Enrich and classify each task relative to original assignment
    const enrichedTasks = useMemo(() => {
        return tasks.map((task) => {
            const id = task.scenario_task_id || task.source_id;
            const orig = originalMap.get(id);

            const prevPhi = task.previous_assigned_phi ?? orig?.assigned_phi ?? "";
            const currPhi = task.assigned_phi ?? "";
            const prevDate = task.previous_planning_date ?? orig?.planning_date ?? planningDate;
            const currDate = task.planning_date ?? planningDate;
            const prevStart = task.previous_start_time ?? orig?.start_time ?? "";
            const prevEnd = task.previous_end_time ?? orig?.end_time ?? "";
            const prevStatus = task.previous_status ?? orig?.status ?? "";
            const currStatus = task.status ?? "";
            const taskStatus = task.task_status ?? orig?.task_status ?? "";
            const reason = task.reason || "";
            const reasonLower = reason.toLowerCase();

            // Use backend classification if provided, otherwise compute accurately
            let classification = task.reassignment_classification;

            if (!classification) {
                if (
                    currStatus === "Pending rescheduling" ||
                    (currDate && prevDate && currDate > prevDate) ||
                    reasonLower.includes("deferred") ||
                    reasonLower.includes("replanned") ||
                    reasonLower.includes("awaiting adaptive replanning")
                ) {
                    classification = "Deferred";
                } else if (currStatus === "Unscheduled") {
                    classification = "Unscheduled";
                } else if (
                    (taskStatus === "Completed" || taskStatus === "In Progress") &&
                    prevPhi === unavailablePhi
                ) {
                    classification = "Unchanged";
                } else if (
                    currStatus === "Scheduled" &&
                    (currPhi !== prevPhi || reasonLower.includes("reassigned"))
                ) {
                    classification = "Reassigned";
                } else {
                    classification = "Unchanged";
                }
            }

            const isProtected =
                (taskStatus === "Completed" || taskStatus === "In Progress") &&
                (prevPhi === unavailablePhi || currPhi === unavailablePhi);

            return {
                ...task,
                taskId: id,
                prevPhi,
                currPhi,
                prevDate,
                currDate,
                prevStart,
                prevEnd,
                prevStatus,
                currStatus,
                taskStatus,
                classification,
                isProtected,
            };
        });
    }, [tasks, originalMap, planningDate, unavailablePhi]);

    // Compute exact summary counts from actual results (no hardcoding)
    const counts = useMemo(() => {
        // Use summary counts from API if present, or compute directly from tasks
        const affected =
            summary.affected_tasks ??
            enrichedTasks.filter(
                (t) =>
                    t.prevPhi === unavailablePhi &&
                    (t.prevStatus === "Scheduled" || t.isProtected || t.classification === "Reassigned" || t.classification === "Unscheduled")
            ).length;

        const reassigned =
            summary.reassigned_tasks ??
            enrichedTasks.filter((t) => t.classification === "Reassigned").length;

        const deferred =
            summary.deferred_tasks ??
            enrichedTasks.filter((t) => t.classification === "Deferred").length;

        const unscheduled =
            summary.remaining_unscheduled_tasks ??
            enrichedTasks.filter((t) => t.classification === "Unscheduled").length;

        const unchanged =
            summary.unchanged_tasks ??
            enrichedTasks.filter((t) => t.classification === "Unchanged").length;

        const protectedCount =
            summary.protected_tasks ??
            enrichedTasks.filter((t) => t.isProtected).length;

        return {
            total: enrichedTasks.length,
            affected,
            reassigned,
            deferred,
            unscheduled,
            unchanged,
            protectedCount,
        };
    }, [enrichedTasks, summary, unavailablePhi]);

    // Collect explanation reasons for unscheduled / deferred tasks
    const explanationNotes = useMemo(() => {
        const unscheduledReasons = new Set();
        const deferredReasons = new Set();

        for (const t of enrichedTasks) {
            if (t.classification === "Unscheduled" && t.reason) {
                unscheduledReasons.add(t.reason);
            }
            if (t.classification === "Deferred" && t.reason) {
                deferredReasons.add(t.reason);
            }
        }

        return {
            unscheduled: Array.from(unscheduledReasons),
            deferred: Array.from(deferredReasons),
        };
    }, [enrichedTasks]);

    // Apply active filter and search query
    const filteredTasks = useMemo(() => {
        return enrichedTasks.filter((task) => {
            // Category Filter
            if (statusFilter === "reassigned" && task.classification !== "Reassigned") return false;
            if (statusFilter === "deferred" && task.classification !== "Deferred") return false;
            if (statusFilter === "unscheduled" && task.classification !== "Unscheduled") return false;
            if (statusFilter === "unchanged" && task.classification !== "Unchanged") return false;

            // Search Filter (by Task ID or PHI ID)
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const idMatch = (task.taskId || "").toLowerCase().includes(q);
                const prevPhiMatch = (task.prevPhi || "").toLowerCase().includes(q);
                const currPhiMatch = (task.currPhi || "").toLowerCase().includes(q);
                const typeMatch = (task.task_type || "").toLowerCase().includes(q);
                const reasonMatch = (task.reason || "").toLowerCase().includes(q);

                if (!idMatch && !prevPhiMatch && !currPhiMatch && !typeMatch && !reasonMatch) {
                    return false;
                }
            }

            return true;
        });
    }, [enrichedTasks, statusFilter, searchQuery]);

    const isFiltered = statusFilter !== "all" || searchQuery.trim() !== "";

    const resetFilters = () => {
        setStatusFilter("all");
        setSearchQuery("");
    };

    return (
        <div className="space-y-4">
            {/* ── Summary KPI Cards ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Affected Tasks */}
                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-textMuted">
                            Affected Tasks
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-accent/20 text-primary flex items-center justify-center">
                            <UserMinus size={16} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-darkBase">{counts.affected}</p>
                    <p className="text-[11px] text-textMuted mt-1">
                        Originally assigned to <strong className="text-primary">{unavailablePhi || "unavailable officer"}</strong>
                    </p>
                </div>

                {/* 2. Successfully Reassigned */}
                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-textMuted">
                            Successfully Reassigned
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-mintSurface text-riskCleared flex items-center justify-center">
                            <UserCheck size={16} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-riskCleared">{counts.reassigned}</p>
                    <p className="text-[11px] text-textMuted mt-1">
                        Reallocated to active division officers
                    </p>
                </div>

                {/* 3. Deferred to Later Date */}
                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-textMuted">
                            Deferred to Later Date
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-riskMedium flex items-center justify-center">
                            <CalendarClock size={16} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-riskMedium">{counts.deferred}</p>
                    <p className="text-[11px] text-textMuted mt-1">
                        Awaiting next available inspection slot
                    </p>
                </div>

                {/* 4. Remaining Unscheduled */}
                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-textMuted">
                            Remaining Unscheduled
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-red-50 text-riskHigh flex items-center justify-center">
                            <XCircle size={16} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-riskHigh">{counts.unscheduled}</p>
                    <p className="text-[11px] text-textMuted mt-1">
                        Exceeds current division capacity
                    </p>
                </div>
            </div>

            {/* ── Officer Unavailability & Reason Callout ──────────────────── */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-sm p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borderLight pb-2.5">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <User size={13} className="text-amber-700" />
                            Unavailable Officer: {unavailablePhi}
                        </span>
                        <span className="text-xs text-textMuted">
                            Planning Date: <strong className="text-darkBase">{planningDate}</strong>
                        </span>
                    </div>
                    {counts.protectedCount > 0 && (
                        <div className="flex items-center gap-1 text-xs text-textMuted">
                            <ShieldCheck size={14} className="text-primary" />
                            <span>
                                <strong className="text-darkBase">{counts.protectedCount}</strong> protected completed/in-progress task(s) preserved
                            </span>
                        </div>
                    )}
                </div>

                {/* Explanations for unscheduled or deferred tasks */}
                {counts.unscheduled > 0 && (
                    <div className="flex items-start gap-2.5 text-xs text-darkBase bg-red-50/70 border border-red-200/80 rounded-lg p-2.5">
                        <AlertTriangle size={15} className="text-riskHigh shrink-0 mt-0.5" />
                        <div>
                            <span className="font-bold text-riskHigh">Capacity Constraint Notice: </span>
                            <span>
                                {explanationNotes.unscheduled[0] ||
                                    "No available officer currently has both remaining capacity and a non-conflicting 45-minute slot on this date."}
                            </span>
                        </div>
                    </div>
                )}

                {counts.deferred > 0 && (
                    <div className="flex items-start gap-2.5 text-xs text-darkBase bg-amber-50/70 border border-amber-200/80 rounded-lg p-2.5">
                        <CalendarClock size={15} className="text-riskMedium shrink-0 mt-0.5" />
                        <div>
                            <span className="font-bold text-riskMedium">Deferred Replanning Notice: </span>
                            <span>
                                {explanationNotes.deferred[0] ||
                                    "Tasks are pending allocation to subsequent days within the active surveillance horizon."}
                            </span>
                        </div>
                    </div>
                )}

                {counts.reassigned > 0 && counts.unscheduled === 0 && counts.deferred === 0 && (
                    <div className="flex items-center gap-2 text-xs text-darkBase bg-mintSurface/60 border border-riskCleared/40 rounded-lg p-2.5">
                        <CheckCircle2 size={15} className="text-riskCleared shrink-0" />
                        <span>
                            All eligible tasks from <strong className="text-primary">{unavailablePhi}</strong> were successfully reassigned to active officers without schedule conflicts.
                        </span>
                    </div>
                )}
            </div>

            {/* ── Detailed Table Container ─────────────────────────────────── */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-sm overflow-hidden">
                {/* Table Header & Controls */}
                <div className="p-4 border-b border-borderLight space-y-3 bg-background/40">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-darkBase">
                                Detailed Task Redistribution Schedule
                            </h4>
                            <span className="text-xs text-textMuted bg-background border border-borderLight px-2 py-0.5 rounded-full font-semibold">
                                {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"}
                            </span>
                        </div>

                        {/* Search Input */}
                        <div className="relative w-full sm:w-72">
                            <Search
                                size={14}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none"
                            />
                            <input
                                id="search-reschedule-tasks"
                                type="text"
                                placeholder="Search by Task ID or PHI ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-7 py-1.5 text-xs border border-borderLight rounded-lg bg-surface text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted hover:text-darkBase"
                                    title="Clear search"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-borderLight/80">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                onClick={() => setStatusFilter("all")}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                                    statusFilter === "all"
                                        ? "bg-primary text-surface shadow-xs"
                                        : "bg-surface border border-borderLight text-textMuted hover:text-darkBase hover:bg-background"
                                }`}
                            >
                                All Tasks ({counts.total})
                            </button>
                            <button
                                onClick={() => setStatusFilter("reassigned")}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                                    statusFilter === "reassigned"
                                        ? "bg-riskCleared text-surface shadow-xs"
                                        : "bg-surface border border-riskCleared/40 text-riskCleared hover:bg-emerald-50"
                                }`}
                            >
                                Reassigned ({counts.reassigned})
                            </button>
                            <button
                                onClick={() => setStatusFilter("deferred")}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                                    statusFilter === "deferred"
                                        ? "bg-riskMedium text-surface shadow-xs"
                                        : "bg-surface border border-riskMedium/40 text-riskMedium hover:bg-amber-50"
                                }`}
                            >
                                Deferred ({counts.deferred})
                            </button>
                            <button
                                onClick={() => setStatusFilter("unscheduled")}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                                    statusFilter === "unscheduled"
                                        ? "bg-riskHigh text-surface shadow-xs"
                                        : "bg-surface border border-riskHigh/40 text-riskHigh hover:bg-red-50"
                                }`}
                            >
                                Unscheduled ({counts.unscheduled})
                            </button>
                            <button
                                onClick={() => setStatusFilter("unchanged")}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                                    statusFilter === "unchanged"
                                        ? "bg-darkBase text-surface shadow-xs"
                                        : "bg-surface border border-borderLight text-textMuted hover:text-darkBase hover:bg-background"
                                }`}
                            >
                                Unchanged ({counts.unchanged})
                            </button>
                        </div>

                        {/* Reset Filter Button */}
                        {isFiltered && (
                            <button
                                onClick={resetFilters}
                                className="text-xs font-semibold text-primary hover:text-secondary flex items-center gap-1 transition px-2 py-1 rounded-md hover:bg-background"
                            >
                                <X size={12} />
                                Reset Filters
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-background border-b border-borderLight uppercase text-textMuted font-bold text-[11px]">
                            <tr>
                                <th className="p-3 whitespace-nowrap">Task ID</th>
                                <th className="p-3 whitespace-nowrap">Type</th>
                                <th className="p-3 whitespace-nowrap">Priority</th>
                                <th className="p-3 whitespace-nowrap">Previous PHI</th>
                                <th className="p-3 whitespace-nowrap">Newly Assigned PHI</th>
                                <th className="p-3 whitespace-nowrap">Previous Schedule</th>
                                <th className="p-3 whitespace-nowrap">New Schedule</th>
                                <th className="p-3 whitespace-nowrap">Final Status</th>
                                <th className="p-3">Reason / Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-borderLight">
                            {filteredTasks.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-sm text-textMuted">
                                        <AlertCircle size={24} className="mx-auto mb-2 text-textMuted/50" />
                                        <p className="font-semibold text-darkBase">No tasks match the active filter</p>
                                        <p className="text-xs text-textMuted mt-1">
                                            Try selecting another category or clearing your search query.
                                        </p>
                                        <button
                                            onClick={resetFilters}
                                            className="mt-3 px-3.5 py-1.5 text-xs font-bold bg-primary text-surface rounded-lg hover:bg-secondary transition shadow-xs"
                                        >
                                            Reset Filters
                                        </button>
                                    </td>
                                </tr>
                            ) : (
                                filteredTasks.map((t) => (
                                    <tr
                                        key={t.taskId}
                                        className={`transition ${
                                            t.classification === "Reassigned"
                                                ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                                                : t.classification === "Unscheduled"
                                                ? "bg-red-50/40 hover:bg-red-50/70"
                                                : t.classification === "Deferred"
                                                ? "bg-amber-50/40 hover:bg-amber-50/70"
                                                : "hover:bg-background/60"
                                        }`}
                                    >
                                        {/* Task ID */}
                                        <td className="p-3 font-mono font-bold text-primary whitespace-nowrap">
                                            {t.taskId}
                                        </td>

                                        {/* Type */}
                                        <td className="p-3 whitespace-nowrap text-textMuted">
                                            {t.task_type ?? "—"}
                                        </td>

                                        {/* Priority */}
                                        <td className="p-3 whitespace-nowrap">
                                            <PriorityBadge level={t.priority_level} />
                                        </td>

                                        {/* Previous PHI */}
                                        <td className="p-3 whitespace-nowrap">
                                            {t.prevPhi ? (
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                                                        t.prevPhi === unavailablePhi
                                                            ? "bg-amber-100/80 text-amber-900 border border-amber-300 font-bold"
                                                            : "bg-background text-textMuted border border-borderLight"
                                                    }`}
                                                >
                                                    <User size={11} />
                                                    {t.prevPhi}
                                                </span>
                                            ) : (
                                                <span className="text-textMuted italic text-xs">Unassigned</span>
                                            )}
                                        </td>

                                        {/* Newly Assigned PHI */}
                                        <td className="p-3 whitespace-nowrap">
                                            {t.currStatus === "Scheduled" && t.currPhi ? (
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold ${
                                                        t.classification === "Reassigned"
                                                            ? "bg-mintSurface text-riskCleared border border-riskCleared/40"
                                                            : "bg-surface text-darkBase border border-borderLight"
                                                    }`}
                                                >
                                                    {t.classification === "Reassigned" && (
                                                        <ArrowRight size={11} className="text-riskCleared" />
                                                    )}
                                                    <User size={11} />
                                                    {t.currPhi}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-50 text-riskHigh border border-red-200">
                                                    <XCircle size={11} />
                                                    Unassigned
                                                </span>
                                            )}
                                        </td>

                                        {/* Previous Schedule */}
                                        <td className="p-3 whitespace-nowrap text-textMuted font-mono text-[11px]">
                                            {t.prevStart && t.prevEnd ? (
                                                <span>
                                                    {t.prevStart} – {t.prevEnd}
                                                </span>
                                            ) : (
                                                <span>—</span>
                                            )}
                                        </td>

                                        {/* New Schedule (Date + Time) */}
                                        <td className="p-3 whitespace-nowrap font-mono text-[11px]">
                                            {t.currStatus === "Scheduled" && t.start_time && t.end_time ? (
                                                <div>
                                                    <span className="font-bold text-darkBase">
                                                        {t.start_time} – {t.end_time}
                                                    </span>
                                                    {t.currDate && t.currDate !== t.prevDate && (
                                                        <div className="text-[10px] font-sans font-bold text-riskMedium">
                                                            {t.currDate}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-textMuted italic">—</span>
                                            )}
                                        </td>

                                        {/* Final Status & Classification Badge */}
                                        <td className="p-3 whitespace-nowrap">
                                            <div className="flex flex-col gap-1 items-start">
                                                <ClassificationBadge classification={t.classification} isProtected={t.isProtected} />
                                                {t.isProtected && (
                                                    <span className="text-[10px] font-bold text-primary flex items-center gap-0.5">
                                                        <ShieldCheck size={10} />
                                                        {t.taskStatus} (Protected)
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Reason / Details */}
                                        <td className="p-3 text-textMuted max-w-xs text-xs">
                                            <span className="line-clamp-2" title={t.reason || ""}>
                                                {t.reason || "—"}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function ClassificationBadge({ classification, isProtected }) {
    if (isProtected) {
        return (
            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                Protected
            </span>
        );
    }

    switch (classification) {
        case "Reassigned":
            return (
                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-mintSurface text-riskCleared border border-riskCleared whitespace-nowrap">
                    Reassigned
                </span>
            );
        case "Deferred":
            return (
                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-riskMedium border border-riskMedium whitespace-nowrap">
                    Deferred
                </span>
            );
        case "Unscheduled":
            return (
                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-red-50 text-riskHigh border border-riskHigh whitespace-nowrap">
                    Unscheduled
                </span>
            );
        case "Unchanged":
        default:
            return (
                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-background text-textMuted border border-borderLight whitespace-nowrap">
                    Unchanged
                </span>
            );
    }
}
