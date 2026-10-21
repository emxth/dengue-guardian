import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Loader2 } from "lucide-react";
import {
    fetchMonthlyDengueAnalytics,
    fetchPlanningLocations,
} from "../api/planningApi";

const PANEL_CLASS = "rounded-xl border border-borderLight bg-surface shadow-sm";
const FIELD_CLASS =
    "rounded-lg border border-borderLight bg-background px-3 py-2 text-sm text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/40";

export default function MonthlyDengueTrends() {
    const [locations, setLocations] = useState([]);
    const [locationId, setLocationId] = useState("");
    const [year, setYear] = useState("");
    const [metric, setMetric] = useState("cases");
    const [loadingLocations, setLoadingLocations] = useState(true);
    const [locationError, setLocationError] = useState("");
    const [analyticsState, setAnalyticsState] = useState({ key: "", data: null });
    const [analyticsError, setAnalyticsError] = useState({ key: "", message: "" });

    useEffect(() => {
        let active = true;
        fetchPlanningLocations()
            .then((rows) => {
                if (!active) return;
                setLocations(rows);
                setLocationId((current) => current || rows[0]?.location_id || "");
            })
            .catch((requestError) => {
                if (active) setLocationError(requestError.message);
            })
            .finally(() => {
                if (active) setLoadingLocations(false);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!locationId) return undefined;
        let active = true;
        const key = `${locationId}:${year}:${metric}`;
        fetchMonthlyDengueAnalytics(locationId, year ? Number(year) : undefined, metric)
            .then((result) => {
                if (active) {
                    setAnalyticsState({ key, data: result });
                    setAnalyticsError({ key: "", message: "" });
                    if (!year && result.year) setYear(String(result.year));
                }
            })
            .catch((requestError) => {
                if (active) {
                    setAnalyticsError({ key, message: requestError.message });
                }
            });
        return () => {
            active = false;
        };
    }, [locationId, year, metric]);

    const selectedLocation = locations.find(
        (location) => location.location_id === locationId
    );
    const selectedKey = `${locationId}:${year}:${metric}`;
    const analytics = analyticsState.key === selectedKey ? analyticsState.data : null;
    const error = locationError || (analyticsError.key === selectedKey ? analyticsError.message : "");
    const loadingAnalytics = Boolean(locationId) && !analytics && !error;
    const months = analytics?.months ?? [];
    const completeValues = months
        .filter((month) => month.coverage_status === "complete")
        .map((month) => month.count ?? 0);
    const maxCount = Math.max(1, ...completeValues);
    const selectedMetric = metric === "cases" ? "Dengue Cases" : "Citizen Complaints";

    return (
        <section className={`${PANEL_CLASS} overflow-hidden`}>
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-borderLight px-5 py-4">
                <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <BarChart3 size={18} />
                    </span>
                    <div>
                        <h3 className="text-base font-bold text-darkBase">
                            Dengue Trends by Location
                        </h3>
                        <p className="mt-1 text-xs text-textMuted">
                            Monthly record counts from synthetic development data.
                        </p>
                    </div>
                </div>
                <span className="rounded-full border border-riskMedium px-3 py-1 text-xs font-bold text-riskMedium">
                    Synthetic data
                </span>
            </header>

            <div className="flex flex-wrap items-end gap-3 border-b border-borderLight bg-background/50 px-5 py-4">
                <div className="min-w-56 flex-1">
                    <label className="mb-1 block text-xs font-bold uppercase text-textMuted" htmlFor="trend-location">
                        Location
                    </label>
                    <select
                        id="trend-location"
                        value={locationId}
                        onChange={(event) => setLocationId(event.target.value)}
                        disabled={loadingLocations || locations.length === 0}
                        className={`${FIELD_CLASS} w-full disabled:opacity-60`}
                    >
                        {loadingLocations && <option value="">Loading locations...</option>}
                        {!loadingLocations && locations.length === 0 && <option value="">No locations available</option>}
                        {locations.map((location) => (
                            <option key={location.location_id} value={location.location_id}>
                                {location.village_area} ({location.location_id})
                            </option>
                        ))}
                    </select>
                </div>
                <div className="w-32">
                    <label className="mb-1 block text-xs font-bold uppercase text-textMuted" htmlFor="trend-year">
                        Year
                    </label>
                    <select
                        id="trend-year"
                        value={year || analytics?.year || ""}
                        onChange={(event) => setYear(event.target.value)}
                        disabled={!analytics?.available_years?.length}
                        className={`${FIELD_CLASS} w-full disabled:opacity-60`}
                    >
                        {analytics?.available_years?.map((availableYear) => (
                            <option key={availableYear} value={availableYear}>{availableYear}</option>
                        ))}
                    </select>
                </div>
                <div className="w-52">
                    <label className="mb-1 block text-xs font-bold uppercase text-textMuted" htmlFor="trend-metric">
                        Metric
                    </label>
                    <select
                        id="trend-metric"
                        value={metric}
                        onChange={(event) => setMetric(event.target.value)}
                        className={`${FIELD_CLASS} w-full`}
                    >
                        <option value="cases">Dengue Cases</option>
                        <option value="complaints">Citizen Complaints</option>
                    </select>
                </div>
                {loadingAnalytics && <Loader2 className="mb-2 animate-spin text-primary" size={18} aria-label="Loading monthly analytics" />}
            </div>

            {error && (
                <div className="m-5 flex items-start gap-2 rounded-lg border border-riskHigh bg-red-50 px-4 py-3 text-sm text-riskHigh" role="alert">
                    <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {!error && loadingAnalytics && !analytics && (
                <div className="px-5 py-16 text-center text-sm text-textMuted" role="status">
                    <Loader2 className="mx-auto mb-2 animate-spin text-primary" size={22} />
                    Loading monthly records...
                </div>
            )}

            {!error && !loadingLocations && locations.length === 0 && !loadingAnalytics && (
                <div className="px-5 py-12 text-center text-sm text-textMuted">
                    No locations are available for monthly analytics.
                </div>
            )}

            {!error && !loadingAnalytics && analytics && (
                <div className="space-y-4 p-5">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <p className="font-semibold text-darkBase">
                            {selectedLocation?.village_area ?? analytics.location_name} ({locationId})
                        </p>
                        <p className="text-textMuted">
                            {analytics.year} · {selectedMetric} · {analytics.coverage_start} to {analytics.coverage_end}
                        </p>
                    </div>

                    {months.every((month) => month.coverage_status === "unavailable") ? (
                        <div className="rounded-lg border border-borderLight bg-background px-4 py-10 text-center text-sm text-textMuted">
                            No source data is available for {analytics.year}.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="grid min-w-[720px] grid-cols-12 gap-2 border-b border-borderLight pb-3" role="img" aria-label={`${selectedMetric} by month for ${selectedLocation?.village_area ?? locationId}, ${analytics.year}`}>
                                {months.map((month) => {
                                    const complete = month.coverage_status === "complete";
                                    const value = month.count ?? 0;
                                    const height = complete && value > 0 ? Math.max(3, (value / maxCount) * 100) : 0;
                                    const change = month.month_over_month_change_pct;
                                    return (
                                        <div key={month.month} className="flex min-w-0 flex-col items-center">
                                            <span className="mb-2 h-5 text-xs font-semibold text-darkBase">
                                                {complete ? value.toLocaleString() : month.coverage_status === "partial" ? `${value}*` : "—"}
                                            </span>
                                            <div className="flex h-36 w-full items-end justify-center border-b border-borderLight">
                                                {complete ? (
                                                    <div
                                                        className={`w-3/5 max-w-10 rounded-t-sm ${value ? "bg-primary" : "bg-borderLight"}`}
                                                        style={{ height: `${height || 1}%` }}
                                                        title={`${month.label}: ${value} ${selectedMetric.toLowerCase()}`}
                                                    />
                                                ) : (
                                                    <div className="mb-1 h-1 w-3/5 border-t-2 border-dashed border-textMuted/50" title={`${month.label}: ${month.coverage_status} data`} />
                                                )}
                                            </div>
                                            <span className="mt-2 text-xs font-semibold text-textMuted">{month.label}</span>
                                            <span className="mt-1 h-4 text-[10px] text-textMuted">
                                                {change == null ? "" : `${change > 0 ? "+" : ""}${change}%`}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <p className="text-xs text-textMuted">
                        {analytics.note} Asterisk marks partial-month records. Month-over-month change is shown only for adjacent complete months with a non-zero prior count.
                    </p>
                </div>
            )}
        </section>
    );
}
