import PriorityBadge from "./PriorityBadge";

/**
 * PriorityTable
 *
 * Renders a table of priority tasks (dengue cases, citizen complaints, or both)
 * returned by the GET /api/v1/planning/priorities endpoint.
 *
 * Requirements:
 * - Preferred location format: `[Verified location name] (LOC007)`
 * - Clear identification of synthetic labels
 * - Graceful fallback to `Name unavailable (LOCxxx)` if label missing
 * - Preserves distinction between Dengue Case Inspection and Citizen Complaint
 */
export default function PriorityTable({
    rows = [],
    taskType = "all",
    emptyLabel = "No priority tasks match the selected criteria.",
}) {
    const categoryHeader =
        taskType === "cases"
            ? "Case Type"
            : taskType === "complaints"
            ? "Complaint Type"
            : "Category";

    if (rows.length === 0) {
        return (
            <div className="py-12 text-center text-sm text-textMuted bg-background/50 rounded-xl border border-dashed border-borderLight m-4">
                <p className="font-semibold text-darkBase mb-1">No matching tasks found</p>
                <p className="text-xs text-textMuted">{emptyLabel}</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-background border-b border-borderLight text-xs font-bold uppercase text-textMuted">
                    <tr>
                        <th className="p-3">Task ID</th>
                        <th className="p-3">{categoryHeader}</th>
                        <th className="p-3">Priority</th>
                        <th className="p-3">Score</th>
                        <th className="p-3">Location</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Reason / Details</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-borderLight">
                    {rows.map((row, idx) => {
                        const isComplaint =
                            row.task_type === "Citizen Complaint" ||
                            row.task_type === "complaint" ||
                            row.complaint_type;
                        const dateVal = row.notification_date || row.received_date || "—";

                        return (
                            <tr
                                key={row.task_id ?? idx}
                                className="hover:bg-background/70 transition"
                            >
                                {/* ID */}
                                <td className="p-3 font-bold text-primary whitespace-nowrap text-xs font-mono">
                                    {row.task_id ?? "—"}
                                </td>

                                {/* Task Type / Category */}
                                <td className="p-3 whitespace-nowrap">
                                    <span
                                        className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${
                                            isComplaint
                                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                                : "bg-blue-50 text-blue-700 border border-blue-200"
                                        }`}
                                    >
                                        {isComplaint ? "Citizen Complaint" : "Dengue Case Inspection"}
                                    </span>
                                    {row.complaint_type && (
                                        <div className="text-[11px] text-textMuted mt-0.5">
                                            {row.complaint_type}
                                        </div>
                                    )}
                                </td>

                                {/* Priority Badge */}
                                <td className="p-3 whitespace-nowrap">
                                    <PriorityBadge level={row.priority_level} />
                                </td>

                                {/* Score */}
                                <td className="p-3 font-semibold text-darkBase whitespace-nowrap">
                                    {row.priority_score != null
                                        ? Number(row.priority_score).toFixed(1)
                                        : "—"}
                                </td>

                                {/* Location: [Verified location name] (LOC007) */}
                                <td className="p-3 whitespace-nowrap">
                                    <div className="font-semibold text-darkBase text-xs">
                                        {row.location_name &&
                                        row.location_name !== "Name unavailable" ? (
                                            <>
                                                <span>{row.location_name}</span>{" "}
                                                <span className="text-textMuted font-mono text-[11px]">
                                                    ({row.location_id ?? "Unknown"})
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-textMuted font-mono text-xs">
                                                Name unavailable ({row.location_id ?? "Unknown"})
                                            </span>
                                        )}
                                    </div>
                                </td>

                                {/* Date */}
                                <td className="p-3 text-xs text-textMuted whitespace-nowrap">
                                    {dateVal}
                                </td>

                                {/* Reason / details */}
                                <td className="p-3 text-textMuted max-w-xs text-xs">
                                    <span className="line-clamp-2">
                                        {row.priority_reason ?? "—"}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
