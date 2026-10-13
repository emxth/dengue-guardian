import React, { useState } from 'react';
import { ClipboardCheck, CheckCircle2, Send, RotateCcw } from 'lucide-react';

const InterventionForm = () => {
    const [status, setStatus] = useState('idle'); // idle, submitting, success

    const handleSubmit = (e) => {
        e.preventDefault();
        setStatus('submitting');
        // Simulate API call to your Node.js backend
        setTimeout(() => setStatus('success'), 800);
    };

    if (status === 'success') {
        return (
            <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm text-center">
                <div className="w-10 h-10 rounded-full bg-mintSurface text-riskCleared flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 size={20} />
                </div>
                <h3 className="text-base font-bold text-darkBase">Intervention Logged Successfully</h3>
                <p className="text-xs text-textMuted mt-1">Data synced to MongoDB for continuous ML model retraining.</p>
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

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold uppercase text-textMuted tracking-wider mb-1.5">Action Taken</label>
                    <select className="block w-full rounded-lg border border-borderLight bg-background px-3.5 py-2 text-sm font-semibold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition">
                        <option>Source Reduction (Breeding Site Cleanup)</option>
                        <option>Indoor ULV Fogging</option>
                        <option>Larviciding (Temephos)</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase text-textMuted tracking-wider mb-1.5">Post-Intervention Larval Count (Breteau Index)</label>
                    <input
                        type="number"
                        defaultValue="5"
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