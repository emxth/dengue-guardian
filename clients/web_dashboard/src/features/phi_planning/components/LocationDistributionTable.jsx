import { useState, useMemo } from "react";
import { MapPin, Filter, ArrowUpDown, ChevronDown, ChevronUp, X } from "lucide-react";

/**
 * LocationDistributionTable
 *
 * Section: "Priority Distribution by Location"
 * Groups currently loaded tasks by location and displays:
 * - Location name & ID: [Verified location name] (LOCxxx)
 * - High, Medium, Low, and Total task counts
 * - Stacked distribution bar (red, amber, green)
 * - Allows clicking any location to filter the task table below.
 *
 * Sorts by descending High-priority count by default.
 */
export default function LocationDistributionTable({
    tasks = [],
    locationSummary = null,
    selectedLocation = "all",
    onSelectLocation,
    totalLoadedTasks = 0,
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [sortBy, setSortBy] = useState("high"); // "high" | "total" | "name"
    const [sortAsc, setSortAsc] = useState(false);

    // Group tasks by location
    const locationStats = useMemo(() => {
        if (locationSummary) {
            const rows = locationSummary.map((item) => ({
                ...item,
                location_label: item.location_label || "Synthetic Point",
                phi_range: item.phi_range || "",
            }));
            rows.sort((a, b) => {
                let diff = 0;
                if (sortBy === "high") diff = b.high - a.high || b.total - a.total;
                else if (sortBy === "total") diff = b.total - a.total || b.high - a.high;
                else if (sortBy === "name") diff = a.location_name.localeCompare(b.location_name);
                return sortAsc ? -diff : diff;
            });
            return rows;
        }
        const map = new Map();

        for (const task of tasks) {
            const locId = task.location_id || "UNKNOWN";
            const locName = task.location_name || "Name unavailable";
            const locLabel = task.location_label || "Synthetic Point";
            const phiRange = task.phi_range || "";

            if (!map.has(locId)) {
                map.set(locId, {
                    location_id: locId,
                    location_name: locName,
                    location_label: locLabel,
                    phi_range: phiRange,
                    high: 0,
                    medium: 0,
                    low: 0,
                    review: 0,
                    total: 0,
                });
            }

            const item = map.get(locId);
            item.total += 1;
            if (task.priority_level === "High") {
                item.high += 1;
            } else if (task.priority_level === "Medium") {
                item.medium += 1;
            } else if (task.priority_level === "Low") {
                item.low += 1;
            } else {
                item.review += 1;
            }
        }

        const list = Array.from(map.values());

        // Sort locations
        list.sort((a, b) => {
            let diff = 0;
            if (sortBy === "high") {
                diff = b.high - a.high || b.total - a.total;
            } else if (sortBy === "total") {
                diff = b.total - a.total || b.high - a.high;
            } else if (sortBy === "name") {
                diff = a.location_name.localeCompare(b.location_name);
            }
            return sortAsc ? -diff : diff;
        });

        return list;
    }, [tasks, locationSummary, sortBy, sortAsc]);

    const handleSort = (field) => {
        if (sortBy === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortBy(field);
            setSortAsc(false);
        }
    };

    if (tasks.length === 0 && !locationSummary?.length) {
        return null;
    }

    const displayedLocations = isExpanded ? locationStats : locationStats.slice(0, 6);
    const activeLocObj = locationStats.find((l) => l.location_id === selectedLocation);

    return (
        <div className="bg-surface rounded-xl border border-borderLight shadow-xs overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-borderLight flex flex-wrap items-center justify-between gap-3 bg-background/50">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <MapPin size={17} />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-darkBase">
                            Priority Distribution by Location
                        </h4>
                        <p className="text-xs text-textMuted">
                            {totalLoadedTasks} tasks across {locationStats.length} surveillance areas
                        </p>
                    </div>
                </div>

                {/* Filter indicator & reset */}
                <div className="flex items-center gap-2">
                    {selectedLocation !== "all" && activeLocObj && (
                        <div className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-lg text-xs font-semibold">
                            <span>Filtering: {activeLocObj.location_name} ({activeLocObj.location_id})</span>
                            <button
                                type="button"
                                onClick={() => onSelectLocation("all")}
                                className="hover:bg-primary/20 rounded p-0.5 cursor-pointer"
                                title="Clear location filter"
                            >
                                <X size={13} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Compact Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-background border-b border-borderLight font-bold uppercase text-textMuted text-[11px]">
                        <tr>
                            <th className="p-3">
                                <button
                                    type="button"
                                    onClick={() => handleSort("name")}
                                    className="flex items-center gap-1 hover:text-darkBase cursor-pointer"
                                >
                                    Location
                                    <ArrowUpDown size={11} />
                                </button>
                            </th>
                            <th className="p-3 text-center">
                                <button
                                    type="button"
                                    onClick={() => handleSort("high")}
                                    className="flex items-center gap-1 hover:text-darkBase mx-auto text-riskHigh cursor-pointer"
                                >
                                    High
                                    <ArrowUpDown size={11} />
                                </button>
                            </th>
                            <th className="p-3 text-center text-riskMedium">Medium</th>
                            <th className="p-3 text-center text-riskCleared">Low</th>
                            <th className="p-3 text-center">Review</th>
                            <th className="p-3 text-center">
                                <button
                                    type="button"
                                    onClick={() => handleSort("total")}
                                    className="flex items-center gap-1 hover:text-darkBase mx-auto cursor-pointer"
                                >
                                    Total
                                    <ArrowUpDown size={11} />
                                </button>
                            </th>
                            <th className="p-3 hidden sm:table-cell">Priority Ratio</th>
                            <th className="p-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-borderLight">
                        {displayedLocations.map((loc) => {
                            const isSelected = selectedLocation === loc.location_id;
                            const highPct = loc.total ? (loc.high / loc.total) * 100 : 0;
                            const medPct = loc.total ? (loc.medium / loc.total) * 100 : 0;
                            const lowPct = loc.total ? (loc.low / loc.total) * 100 : 0;
                            const reviewPct = loc.total ? (loc.review / loc.total) * 100 : 0;

                            return (
                                <tr
                                    key={loc.location_id}
                                    onClick={() =>
                                        onSelectLocation(isSelected ? "all" : loc.location_id)
                                    }
                                    className={`cursor-pointer transition ${
                                        isSelected
                                            ? "bg-primary/5 font-semibold"
                                            : "hover:bg-background/80"
                                    }`}
                                >
                                    {/* Location Name & ID */}
                                    <td className="p-3 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <div>
                                                <span className="font-bold text-darkBase text-xs">
                                                    {loc.location_name}
                                                </span>{" "}
                                                <span className="text-textMuted font-mono text-[11px]">
                                                    ({loc.location_id})
                                                </span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* High Count */}
                                    <td className="p-3 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                                            loc.high > 0 ? "bg-red-100 text-riskHigh font-black" : "text-textMuted/50"
                                        }`}>
                                            {loc.high}
                                        </span>
                                    </td>

                                    {/* Medium Count */}
                                    <td className="p-3 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                                            loc.medium > 0 ? "bg-amber-100 text-riskMedium font-black" : "text-textMuted/50"
                                        }`}>
                                            {loc.medium}
                                        </span>
                                    </td>

                                    {/* Low Count */}
                                    <td className="p-3 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                                            loc.low > 0 ? "bg-emerald-100 text-riskCleared font-black" : "text-textMuted/50"
                                        }`}>
                                            {loc.low}
                                        </span>
                                    </td>

                                    <td className="p-3 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                                            loc.review > 0 ? "bg-borderLight text-textMuted font-black" : "text-textMuted/50"
                                        }`}>
                                            {loc.review}
                                        </span>
                                    </td>

                                    {/* Total Count */}
                                    <td className="p-3 text-center font-bold text-darkBase">
                                        {loc.total}
                                    </td>

                                    {/* Stacked bar */}
                                    <td className="p-3 hidden sm:table-cell min-w-[120px]">
                                        <div className="w-full bg-borderLight/60 rounded-full h-2 flex overflow-hidden">
                                            {highPct > 0 && (
                                                <div
                                                    style={{ width: `${highPct}%` }}
                                                    className="bg-riskHigh h-full"
                                                    title={`High: ${loc.high} (${highPct.toFixed(0)}%)`}
                                                />
                                            )}
                                            {medPct > 0 && (
                                                <div
                                                    style={{ width: `${medPct}%` }}
                                                    className="bg-riskMedium h-full"
                                                    title={`Medium: ${loc.medium} (${medPct.toFixed(0)}%)`}
                                                />
                                            )}
                                            {lowPct > 0 && (
                                                <div
                                                    style={{ width: `${lowPct}%` }}
                                                    className="bg-riskCleared h-full"
                                                    title={`Low: ${loc.low} (${lowPct.toFixed(0)}%)`}
                                                />
                                            )}
                                            {reviewPct > 0 && (
                                                <div
                                                    style={{ width: `${reviewPct}%` }}
                                                    className="bg-textMuted/40 h-full"
                                                    title={`Review: ${loc.review} (${reviewPct.toFixed(0)}%)`}
                                                />
                                            )}
                                        </div>
                                    </td>

                                    {/* Action button */}
                                    <td className="p-3 text-right whitespace-nowrap">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectLocation(isSelected ? "all" : loc.location_id);
                                            }}
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 ml-auto cursor-pointer ${
                                                isSelected
                                                    ? "bg-primary text-surface"
                                                    : "bg-background hover:bg-borderLight text-textMuted border border-borderLight"
                                            }`}
                                        >
                                            <Filter size={11} />
                                            {isSelected ? "Active" : "Filter"}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Toggle show all */}
            {locationStats.length > 6 && (
                <div className="p-2 border-t border-borderLight text-center bg-background/30">
                    <button
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-xs text-primary hover:text-secondary font-bold inline-flex items-center gap-1 py-1 px-3 rounded cursor-pointer"
                    >
                        {isExpanded ? (
                            <>
                                Show Top 6 Locations <ChevronUp size={14} />
                            </>
                        ) : (
                            <>
                                Show All {locationStats.length} Locations <ChevronDown size={14} />
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
