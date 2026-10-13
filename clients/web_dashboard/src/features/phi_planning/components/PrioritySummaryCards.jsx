import { AlertCircle, AlertTriangle, CheckCircle2, Layers } from "lucide-react";

/**
 * PrioritySummaryCards
 *
 * Displays the 4 KPI summary cards at the top of the Inspection Priorities tab:
 * 1. High Priority (red)
 * 2. Medium Priority (amber/orange)
 * 3. Low Priority (green/teal)
 * 4. Total Tasks (blue)
 */
export default function PrioritySummaryCards({
    highCount = 0,
    mediumCount = 0,
    lowCount = 0,
    totalCount = 0,
    activePriority = "all",
    onSelectPriority,
    category = "all",
}) {
    const cards = [
        {
            id: "High",
            label: "High Priority Tasks",
            shortLabel: "High Priority",
            count: highCount,
            subtext: "Immediate inspection required",
            icon: AlertCircle,
            colorCls: "text-riskHigh",
            bgCls: "bg-red-50/70 border-red-200 hover:border-riskHigh/50",
            activeBorder: "ring-2 ring-riskHigh border-transparent",
            pillCls: "bg-red-100 text-riskHigh border border-red-300",
        },
        {
            id: "Medium",
            label: "Medium Priority Tasks",
            shortLabel: "Medium Priority",
            count: mediumCount,
            subtext: "Standard surveillance queue",
            icon: AlertTriangle,
            colorCls: "text-riskMedium",
            bgCls: "bg-amber-50/70 border-amber-200 hover:border-riskMedium/50",
            activeBorder: "ring-2 ring-riskMedium border-transparent",
            pillCls: "bg-amber-100 text-riskMedium border border-amber-300",
        },
        {
            id: "Low",
            label: "Low Priority Tasks",
            shortLabel: "Low Priority",
            count: lowCount,
            subtext: "Routine monitoring",
            icon: CheckCircle2,
            colorCls: "text-riskCleared",
            bgCls: "bg-emerald-50/70 border-emerald-200 hover:border-riskCleared/50",
            activeBorder: "ring-2 ring-riskCleared border-transparent",
            pillCls: "bg-emerald-100 text-riskCleared border border-emerald-300",
        },
        {
            id: "all",
            label: "Total Tasks",
            shortLabel: "Total Tasks",
            count: totalCount,
            subtext:
                category === "cases"
                    ? "Active dengue cases"
                    : category === "complaints"
                    ? "Community complaints"
                    : "Active cases & complaints",
            icon: Layers,
            colorCls: "text-primary",
            bgCls: "bg-blue-50/60 border-blue-200 hover:border-primary/50",
            activeBorder: "ring-2 ring-primary border-transparent",
            pillCls: "bg-blue-100 text-primary border border-blue-300",
        },
    ];

    return (
        <div className="space-y-2.5">
            {/* Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((c) => {
                    const Icon = c.icon;
                    const isSelected = activePriority === c.id;

                    return (
                        <button
                            type="button"
                            key={c.id}
                            onClick={() => onSelectPriority?.(c.id)}
                            className={`p-4 rounded-xl border text-left transition relative cursor-pointer ${
                                c.bgCls
                            } ${isSelected ? c.activeBorder : ""}`}
                            aria-label={`Filter by ${c.shortLabel}: ${c.count} tasks`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-darkBase tracking-wide">
                                    {c.shortLabel}
                                </span>
                                <div className={`p-1.5 rounded-lg bg-surface shadow-xs ${c.colorCls}`}>
                                    <Icon size={16} />
                                </div>
                            </div>

                            <div className="flex items-baseline gap-2 mb-1">
                                <span className={`text-2xl font-black ${c.colorCls}`}>
                                    {c.count.toLocaleString()}
                                </span>
                                <span className="text-[11px] font-medium text-textMuted">
                                    tasks
                                </span>
                            </div>

                            <p className="text-xs text-textMuted line-clamp-1">{c.subtext}</p>

                            {isSelected && (
                                <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider text-textMuted">
                                    ● Active Filter
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
