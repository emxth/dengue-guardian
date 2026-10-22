import React, { useState, useEffect, useMemo } from 'react';
import { preventionApi } from '../../../shared/api/preventionApi';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import {
    BarChart3,
    Filter,
    RefreshCw,
    AlertCircle,
    Info,
    TrendingUp,
    ShieldCheck,
    Layers,
    CheckCircle2
} from 'lucide-react';

const RATING_COLORS = {
    'Excellent': '#10B981', // Emerald
    'Good': '#3674B5',      // Cobalt
    'Moderate': '#F59E0B',  // Amber
    'Needs Review': '#E11D48', // Crimson
    'Unrated': '#94A3B8'
};

export default function InterventionEffectivenessAnalytics() {
    const [records, setRecords] = useState([]);
    const [serverSummary, setServerSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filters
    const [selectedZone, setSelectedZone] = useState('ALL');
    const [selectedStrategy, setSelectedStrategy] = useState('ALL');
    const [selectedRating, setSelectedRating] = useState('ALL');

    const fetchAllRecords = async () => {
        setLoading(true);
        setError(null);
        try {
            const [interventionsRes, summaryRes] = await Promise.allSettled([
                preventionApi.getInterventions(),
                preventionApi.getEffectivenessSummary()
            ]);
            if (interventionsRes.status === 'fulfilled') {
                setRecords(interventionsRes.value?.data || []);
            }
            if (summaryRes.status === 'fulfilled') {
                setServerSummary(summaryRes.value?.data || null);
            }
        } catch (err) {
            console.error("Failed to load records for analytics:", err);
            setError("Unable to retrieve records from backend API for effectiveness analysis.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllRecords();
    }, []);

    // Filter options extracted dynamically from actual records
    const zonesList = useMemo(() => ['ALL', ...new Set(records.map(r => r.zoneId).filter(Boolean))], [records]);
    const strategiesList = useMemo(() => ['ALL', ...new Set(records.map(r => r.tier1MacroStrategy).filter(Boolean))], [records]);
    const ratingsList = useMemo(() => ['ALL', 'Excellent', 'Good', 'Moderate', 'Needs Review', 'Pending'], []);

    // Filtered record set
    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            if (selectedZone !== 'ALL' && r.zoneId !== selectedZone) return false;
            if (selectedStrategy !== 'ALL' && r.tier1MacroStrategy !== selectedStrategy) return false;
            if (selectedRating !== 'ALL') {
                const rRating = r.followUp?.outcomeRating || (r.followUp ? 'Unrated' : 'Pending');
                if (rRating !== selectedRating) return false;
            }
            return true;
        });
    }, [records, selectedZone, selectedStrategy, selectedRating]);

    // Legitimate calculations on filtered actual records
    const evaluatedRecords = useMemo(() => {
        return filteredRecords.filter(r => r.followUp && r.followUp.fociDropPercentage !== undefined);
    }, [filteredRecords]);

    const isFiltered = selectedZone !== 'ALL' || selectedStrategy !== 'ALL' || selectedRating !== 'ALL';

    // Summary metrics: uses MongoDB server-side aggregation when unfiltered
    const totalCount = (!isFiltered && serverSummary) ? serverSummary.totalInterventions : filteredRecords.length;
    const evaluatedCount = (!isFiltered && serverSummary) ? serverSummary.totalFollowUps : evaluatedRecords.length;
    const pendingCount = totalCount - evaluatedCount;

    const avgDrop = (!isFiltered && serverSummary)
        ? serverSummary.avgFociDropPercentage
        : (evaluatedCount > 0
            ? Math.round(evaluatedRecords.reduce((acc, r) => acc + (r.followUp.fociDropPercentage || 0), 0) / evaluatedCount * 10) / 10
            : 0);

    const avgScore = (!isFiltered && serverSummary)
        ? (serverSummary.avgFollowUpScore || serverSummary.avgInitialScore)
        : (evaluatedCount > 0
            ? Math.round(evaluatedRecords.reduce((acc, r) => acc + (r.followUp?.score ?? r.effectivenessScore ?? 0), 0) / evaluatedCount * 10) / 10
            : 0);

    const successCount = evaluatedRecords.filter(r =>
        r.followUp?.outcomeRating === 'Excellent' || r.followUp?.outcomeRating === 'Good'
    ).length;
    const successRate = evaluatedCount > 0 ? Math.round((successCount / evaluatedCount) * 100) : 0;

    // ─── Chart Data 1: Before vs After Foci Comparison (Sample of recent records) ──
    const beforeAfterData = useMemo(() => {
        return evaluatedRecords.slice(0, 10).map((r, i) => {
            const initial = r.environmentalContext?.breedingSites ?? 0;
            const post = r.followUp?.postBreedingFoci ?? 0;
            const dateStr = r.dateApplied ? new Date(r.dateApplied).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) : `#${i + 1}`;
            return {
                id: `${dateStr} (${r.zoneId || 'Zone'})`,
                initialFoci: initial,
                postFoci: post,
                dropPct: r.followUp?.fociDropPercentage ?? 0
            };
        });
    }, [evaluatedRecords]);

    // ─── Chart Data 2: Performance by Strategy ─────────────────────────────────────
    const strategyComparisonData = useMemo(() => {
        if (!isFiltered && serverSummary?.strategyBreakdown?.length > 0) {
            return serverSummary.strategyBreakdown.map(s => ({
                strategy: s.strategy,
                avgDropPercentage: s.avgDrop != null ? s.avgDrop : 0,
                avgScore: s.avgScore || 0,
                sampleSize: s.count
            }));
        }

        const grouped = {};
        evaluatedRecords.forEach(r => {
            const strat = r.tier1MacroStrategy || 'Other';
            if (!grouped[strat]) {
                grouped[strat] = { strategy: strat, totalDrop: 0, totalScore: 0, count: 0 };
            }
            grouped[strat].totalDrop += (r.followUp?.fociDropPercentage || 0);
            grouped[strat].totalScore += (r.followUp?.score ?? r.effectivenessScore ?? 0);
            grouped[strat].count += 1;
        });

        return Object.values(grouped).map(g => ({
            strategy: g.strategy,
            avgDropPercentage: Math.round((g.totalDrop / g.count) * 10) / 10,
            avgScore: Math.round((g.totalScore / g.count) * 10) / 10,
            sampleSize: g.count
        }));
    }, [isFiltered, serverSummary, evaluatedRecords]);

    // ─── Chart Data 3: Outcome Rating Breakdown ───────────────────────────────────
    const ratingPieData = useMemo(() => {
        if (!isFiltered && serverSummary?.ratingBreakdown?.length > 0) {
            return serverSummary.ratingBreakdown.map(item => ({
                name: item._id,
                value: item.count,
                color: RATING_COLORS[item._id] || '#94A3B8'
            }));
        }

        const counts = {};
        evaluatedRecords.forEach(r => {
            const rating = r.followUp?.outcomeRating || 'Moderate';
            counts[rating] = (counts[rating] || 0) + 1;
        });

        return Object.keys(counts).map(k => ({
            name: k,
            value: counts[k],
            color: RATING_COLORS[k] || '#94A3B8'
        }));
    }, [isFiltered, serverSummary, evaluatedRecords]);

    return (
        <div className="space-y-6">
            {/* Top Filter Bar */}
            <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-textMuted flex items-center gap-1.5">
                            <Filter size={14} className="text-primary" /> Supported Operational Record Filters
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            !isFiltered && serverSummary
                                ? "bg-mintSurface text-primary border border-primary/20"
                                : "bg-background text-textMuted border border-borderLight"
                        }`}>
                            {!isFiltered && serverSummary ? "Source: Server-Side MongoDB Pipeline" : "Custom Filter Active"}
                        </span>
                    </div>
                    <button
                        onClick={fetchAllRecords}
                        disabled={loading}
                        className="text-xs text-primary hover:text-secondary font-bold flex items-center gap-1"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh Data
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                        <label className="block text-textMuted font-bold mb-1">MOH Zone / Location:</label>
                        <select
                            value={selectedZone}
                            onChange={(e) => setSelectedZone(e.target.value)}
                            className="w-full bg-background border border-borderLight rounded-lg px-3 py-1.5 font-bold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            {zonesList.map(z => (
                                <option key={z} value={z}>{z === 'ALL' ? 'All Operational Zones' : z}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-textMuted font-bold mb-1">Intervention Protocol:</label>
                        <select
                            value={selectedStrategy}
                            onChange={(e) => setSelectedStrategy(e.target.value)}
                            className="w-full bg-background border border-borderLight rounded-lg px-3 py-1.5 font-bold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            {strategiesList.map(s => (
                                <option key={s} value={s}>{s === 'ALL' ? 'All Intervention Types' : s}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-textMuted font-bold mb-1">Outcome Rating:</label>
                        <select
                            value={selectedRating}
                            onChange={(e) => setSelectedRating(e.target.value)}
                            className="w-full bg-background border border-borderLight rounded-lg px-3 py-1.5 font-bold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            {ratingsList.map(r => (
                                <option key={r} value={r}>{r === 'ALL' ? 'All Outcome Ratings' : r}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-riskHigh/10 border border-riskHigh/30 text-riskHigh rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* 4 Summary Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <span className="text-[10px] font-bold uppercase text-textMuted block">Sample Filtered Records</span>
                    <p className="text-2xl font-extrabold text-darkBase mt-1">
                        {loading ? "..." : totalCount}
                    </p>
                    <p className="text-xs text-textMuted mt-0.5">
                        {evaluatedCount} with follow-up outcome data
                    </p>
                </div>

                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <span className="text-[10px] font-bold uppercase text-textMuted block">Mean Breeding Site Reduction</span>
                    <p className="text-2xl font-extrabold text-riskCleared mt-1">
                        {loading ? "..." : `${avgDrop}%`}
                    </p>
                    <p className="text-xs text-textMuted mt-0.5">
                        Average breeding site reduction percentage
                    </p>
                </div>

                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <span className="text-[10px] font-bold uppercase text-textMuted block">Average Score</span>
                    <p className="text-2xl font-extrabold text-primary mt-1">
                        {loading ? "..." : `${avgScore} / 100`}
                    </p>
                    <p className="text-xs text-textMuted mt-0.5">
                        Derived from Day-7 field outcome assessment
                    </p>
                </div>

                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <span className="text-[10px] font-bold uppercase text-textMuted block">Favorable Outcome Rate</span>
                    <p className="text-2xl font-extrabold text-darkBase mt-1">
                        {loading ? "..." : `${successRate}%`}
                    </p>
                    <p className="text-xs font-semibold text-riskCleared mt-0.5">
                        {successCount} rated Excellent or Good
                    </p>
                </div>
            </div>

            {/* Public Health Observational & Causal Guard Note (MANDATORY per Prompt) */}
            <div className="p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs flex items-start gap-3">
                <Info size={18} className="text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <strong className="font-bold block">Public-Health Causal Attribution Guard:</strong>
                    <p className="text-textMuted leading-relaxed">
                        Before-and-after differences reflect observed changes between initial inspection and Day-7 follow-up in the field.
                        In accordance with epidemiological rigor, observed reductions must not be attributed solely as unconfounded causal proof of the intervention,
                        as environmental dynamics (rainfall evaporation, temperature shifts) or community behaviors may also influence vector abundance.
                    </p>
                </div>
            </div>

            {/* Insufficient / Sparse Data Indicator if filtered set is small */}
            {evaluatedCount < 5 && !loading && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-800 rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>
                        <strong>Sparse Sample Warning:</strong> Filter returned only {evaluatedCount} evaluated records.
                        Aggregated percentages should be interpreted cautiously due to limited sample size.
                    </span>
                </div>
            )}

            {/* Analytics Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1: Before vs After Comparison */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <span className="text-[10px] font-bold uppercase text-textMuted tracking-wider">
                                Longitudinal Field Delta
                            </span>
                            <h4 className="text-sm font-bold text-darkBase">
                                Before vs After Breeding Sites (Sample Interventions)
                            </h4>
                        </div>
                        <span className="text-xs text-textMuted font-mono">
                            Initial vs Post Day-7
                        </span>
                    </div>

                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={beforeAfterData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="id" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip
                                    formatter={(val, name) => [
                                        val,
                                        name === 'initialFoci' ? 'Initial Breeding Sites' : 'Remaining Sites (Day 7)'
                                    ]}
                                    contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #E2E8F0' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Bar dataKey="initialFoci" name="Initial Breeding Sites" fill="#E11D48" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="postFoci" name="Remaining Sites" fill="#10B981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Chart 2: Protocol Comparison */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <span className="text-[10px] font-bold uppercase text-textMuted tracking-wider">
                                Cross-Strategy Benchmarking
                            </span>
                            <h4 className="text-sm font-bold text-darkBase">
                                Mean Breeding Site Reduction by Strategy
                            </h4>
                        </div>
                        <span className="text-xs text-textMuted font-mono">
                            {strategyComparisonData.length} Protocols
                        </span>
                    </div>

                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={strategyComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="strategy" tick={{ fontSize: 11 }} />
                                <YAxis unit="%" tick={{ fontSize: 10 }} domain={[0, 100]} />
                                <Tooltip
                                    formatter={(val, name) => [`${val}%`, 'Mean Breeding Site Drop']}
                                    contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #E2E8F0' }}
                                />
                                <Bar dataKey="avgDropPercentage" fill="#3674B5" radius={[4, 4, 0, 0]}>
                                    {strategyComparisonData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.avgDropPercentage >= 60 ? '#10B981' : entry.avgDropPercentage >= 40 ? '#3674B5' : '#E11D48'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Outcome Rating Distribution Table & Summary */}
            <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                <h4 className="text-sm font-bold text-darkBase mb-3">
                    Distribution of Verified Outcomes in Active Operational Dataset
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {['Excellent', 'Good', 'Moderate', 'Needs Review'].map((rating) => {
                        const count = evaluatedRecords.filter(r => r.followUp?.outcomeRating === rating).length;
                        const pct = evaluatedCount > 0 ? Math.round((count / evaluatedCount) * 100) : 0;
                        return (
                            <div key={rating} className="p-3 bg-background rounded-xl border border-borderLight">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-darkBase">{rating}</span>
                                    <span
                                        className="w-2.5 h-2.5 rounded-full inline-block"
                                        style={{ backgroundColor: RATING_COLORS[rating] }}
                                    />
                                </div>
                                <p className="text-xl font-extrabold text-darkBase">{count}</p>
                                <p className="text-[11px] text-textMuted mt-0.5">{pct}% of evaluated records</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
