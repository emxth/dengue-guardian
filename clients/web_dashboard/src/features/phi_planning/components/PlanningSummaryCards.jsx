import { ClipboardList, CheckCircle2, XCircle } from "lucide-react";

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
 */
export default function PlanningSummaryCards({
    totalTasks,
    newTasks,
    scheduledTasks,
    unscheduledTasks,
    completedTasks,
    cancelledTasks,
    carriedForwardTasks,
}) {
    const cards = [
        {
            label: "Total Tasks",
            value: totalTasks ?? "—",
            sublabel: "Considered for date",
            icon: ClipboardList,
            bg: "bg-accent/30",
            iconColor: "text-primary",
        },
        {
            label: "New Tasks",
            value: newTasks ?? "—",
            sublabel: "Received on selected date",
            icon: ClipboardList,
            bg: "bg-accent/30",
            iconColor: "text-primary",
        },
        {
            label: "Scheduled",
            value: scheduledTasks ?? "—",
            sublabel: "Assigned inspection slot",
            icon: CheckCircle2,
            bg: "bg-mintSurface",
            iconColor: "text-riskCleared",
        },
        {
            label: "Unscheduled",
            value: unscheduledTasks ?? "—",
            sublabel: "Waiting for an available time slot",
            icon: XCircle,
            bg: "bg-red-50",
            iconColor: "text-riskHigh",
        },
        {
            label: "Completed",
            value: completedTasks ?? "—",
            sublabel: "Completed inspections",
            icon: CheckCircle2,
            bg: "bg-mintSurface",
            iconColor: "text-riskCleared",
        },
        {
            label: "Cancelled",
            value: cancelledTasks ?? "—",
            sublabel: "Cancelled inspections",
            icon: XCircle,
            bg: "bg-red-50",
            iconColor: "text-riskHigh",
        },
        {
            label: "Carried Forward",
            value: carriedForwardTasks ?? "—",
            sublabel: "Tasks from earlier planning dates",
            icon: ClipboardList,
            bg: "bg-amber-50",
            iconColor: "text-riskMedium",
        },
    ];

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 gap-3">
                {cards.map(({ label, value, sublabel, icon: Icon, bg, iconColor }) => (
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
                            <p className="text-xl font-extrabold text-darkBase">
                                {value}
                            </p>
                        </div>
                        <div className="mt-2 pt-2 border-t border-borderLight/60 flex flex-col gap-0.5">
                            <span className="text-[10px] font-semibold text-textMuted leading-tight">
                                {sublabel}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
