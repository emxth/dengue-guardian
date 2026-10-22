import React, { useState, useEffect } from 'react';
import { preventionApi } from '../../../shared/api/preventionApi';
import RecommendationCard from '../components/RecommendationCard';
import XAIExplanationChart from '../components/XAIExplanationChart';
import { DEFAULT_CONTEXT } from '../components/ContextInputPanel';
import {
    MapPin,
    RefreshCw,
    AlertCircle,
    Calendar,
    Thermometer,
    CloudRain,
    Bug,
    ShieldCheck,
    CheckCircle2,
    Clock,
    UserCheck,
    Cpu,
    Compass,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';

// Component 3 Master Schema Mapping: All 30 Locations (LOC001 to LOC030)
const KNOWN_ZONES = [
    // Malabe Range (PHI01, PHI02, PHI03)
    { id: "LOC001", name: "LOC001 — Malabe East (Malabe Range)", phiId: "PHI03", range: "Malabe Range", mohArea: "Kaduwela", village: "Malabe East" },
    { id: "LOC002", name: "LOC002 — Malabe North (Malabe Range)", phiId: "PHI01", range: "Malabe Range", mohArea: "Kaduwela", village: "Malabe North" },
    { id: "LOC003", name: "LOC003 — Malabe West (Malabe Range)", phiId: "PHI03", range: "Malabe Range", mohArea: "Kaduwela", village: "Malabe West" },
    { id: "LOC004", name: "LOC004 — Thalangama North A (Malabe Range)", phiId: "PHI01", range: "Malabe Range", mohArea: "Kaduwela", village: "Thalangama North A" },
    { id: "LOC005", name: "LOC005 — Pothuarawa (Malabe Range)", phiId: "PHI01", range: "Malabe Range", mohArea: "Kaduwela", village: "Pothuarawa" },
    { id: "LOC006", name: "LOC006 — Hokandara North (Malabe Range)", phiId: "PHI02", range: "Malabe Range", mohArea: "Kaduwela", village: "Hokandara North" },
    { id: "LOC007", name: "LOC007 — Hokandara East (Malabe Range)", phiId: "PHI02", range: "Malabe Range", mohArea: "Kaduwela", village: "Hokandara East" },

    // Kaduwela Town Range (PHI04, PHI05)
    { id: "LOC008", name: "LOC008 — Kaduwela Town (Kaduwela Town Range)", phiId: "PHI04", range: "Kaduwela Town Range", mohArea: "Kaduwela", village: "Kaduwela Town" },
    { id: "LOC009", name: "LOC009 — Kothalawala (Kaduwela Town Range)", phiId: "PHI04", range: "Kaduwela Town Range", mohArea: "Kaduwela", village: "Kothalawala" },
    { id: "LOC010", name: "LOC010 — Welivita (Kaduwela Town Range)", phiId: "PHI04", range: "Kaduwela Town Range", mohArea: "Kaduwela", village: "Welivita" },
    { id: "LOC011", name: "LOC011 — Hewagama (Kaduwela Town Range)", phiId: "PHI05", range: "Kaduwela Town Range", mohArea: "Kaduwela", village: "Hewagama" },
    { id: "LOC012", name: "LOC012 — Ihala Bomiriya (Kaduwela Town Range)", phiId: "PHI05", range: "Kaduwela Town Range", mohArea: "Kaduwela", village: "Ihala Bomiriya" },
    { id: "LOC013", name: "LOC013 — Pahala Bomiriya A (Kaduwela Town Range)", phiId: "PHI05", range: "Kaduwela Town Range", mohArea: "Kaduwela", village: "Pahala Bomiriya A" },

    // Battaramulla Range (PHI06, PHI07)
    { id: "LOC014", name: "LOC014 — Battaramulla North (Battaramulla Range)", phiId: "PHI06", range: "Battaramulla Range", mohArea: "Kaduwela", village: "Battaramulla North" },
    { id: "LOC015", name: "LOC015 — Battaramulla South (Battaramulla Range)", phiId: "PHI06", range: "Battaramulla Range", mohArea: "Kaduwela", village: "Battaramulla South" },
    { id: "LOC016", name: "LOC016 — Sri Subhuthipura (Battaramulla Range)", phiId: "PHI06", range: "Battaramulla Range", mohArea: "Kaduwela", village: "Sri Subhuthipura" },
    { id: "LOC017", name: "LOC017 — Pahalawela (Battaramulla Range)", phiId: "PHI07", range: "Battaramulla Range", mohArea: "Kaduwela", village: "Pahalawela" },
    { id: "LOC018", name: "LOC018 — Udumulla (Battaramulla Range)", phiId: "PHI07", range: "Battaramulla Range", mohArea: "Kaduwela", village: "Udumulla" },
    { id: "LOC019", name: "LOC019 — Rajamalwatta (Battaramulla Range)", phiId: "PHI07", range: "Battaramulla Range", mohArea: "Kaduwela", village: "Rajamalwatta" },

    // Athurugiriya Range (PHI08, PHI09)
    { id: "LOC020", name: "LOC020 — Athurugiriya Town (Athurugiriya Range)", phiId: "PHI08", range: "Athurugiriya Range", mohArea: "Kaduwela", village: "Athurugiriya Town" },
    { id: "LOC021", name: "LOC021 — Athurugiriya South (Athurugiriya Range)", phiId: "PHI08", range: "Athurugiriya Range", mohArea: "Kaduwela", village: "Athurugiriya South" },
    { id: "LOC022", name: "LOC022 — Pore (Athurugiriya Range)", phiId: "PHI08", range: "Athurugiriya Range", mohArea: "Kaduwela", village: "Pore" },
    { id: "LOC023", name: "LOC023 — Korathota (Athurugiriya Range)", phiId: "PHI09", range: "Athurugiriya Range", mohArea: "Kaduwela", village: "Korathota" },
    { id: "LOC024", name: "LOC024 — Oruwala (Athurugiriya Range)", phiId: "PHI09", range: "Athurugiriya Range", mohArea: "Kaduwela", village: "Oruwala" },
    { id: "LOC025", name: "LOC025 — Shanthalokagama (Athurugiriya Range)", phiId: "PHI09", range: "Athurugiriya Range", mohArea: "Kaduwela", village: "Shanthalokagama" },

    // Nawagamuwa / Ranala Range (PHI10, PHI11, PHI12)
    { id: "LOC026", name: "LOC026 — Ranala (Nawagamuwa / Ranala Range)", phiId: "PHI10", range: "Nawagamuwa / Ranala Range", mohArea: "Kaduwela", village: "Ranala" },
    { id: "LOC027", name: "LOC027 — Welipillewa (Nawagamuwa / Ranala Range)", phiId: "PHI12", range: "Nawagamuwa / Ranala Range", mohArea: "Kaduwela", village: "Welipillewa" },
    { id: "LOC028", name: "LOC028 — Nawagamuwa (Nawagamuwa / Ranala Range)", phiId: "PHI10", range: "Nawagamuwa / Ranala Range", mohArea: "Kaduwela", village: "Nawagamuwa" },
    { id: "LOC029", name: "LOC029 — Dedigamuwa (Nawagamuwa / Ranala Range)", phiId: "PHI11", range: "Nawagamuwa / Ranala Range", mohArea: "Kaduwela", village: "Dedigamuwa" },
    { id: "LOC030", name: "LOC030 — Wellangiriya (Nawagamuwa / Ranala Range)", phiId: "PHI11", range: "Nawagamuwa / Ranala Range", mohArea: "Kaduwela", village: "Wellangiriya" },
];

export default function AreaPreventionOverview() {
    const [selectedZone, setSelectedZone] = useState("LOC004");
    const [zoneRecords, setZoneRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 10;

    const [areaRecommendation, setAreaRecommendation] = useState(null);
    const [loadingRec, setLoadingRec] = useState(false);

    const fetchZoneData = async (zoneId) => {
        setLoading(true);
        setError(null);
        try {
            // Fetch real intervention records filtered by zoneId
            const res = await preventionApi.getInterventions(zoneId);
            const list = res.data || [];
            setZoneRecords(list);

            // Derive current environmental context from the latest record of this zone
            const latestEnv = list[0]?.environmentalContext;
            if (latestEnv) {
                const evalContext = {
                    temperature: Number(latestEnv.temperature || DEFAULT_CONTEXT.temperature),
                    rainfall: Number(latestEnv.rainfall || DEFAULT_CONTEXT.rainfall),
                    cumulative_rainfall_14_days: Number(latestEnv.cumulativeRainfall14Days || DEFAULT_CONTEXT.cumulative_rainfall_14_days),
                    wind_speed: Number(latestEnv.windSpeed || DEFAULT_CONTEXT.wind_speed),
                    mosquito_density: Number(latestEnv.mosquitoDensity || DEFAULT_CONTEXT.mosquito_density),
                    breeding_sites_count: Math.round(Number(latestEnv.breedingSites || DEFAULT_CONTEXT.breeding_sites_count)),
                };

                // Generate AI recommendation for this area's specific context
                setLoadingRec(true);
                try {
                    const recData = await preventionApi.getRecommendations(evalContext);
                    setAreaRecommendation(recData);
                } catch (rErr) {
                    console.warn("Could not generate recommendation for area:", rErr.message);
                    setAreaRecommendation(null);
                } finally {
                    setLoadingRec(false);
                }
            } else {
                setAreaRecommendation(null);
                setLoadingRec(false);
            }

        } catch (err) {
            console.error("Error loading zone data:", err);
            setError(`Failed to retrieve records for zone ${zoneId} from backend.`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setCurrentPage(1);
        fetchZoneData(selectedZone);
    }, [selectedZone]);

    // Area-level calculations strictly from retrieved zone records (sorted latest first)
    const sortedRecords = [...zoneRecords].sort((a, b) => new Date(b.dateApplied || 0) - new Date(a.dateApplied || 0));
    const totalPages = Math.ceil(sortedRecords.length / PAGE_SIZE) || 1;
    const paginatedRecords = sortedRecords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const latestRecord = sortedRecords[0];
    const latestEnv = latestRecord?.environmentalContext;
    const completedRecords = sortedRecords.filter(r => r.followUp && r.followUp.fociDropPercentage !== undefined);

    const avgZoneDrop = completedRecords.length > 0
        ? Math.round(completedRecords.reduce((acc, r) => acc + (r.followUp.fociDropPercentage || 0), 0) / completedRecords.length * 10) / 10
        : 0;

    const avgZoneScore = completedRecords.length > 0
        ? Math.round(completedRecords.reduce((acc, r) => acc + (r.followUp?.score ?? r.effectivenessScore ?? 0), 0) / completedRecords.length * 10) / 10
        : (zoneRecords.length > 0
            ? Math.round(zoneRecords.reduce((acc, r) => acc + (r.effectivenessScore || 0), 0) / zoneRecords.length * 10) / 10
            : 0);

    const assignedPhis = [...new Set(zoneRecords.map(r => r.phiId).filter(Boolean))];
    const currentZoneInfo = KNOWN_ZONES.find(z => z.id === selectedZone);

    return (
        <div className="space-y-6">
            {/* Zone Selector & Area Header */}
            <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-mintSurface text-primary flex items-center justify-center shrink-0">
                        <MapPin size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-textMuted">
                            Selected MOH Administrative Division / Zone
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <select
                                value={selectedZone}
                                onChange={(e) => setSelectedZone(e.target.value)}
                                className="bg-background border border-borderLight rounded-lg px-3 py-1.5 text-sm font-bold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                {KNOWN_ZONES.map((z) => (
                                    <option key={z.id} value={z.id}>
                                        {z.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchZoneData(selectedZone)}
                        disabled={loading}
                        className="bg-primary hover:bg-secondary text-surface px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        Reload Area Data
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-riskHigh/10 border border-riskHigh/30 text-riskHigh rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* 4 Area-Specific Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <span className="text-[10px] font-bold uppercase text-textMuted block">Area Interventions</span>
                    <p className="text-2xl font-extrabold text-darkBase mt-1">
                        {loading ? "..." : zoneRecords.length}
                    </p>
                    <p className="text-xs text-textMuted mt-0.5">
                        {completedRecords.length} with recorded Day-7 follow-up
                    </p>
                </div>

                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <span className="text-[10px] font-bold uppercase text-textMuted block">Mean Foci Reduction</span>
                    <p className="text-2xl font-extrabold text-riskCleared mt-1">
                        {loading ? "..." : `${avgZoneDrop}%`}
                    </p>
                    <p className="text-xs text-textMuted mt-0.5">
                        Observed across historical actions
                    </p>
                </div>

                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <span className="text-[10px] font-bold uppercase text-textMuted block">Assigned PHI Officers</span>
                    <p className="text-2xl font-extrabold text-primary mt-1">
                        {loading ? "..." : (assignedPhis.length > 0 ? assignedPhis.length : 1)}
                    </p>
                    <p className="text-xs text-textMuted mt-0.5 truncate">
                        {assignedPhis.join(", ") || (currentZoneInfo ? `${currentZoneInfo.phiId} (Scheduled)` : "PHI01")}
                    </p>
                </div>

                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <span className="text-[10px] font-bold uppercase text-textMuted block">Area Efficacy Rating</span>
                    <p className="text-2xl font-extrabold text-darkBase mt-1">
                        {loading ? "..." : `${avgZoneScore}/100`}
                    </p>
                    <p className="text-xs font-semibold text-primary mt-0.5">
                        {completedRecords[0]?.followUp?.outcomeRating || "Active Surveillance"}
                    </p>
                </div>
            </div>

            {/* Upstream Components Multi-Source Context Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Component 1: Edge AI Environmental Readings */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-riskCleared" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-darkBase">
                                Edge AI Microclimate
                            </h4>
                        </div>
                        <span className="bg-mintSurface text-primary px-2 py-0.5 rounded text-[10px] font-bold">
                            {latestEnv ? "Live Telemetry Schema" : "No Telemetry"}
                        </span>
                    </div>

                    <p className="text-xs text-textMuted">
                        {latestEnv
                            ? `Localized environmental indicators recorded for ${selectedZone}:`
                            : `No environmental telemetry records logged yet for ${selectedZone}.`}
                    </p>

                    <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center p-2 bg-background rounded-lg border border-borderLight">
                            <span className="flex items-center gap-1.5 text-textMuted">
                                <Thermometer size={14} className="text-primary" /> Temperature
                            </span>
                            <span className="font-bold text-darkBase">
                                {latestEnv ? `${latestEnv.temperature}°C` : "No telemetry"}
                            </span>
                        </div>

                        <div className="flex justify-between items-center p-2 bg-background rounded-lg border border-borderLight">
                            <span className="flex items-center gap-1.5 text-textMuted">
                                <CloudRain size={14} className="text-secondary" /> 7-Day / 14-Day Rain
                            </span>
                            <span className="font-bold text-darkBase">
                                {latestEnv ? `${latestEnv.rainfall}mm / ${latestEnv.cumulativeRainfall14Days || 0}mm` : "No telemetry"}
                            </span>
                        </div>

                        <div className="flex justify-between items-center p-2 bg-background rounded-lg border border-borderLight">
                            <span className="flex items-center gap-1.5 text-textMuted">
                                <Compass size={14} className="text-accent" /> Wind Velocity
                            </span>
                            <span className="font-bold text-darkBase">
                                {latestEnv ? `${latestEnv.windSpeed} km/h` : "No telemetry"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Component 2 & Entomological Surveillance */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-riskMedium" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-darkBase">
                                Mosquito Risk
                            </h4>
                        </div>
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">
                            {latestEnv ? "Entomological" : "Awaiting Data"}
                        </span>
                    </div>

                    <p className="text-xs text-textMuted">
                        {latestEnv
                            ? `Active larval foci and Breteau density estimates for ${selectedZone}:`
                            : `No entomological surveillance logged yet for ${selectedZone}.`}
                    </p>

                    <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center p-2 bg-background rounded-lg border border-borderLight">
                            <span className="flex items-center gap-1.5 text-textMuted">
                                <Bug size={14} className="text-riskHigh" /> Adult Mosquito Density
                            </span>
                            <span className="font-bold text-darkBase">
                                {latestEnv ? `${latestEnv.mosquitoDensity} index` : "No telemetry"}
                            </span>
                        </div>

                        <div className="flex justify-between items-center p-2 bg-background rounded-lg border border-borderLight">
                            <span className="flex items-center gap-1.5 text-textMuted">
                                <Bug size={14} className="text-riskMedium" /> Active Breeding Sites
                            </span>
                            <span className="font-bold text-darkBase">
                                {latestEnv ? `${latestEnv.breedingSites} sites` : "No telemetry"}
                            </span>
                        </div>

                        <div className="flex justify-between items-center p-2 bg-background rounded-lg border border-borderLight">
                            <span className="flex items-center gap-1.5 text-textMuted">
                                <ShieldCheck size={14} className="text-riskCleared" /> Post-Action Larval Drop
                            </span>
                            <span className="font-bold text-riskCleared">
                                {completedRecords.length > 0
                                    ? `${completedRecords[0]?.followUp?.fociDropPercentage ?? 0}% reduction`
                                    : "No follow-up logged"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Component 3: PHI Field Planning Findings */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-primary" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-darkBase">
                                PHI Field Ops
                            </h4>
                        </div>
                        <span className="bg-mintSurface text-primary px-2 py-0.5 rounded text-[10px] font-bold">
                            Field Inspections
                        </span>
                    </div>

                    <p className="text-xs text-textMuted">
                        Recorded PHI officers & operational verification notes:
                    </p>

                    <div className="space-y-2 text-xs">
                        <div className="p-2.5 bg-background rounded-lg border border-borderLight">
                            <span className="text-[10px] uppercase font-bold text-textMuted block mb-0.5">
                                Assigned Inspection Personnel
                            </span>
                            <p className="font-semibold text-darkBase">
                                {assignedPhis.length > 0
                                    ? assignedPhis.join(" • ")
                                    : (currentZoneInfo ? `${currentZoneInfo.phiId} (${currentZoneInfo.range})` : "PHI01 (Malabe Range)")}
                            </p>
                            <span className="text-[10px] text-textMuted mt-0.5 block">
                                Village: {currentZoneInfo?.village || "Thalangama North A"} • MOH Area: {currentZoneInfo?.mohArea || "Kaduwela"}
                            </span>
                        </div>

                        <div className="p-2.5 bg-background rounded-lg border border-borderLight">
                            <span className="text-[10px] uppercase font-bold text-textMuted block mb-0.5">
                                Latest Field Note
                            </span>
                            <p className="text-xs text-slate-700 italic truncate">
                                "{latestRecord?.notes || "No notes filed by inspecting officer."}"
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Area AI Recommendation Evaluation */}
            <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <span className="text-xs font-bold uppercase text-textMuted tracking-wider">
                            Zone-Specific Decision Intelligence
                        </span>
                        <h3 className="text-base font-bold text-darkBase">
                            Active Prevention Recommendation for {selectedZone}
                        </h3>
                    </div>
                    <span className="bg-mintSurface text-primary px-3 py-1 rounded-full text-xs font-bold">
                        {latestEnv ? "Evaluated for current area context" : "Awaiting area telemetry"}
                    </span>
                </div>

                <RecommendationCard
                    recommendation={areaRecommendation}
                    loading={loadingRec}
                />
            </div>

            {/* Tree SHAP Interpretability for Area Context */}
            {areaRecommendation && !loadingRec && (
                <XAIExplanationChart
                    featureImportance={areaRecommendation.feature_importance}
                    topRecommendation={areaRecommendation.top_recommendation}
                    context={latestEnv || DEFAULT_CONTEXT}
                />
            )}

            {/* Historical Intervention Records for this Area */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-sm overflow-hidden">
                <div className="p-5 border-b border-borderLight flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h4 className="text-base font-bold text-darkBase">
                            Historical Intervention Timeline
                        </h4>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-textMuted bg-background px-2.5 py-1 rounded-lg border border-borderLight">
                            Zone: {selectedZone}
                        </span>
                        {totalPages > 1 && (
                            <span className="text-xs font-semibold text-primary bg-mintSurface px-2.5 py-1 rounded-lg border border-primary/20">
                                Page {currentPage} of {totalPages}
                            </span>
                        )}
                    </div>
                </div>

                {sortedRecords.length === 0 ? (
                    <div className="p-8 text-center text-xs text-textMuted">
                        No intervention records logged yet for {selectedZone}.
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead className="bg-background border-b border-borderLight text-textMuted uppercase font-bold">
                                    <tr>
                                        <th className="p-3.5">Date Applied</th>
                                        <th className="p-3.5">Officer ID</th>
                                        <th className="p-3.5">Protocol (Macro / Micro)</th>
                                        <th className="p-3.5">Initial Sites</th>
                                        <th className="p-3.5">Remaining Sites</th>
                                        <th className="p-3.5">Site Drop %</th>
                                        <th className="p-3.5">Outcome Rating</th>
                                        <th className="p-3.5">Score</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-borderLight">
                                    {paginatedRecords.map((r) => {
                                        const hasFollowUp = r.followUp && r.followUp.fociDropPercentage !== undefined;
                                        const rating = r.followUp?.outcomeRating;
                                        return (
                                            <tr key={r._id} className="hover:bg-background/60 transition">
                                                <td className="p-3.5 font-medium text-darkBase">
                                                    {r.dateApplied ? new Date(r.dateApplied).toLocaleDateString() : "N/A"}
                                                </td>
                                                <td className="p-3.5 font-bold text-primary">
                                                    {r.phiId}
                                                </td>
                                                <td className="p-3.5 font-semibold text-darkBase">
                                                    {r.tier1MacroStrategy}
                                                    <span className="text-textMuted font-normal block text-[11px]">
                                                        {r.tier2MicroStrategy}
                                                    </span>
                                                </td>
                                                <td className="p-3.5 font-mono">
                                                    {r.environmentalContext?.breedingSites ?? "N/A"}
                                                </td>
                                                <td className="p-3.5 font-mono">
                                                    {hasFollowUp ? r.followUp.postBreedingFoci : "Pending"}
                                                </td>
                                                <td className="p-3.5">
                                                    {hasFollowUp ? (
                                                        <span className={`font-bold ${r.followUp.fociDropPercentage >= 50 ? 'text-riskCleared' : 'text-riskHigh'}`}>
                                                            {r.followUp.fociDropPercentage}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-textMuted">--</span>
                                                    )}
                                                </td>
                                                <td className="p-3.5">
                                                    {hasFollowUp ? (
                                                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${rating === 'Excellent' ? 'bg-mintSurface text-riskCleared border border-riskCleared/30' :
                                                            rating === 'Good' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                                                                'bg-amber-100 text-amber-800 border border-amber-300'
                                                            }`}>
                                                            {rating}
                                                        </span>
                                                    ) : (
                                                        <span className="bg-background text-textMuted px-2 py-0.5 rounded text-[10px] font-semibold border border-borderLight">
                                                            Pending Follow-Up
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3.5 font-bold font-mono">
                                                    {hasFollowUp ? r.followUp.score : r.effectivenessScore || "N/A"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Bar */}
                        {totalPages > 1 && (
                            <div className="p-4 border-t border-borderLight bg-background flex flex-wrap items-center justify-between gap-3 text-xs">
                                <span className="text-textMuted">
                                    Showing <strong className="text-darkBase">{(currentPage - 1) * PAGE_SIZE + 1}</strong> to <strong className="text-darkBase">{Math.min(currentPage * PAGE_SIZE, sortedRecords.length)}</strong> of <strong className="text-darkBase">{sortedRecords.length}</strong> records
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1.5 rounded-lg border border-borderLight bg-surface hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-darkBase flex items-center gap-1 transition"
                                    >
                                        <ChevronLeft size={14} /> Previous
                                    </button>
                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                                            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                            .map((pageNum, idx, arr) => (
                                                <React.Fragment key={pageNum}>
                                                    {idx > 0 && pageNum - arr[idx - 1] > 1 && (
                                                        <span className="px-1 text-textMuted">...</span>
                                                    )}
                                                    <button
                                                        onClick={() => setCurrentPage(pageNum)}
                                                        className={`w-8 h-8 rounded-lg font-bold text-xs transition ${currentPage === pageNum
                                                            ? "bg-primary text-surface shadow-sm"
                                                            : "border border-borderLight bg-surface hover:bg-slate-100 text-textMuted"
                                                            }`}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                </React.Fragment>
                                            ))}
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1.5 rounded-lg border border-borderLight bg-surface hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-darkBase flex items-center gap-1 transition"
                                    >
                                        Next <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
