import React, { useState, useEffect } from "react";
import { Cpu, Wifi, Thermometer, Activity, Navigation, Database, RefreshCw, Clock, Zap } from "lucide-react";

export default function EdgeTelemetryDashboard() {
    const [telemetry, setTelemetry] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Mock API call - replace this with your actual edge API fetch
    const fetchEdgeData = async () => {
        setIsRefreshing(true);
        try {
            // e.g., const response = await fetch("http://<PI_IP>:8000/api/admin/telemetry");
            // const data = await response.json();
            
            // Simulating the expected JSON payload from your updated FastAPI backend
            const mockBackendData = {
                connection: { status: "Online", ping_ms: 45 },
                hardware: { cpu_temp: 46.2, ram_percent: 42 },
                sensors: { temp: 31.5, hum: 82.7, lat: 6.8312, lng: 79.8701 },
                profiling: { 
                    latest_inference_ms: 1621, 
                    inference_type: "Fresh", // "Fresh" or "Cached"
                    weather_execution_ms: 7.0,
                    total_cycle_ms: 4307 
                }
            };
            
            setTelemetry(mockBackendData);
        } catch (error) {
            console.error("Failed to fetch edge telemetry:", error);
        } finally {
            setTimeout(() => setIsRefreshing(false), 500); // Visual delay for the refresh button
        }
    };

    useEffect(() => {
        fetchEdgeData();
        const interval = setInterval(fetchEdgeData, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, []);

    // Safe fallbacks while loading
    const data = telemetry || {
        connection: { status: "Connecting...", ping_ms: 0 },
        hardware: { cpu_temp: 0, ram_percent: 0 },
        sensors: { temp: 0, hum: 0, lat: 0, lng: 0 },
        profiling: { latest_inference_ms: 0, inference_type: "Pending", weather_execution_ms: 0, total_cycle_ms: 0 }
    };

    return (
        <div className="space-y-6">
            {/* Highlighted AI Insight Banner */}
            <div className="bg-mintSurface border-l-4 border-primary p-5 rounded-xl flex flex-wrap gap-4 justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-darkBase">
                        Component 1: Edge AI & Raspberry Pi Telemetry
                    </h3>
                    <p className="text-sm text-textMuted mt-0.5">
                        Live Raspberry Pi 4 health, sensor diagnostics, and YOLO ONNX model accuracy
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <span className={`border px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${data.connection.status === "Online" ? "bg-surface text-riskCleared border-riskCleared" : "bg-rose-50 text-riskHigh border-rose-200"}`}>
                        <Wifi size={14} /> Pi Node {data.connection.status}
                    </span>
                    <button 
                        onClick={fetchEdgeData}
                        className={`bg-primary hover:bg-secondary text-surface px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${isRefreshing ? 'opacity-75 cursor-wait' : ''}`}
                    >
                        <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} /> 
                        {isRefreshing ? "Syncing..." : "Refresh Telemetry"}
                    </button>
                </div>
            </div>

            {/* 4 Core KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Card 1: Pi Connection */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase text-textMuted">
                            Pi Connection
                        </span>
                        <div className="w-9 h-9 rounded-full bg-mintSurface text-primary flex items-center justify-center">
                            <Wifi size={18} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-darkBase">{data.connection.status}</p>
                    <p className="text-xs font-semibold text-riskCleared mt-1">
                        Heartbeat: {data.connection.ping_ms}ms • Active
                    </p>
                </div>

                {/* Card 2: Pi Health (Updated with sleek badges) */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold uppercase text-textMuted">
                                Raspberry Pi Health
                            </span>
                            <div className="w-9 h-9 rounded-full bg-accent/40 text-primary flex items-center justify-center">
                                <Cpu size={18} />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <p className="text-2xl font-extrabold text-darkBase">{data.hardware.cpu_temp.toFixed(1)}°C</p>
                            <p className="text-xl font-bold text-slate-300">/</p>
                            <p className="text-2xl font-extrabold text-darkBase">{data.hardware.ram_percent}%</p>
                        </div>
                    </div>
                    
                    {/* Modern Badges for CPU and RAM */}
                    <div className="flex items-center gap-2 mt-3">
                        <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase">
                            CPU Temp
                        </span>
                        <span className="bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase">
                            RAM
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold ml-auto border-b border-dashed border-slate-300">
                            Pi 4B
                        </span>
                    </div>
                </div>

                {/* Card 3: Sensor Status */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold uppercase text-textMuted">
                                Sensor Status
                            </span>
                            <div className="w-9 h-9 rounded-full bg-mintSurface text-primary flex items-center justify-center">
                                <Thermometer size={18} />
                            </div>
                        </div>
                        <p className="text-2xl font-extrabold text-darkBase">{data.sensors.temp.toFixed(1)}°C • {data.sensors.hum.toFixed(0)}%</p>
                    </div>
                    <p className="text-xs font-semibold text-riskCleared mt-3">
                        DHT22 & U-blox7 GPS Locked
                    </p>
                </div>

                {/* Card 4: AI Model Accuracy (Static) */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold uppercase text-textMuted">
                                Vision Accuracy
                            </span>
                            <div className="w-9 h-9 rounded-full bg-accent/40 text-primary flex items-center justify-center">
                                <Activity size={18} />
                            </div>
                        </div>
                        <p className="text-2xl font-extrabold text-darkBase">91.9% mAP</p>
                    </div>
                    <p className="text-xs font-semibold text-secondary mt-3">
                        YOLOv8s ONNX Format
                    </p>
                </div>
            </div>

            {/* Detailed Diagnostics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Hardware & Peripheral Diagnostics */}
                <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm">
                    <h4 className="text-base font-bold text-darkBase mb-4">
                        Edge Sensor & Storage Diagnostics
                    </h4>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-borderLight">
                            <div className="flex items-center gap-3">
                                <Thermometer size={18} className="text-primary" />
                                <div>
                                    <p className="text-sm font-bold text-darkBase">DHT22 Microclimate Sensor</p>
                                    <p className="text-xs text-textMuted">GPIO Telemetry Stream</p>
                                </div>
                            </div>
                            <span className="bg-mintSurface text-riskCleared px-2.5 py-1 rounded-full text-xs font-bold">
                                Active ({data.sensors.temp.toFixed(1)}°C / {data.sensors.hum.toFixed(1)}% RH)
                            </span>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-borderLight">
                            <div className="flex items-center gap-3">
                                <Navigation size={18} className="text-primary" />
                                <div>
                                    <p className="text-sm font-bold text-darkBase">U-blox7 GPS/GLONASS USB</p>
                                    <p className="text-xs text-textMuted">NMEA Sentence Stream</p>
                                </div>
                            </div>
                            <span className="bg-mintSurface text-riskCleared px-2.5 py-1 rounded-full text-xs font-bold">
                                {data.sensors.lat.toFixed(4)}° N, {data.sensors.lng.toFixed(4)}° E
                            </span>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-borderLight">
                            <div className="flex items-center gap-3">
                                <Database size={18} className="text-primary" />
                                <div>
                                    <p className="text-sm font-bold text-darkBase">Local SQLite Edge Buffer</p>
                                    <p className="text-xs text-textMuted">Write-Ahead Logging (WAL Mode)</p>
                                </div>
                            </div>
                            <span className="bg-accent/40 text-primary px-2.5 py-1 rounded-full text-xs font-bold">
                                Synced (0 Queued)
                            </span>
                        </div>
                    </div>
                </div>

                {/* YOLO Validation Metrics (Static) */}
                <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-base font-bold text-darkBase">
                            YOLO Static Validation Metrics
                        </h4>
                        <span className="text-[10px] bg-slate-100 text-textMuted px-2 py-1 rounded font-bold border border-slate-200">
                            11.1M Params • 28.4 GFLOPs
                        </span>
                    </div>
                    
                    <div className="space-y-4 mt-2">
                        {/* Precision Score */}
                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span className="text-darkBase">Detection Precision (Box P)</span>
                                <span className="text-primary">95.0%</span>
                            </div>
                            <div className="w-full bg-background h-2.5 rounded-full overflow-hidden border border-borderLight">
                                <div className="bg-primary h-full rounded-full" style={{ width: "95.0%" }} />
                            </div>
                        </div>

                        {/* Recall Score */}
                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span className="text-darkBase">Detection Recall (Box R)</span>
                                <span className="text-secondary">84.0%</span>
                            </div>
                            <div className="w-full bg-background h-2.5 rounded-full overflow-hidden border border-borderLight">
                                <div className="bg-secondary h-full rounded-full" style={{ width: "84.0%" }} />
                            </div>
                        </div>

                        {/* mAP50-95 Score */}
                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span className="text-darkBase">Strict Accuracy (mAP@50-95)</span>
                                <span className="text-riskCleared">71.5%</span>
                            </div>
                            <div className="w-full bg-background h-2.5 rounded-full overflow-hidden border border-borderLight">
                                <div className="bg-riskCleared h-full rounded-full" style={{ width: "71.5%" }} />
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Live Edge Cycle & Latency Profiling */}
            <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <Zap size={18} className="text-secondary" />
                    <h4 className="text-base font-bold text-darkBase">Live Edge Cycle & Latency Profiling</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-background rounded-lg border border-borderLight text-center">
                        <p className="text-xs font-bold text-textMuted uppercase tracking-wide mb-1">Vision Inference Status</p>
                        <p className={`text-xl font-black ${data.profiling.inference_type === "Fresh" ? "text-rose-600" : "text-emerald-600"}`}>
                            {data.profiling.inference_type === "Fresh" ? `~${data.profiling.latest_inference_ms} ms` : "0 ms (Cached)"}
                        </p>
                        <p className="text-[10px] text-textMuted mt-1">
                            {data.profiling.inference_type === "Fresh" ? "CPU execution bottleneck" : "Optimization active (Skip mode)"}
                        </p>
                    </div>

                    <div className="p-4 bg-background rounded-lg border border-borderLight text-center">
                        <p className="text-xs font-bold text-textMuted uppercase tracking-wide mb-1">Weather AI Execution</p>
                        <p className="text-xl font-black text-primary">~{data.profiling.weather_execution_ms.toFixed(1)} ms</p>
                        <p className="text-[10px] text-textMuted mt-1">HistGradientBoostingRegressor</p>
                    </div>

                    <div className="p-4 bg-background rounded-lg border border-borderLight text-center">
                        <p className="text-xs font-bold text-textMuted uppercase tracking-wide mb-1">Total Edge Loop Duration</p>
                        <p className="text-xl font-black text-darkBase">~{(data.profiling.total_cycle_ms / 1000).toFixed(2)} s</p>
                        <p className="text-[10px] text-textMuted mt-1">Sensor read + AI + Network</p>
                    </div>
                </div>
            </div>
        </div>
    );
}