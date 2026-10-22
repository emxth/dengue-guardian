import React, { useState, useEffect } from 'react';
import { preventionApi } from '../../../shared/api/preventionApi';
import ContextInputPanel, { DEFAULT_CONTEXT } from '../components/ContextInputPanel';
import RecommendationCard from '../components/RecommendationCard';
import XAIExplanationChart from '../components/XAIExplanationChart';

import { AlertCircle } from 'lucide-react';

export default function RecommendationValidation() {
    const [context, setContext] = useState(DEFAULT_CONTEXT);
    const [recommendation, setRecommendation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const evaluateRecommendation = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await preventionApi.getRecommendations(context);
            setRecommendation(data);
        } catch (err) {
            console.error("Validation recommendation evaluation failed:", err);
            setError("Failed to obtain recommendation from ML microservice. Ensure port 5000 and port 8000 are running.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        evaluateRecommendation();
    }, []);

    return (
        <div className="space-y-6">



            {error && (
                <div className="p-4 bg-riskHigh/10 border border-riskHigh/30 text-riskHigh rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* Main Interactive Grid: Context Sliders (Left) & Model Evaluation (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Context Configuration */}
                <div className="space-y-6">
                    <ContextInputPanel
                        context={context}
                        onChange={setContext}
                        onEvaluate={evaluateRecommendation}
                        loading={loading}
                        title="Surveillance Context"
                        subtitle="Adjust field indicators to simulate surveillance conditions and audit model behavior"
                    />


                </div>

                {/* Right 2 Columns: Recommendation Output & Interpretability */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Top Recommendation & Counterfactuals */}
                    <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <span className="text-xs font-bold uppercase text-textMuted tracking-wider">
                                    Simulated Model Inference
                                </span>
                                <h3 className="text-base font-bold text-darkBase">
                                    Recommended Protocol & Counterfactual Ranking
                                </h3>
                            </div>
                        </div>

                        <RecommendationCard
                            recommendation={recommendation}
                            loading={loading}
                        />
                    </div>

                    {/* Tree SHAP Feature Contribution Chart */}
                    {recommendation && !loading && (
                        <XAIExplanationChart
                            featureImportance={recommendation.feature_importance}
                            topRecommendation={recommendation.top_recommendation}
                            context={context}
                        />
                    )}


                </div>
            </div>
        </div>
    );
}
