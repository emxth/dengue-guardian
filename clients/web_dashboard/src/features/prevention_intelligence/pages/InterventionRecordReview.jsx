import React, { useState, useEffect, useMemo } from 'react';
import { preventionApi } from '../../../shared/api/preventionApi';
import {
    Search,
    Filter,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Clock,
    FileText,
    ExternalLink,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    PlusCircle,
    X,
    Send
} from 'lucide-react';

export default function InterventionRecordReview() {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Search and filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedZone, setSelectedZone] = useState('ALL');
    const [selectedStrategy, setSelectedStrategy] = useState('ALL');
    const [selectedStatus, setSelectedStatus] = useState('ALL');

    // Pagination state (latest 10 records per page)
    const PAGE_SIZE = 10;
    const [currentPage, setCurrentPage] = useState(1);

    // Selected record for details modal
    const [activeRecord, setActiveRecord] = useState(null);

    // Follow-up entry modal state (uses real POST /api/interventions/:id/follow-up)
    const [followUpRecord, setFollowUpRecord] = useState(null);
    const [postBreedingFoci, setPostBreedingFoci] = useState('');
    const [submittingFollowUp, setSubmittingFollowUp] = useState(false);
    const [followUpSuccess, setFollowUpSuccess] = useState(null);

    const loadRecords = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await preventionApi.getInterventions();
            setRecords(res.data || []);
        } catch (err) {
            console.error("Failed to load intervention records:", err);
            setError("Could not retrieve intervention records from MongoDB database.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRecords();
    }, []);

    // Filter options from real records
    const zonesList = useMemo(() => ['ALL', ...new Set(records.map(r => r.zoneId).filter(Boolean))], [records]);
    const strategiesList = useMemo(() => ['ALL', ...new Set(records.map(r => r.tier1MacroStrategy).filter(Boolean))], [records]);

    // Filtered records
    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            if (selectedZone !== 'ALL' && r.zoneId !== selectedZone) return false;
            if (selectedStrategy !== 'ALL' && r.tier1MacroStrategy !== selectedStrategy) return false;
            if (selectedStatus === 'COMPLETED' && (!r.followUp || r.followUp.postBreedingFoci === undefined)) return false;
            if (selectedStatus === 'PENDING' && r.followUp && r.followUp.postBreedingFoci !== undefined) return false;

            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const matchId = (r._id || '').toLowerCase().includes(term);
                const matchZone = (r.zoneId || '').toLowerCase().includes(term);
                const matchPhi = (r.phiId || '').toLowerCase().includes(term);
                const matchMacro = (r.tier1MacroStrategy || '').toLowerCase().includes(term);
                const matchMicro = (r.tier2MicroStrategy || '').toLowerCase().includes(term);
                const matchNotes = (r.notes || '').toLowerCase().includes(term);
                return matchId || matchZone || matchPhi || matchMacro || matchMicro || matchNotes;
            }
            return true;
        });
    }, [records, selectedZone, selectedStrategy, selectedStatus, searchTerm]);

    // Reset pagination to page 1 whenever search or filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedZone, selectedStrategy, selectedStatus, searchTerm]);

    // Sort records latest first (by dateApplied descending)
    const sortedRecords = useMemo(() => {
        return [...filteredRecords].sort((a, b) => new Date(b.dateApplied || 0) - new Date(a.dateApplied || 0));
    }, [filteredRecords]);

    const totalPages = Math.ceil(sortedRecords.length / PAGE_SIZE) || 1;
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return sortedRecords.slice(start, start + PAGE_SIZE);
    }, [sortedRecords, currentPage]);

    const handleRecordFollowUpSubmit = async (e) => {
        e.preventDefault();
        if (!followUpRecord) return;
        setSubmittingFollowUp(true);
        setFollowUpSuccess(null);
        try {
            const payload = {
                postBreedingFoci: parseFloat(postBreedingFoci) || 0
            };
            const result = await preventionApi.recordFollowUp(followUpRecord._id, payload);
            setFollowUpSuccess(`Follow-up saved! Rating: ${result.data?.outcomeRating}, Drop: ${result.data?.fociDropPercentage}%`);
            // Reload records to reflect actual updated record
            await loadRecords();
            setTimeout(() => {
                setFollowUpRecord(null);
                setFollowUpSuccess(null);
            }, 1800);
        } catch (err) {
            console.error("Follow-up submission failed:", err);
            alert("Error saving follow-up: " + (err.response?.data?.error || err.message));
        } finally {
            setSubmittingFollowUp(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" />
                        <input
                            type="text"
                            placeholder="Search by Record ID, Zone, PHI Officer, Strategy, or Field Notes..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-background border border-borderLight rounded-xl pl-10 pr-4 py-2 text-xs font-semibold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadRecords}
                            disabled={loading}
                            className="bg-primary hover:bg-secondary text-surface px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                        >
                            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh Records
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1 border-t border-borderLight">
                    <div>
                        <label className="block text-textMuted font-bold mb-1">MOH Zone ID:</label>
                        <select
                            value={selectedZone}
                            onChange={(e) => setSelectedZone(e.target.value)}
                            className="w-full bg-background border border-borderLight rounded-lg px-3 py-1.5 font-bold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            {zonesList.map(z => (
                                <option key={z} value={z}>{z === 'ALL' ? 'All Zones' : z}</option>
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
                                <option key={s} value={s}>{s === 'ALL' ? 'All Protocols' : s}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-textMuted font-bold mb-1">Follow-Up Audit Status:</label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="w-full bg-background border border-borderLight rounded-lg px-3 py-1.5 font-bold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="ALL">All Records</option>
                            <option value="COMPLETED">Completed Day-7 Follow-up</option>
                            <option value="PENDING">Pending Follow-up Verification</option>
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

            {/* Results Count Banner */}
            <div className="flex justify-between items-center text-xs text-textMuted px-1">
                <span>
                    Showing <strong className="text-darkBase">{sortedRecords.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}</strong> to{' '}
                    <strong className="text-darkBase">{Math.min(currentPage * PAGE_SIZE, sortedRecords.length)}</strong> of{' '}
                    <strong className="text-darkBase">{sortedRecords.length}</strong> filtered records ({records.length} total in MongoDB)
                </span>
            </div>

            {/* Data Table */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-background border-b border-borderLight text-textMuted uppercase font-bold text-[11px]">
                            <tr>
                                <th className="p-3.5">Record ID </th>
                                <th className="p-3.5">Zone & Officer</th>
                                <th className="p-3.5">Protocol (Macro / Micro)</th>
                                <th className="p-3.5">Day-7 Follow-up</th>
                                <th className="p-3.5">Outcome Rating</th>
                                <th className="p-3.5 text-right">Audit Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-borderLight">
                            {sortedRecords.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="p-8 text-center text-textMuted">
                                        {loading ? "Loading operational records from backend..." : "No intervention records match your search filter."}
                                    </td>
                                </tr>
                            ) : (
                                paginatedRecords.map((r) => {
                                    const hasFollowUp = r.followUp && r.followUp.fociDropPercentage !== undefined;
                                    const rating = r.followUp?.outcomeRating;
                                    const postFoci = hasFollowUp ? r.followUp.postBreedingFoci : null;

                                    return (
                                        <tr key={r._id} className="hover:bg-background/60 transition group">
                                            {/* ID & Date */}
                                            <td className="p-3.5">
                                                <span className="font-mono text-[11px] font-bold text-primary block">
                                                    {r._id ? r._id.slice(-8) : "N/A"}
                                                </span>
                                            </td>

                                            {/* Zone & PHI */}
                                            <td className="p-3.5">
                                                <span className="font-bold text-darkBase block">
                                                    {r.zoneId || "LOC004"}
                                                </span>
                                                <span className="text-[11px] text-textMuted font-mono">
                                                    PHI: {r.phiId || "PHI01"}
                                                </span>
                                            </td>

                                            {/* Protocol */}
                                            <td className="p-3.5">
                                                <span className="font-bold text-darkBase block">
                                                    {r.tier1MacroStrategy}
                                                </span>
                                                <span className="text-[11px] text-textMuted">
                                                    {r.tier2MicroStrategy}
                                                </span>
                                            </td>

                                            {/* Follow Up */}
                                            <td className="p-3.5">
                                                {hasFollowUp ? (
                                                    <div className="font-mono text-[11px]">
                                                        <span>Remaining Sites: <strong className="text-darkBase">{postFoci}</strong></span>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full font-semibold">
                                                        <Clock size={11} /> Pending Day 7
                                                    </span>
                                                )}
                                            </td>

                                            {/* Rating */}
                                            <td className="p-3.5">
                                                {hasFollowUp ? (
                                                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${rating === 'Excellent' ? 'bg-mintSurface text-riskCleared border border-riskCleared/30' :
                                                        rating === 'Good' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                                                            'bg-amber-100 text-amber-800 border border-amber-300'
                                                        }`}>
                                                        {rating}
                                                    </span>
                                                ) : (
                                                    <span className="text-textMuted text-[11px]">--</span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="p-3.5 text-right space-x-1.5">
                                                {!hasFollowUp && (
                                                    <button
                                                        onClick={() => {
                                                            setFollowUpRecord(r);
                                                            setPostBreedingFoci('0');
                                                        }}
                                                        title="Log Day-7 Follow-up Assessment"
                                                        className="bg-primary hover:bg-secondary text-surface px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition"
                                                    >
                                                        <PlusCircle size={12} /> Log Follow-up
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setActiveRecord(r)}
                                                    className="bg-background hover:bg-slate-200 border border-borderLight text-textMuted hover:text-darkBase px-2.5 py-1 rounded-lg text-[11px] font-bold transition"
                                                >
                                                    Audit Details
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Bar */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-borderLight bg-background flex flex-wrap items-center justify-between gap-3 text-xs">
                        <span className="text-textMuted">
                            Showing <strong className="text-darkBase">{(currentPage - 1) * PAGE_SIZE + 1}</strong> to{' '}
                            <strong className="text-darkBase">{Math.min(currentPage * PAGE_SIZE, sortedRecords.length)}</strong> of{' '}
                            <strong className="text-darkBase">{sortedRecords.length}</strong> records (Page {currentPage} of {totalPages})
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
            </div>

            {/* Audit Details Modal */}
            {activeRecord && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-surface rounded-2xl max-w-xl w-full border border-borderLight shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-5 border-b border-borderLight flex items-center justify-between bg-mintSurface">
                            <div>
                                <span className="text-[10px] uppercase font-bold text-primary tracking-wider">
                                    Intervention Record Details
                                </span>
                                <h3 className="text-base font-bold text-darkBase">
                                    Record ID: {activeRecord._id}
                                </h3>
                            </div>
                            <button
                                onClick={() => setActiveRecord(null)}
                                className="w-8 h-8 rounded-full bg-surface text-textMuted hover:text-darkBase flex items-center justify-center border border-borderLight transition"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
                            <div className="grid grid-cols-2 gap-3 p-3 bg-background rounded-xl border border-borderLight">
                                <div>
                                    <span className="text-textMuted block text-[10px] uppercase font-bold">MOH Zone</span>
                                    <strong className="text-darkBase text-sm">{activeRecord.zoneId}</strong>
                                </div>
                                <div>
                                    <span className="text-textMuted block text-[10px] uppercase font-bold">Inspecting PHI</span>
                                    <strong className="text-primary text-sm">{activeRecord.phiId}</strong>
                                </div>
                                <div>
                                    <span className="text-textMuted block text-[10px] uppercase font-bold">Date Applied</span>
                                    <strong className="text-darkBase">{activeRecord.dateApplied ? new Date(activeRecord.dateApplied).toLocaleString() : "N/A"}</strong>
                                </div>
                                <div>
                                    <span className="text-textMuted block text-[10px] uppercase font-bold">Execution Status</span>
                                    <strong className="text-riskCleared">{activeRecord.status || "Completed"}</strong>
                                </div>
                            </div>

                            <div className="p-3 bg-background rounded-xl border border-borderLight space-y-1">
                                <span className="text-textMuted block text-[10px] uppercase font-bold">Protocol Details</span>
                                <p className="font-bold text-darkBase">
                                    {activeRecord.tier1MacroStrategy} — <span className="text-primary">{activeRecord.tier2MicroStrategy}</span>
                                </p>
                                <p className="text-textMuted text-[11px] pt-1">
                                    <strong>Field Notes:</strong> {activeRecord.notes || "None entered."}
                                </p>
                            </div>

                            <div className="p-3 bg-background rounded-xl border border-borderLight space-y-2">
                                <span className="text-textMuted block text-[10px] uppercase font-bold">Baseline Environmental Context</span>
                                <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                                    <div>Temp: <strong>{activeRecord.environmentalContext?.temperature}°C</strong></div>
                                    <div>Rain: <strong>{activeRecord.environmentalContext?.rainfall}mm</strong></div>
                                    <div>14d Rain: <strong>{activeRecord.environmentalContext?.cumulativeRainfall14Days}mm</strong></div>
                                    <div>Wind: <strong>{activeRecord.environmentalContext?.windSpeed} km/h</strong></div>
                                    <div>Density: <strong>{activeRecord.environmentalContext?.mosquitoDensity}</strong></div>
                                    <div>Breeding Sites: <strong>{activeRecord.environmentalContext?.breedingSites}</strong></div>
                                </div>
                            </div>

                            {activeRecord.followUp && (
                                <div className="p-3 bg-mintSurface/60 rounded-xl border border-primary/20 space-y-2">
                                    <span className="text-primary block text-[10px] uppercase font-bold">Day-7 Follow-up Assessment</span>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>Remaining Sites: <strong>{activeRecord.followUp.postBreedingFoci}</strong></div>
                                        <div>Breeding Site Reduction: <strong className="text-riskCleared">{activeRecord.followUp.fociDropPercentage}%</strong></div>
                                        <div>Rating: <strong className="text-primary">{activeRecord.followUp.outcomeRating} ({activeRecord.followUp.score})</strong></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-borderLight bg-background flex justify-end">
                            <button
                                onClick={() => setActiveRecord(null)}
                                className="bg-primary text-surface px-4 py-2 rounded-xl text-xs font-bold hover:opacity-90 transition"
                            >
                                Close Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Log Day-7 Follow-up Modal */}
            {followUpRecord && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-surface rounded-2xl max-w-md w-full border border-borderLight shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-5 border-b border-borderLight flex items-center justify-between bg-mintSurface">
                            <div>
                                <span className="text-[10px] uppercase font-bold text-primary tracking-wider">
                                    Server-Side Outcome Evaluator
                                </span>
                                <h3 className="text-base font-bold text-darkBase">
                                    Log Day-7 Follow-up Assessment
                                </h3>
                            </div>
                            <button
                                onClick={() => setFollowUpRecord(null)}
                                className="w-8 h-8 rounded-full bg-surface text-textMuted hover:text-darkBase flex items-center justify-center border border-borderLight transition"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleRecordFollowUpSubmit} className="p-6 space-y-4 text-xs">
                            <div className="p-3 bg-background rounded-xl border border-borderLight space-y-1">
                                <span className="text-textMuted block text-[10px] uppercase font-bold">Target Intervention</span>
                                <p className="font-bold text-darkBase">
                                    {followUpRecord.tier1MacroStrategy} ({followUpRecord.zoneId})
                                </p>
                                <p className="text-textMuted text-[11px]">
                                    Initial Breeding Sites: <strong>{followUpRecord.environmentalContext?.breedingSites ?? 15}</strong>
                                </p>
                            </div>

                            {followUpSuccess && (
                                <div className="p-3 bg-mintSurface text-riskCleared border border-riskCleared/30 rounded-xl font-bold flex items-center gap-2">
                                    <CheckCircle2 size={16} />
                                    <span>{followUpSuccess}</span>
                                </div>
                            )}

                            <div>
                                <label className="block text-textMuted font-bold uppercase tracking-wider mb-1">
                                    Post-Intervention Remaining Breeding Sites:
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    required
                                    value={postBreedingFoci}
                                    onChange={(e) => setPostBreedingFoci(e.target.value)}
                                    className="w-full bg-background border border-borderLight rounded-xl px-3 py-2 font-bold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>

                            <p className="text-[11px] text-textMuted italic">
                                Note: Submitting calculates breeding site reduction % and outcome rating via the backend formula:
                                <br />
                                <code>((initialFoci - postBreedingFoci) / initialFoci) * 100</code>
                            </p>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setFollowUpRecord(null)}
                                    className="px-4 py-2 rounded-xl text-textMuted hover:bg-slate-100 font-bold"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingFollowUp}
                                    className="bg-primary hover:bg-secondary text-surface px-5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition shadow-sm"
                                >
                                    <Send size={13} className={submittingFollowUp ? "animate-pulse" : ""} />
                                    {submittingFollowUp ? "Calculating..." : "Save & Calculate Outcome"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
