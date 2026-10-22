import { useState, useMemo } from "react";
import { User, Users, Search, X, Clock, AlertCircle } from "lucide-react";
import TaskPriorityDisplay from "./TaskPriorityDisplay";

/**
 * ScheduleTable
 *
 * Renders a table of tasks returned by POST /api/v1/planning/schedule
 * or POST /api/v1/planning/reschedule with interactive PHI filtering.
 *
 * Props:
 *   tasks      — array of task objects
 *   emptyLabel — fallback message when tasks is empty
 */
export default function ScheduleTable({ tasks = [], emptyLabel }) {
    const [selectedPhi, setSelectedPhi] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [priorityFilter, setPriorityFilter] = useState("all");

    function displayPriority(task) {
        return task.scheduling_priority_level || task.priority_level || "Low";
    }

    // Extract sorted unique list of PHIs from tasks
    const phiList = useMemo(() => {
        const phis = new Set();
        tasks.forEach((t) => {
            if (t.status === "Scheduled" && t.assigned_phi && t.assigned_phi.trim()) {
                phis.add(t.assigned_phi.trim());
            }
        });
        return Array.from(phis).sort();
    }, [tasks]);

    // Count tasks per PHI
    const phiCounts = useMemo(() => {
        const counts = {};
        let unassigned = 0;
        tasks.forEach((t) => {
            const phi = t.assigned_phi?.trim();
            if (t.status === "Scheduled" && phi) {
                counts[phi] = (counts[phi] || 0) + 1;
            } else if (["Unscheduled", "Pending rescheduling"].includes(t.status) && !phi) {
                unassigned += 1;
            }
        });
        return { counts, unassigned };
    }, [tasks]);

    // Filter tasks based on PHI, priority, and search query
    const filteredTasks = useMemo(() => {
        const matchingTasks = tasks.filter((task) => {
            // PHI Filter
            if (selectedPhi !== "all") {
                if (selectedPhi === "Unassigned") {
                    if (task.assigned_phi && task.assigned_phi.trim()) return false;
                } else if (task.assigned_phi?.trim() !== selectedPhi) {
                    return false;
                }
            }

            // Priority Filter
            if (priorityFilter !== "all") {
                if (displayPriority(task) !== priorityFilter) return false;
            }

            // Search query filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const idMatch = (task.scenario_task_id || task.source_id || "").toLowerCase().includes(q);
                const typeMatch = (task.task_type || "").toLowerCase().includes(q);
                const phiMatch = (task.assigned_phi || "").toLowerCase().includes(q);
                const noteMatch = (task.reason || "").toLowerCase().includes(q);
                const statusMatch = (task.status || "").toLowerCase().includes(q);
                if (!idMatch && !typeMatch && !phiMatch && !noteMatch && !statusMatch) {
                    return false;
                }
            }

            return true;
        });
        return matchingTasks.sort((first, second) => {
            const firstTime = first.start_time || "99:99";
            const secondTime = second.start_time || "99:99";
            return firstTime.localeCompare(secondTime);
        });
    }, [tasks, selectedPhi, priorityFilter, searchQuery]);

    // Calculate active shift window for the selected PHI
    const selectedPhiStats = useMemo(() => {
        if (selectedPhi === "all" || selectedPhi === "Unassigned") return null;

        const phiTasks = tasks.filter((t) =>
            t.status === "Scheduled" && t.assigned_phi?.trim() === selectedPhi
        );
        const validTimes = phiTasks.filter((t) => t.start_time && t.end_time);

        let earliestStart = null;
        let latestEnd = null;

        validTimes.forEach((t) => {
            if (!earliestStart || t.start_time < earliestStart) earliestStart = t.start_time;
            if (!latestEnd || t.end_time > latestEnd) latestEnd = t.end_time;
        });

        const highCount = phiTasks.filter((task) => displayPriority(task) === "High").length;
        const mediumCount = phiTasks.filter((task) => displayPriority(task) === "Medium").length;
        const lowCount = phiTasks.filter((task) => displayPriority(task) === "Low").length;

        return {
            total: phiTasks.length,
            earliestStart,
            latestEnd,
            highCount,
            mediumCount,
            lowCount,
        };
    }, [tasks, selectedPhi]);

    const isFiltered = selectedPhi !== "all" || priorityFilter !== "all" || searchQuery.trim() !== "";

    const resetFilters = () => {
        setSelectedPhi("all");
        setPriorityFilter("all");
        setSearchQuery("");
    };

    if (tasks.length === 0) {
        return (
            <div className="py-10 text-center text-sm text-textMuted">
                {emptyLabel ?? "No tasks to display."}
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            {/* ── Toolbar: Filters & Search ──────────────────────────────────── */}
            <div className="p-4 bg-background/50 border-b border-borderLight space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Controls group */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* PHI Dropdown */}
                        <div className="flex items-center gap-1.5">
                            <label
                                htmlFor="phi-filter-dropdown"
                                className="text-xs font-bold text-textMuted uppercase flex items-center gap-1 shrink-0"
                            >
                                <User size={13} className="text-primary" />
                                Officer:
                            </label>
                            <select
                                id="phi-filter-dropdown"
                                value={selectedPhi}
                                onChange={(e) => setSelectedPhi(e.target.value)}
                                className="border border-borderLight rounded-lg px-2.5 py-1.5 text-xs font-semibold text-darkBase bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
                            >
                                <option value="all">All Officers ({tasks.length} tasks)</option>
                                {phiList.map((phi) => (
                                    <option key={phi} value={phi}>
                                        {phi} ({phiCounts.counts[phi] || 0} tasks)
                                    </option>
                                ))}
                                {phiCounts.unassigned > 0 && (
                                    <option value="Unassigned">
                                        Unassigned ({phiCounts.unassigned} tasks)
                                    </option>
                                )}
                            </select>
                        </div>

                        {/* Priority Filter */}
                        <div className="flex items-center gap-1.5">
                            <label
                                htmlFor="priority-filter-select"
                                className="text-xs font-bold text-textMuted uppercase shrink-0"
                            >
                                Priority:
                            </label>
                            <select
                                id="priority-filter-select"
                                value={priorityFilter}
                                onChange={(e) => setPriorityFilter(e.target.value)}
                                className="border border-borderLight rounded-lg px-2.5 py-1.5 text-xs font-semibold text-darkBase bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
                            >
                                <option value="all">All Priorities</option>
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>

                        {/* Reset Filter Button */}
                        {isFiltered && (
                            <button
                                onClick={resetFilters}
                                className="text-xs font-semibold text-primary hover:text-secondary flex items-center gap-1 transition px-2 py-1 rounded-md hover:bg-background"
                            >
                                <X size={12} />
                                Clear Filters
                            </button>
                        )}
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full sm:w-64">
                        <Search
                            size={14}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none"
                        />
                        <input
                            type="text"
                            placeholder="Search tasks, notes, IDs..."
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

                {/* Quick PHI Pills */}
                {phiList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-bold text-textMuted uppercase flex items-center gap-1 mr-1">
                            <Users size={12} />
                            Quick Select:
                        </span>
                        <button
                            onClick={() => setSelectedPhi("all")}
                            className={`px-2.5 py-1 rounded-full text-xs font-bold transition ${
                                selectedPhi === "all"
                                    ? "bg-primary text-surface shadow-xs"
                                    : "bg-surface border border-borderLight text-textMuted hover:text-darkBase hover:bg-background"
                            }`}
                        >
                            All ({tasks.length})
                        </button>
                        {phiList.map((phi) => (
                            <button
                                key={phi}
                                onClick={() => setSelectedPhi(phi)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                                    selectedPhi === phi
                                        ? "bg-primary text-surface shadow-xs font-bold"
                                        : "bg-surface border border-borderLight text-textMuted hover:text-darkBase hover:bg-background"
                                }`}
                            >
                                {phi} ({phiCounts.counts[phi] || 0})
                            </button>
                        ))}
                        {phiCounts.unassigned > 0 && (
                            <button
                                onClick={() => setSelectedPhi("Unassigned")}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                                    selectedPhi === "Unassigned"
                                        ? "bg-riskHigh text-surface shadow-xs font-bold"
                                        : "bg-surface border border-riskHigh/40 text-riskHigh hover:bg-red-50"
                                }`}
                            >
                                Unassigned ({phiCounts.unassigned})
                            </button>
                        )}
                    </div>
                )}

                {/* Active PHI Shift Summary Banner */}
                {selectedPhiStats && (
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-mintSurface/60 border border-riskCleared/40 rounded-lg px-3.5 py-2 text-xs text-darkBase">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-bold text-primary flex items-center gap-1">
                                <User size={13} /> Officer {selectedPhi}
                            </span>
                            <span className="text-textMuted">•</span>
                            <span className="font-semibold">
                                {selectedPhiStats.total} assigned task{selectedPhiStats.total !== 1 ? "s" : ""}
                            </span>
                            {selectedPhiStats.earliestStart && selectedPhiStats.latestEnd && (
                                <>
                                    <span className="text-textMuted">•</span>
                                    <span className="flex items-center gap-1 text-textMuted">
                                        <Clock size={12} className="text-secondary" />
                                        Shift: <strong className="text-darkBase">{selectedPhiStats.earliestStart} – {selectedPhiStats.latestEnd}</strong>
                                    </span>
                                </>
                            )}
                            <span className="text-textMuted">•</span>
                            <span className="text-textMuted">
                                High: <strong className="text-riskHigh">{selectedPhiStats.highCount}</strong> | Med: <strong className="text-riskMedium">{selectedPhiStats.mediumCount}</strong> | Low: <strong className="text-riskCleared">{selectedPhiStats.lowCount}</strong>
                            </span>
                        </div>
                        <button
                            onClick={() => setSelectedPhi("all")}
                            className="text-[11px] font-bold text-primary hover:text-secondary hover:underline"
                        >
                            Show All Officers
                        </button>
                    </div>
                )}

                {/* Filter count indicator */}
                {isFiltered && (
                    <div className="text-xs text-textMuted flex items-center justify-between pt-0.5">
                        <span>
                            Showing <strong className="text-darkBase">{filteredTasks.length}</strong> of {tasks.length} total tasks
                            {selectedPhi !== "all" && (
                                <span> for <strong className="text-primary">{selectedPhi}</strong></span>
                            )}
                        </span>
                    </div>
                )}
            </div>

            {/* ── Table ──────────────────────────────────────────────────────── */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-background border-b border-borderLight text-xs font-bold uppercase text-textMuted">
                        <tr>
                            <th className="p-3">Order</th>
                            <th className="p-3">Task ID</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Priority</th>
                            <th className="p-3">Assigned PHI</th>
                            <th className="p-3">Original Date</th>
                            <th className="p-3">Start</th>
                            <th className="p-3">End</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Reason / Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-borderLight">
                        {filteredTasks.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="py-12 text-center text-sm text-textMuted">
                                    <AlertCircle size={24} className="mx-auto mb-2 text-textMuted/50" />
                                    <p className="font-semibold text-darkBase">No tasks match the active filters</p>
                                    <p className="text-xs text-textMuted mt-1">
                                        Try selecting another officer or clearing your search term.
                                    </p>
                                    <button
                                        onClick={resetFilters}
                                        className="mt-3 px-3.5 py-1.5 text-xs font-bold bg-primary text-surface rounded-lg hover:bg-secondary transition shadow-xs"
                                    >
                                        Clear Filters
                                    </button>
                                </td>
                            </tr>
                        ) : (
                            filteredTasks.map((task, idx) => (
                                <tr
                                    key={task.scenario_task_id ?? idx}
                                    className={`transition ${
                                        task.status === "Unscheduled"
                                            ? "bg-red-50/60"
                                            : task.status === "Pending rescheduling"
                                            ? "bg-amber-50/60"
                                            : "hover:bg-background/60"
                                    }`}
                                >
                                    <td className="p-3 text-xs font-mono text-textMuted">
                                        {task.start_time ? idx + 1 : "—"}
                                    </td>
                                    <td className="p-3 font-bold text-primary whitespace-nowrap text-xs font-mono">
                                        {task.scenario_task_id ?? task.source_id ?? "—"}
                                    </td>
                                    <td className="p-3 text-textMuted whitespace-nowrap">
                                        {task.task_type ?? "—"}
                                    </td>
                                    <td className="p-3 whitespace-nowrap">
                                        <TaskPriorityDisplay task={task} />
                                    </td>
                                    <td className="p-3 whitespace-nowrap">
                                        {task.assigned_phi ? (
                                            <button
                                                onClick={() => setSelectedPhi(task.assigned_phi.trim())}
                                                title={`Filter schedule by ${task.assigned_phi.trim()}`}
                                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold transition border cursor-pointer ${
                                                    selectedPhi === task.assigned_phi.trim()
                                                        ? "bg-primary text-surface border-primary"
                                                        : "bg-surface text-primary border-borderLight hover:bg-primary/10 hover:border-primary/40"
                                                }`}
                                            >
                                                <User size={11} className={selectedPhi === task.assigned_phi.trim() ? "text-surface" : "text-secondary"} />
                                                {task.assigned_phi.trim()}
                                            </button>
                                        ) : (
                                            <span className="text-textMuted italic text-xs">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="p-3 whitespace-nowrap text-xs font-mono text-textMuted">
                                        {task.task_date || task.notification_date || task.received_date || "—"}
                                    </td>
                                    <td className="p-3 text-darkBase whitespace-nowrap font-mono text-xs">
                                        {task.start_time || "—"}
                                    </td>
                                    <td className="p-3 text-darkBase whitespace-nowrap font-mono text-xs">
                                        {task.end_time || "—"}
                                    </td>
                                    <td className="p-3 whitespace-nowrap">
                                        <StatusBadge status={task.status} />
                                    </td>
                                    <td className="p-3 text-textMuted max-w-xs text-xs">
                                        <span className="line-clamp-2">{task.reason ?? "—"}</span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function StatusBadge({ status }) {
    const map = {
        Scheduled:
            "bg-mintSurface border border-riskCleared text-riskCleared",
        Unscheduled:
            "bg-red-50 border border-riskHigh text-riskHigh",
        "Pending rescheduling":
            "bg-amber-50 border border-riskMedium text-riskMedium",
        Completed:
            "bg-mintSurface border border-riskCleared text-riskCleared",
        "In Progress":
            "bg-accent/30 border border-secondary text-secondary",
        Pending:
            "bg-background border border-textMuted text-textMuted",
    };

    const label = status ?? "Unknown";
    const cls = map[label] ?? "bg-background border border-borderLight text-textMuted";

    return (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${cls}`}>
            {label}
        </span>
    );
}
