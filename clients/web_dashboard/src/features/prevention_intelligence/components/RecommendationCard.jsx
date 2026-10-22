import React from 'react';
import { ShieldCheck, CheckCircle2, ChevronRight } from 'lucide-react';

const RecommendationCard = ({
    recommendation,
    loading = false,
    onSelectAlternative = null
}) => {
    if (loading) {
        return (
            <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm animate-pulse space-y-4">
                <div className="h-6 bg-background rounded w-1/3" />
                <div className="h-20 bg-background rounded" />
                <div className="h-12 bg-background rounded" />
            </div>
        );
    }

    if (!recommendation || !recommendation.top_recommendation) {
        return (
            <div className="bg-surface p-6 rounded-xl border border-borderLight text-center text-textMuted text-xs">
                No recommendation data available. Run model evaluation to generate.
            </div>
        );
    }

    const { top_recommendation, ranked_alternatives } = recommendation;

    return (
        <div className="space-y-5">
            {/* Top Recommendation Highlight Card */}
            <div className="bg-mintSurface border-l-4 border-primary p-5 rounded-xl shadow-sm flex flex-wrap justify-between items-start gap-4">
                <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="bg-surface text-primary border border-primary/20 px-3 py-0.5 rounded-full text-[11px] font-bold">
                            Primary AI Protocol Recommendation
                        </span>
                        <span className="bg-primary text-surface px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                            <CheckCircle2 size={12} /> {top_recommendation.predicted_effectiveness}% Predicted Effectiveness
                        </span>
                    </div>

                    <h3 className="text-xl font-extrabold text-darkBase tracking-tight">
                        {top_recommendation.tier_1_macro}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-textMuted pt-1">
                        <div>
                            <strong className="text-darkBase">Active Agent / Micro:</strong>{' '}
                            <span className="font-semibold text-primary">{top_recommendation.tier_2_micro}</span>
                        </div>
                        <div>
                            <strong className="text-darkBase">Deployment Method:</strong>{' '}
                            <span className="font-semibold text-darkBase">{top_recommendation.application_method}</span>
                        </div>
                    </div>
                </div>

                <div className="w-12 h-12 rounded-xl bg-surface text-primary flex items-center justify-center shrink-0 border border-secondary/30 shadow-sm">
                    <ShieldCheck size={24} />
                </div>
            </div>

            {/* Rationale Section */}
            {top_recommendation.rationale && (
                <div className="bg-surface p-4 rounded-xl border border-borderLight shadow-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-textMuted block mb-1.5">
                        Clinical & Epidemiological Rationale
                    </span>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium bg-background p-3 rounded-lg border border-borderLight">
                        "{top_recommendation.rationale}"
                    </p>
                </div>
            )}

            {/* Ranked Alternatives Section */}
            {ranked_alternatives && ranked_alternatives.length > 1 && (
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-textMuted">
                            Prevention Strategies
                        </span>
                    </div>

                    <div className="space-y-2">
                        {ranked_alternatives.map((alt, idx) => {
                            const isTop = idx === 0;
                            return (
                                <div
                                    key={idx}
                                    onClick={() => onSelectAlternative && onSelectAlternative(alt)}
                                    className={`flex items-center justify-between p-3 rounded-xl border text-xs transition ${isTop
                                        ? 'bg-mintSurface/60 border-primary/30 text-darkBase font-semibold'
                                        : 'bg-background hover:bg-slate-100 border-borderLight text-textMuted cursor-pointer'
                                        }`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${isTop ? 'bg-primary text-surface' : 'bg-surface border border-borderLight text-textMuted'
                                            }`}>
                                            #{idx + 1}
                                        </span>
                                        <div>
                                            <span className="font-bold text-darkBase">{alt.macro_strategy}</span>
                                            <span className="text-textMuted ml-1.5 text-[11px]">
                                                ({alt.micro_strategy})
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${isTop
                                            ? 'bg-primary text-surface'
                                            : 'bg-surface border border-borderLight text-darkBase'
                                            }`}>
                                            {alt.predicted_effectiveness}%
                                        </span>
                                        {onSelectAlternative && !isTop && (
                                            <ChevronRight size={14} className="text-textMuted" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecommendationCard;
