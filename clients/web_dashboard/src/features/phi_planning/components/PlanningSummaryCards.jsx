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
    scheduledTasks,
    unscheduledTasks,
    solverStatus,
}) {
    const cards = [
        {
            label: "Total Tasks",
            value: totalTasks ?? "—",
            icon: ClipboardList,
            bg: "bg-accent/30",
            iconColor: "text-primary",
        },
        {
            label: "Scheduled",
            value: scheduledTasks ?? "—",
            icon: CheckCircle2,
            bg: "bg-mintSurface",
            iconColor: "text-riskCleared",
        },
        {
            label: "Unscheduled",
            value: unscheduledTasks ?? "—",
            icon: XCircle,
            bg: "bg-red-50",
            iconColor: "text-riskHigh",
        },
        {
            label: "Solver Status",
            value: solverStatus ?? "—",
            icon: Users,
            bg: "bg-accent/20",
            iconColor: "text-secondary",
            small: true,
        },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map(({ label, value, icon: Icon, bg, iconColor, small }) => (
                <div
                    key={label}
                    className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm"
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase text-textMuted">
                            {label}
                        </span>
                        <div
                            className={`w-9 h-9 rounded-full ${bg} ${iconColor} flex items-center justify-center`}
                        >
                            <Icon size={18} />
                        </div>
                    </div>
                    <p
                        className={`font-extrabold text-darkBase ${
                            small ? "text-base break-words" : "text-2xl"
                        }`}
                    >
                        {value}
                    </p>
                </div>
            ))}
        </div>
    );
}
