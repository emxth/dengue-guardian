import { ClipboardList, CheckCircle2, XCircle, Users } from "lucide-react";

/**
 * PlanningSummaryCards
 *
 * Displays KPI summary cards sourced from the API response.
 * Does not display hardcoded values — renders only what the API returns.
 *
 * Props (all optional, render "—" if not provided):
 *   totalTasks       — total number of tasks in the schedule
 *   scheduledTasks   — number of successfully scheduled tasks
 *   unscheduledTasks — number of tasks not scheduled
 *   solverStatus     — solver status string from the API
 */
export default function PlanningSummaryCards({
    totalTasks,
    newTasks,
    scheduledTasks,
    unscheduledTasks,
    completedTasks,
    cancelledTasks,
    solverStatus,
    carriedForwardTasks,
}) {
    const cards = [
        {
            label: "Total Tasks",
            value: totalTasks ?? "—",
            sublabel: "Considered for date",
            category: "Total",
            icon: ClipboardList,
            bg: "bg-accent/30",
            iconColor: "text-primary",
        },
        {
            label: "New Tasks",
            value: newTasks ?? "—",
            sublabel: "Received on selected date",
            category: "Task Origin",
            icon: ClipboardList,
            bg: "bg-accent/30",
            iconColor: "text-primary",
        },
        {
            label: "Scheduled",
            value: scheduledTasks ?? "—",
            sublabel: "Assigned inspection slot",
            category: "Outcome Category",
            icon: CheckCircle2,
            bg: "bg-mintSurface",
            iconColor: "text-riskCleared",
        },
        {
            label: "Unscheduled",
            value: unscheduledTasks ?? "—",
            sublabel: "Pending feasible slot",
            category: "Outcome Category",
            icon: XCircle,
            bg: "bg-red-50",
            iconColor: "text-riskHigh",
        },
        {
            label: "Completed",
            value: completedTasks ?? "—",
            sublabel: "Terminal; not reassigned",
            category: "Lifecycle",
            icon: CheckCircle2,
            bg: "bg-mintSurface",
            iconColor: "text-riskCleared",
        },
        {
            label: "Cancelled",
            value: cancelledTasks ?? "—",
            sublabel: "Terminal; not reassigned",
            category: "Lifecycle",
            icon: XCircle,
            bg: "bg-red-50",
            iconColor: "text-riskHigh",
        },
        {
            label: "Carried Forward",
            value: carriedForwardTasks ?? "—",
            sublabel: "Earlier Pending / In Progress",
            category: "Overlapping Metric",
            icon: ClipboardList,
            bg: "bg-amber-50",
            iconColor: "text-riskMedium",
        },
        {
            label: "Solver Status",
            value: solverStatus ?? "—",
            sublabel: "Optimization outcome",
            category: "Engine",
            icon: Users,
            bg: "bg-accent/20",
            iconColor: "text-secondary",
            small: true,
        },
    ];

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 gap-3">
                {cards.map(({ label, value, sublabel, category, icon: Icon, bg, iconColor, small }) => (
                    <div
                        key={label}
                        className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-textMuted">
                                    {label}
                                </span>
                                <div
                                    className={`w-7 h-7 rounded-full ${bg} ${iconColor} flex items-center justify-center shrink-0`}
                                >
                                    <Icon size={14} />
                                </div>
                            </div>
                            <p
                                className={`font-extrabold text-darkBase ${
                                    small ? "text-sm break-words" : "text-xl"
                                }`}
                            >
                                {value}
                            </p>
                        </div>
                        <div className="mt-2 pt-2 border-t border-borderLight/60 flex flex-col gap-0.5">
                            <span className="text-[10px] font-semibold text-textMuted leading-tight">
                                {sublabel}
                            </span>
                            <span className={`text-[9px] font-bold uppercase ${
                                category === "Overlapping Metric"
                                    ? "text-riskMedium"
                                    : category === "Outcome Category"
                                    ? "text-primary"
                                    : "text-textMuted"
                            }`}>
                                {category}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
