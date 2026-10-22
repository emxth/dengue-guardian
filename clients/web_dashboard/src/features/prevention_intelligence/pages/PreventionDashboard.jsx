import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { preventionApi } from '../../../shared/api/preventionApi';
import {
    ShieldCheck,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Clock,
    MapPin,
    BarChart3,
    AlertTriangle,
    ArrowRight,
    TrendingUp,
    FileText,
    Activity
} from 'lucide-react';

export default function PreventionDashboard() {
    const navigate = useNavigate();

    // Live state
    const [records, setRecords] = useState([]);
    const [loadingRecords, setLoadingRecords] = useState(true);
    const [errorRecords, setErrorRecords] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const loadData = async () => {
        setLoadingRecords(true);
        setErrorRecords(null);

        // Fetch real interventions from MongoDB via Express backend
        try {
            const res = await preventionApi.getInterventions();
            const recList = res.data || [];
            setRecords(recList);
            setLastUpdated(new Date().toLocaleTimeString());
        } catch (err) {
            console.error("Interventions fetch failed:", err);
            setErrorRecords("Failed to connect to backend service.");
        } finally {
            setLoadingRecords(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // ─── Legitimate Calculations Based Exclusively on Actual Retrieved Records ──
    const totalInterventions = records.length;
    const completedWithFollowUp = records.filter(r => r.followUp && r.followUp.fociDropPercentage !== undefined);
    const pendingFollowUpCount = totalInterventions - completedWithFollowUp.length;
    const followUpRate = totalInterventions > 0
        ? Math.round((completedWithFollowUp.length / totalInterventions) * 100)
        : 0;

    // Unique accessible areas discovered from actual DB records
    const accessibleAreas = [...new Set(records.map(r => r.zoneId).filter(Boolean))];

    // Average effectiveness score from actual records
    const avgEffectivenessScore = completedWithFollowUp.length > 0
        ? Math.round(
            completedWithFollowUp.reduce((acc, r) => acc + (r.followUp?.score ?? r.effectivenessScore ?? 0), 0) /
            completedWithFollowUp.length * 10
        ) / 10
        : (records.length > 0
            ? Math.round(records.reduce((acc, r) => acc + (r.effectivenessScore || 0), 0) / records.length * 10) / 10
            : 0);

    // Average breeding foci drop percentage from actual records
    const avgFociDrop = completedWithFollowUp.length > 0
        ? Math.round(
            completedWithFollowUp.reduce((acc, r) => acc + (r.followUp?.fociDropPercentage || 0), 0) /
            completedWithFollowUp.length * 10
        ) / 10
        : 0;

    // Actual outcome rating counts
    const ratingBreakdown = completedWithFollowUp.reduce((acc, r) => {
        const rating = r.followUp?.outcomeRating || "Unrated";
        acc[rating] = (acc[rating] || 0) + 1;
        return acc;
    }, {});

    // Identify actual recurring problems from retrieved records
    // e.g. records with 'Needs Review' rating or 0% / low drop rate
    const problemRecords = completedWithFollowUp.filter(r =>
        r.followUp?.outcomeRating === "Needs Review" || (r.followUp?.fociDropPercentage !== undefined && r.followUp.fociDropPercentage <= 30)
    );

    // Data quality issues: records missing follow-up, or zero initial foci
    const dataQualityIssues = records.filter(r =>
        !r.followUp ||
        r.followUp.postBreedingFoci === undefined ||
        !r.environmentalContext ||
        r.environmentalContext.breedingSites === 0
    );

    return (
        <div className="space-y-6">
            {/* Status & Refresh Banner */}
            <div className="bg-mintSurface border-l-4 border-primary p-5 rounded-xl flex flex-wrap gap-4 justify-between items-center shadow-sm">
                <div>
                    <h3 className="text-lg font-bold text-darkBase">
                        MOH Prevention Intelligence Overview
                    </h3>
                </div>

                <div className="flex items-center gap-3">

                    <button
                        onClick={loadData}
                        disabled={loadingRecords}
                        className="bg-primary hover:bg-secondary text-surface px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                    >
                        <RefreshCw size={14} className={loadingRecords ? "animate-spin" : ""} />
                        Refresh Intelligence
                    </button>
                </div>
            </div>

            {/* Error States */}
            {errorRecords && (
                <div className="p-4 bg-riskHigh/10 border border-riskHigh/30 text-riskHigh rounded-xl text-xs flex items-center gap-3">
                    <AlertCircle size={18} className="shrink-0" />
                    <div>
                        <strong className="block font-bold">Backend Connection Issue:</strong>
                        <span>{errorRecords} Ensure the Node.js Express service is active on port 5000.</span>
                    </div>
                </div>
            )}

            {/* 4 Primary KPI Summary Cards (Computed Strictly From Actual Records) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* KPI 1: Accessible Areas */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold uppercase text-textMuted tracking-wider">
                            Active Prevention Zones
                        </span>
                        <div className="w-9 h-9 rounded-full bg-mintSurface text-primary flex items-center justify-center">
                            <MapPin size={18} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-darkBase">
                        {loadingRecords ? "..." : accessibleAreas.length}
                    </p>
                </div>

                {/* KPI 2: Total Recorded Interventions */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold uppercase text-textMuted tracking-wider">
                            Field Interventions Records
                        </span>
                        <div className="w-9 h-9 rounded-full bg-accent/40 text-primary flex items-center justify-center">
                            <FileText size={18} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-darkBase">
                        {loadingRecords ? "..." : totalInterventions}
                    </p>
                    <p className="text-xs font-semibold text-riskCleared mt-1">
                        {completedWithFollowUp.length} with verified Day-7 follow-up
                    </p>
                </div>

                {/* KPI 3: Average Foci Drop Percentage */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold uppercase text-textMuted tracking-wider">
                            Avg. Breeding Site Reduction
                        </span>
                        <div className="w-9 h-9 rounded-full bg-mintSurface text-riskCleared flex items-center justify-center">
                            <TrendingUp size={18} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-darkBase">
                        {loadingRecords ? "..." : `${avgFociDrop}%`}
                    </p>
                    <p className="text-xs text-textMuted mt-1">
                        Across {completedWithFollowUp.length} evaluated field actions
                    </p>
                </div>

                {/* KPI 4: Average Effectiveness Score */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold uppercase text-textMuted tracking-wider">
                            Average Effectiveness Score
                        </span>
                        <div className="w-9 h-9 rounded-full bg-accent/40 text-primary flex items-center justify-center">
                            <ShieldCheck size={18} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-darkBase">
                        {loadingRecords ? "..." : `${avgEffectivenessScore} / 100`}
                    </p>
                    <p className="text-xs text-textMuted mt-1">
                        Rating: {ratingBreakdown['Excellent'] || 0} Exc • {ratingBreakdown['Good'] || 0} Good
                    </p>
                </div>
            </div>

            {/* Unified Surveillance & Operational Governance Section */}
            <div className="bg-surface p-6 rounded-2xl border border-borderLight shadow-sm space-y-5">
                {/* Section Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-borderLight pb-4">
                    <div>
                        <h3 className="text-lg font-bold text-darkBase">
                            Intervention Audit
                        </h3>
                    </div>
                </div>

                {/* 2-Column Internal Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Surveillance Flagging (Recurring Problems) */}
                    <div className="p-5 rounded-xl bg-background border border-borderLight flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                                        <AlertTriangle size={16} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-darkBase">
                                            Intervention Alerts
                                        </h4>
                                    </div>
                                </div>
                                <span className={`text-xs font-bold font-mono px-2.5 py-0.5 rounded-full ${problemRecords.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-mintSurface text-riskCleared'
                                    }`}>
                                    {problemRecords.length} Flagged
                                </span>
                            </div>

                            {problemRecords.length === 0 ? (
                                <div className="p-6 text-center text-xs text-riskCleared font-semibold flex flex-col items-center justify-center my-4 bg-surface rounded-xl border border-borderLight">
                                    <CheckCircle2 size={22} className="mb-1.5 text-riskCleared" />
                                    All evaluated interventions achieved satisfactory breeding site reduction (&gt; 30%).
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {problemRecords.slice(0, 3).map((rec, i) => (
                                        <div key={i} className="p-3 bg-surface rounded-xl border border-borderLight text-xs flex justify-between items-center hover:border-primary/30 transition shadow-sm">
                                            <div>
                                                <div className="flex items-center gap-1.5 font-bold text-darkBase">
                                                    <span>{rec.zoneId}</span>
                                                    <span className="text-[11px] text-textMuted font-normal">• PHI: {rec.phiId}</span>
                                                </div>
                                                <p className="text-[11px] text-textMuted mt-0.5">
                                                    {rec.tier1MacroStrategy} ({rec.tier2MicroStrategy})
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-riskHigh font-bold font-mono text-xs block">
                                                    {rec.followUp?.fociDropPercentage}% drop
                                                </span>
                                                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold inline-block mt-0.5">
                                                    {rec.followUp?.outcomeRating || "Needs Review"}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {problemRecords.length > 0 && (
                            <div className="pt-3">
                                <button
                                    onClick={() => navigate('/dashboard/prevention/records')}
                                    className="w-full bg-surface hover:bg-slate-100 border border-borderLight text-darkBase py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                    <AlertTriangle size={14} className="text-amber-600" /> View All  <ArrowRight size={13} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right: Operational Governance & Audit Status */}
                    <div className="p-5 rounded-xl bg-background border border-borderLight flex flex-col justify-between">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-accent/30 text-primary flex items-center justify-center">
                                        <Clock size={16} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-darkBase">
                                            Follow-up & Verification
                                        </h4>
                                    </div>
                                </div>
                            </div>

                            <div className="p-3.5 bg-surface rounded-xl border border-borderLight flex items-center justify-between">
                                <div>
                                    <span className="text-[11px] font-bold text-textMuted uppercase tracking-wider block">
                                        Pending Day-7 Follow-ups
                                    </span>
                                    <p className="text-xs text-textMuted mt-0.5">
                                        {pendingFollowUpCount === 0
                                            ? "All field actions have completed Day-7 verification"
                                            : "Interventions requiring post-action inspection"}
                                    </p>
                                </div>
                                <span className={`text-2xl font-extrabold font-mono px-3 py-1 rounded-xl ${pendingFollowUpCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-mintSurface text-riskCleared'
                                    }`}>
                                    {pendingFollowUpCount}
                                </span>
                            </div>

                            <div className="p-3.5 bg-surface rounded-xl border border-borderLight space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-textMuted font-medium">Follow-up Verification Rate</span>
                                    <span className="font-bold text-darkBase font-mono">
                                        {followUpRate}% ({completedWithFollowUp.length} of {totalInterventions} records)
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-3">
                            <button
                                onClick={() => navigate('/dashboard/prevention/records')}
                                className="w-full bg-primary hover:bg-secondary text-surface py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                            >
                                <FileText size={14} /> Review Field Records <ArrowRight size={13} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}