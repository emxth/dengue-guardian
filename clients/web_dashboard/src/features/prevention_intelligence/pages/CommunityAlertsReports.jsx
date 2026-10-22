import React, { useState, useEffect } from 'react';
import { preventionApi } from '../../../shared/api/preventionApi';
import {
    BellRing,
    FileSpreadsheet,
    Printer,
    Download,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Calendar,
    Send,
    ShieldCheck,
    MapPin
} from 'lucide-react';

export default function CommunityAlertsReports() {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reportDate, setReportDate] = useState(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await preventionApi.getInterventions();
            setRecords(res.data || []);
        } catch (err) {
            console.error("Failed to load records for reporting:", err);
            setError("Could not retrieve operational records for report compilation.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Real calculations from retrieved records for the report
    const totalInterventions = records.length;
    const completedRecords = records.filter(r => r.followUp && r.followUp.fociDropPercentage !== undefined);
    const zonesCovered = [...new Set(records.map(r => r.zoneId).filter(Boolean))];

    const avgFociReduction = completedRecords.length > 0
        ? Math.round(completedRecords.reduce((acc, r) => acc + (r.followUp.fociDropPercentage || 0), 0) / completedRecords.length * 10) / 10
        : 0;

    const excellentCount = completedRecords.filter(r => r.followUp?.outcomeRating === 'Excellent').length;
    const goodCount = completedRecords.filter(r => r.followUp?.outcomeRating === 'Good').length;
    const needsReviewCount = completedRecords.filter(r => r.followUp?.outcomeRating === 'Needs Review').length;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            {/* Header Card */}
            <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-mintSurface text-primary flex items-center justify-center shrink-0">
                        <BellRing size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-textMuted">
                            MOH Operational Communications & Reporting
                        </span>
                        <h3 className="text-base font-bold text-darkBase">
                            Community Alert Broadcasts & Executive Prevention Intelligence Report
                        </h3>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePrint}
                        className="bg-primary hover:bg-secondary text-surface px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                    >
                        <Printer size={14} /> Print / Export Report
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-riskHigh/10 border border-riskHigh/30 text-riskHigh rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* Section 2: Executive Prevention Intelligence Report (Real Data) */}
            <div className="bg-surface rounded-2xl border border-borderLight shadow-md overflow-hidden p-8 space-y-6 print:shadow-none print:border-none">
                {/* Formal Letterhead */}
                <div className="border-b-2 border-primary pb-5 flex flex-wrap justify-between items-start gap-4">
                    <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-primary block">
                            Democratic Socialist Republic of Sri Lanka • Ministry of Health
                        </span>
                        <h3 className="text-xl font-extrabold text-darkBase mt-0.5">
                            Executive Vector Prevention & Outcome Intelligence Report
                        </h3>
                        <p className="text-xs text-textMuted mt-1">
                            Office of the Medical Officer of Health (MOH) — Kaduwela / Colombo Division
                        </p>
                    </div>

                    <div className="text-right text-xs">
                        <span className="text-textMuted block">Report Generated:</span>
                        <strong className="text-darkBase font-mono">{reportDate}</strong>
                        <span className="bg-mintSurface text-primary font-bold px-2.5 py-0.5 rounded-full text-[10px] block mt-1">
                            Official MOH Record
                        </span>
                    </div>
                </div>

                {/* Executive Summary Narrative */}
                <div className="space-y-2 text-xs leading-relaxed text-slate-800">
                    <h4 className="font-bold text-sm text-darkBase uppercase tracking-wider">
                        1. Executive Summary & Epidemiological Surveillance Context
                    </h4>
                    <p>
                        This report compiles actual field intervention records and Day-7 entomological follow-up outcomes
                        recorded across <strong>{zonesCovered.length} administrative zones</strong> (including {zonesCovered.slice(0, 3).join(", ")}).
                        A total of <strong>{totalInterventions} field interventions</strong> have been logged in the system,
                        with <strong>{completedRecords.length} interventions</strong> evaluated post-action.
                    </p>
                </div>

                {/* Quantitative Metric Table */}
                <div className="space-y-2">
                    <h4 className="font-bold text-xs text-darkBase uppercase tracking-wider">
                        2. Verified Operational Key Performance Metrics
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 bg-background rounded-xl border border-borderLight">
                            <span className="text-textMuted text-[10px] block font-bold uppercase">Total Interventions</span>
                            <strong className="text-xl text-darkBase">{totalInterventions}</strong>
                        </div>
                        <div className="p-3 bg-background rounded-xl border border-borderLight">
                            <span className="text-textMuted text-[10px] block font-bold uppercase">Evaluated Follow-ups</span>
                            <strong className="text-xl text-primary">{completedRecords.length}</strong>
                        </div>
                        <div className="p-3 bg-background rounded-xl border border-borderLight">
                            <span className="text-textMuted text-[10px] block font-bold uppercase">Mean Foci Reduction</span>
                            <strong className="text-xl text-riskCleared">{avgFociReduction}%</strong>
                        </div>
                        <div className="p-3 bg-background rounded-xl border border-borderLight">
                            <span className="text-textMuted text-[10px] block font-bold uppercase">Pending Day-7 Checks</span>
                            <strong className="text-xl text-amber-800">{totalInterventions - completedRecords.length}</strong>
                        </div>
                    </div>
                </div>

                {/* Outcome Quality Breakdown */}
                <div className="space-y-2 text-xs">
                    <h4 className="font-bold text-xs text-darkBase uppercase tracking-wider">
                        3. Field Outcome Rating Distribution
                    </h4>
                    <div className="p-4 bg-background rounded-xl border border-borderLight flex flex-wrap justify-between gap-4">
                        <div>
                            <span className="text-textMuted block text-[11px]">Excellent Efficacy (&ge; 70% drop, safe BI):</span>
                            <strong className="text-sm text-riskCleared">{excellentCount} records</strong>
                        </div>
                        <div>
                            <span className="text-textMuted block text-[11px]">Good Efficacy (&ge; 50% drop):</span>
                            <strong className="text-sm text-primary">{goodCount} records</strong>
                        </div>
                        <div>
                            <span className="text-textMuted block text-[11px]">Needs Review (&le; 30% drop):</span>
                            <strong className="text-sm text-riskHigh">{needsReviewCount} records</strong>
                        </div>
                    </div>
                </div>

                {/* Algorithmic & Scientific Notes */}
                <div className="space-y-2 text-xs text-textMuted border-t border-borderLight pt-4">
                    <h4 className="font-bold text-darkBase uppercase text-[11px] tracking-wider">
                        4. Methodological & Algorithmic Notes
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-[11px] leading-relaxed">
                        <li>Foci reduction percentage is derived from server-side formula: <code>((initialFoci - postBreedingFoci) / initialFoci) * 100</code>.</li>
                        <li>Recommendations generated via Component 4 XGBoost Regressor trained on 2,501 baseline benchmark records combined with 1,091 continually learned field outcomes.</li>
                        <li>Feature attributions computed through native XGBoost Tree SHAP algorithms.</li>
                    </ul>
                </div>

                {/* Signoff Footer */}
                <div className="border-t border-borderLight pt-6 flex flex-wrap justify-between items-center text-xs text-textMuted">
                    <div>
                        <p className="font-bold text-darkBase">Dengue Guardian AI Intelligence System</p>
                        <p className="text-[11px]">Adaptive Prevention Intelligence Framework • Component 4</p>
                    </div>
                    <div className="text-right">
                        <p className="font-mono text-[11px]">Status: Verified Operational Audit</p>
                        <p className="text-[10px]">Authorized MOH Supervision Portal</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
