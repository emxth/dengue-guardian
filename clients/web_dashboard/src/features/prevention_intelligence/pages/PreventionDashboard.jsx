import React, { useState, useEffect } from 'react';
import { preventionApi } from '../../../shared/api/preventionApi';

const PreventionDashboard = () => {
    const [context, setContext] = useState({
        temperature: 29.5,
        rainfall: 85.0,
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
        <div className="p-6 max-w-6xl mx-auto bg-background min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-darkBase">Prevention Intelligence Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Context Input Panel */}
                <div className="bg-surface p-6 rounded-lg shadow-sm border border-borderLight col-span-1">
                    <h2 className="text-xl font-semibold mb-4 text-darkBase">Environmental Context</h2>
                    <div className="space-y-4">
                        {Object.keys(context).map((key) => (
                            <div key={key}>
                                <label className="block text-sm font-medium text-textMuted capitalize">
                                    {key.replace(/_/g, ' ')}
                                </label>
                                <input
                                    type="number"
                                    name={key}
                                    value={context[key]}
                                    onChange={handleInputChange}
                                    className="mt-1 block w-full rounded-md border-borderLight shadow-sm p-2 border focus:border-primary focus:ring-primary text-darkBase"
                                />
                            </div>
                        ))}
                        <button
                            onClick={fetchRecommendations}
                            className="w-full bg-primary text-white py-2 px-4 rounded hover:bg-secondary transition"
                        >
                            Run AI Engine
                        </button>
                    </div>
                </div>

                {/* AI Recommendation Output */}
                <div className="bg-surface p-6 rounded-lg shadow-sm border border-borderLight col-span-2">
                    <h2 className="text-xl font-semibold mb-4 text-darkBase">AI Strategy Recommendation</h2>

                    {loading && <p className="text-secondary font-medium">Analyzing entomological data...</p>}
                    {error && <p className="text-riskHigh font-medium">{error}</p>}

                    {recommendationData && !loading && (
                        <div>
                            <div className="bg-mintSurface border-l-4 border-riskCleared p-4 mb-6 rounded-r">
                                <h3 className="text-lg font-bold text-darkBase">
                                    Tier 1 Strategy: {recommendationData.top_recommendation.tier_1_macro}
                                </h3>
                                <p className="text-textMuted mt-1">
                                    <strong className="text-darkBase">Tier 2 Micro:</strong> {recommendationData.top_recommendation.tier_2_micro}
                                </p>
                                <p className="text-textMuted">
                                    <strong className="text-darkBase">Application Method:</strong> {recommendationData.top_recommendation.application_method}
                                </p>
                                <div className="mt-4 inline-block bg-primary text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                                    Predicted Effectiveness: {recommendationData.top_recommendation.predicted_effectiveness}%
                                </div>
                            </div>

                            <div>
                                <h4 className="font-semibold text-darkBase mb-2">Rationale</h4>
                                <p className="text-textMuted italic border-b border-borderLight pb-4">
                                    {recommendationData.top_recommendation.rationale}
                                </p>
                            </div>

                            <div className="mt-4">
                                <h4 className="font-semibold text-darkBase mb-2">Ranked Alternatives</h4>
                                <ul className="space-y-2">
                                    {recommendationData.ranked_alternatives.slice(1).map((alt, index) => (
                                        <li key={index} className="flex justify-between text-sm text-textMuted bg-background p-3 rounded border border-borderLight">
                                            <span>{alt.macro_strategy} ({alt.micro_strategy})</span>
                                            <span className="font-medium text-secondary">{alt.predicted_effectiveness}%</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PreventionDashboard;