import React from 'react';
import { Sliders, Play, RotateCcw, CloudRain, Wind, Thermometer, Bug, Compass } from 'lucide-react';

export const DEFAULT_CONTEXT = {
    temperature: 29.5,
    rainfall: 85.0,
    cumulative_rainfall_14_days: 120.0,
    wind_speed: 10.0,
    mosquito_density: 45.0,
    breeding_sites_count: 28,
};


const ContextInputPanel = ({
    context,
    onChange,
    onEvaluate,
    loading = false,
    title = "Environmental & Vector Parameters",
    subtitle = "Actual inputs fed into the XGBoost recommendation model"
}) => {
    const handleSlider = (key, val) => {
        onChange({
            ...context,
            [key]: parseFloat(val) || 0
        });
    };

    const handleReset = () => {
        onChange(DEFAULT_CONTEXT);
    };

    return (
        <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-bold text-darkBase">{title}</h3>
                </div>
                <div className="w-8 h-8 rounded-full bg-mintSurface text-primary flex items-center justify-center">
                    <Sliders size={16} />
                </div>
            </div>

            {subtitle && (
                <p className="text-xs text-textMuted leading-relaxed">
                    {subtitle}
                </p>
            )}


            {/* Sliders & Numeric Inputs */}
            <div className="space-y-3 pt-2 border-t border-borderLight">
                {/* Temperature */}
                <div>
                    <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span className="flex items-center gap-1.5 text-slate-700">
                            <Thermometer size={14} className="text-primary" /> Ambient Temp (°C)
                        </span>
                        <span className="font-mono text-darkBase bg-background px-2 py-0.5 rounded border border-borderLight">
                            {context.temperature}°C
                        </span>
                    </div>
                    <input
                        type="range"
                        min="15"
                        max="45"
                        step="0.5"
                        value={context.temperature}
                        onChange={(e) => handleSlider('temperature', e.target.value)}
                        className="w-full accent-primary cursor-pointer"
                    />
                </div>

                {/* 7-Day Rainfall */}
                <div>
                    <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span className="flex items-center gap-1.5 text-slate-700">
                            <CloudRain size={14} className="text-secondary" /> 7-Day Rainfall (mm)
                        </span>
                        <span className="font-mono text-darkBase bg-background px-2 py-0.5 rounded border border-borderLight">
                            {context.rainfall} mm
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="300"
                        step="5"
                        value={context.rainfall}
                        onChange={(e) => handleSlider('rainfall', e.target.value)}
                        className="w-full accent-secondary cursor-pointer"
                    />
                </div>

                {/* 14-Day Cumulative Rainfall */}
                <div>
                    <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span className="flex items-center gap-1.5 text-slate-700">
                            <Compass size={14} className="text-secondary" /> 14-Day Cumulative Rain (mm)
                        </span>
                        <span className="font-mono text-darkBase bg-background px-2 py-0.5 rounded border border-borderLight">
                            {context.cumulative_rainfall_14_days} mm
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="600"
                        step="10"
                        value={context.cumulative_rainfall_14_days}
                        onChange={(e) => handleSlider('cumulative_rainfall_14_days', e.target.value)}
                        className="w-full accent-secondary cursor-pointer"
                    />
                </div>

                {/* Wind Speed */}
                <div>
                    <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span className="flex items-center gap-1.5 text-slate-700">
                            <Wind size={14} className="text-accent" /> Wind Speed (km/h)
                        </span>
                        <span className="font-mono text-darkBase bg-background px-2 py-0.5 rounded border border-borderLight">
                            {context.wind_speed} km/h
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="50"
                        step="1"
                        value={context.wind_speed}
                        onChange={(e) => handleSlider('wind_speed', e.target.value)}
                        className="w-full accent-primary cursor-pointer"
                    />
                </div>

                {/* Adult Mosquito Density */}
                <div>
                    <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span className="flex items-center gap-1.5 text-slate-700">
                            <Bug size={14} className="text-riskHigh" /> Mosquito Density Index
                        </span>
                        <span className="font-mono text-darkBase bg-background px-2 py-0.5 rounded border border-borderLight">
                            {context.mosquito_density}
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="120"
                        step="1"
                        value={context.mosquito_density}
                        onChange={(e) => handleSlider('mosquito_density', e.target.value)}
                        className="w-full accent-riskHigh cursor-pointer"
                    />
                </div>

                {/* Active Breeding Sites Count */}
                <div>
                    <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span className="flex items-center gap-1.5 text-slate-700">
                            <Bug size={14} className="text-riskMedium" /> Breeding Sites Count
                        </span>
                        <span className="font-mono text-darkBase bg-background px-2 py-0.5 rounded border border-borderLight">
                            {context.breeding_sites_count} sites
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="80"
                        step="1"
                        value={context.breeding_sites_count}
                        onChange={(e) => handleSlider('breeding_sites_count', e.target.value)}
                        className="w-full accent-riskMedium cursor-pointer"
                    />
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
                <button
                    type="button"
                    onClick={onEvaluate}
                    disabled={loading}
                    className="flex-1 bg-primary hover:bg-secondary text-surface py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-sm"
                >
                    <Play size={14} className={loading ? "animate-spin" : ""} />
                    {loading ? "Simulating XGBoost..." : "Evaluate Recommendations"}
                </button>
                <button
                    type="button"
                    onClick={handleReset}
                    title="Reset to default context"
                    className="p-2.5 bg-background hover:bg-slate-200 border border-borderLight rounded-xl text-textMuted transition"
                >
                    <RotateCcw size={14} />
                </button>
            </div>
        </div>
    );
};

export default ContextInputPanel;
