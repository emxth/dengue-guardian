import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Activity } from 'lucide-react';

const XAIExplanationChart = () => {
    // Simulated SHAP feature attribution data for the presentation
    const shapData = [
        { feature: 'Rainfall (85mm)', impact: 0.85 },
        { feature: 'Mosquito Density', impact: 0.65 },
        { feature: 'Breeding Sites', impact: 0.55 },
        { feature: 'Temperature', impact: 0.30 },
        { feature: 'Wind Speed', impact: -0.15 }, // Negative impact means it reduced the risk slightly
    ];

    return (
        <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <span className="text-xs font-bold uppercase text-textMuted tracking-wider">Model Interpretability</span>
                    <h3 className="text-base font-bold text-darkBase">Explainable AI (XAI) Feature Analysis</h3>
                </div>
                <div className="w-8 h-8 rounded-full bg-mintSurface flex items-center justify-center text-primary">
                    <Activity size={18} />
                </div>
            </div>

            <p className="text-xs text-textMuted mb-4">
                Visualizing the XGBoost model parameters. Positive values pushed the AI toward recommending <strong className="text-darkBase">Source Reduction</strong>.
            </p>

            <div className="flex items-center gap-4 mb-4 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-riskHigh">
                    <span className="w-2.5 h-2.5 rounded-full bg-riskHigh inline-block" /> Strongest Risk Drivers
                </span>
                <span className="flex items-center gap-1.5 text-riskCleared">
                    <span className="w-2.5 h-2.5 rounded-full bg-riskCleared inline-block" /> Mitigating Factors
                </span>
            </div>

            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={shapData} layout="vertical" margin={{ left: 40, right: 20 }}>
                        <XAxis type="number" hide />
                        <YAxis dataKey="feature" type="category" axisLine={false} tickLine={false} className="text-xs font-medium text-textMuted" />
                        <Tooltip cursor={{ fill: 'transparent' }} />
                        <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                            {shapData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.impact > 0 ? '#E11D48' : '#10B981'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default XAIExplanationChart;