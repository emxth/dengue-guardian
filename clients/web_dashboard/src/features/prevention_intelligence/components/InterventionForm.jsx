import React, { useState } from 'react';
import { ClipboardCheck, CheckCircle2, Send, RotateCcw, AlertCircle } from 'lucide-react';
import { preventionApi } from '../../../shared/api/preventionApi';

const ACTION_MAPPING = {
    'Source Reduction (Breeding Site Cleanup)': {
        macro: 'Source Reduction',
        micro: 'None'
    },
    'Indoor ULV Fogging': {
        macro: 'Adulticiding (Fogging)',
        micro: 'Deltamethrin'
    },
    'Larviciding (Temephos)': {
        macro: 'Larviciding',
        micro: 'Temephos (Abate)'
    }
};

const InterventionForm = () => {
    const [selectedAction, setSelectedAction] = useState('Source Reduction (Breeding Site Cleanup)');
    const [breteauIndex, setBreteauIndex] = useState('5');
    const [status, setStatus] = useState('idle'); // idle, submitting, success, error
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('submitting');
        setErrorMessage('');

        try {
            const mapping = ACTION_MAPPING[selectedAction] || {
                macro: 'Source Reduction',
                micro: 'None'
            };

            const biValue = parseFloat(breteauIndex) || 5.0;
            // Effectiveness calculation: lower post-intervention Breteau index -> higher efficacy score
            const calculatedEffectiveness = biValue <= 5 ? 92.0 : (biValue <= 15 ? 78.5 : 52.0);

            const payload = {
                zoneId: 'ZONE-COLOMBO-01',
                phiId: 'PHI-DASHBOARD-SIM',
                tier1MacroStrategy: mapping.macro,
                tier2MicroStrategy: mapping.micro,
                status: 'Completed',
                notes: `Dashboard simulation log with Post-Intervention Breteau Index: ${biValue}`,
                environmentalContext: {
                    temperature: 29.5,
                    rainfall: 85.0,
                    cumulativeRainfall14Days: 210.5,
                    windSpeed: 10.0,
                    mosquitoDensity: biValue * 1.5,
                    breedingSites: Math.round(biValue)
                },
                effectivenessScore: calculatedEffectiveness
            };

            await preventionApi.recordIntervention(payload);
            setStatus('success');
        } catch (err) {
            console.error('Failed to log intervention:', err);
            setErrorMessage(err.response?.data?.error || err.message || 'Failed to sync with backend');
            setStatus('error');
        }
    };

    if (status === 'success') {
        return (
            <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm text-center">
                <div className="w-10 h-10 rounded-full bg-mintSurface text-riskCleared flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 size={20} />
                </div>
                <h3 className="text-base font-bold text-darkBase">Intervention Logged Successfully</h3>
                <p className="text-xs text-textMuted mt-1">Data synced to MongoDB & continual learning pipeline.</p>
                <button
                    onClick={() => setStatus('idle')}
                    className="mt-4 bg-primary hover:bg-secondary text-surface px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition shadow-sm"
                >
                    <RotateCcw size={13} /> Log Another Action
                </button>
            </div>
        );
    }

    return (
        <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <span className="text-xs font-bold uppercase text-textMuted tracking-wider">Field Operations</span>
                    <h3 className="text-base font-bold text-darkBase">Simulate PHI Field Logging</h3>
                </div>
                <div className="w-8 h-8 rounded-full bg-mintSurface flex items-center justify-center text-primary">
                    <ClipboardCheck size={18} />
                </div>
            </div>

            {status === 'error' && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-riskHigh/10 border border-riskHigh/30 text-riskHigh rounded-xl text-xs font-semibold">
                    <AlertCircle size={16} />
                    <span>{errorMessage}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold uppercase text-textMuted tracking-wider mb-1.5">Action Taken</label>
                    <select
                        value={selectedAction}
                        onChange={(e) => setSelectedAction(e.target.value)}
                        className="block w-full rounded-lg border border-borderLight bg-background px-3.5 py-2 text-sm font-semibold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                    >
                        <option>Source Reduction (Breeding Site Cleanup)</option>
                        <option>Indoor ULV Fogging</option>
                        <option>Larviciding (Temephos)</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase text-textMuted tracking-wider mb-1.5">Post-Intervention Larval Count (Breteau Index)</label>
                    <input
                        type="number"
                        value={breteauIndex}
                        onChange={(e) => setBreteauIndex(e.target.value)}
                        min="0"
                        step="0.5"
                        required
                        className="block w-full rounded-lg border border-borderLight bg-background px-3.5 py-2 text-sm font-semibold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                    />
                </div>
                <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="w-full bg-primary hover:bg-secondary text-surface py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-sm"
                >
                    <Send size={14} className={status === 'submitting' ? 'animate-pulse' : ''} />
                    {status === 'submitting' ? 'Syncing to Database...' : 'Log Field Data'}
                </button>
            </form>
        </div>
    );
};

export default InterventionForm;