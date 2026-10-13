import PriorityBadge from "./PriorityBadge";

/**
 * ScheduleTable
 *
 * Renders a table of tasks returned by POST /api/v1/planning/schedule
 * or POST /api/v1/planning/reschedule.
 *
 * Props:
 *   tasks      — array of task objects
 *   emptyLabel — fallback message when tasks is empty
 */
export default function ScheduleTable({ tasks = [], emptyLabel }) {
    if (tasks.length === 0) {
        return (
            <div className="py-10 text-center text-sm text-textMuted">
                {emptyLabel ?? "No tasks to display."}
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-background border-b border-borderLight text-xs font-bold uppercase text-textMuted">
                    <tr>
                        <th className="p-3">Task ID</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Priority</th>
                        <th className="p-3">Assigned PHI</th>
                        <th className="p-3">Start</th>
                        <th className="p-3">End</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Note</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-borderLight">
                    {tasks.map((task, idx) => (
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
                            <td className="p-3 font-bold text-primary whitespace-nowrap text-xs">
                                {task.scenario_task_id ?? task.source_id ?? "—"}
                            </td>
                            <td className="p-3 text-textMuted whitespace-nowrap">
                                {task.task_type ?? "—"}
                            </td>
                            <td className="p-3">
                                <PriorityBadge level={task.priority_level} />
                            </td>
                            <td className="p-3 font-semibold text-darkBase whitespace-nowrap">
                                {task.assigned_phi || <span className="text-textMuted italic">Unassigned</span>}
                            </td>
                            <td className="p-3 text-darkBase whitespace-nowrap">
                                {task.start_time || "—"}
                            </td>
                            <td className="p-3 text-darkBase whitespace-nowrap">
                                {task.end_time || "—"}
                            </td>
                            <td className="p-3">
                                <StatusBadge status={task.status} />
                            </td>
                            <td className="p-3 text-textMuted max-w-xs text-xs">
                                <span className="line-clamp-2">{task.reason ?? "—"}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
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
