import React, { useState, useEffect } from 'react';
import { preventionApi } from '../../../shared/api/preventionApi';
import XAIExplanationChart from '../components/XAIExplanationChart';
import InterventionForm from '../components/InterventionForm';
import { ShieldCheck, Sparkles, Sliders, Play, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

const PreventionDashboard = () => {
    const [context, setContext] = useState({
        temperature: 29.5,
        rainfall: 85.0,
        cumulative_rainfall_14_days: 210.5,
        mosquito_density: 45.0,
        breeding_sites_count: 28,
        wind_speed: 10.0
    });

    const [recommendationData, setRecommendationData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchRecommendations = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await preventionApi.getRecommendations(context);
            setRecommendationData(data);
        } catch (err) {
            setError('Failed to connect to the AI Recommendation Engine.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecommendations();
    }, []);

    const handleInputChange = (e) => {
        setContext({
            ...context,
            [e.target.name]: parseFloat(e.target.value)
        });
    };

    return (
        <div className="space-y-6">
            {/* Top Banner (Component 1 Style) */}
            <div className="bg-mintSurface border-l-4 border-primary p-5 rounded-xl flex flex-wrap gap-4 justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-darkBase">
                        Prevention Intelligence & Vector Control
                    </h3>
                    <p className="text-sm text-textMuted mt-0.5">
                        Context-aware AI decision support, NDCU intervention protocols, and continual learning
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <span className="bg-surface text-riskCleared border border-riskCleared px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5">
                        <ShieldCheck size={14} /> AI Decision Engine Active
                    </span>
                    <button
                        onClick={fetchRecommendations}
                        disabled={loading}
                        className="bg-primary hover:bg-secondary text-surface px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh Recommendations
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* LEFT COLUMN: Inputs & Forms */}
                <div className="col-span-1 flex flex-col gap-6">
                    {/* Context Input Panel */}
                    <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <span className="text-xs font-bold uppercase text-textMuted tracking-wider">Field Parameters</span>
                                <h2 className="text-base font-bold text-darkBase">Environmental Context</h2>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-mintSurface flex items-center justify-center text-primary">
                                <Sliders size={18} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            {Object.keys(context).map((key) => (
                                <div key={key}>
                                    <label className="block text-xs font-bold uppercase text-textMuted tracking-wider mb-1.5 capitalize">
                                        {key.replace(/_/g, ' ')}
                                    </label>
                                    <input
                                        type="number"
                                        name={key}
                                        value={context[key]}
                                        onChange={handleInputChange}
                                        className="block w-full rounded-lg border border-borderLight bg-background px-3.5 py-2 text-sm font-semibold text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                                    />
                                </div>
                            ))}
                            <button
                                onClick={fetchRecommendations}
                                disabled={loading}
                                className="w-full bg-primary hover:bg-secondary text-surface py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-sm"
                            >
                                <Play size={14} />
                                {loading ? 'Evaluating Model...' : 'Run AI Engine'}
                            </button>
                        </div>
                    </div>

                    {/* PHI Intervention Form */}
                    <InterventionForm />
                </div>

                {/* RIGHT COLUMN: AI Outputs & Charts */}
                <div className="col-span-2 flex flex-col gap-6">
                    {/* AI Recommendation Output */}
                    <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <span className="text-xs font-bold uppercase text-textMuted tracking-wider">Decision Support</span>
                                <h2 className="text-base font-bold text-darkBase">AI Strategy Recommendation</h2>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-mintSurface flex items-center justify-center text-primary">
                                <Sparkles size={18} />
                            </div>
                        </div>

                        {loading && (
                            <div className="flex items-center gap-3 p-4 bg-background rounded-xl border border-borderLight">
                                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                <p className="text-sm font-semibold text-secondary">Analyzing entomological & environmental data...</p>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-3 p-4 bg-riskHigh/10 border border-riskHigh/30 text-riskHigh rounded-xl">
                                <AlertCircle size={18} />
                                <p className="text-sm font-semibold">{error}</p>
                            </div>
                        )}

                        {recommendationData && !loading && (
                            <div>
                                {/* Highlighted Recommendation Banner */}
                                <div className="bg-mintSurface border-l-4 border-primary p-5 rounded-xl mb-6 flex flex-wrap justify-between items-start gap-4">
                                    <div className="space-y-1.5 flex-1">
                                        <span className="bg-surface text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold inline-block mb-1">
                                            Top Recommended Protocol
                                        </span>
                                        <h3 className="text-lg font-bold text-darkBase">
                                            Tier 1 Strategy: <span className="text-primary">{recommendationData.top_recommendation.tier_1_macro}</span>
                                        </h3>
                                        <p className="text-sm text-textMuted">
                                            <strong className="text-darkBase">Tier 2 Micro:</strong> {recommendationData.top_recommendation.tier_2_micro}
                                        </p>
                                        <p className="text-sm text-textMuted">
                                            <strong className="text-darkBase">Application Method:</strong> {recommendationData.top_recommendation.application_method}
                                        </p>
                                        <div className="pt-2">
                                            <span className="bg-primary text-surface px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 shadow-sm">
                                                <CheckCircle2 size={14} /> Predicted Effectiveness: {recommendationData.top_recommendation.predicted_effectiveness}%
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-surface text-primary flex items-center justify-center shrink-0 border border-borderLight shadow-sm">
                                        <ShieldCheck size={20} />
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <span className="text-xs font-bold uppercase text-textMuted tracking-wider block mb-2">Rationale</span>
                                    <div className="p-4 bg-background rounded-xl border border-borderLight">
                                        <p className="text-sm text-textMuted italic leading-relaxed">
                                            {recommendationData.top_recommendation.rationale}
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <span className="text-xs font-bold uppercase text-textMuted tracking-wider block mb-2">Ranked Alternatives</span>
                                    <ul className="space-y-2.5">
                                        {recommendationData.ranked_alternatives.slice(1).map((alt, index) => (
                                            <li key={index} className="flex justify-between items-center text-sm p-3.5 bg-background rounded-xl border border-borderLight">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-6 h-6 rounded-full bg-surface border border-borderLight text-textMuted text-xs font-bold flex items-center justify-center">
                                                        {index + 2}
                                                    </span>
                                                    <span className="font-bold text-darkBase">
                                                        {alt.macro_strategy} <span className="font-normal text-textMuted">({alt.micro_strategy})</span>
                                                    </span>
                                                </div>
                                                <span className="font-bold text-xs bg-mintSurface text-primary border border-primary/20 px-2.5 py-1 rounded-full">
                                                    {alt.predicted_effectiveness}%
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* XAI Chart (Only shows when data is loaded) */}
                    {recommendationData && !loading && (
                        <XAIExplanationChart
                            featureImportance={recommendationData.feature_importance}
                            topRecommendation={recommendationData.top_recommendation}
                            context={context}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default PreventionDashboard;