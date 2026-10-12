import { Cpu, Wifi, Thermometer, Activity, Navigation, Database, RefreshCw } from "lucide-react";

export default function EdgeTelemetryDashboard() {
    return (
        <div className="space-y-6">
            {/* Highlighted AI Insight Banner (#D1F8EF with #3674B5 left border) */}
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
                    <span className="bg-surface text-riskCleared border border-riskCleared px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5">
                        <Wifi size={14} /> Pi Node Connected
                    </span>
                    <button className="bg-primary hover:bg-secondary text-surface px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition">
                        <RefreshCw size={14} /> Refresh Telemetry
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
                    <p className="text-2xl font-extrabold text-darkBase">Online</p>
                    <p className="text-xs font-semibold text-riskCleared mt-1">
                        Heartbeat: 24ms • Active
                    </p>
                </div>

                {/* Card 2: Pi Health */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase text-textMuted">
                            Raspberry Pi Health
                        </span>
                        <div className="w-9 h-9 rounded-full bg-accent/40 text-primary flex items-center justify-center">
                            <Cpu size={18} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-darkBase">43.2°C / 36%</p>
                    <p className="text-xs text-textMuted mt-1">
                        CPU Temp • RAM Usage (Pi 4B)
                    </p>
                </div>

                {/* Card 3: Sensor Status */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase text-textMuted">
                            Sensor Status
                        </span>
                        <div className="w-9 h-9 rounded-full bg-mintSurface text-primary flex items-center justify-center">
                            <Thermometer size={18} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-darkBase">30.4°C • 78%</p>
                    <p className="text-xs font-semibold text-riskCleared mt-1">
                        DHT22 & NEO-6M GPS Locked
                    </p>
                </div>

                {/* Card 4: AI Model Accuracy */}
                <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase text-textMuted">
                            AI Model Accuracy
                        </span>
                        <div className="w-9 h-9 rounded-full bg-accent/40 text-primary flex items-center justify-center">
                            <Activity size={18} />
                        </div>
                    </div>
                    <p className="text-2xl font-extrabold text-darkBase">94.2% mAP</p>
                    <p className="text-xs font-semibold text-secondary mt-1">
                        YOLO ONNX • 112ms Inference
                    </p>
                </div>
            </div>

            {/* Detailed Sensor & AI Model Breakdown */}
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
                                Active (30.4°C / 78% RH)
                            </span>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-borderLight">
                            <div className="flex items-center gap-3">
                                <Navigation size={18} className="text-primary" />
                                <div>
                                    <p className="text-sm font-bold text-darkBase">NEO-6M GPS Module</p>
                                    <p className="text-xs text-textMuted">NMEA Sentence Stream (6.9271° N, 79.9712° E)</p>
                                </div>
                            </div>
                            <span className="bg-mintSurface text-riskCleared px-2.5 py-1 rounded-full text-xs font-bold">
                                3D Fix Locked
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

                {/* AI Model Evaluation Metrics */}
                <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm">
                    <h4 className="text-base font-bold text-darkBase mb-4">
                        Edge AI Model Performance Metrics
                    </h4>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span className="text-darkBase">YOLO Container Detection Accuracy (mAP@50)</span>
                                <span className="text-primary">94.2%</span>
                            </div>
                            <div className="w-full bg-background h-2.5 rounded-full overflow-hidden border border-borderLight">
                                <div className="bg-primary h-full rounded-full" style={{ width: "94.2%" }} />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span className="text-darkBase">Precision Score (Breeding Containers)</span>
                                <span className="text-secondary">91.8%</span>
                            </div>
                            <div className="w-full bg-background h-2.5 rounded-full overflow-hidden border border-borderLight">
                                <div className="bg-secondary h-full rounded-full" style={{ width: "91.8%" }} />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span className="text-darkBase">Microclimate Suitability Regression (R² Score)</span>
                                <span className="text-riskCleared">89.5%</span>
                            </div>
                            <div className="w-full bg-background h-2.5 rounded-full overflow-hidden border border-borderLight">
                                <div className="bg-riskCleared h-full rounded-full" style={{ width: "89.5%" }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}