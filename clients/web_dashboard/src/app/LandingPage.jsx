import { useNavigate } from "react-router-dom";
import {
    Cpu,
    Users,
    ArrowRight,
    Activity,
    Lock,
    Radar,
    Thermometer,
    ShieldCheck,
    Wifi,
} from "lucide-react";
import logo from "../assets/DengueGuardian.jpg";

const stats = [
    { label: "Edge AI Modules", value: "3", sub: "Weather • YOLO • Fusion" },
    { label: "Breeding Classes", value: "5", sub: "Tires, shells, drains…" },
    { label: "Inference Latency", value: "<120ms", sub: "ONNX on Raspberry Pi" },
    { label: "Coverage", value: "Kaduwela", sub: "MOH Division" },
];

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Top Navbar */}
            <header className="sticky top-0 z-20 bg-surface/90 backdrop-blur border-b border-borderLight">
                <div className="max-w-7xl mx-auto px-6 lg:px-10 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-darkBase ring-2 ring-accent/60 shadow-sm">
                            <img
                                src={logo}
                                alt="Dengue-Guardian logo"
                                className="w-full h-full object-cover scale-110"
                            />
                        </div>
                        <div>
                            <h1 className="text-lg font-extrabold text-darkBase leading-tight tracking-tight">
                                DENGUE<span className="text-secondary">-</span>
                                <span className="text-primary">GUARDIAN</span>
                            </h1>
                            <p className="text-[11px] text-textMuted hidden sm:block">
                                Intelligent Dengue Surveillance & Decision Support
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => navigate("/dashboard/telemetry")}
                        className="bg-primary hover:bg-secondary text-surface px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition shadow-sm"
                    >
                        <Lock size={16} />
                        Admin Login
                    </button>
                </div>
            </header>

            {/* Hero */}
            <main className="flex-1">
                <section className="relative overflow-hidden">
                    {/* Soft background decoration */}
                    <div className="pointer-events-none absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-accent/30 blur-3xl" />
                    <div className="pointer-events-none absolute top-40 right-0 w-[26rem] h-[26rem] rounded-full bg-mintSurface blur-3xl opacity-80" />

                    <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-14 lg:py-20 grid lg:grid-cols-2 gap-12 items-center">
                        {/* Left: copy */}
                        <div>
                            <div className="bg-mintSurface border-l-4 border-primary px-4 py-2 rounded-r-xl inline-flex items-center gap-2 mb-6">
                                <Activity size={16} className="text-primary" />
                                <span className="text-xs font-bold text-darkBase uppercase tracking-wide">
                                    Central Administration & Edge AI Telemetry
                                </span>
                            </div>

                            <h2 className="text-4xl md:text-5xl xl:text-6xl font-extrabold text-darkBase leading-[1.1] tracking-tight mb-5">
                                Adaptive Surveillance,
                                <br />
                                <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                                    Proactive Prevention.
                                </span>
                            </h2>

                            <p className="text-base md:text-lg text-textMuted max-w-xl mb-8 leading-relaxed">
                                Monitor Raspberry Pi edge nodes, microclimate sensor streams and
                                YOLO container detections in real time — while governing Public
                                Health Inspector (PHI) access to the field mobile client.
                            </p>

                            <div className="flex flex-wrap items-center gap-4 mb-10">
                                <button
                                    onClick={() => navigate("/dashboard/telemetry")}
                                    className="group bg-primary hover:bg-secondary text-surface px-6 py-3.5 rounded-xl text-base font-bold flex items-center gap-2.5 transition shadow-md hover:shadow-lg"
                                >
                                    Admin Login to Portal
                                    <ArrowRight
                                        size={18}
                                        className="transition-transform group-hover:translate-x-1"
                                    />
                                </button>

                                <button
                                    onClick={() => navigate("/dashboard/users")}
                                    className="bg-mintSurface border-[1.5px] border-primary text-primary hover:bg-accent/40 px-6 py-3.5 rounded-xl text-base font-bold flex items-center gap-2 transition"
                                >
                                    <Users size={18} />
                                    PHI Access Management
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-textMuted">
                                <span className="flex items-center gap-1.5">
                                    <ShieldCheck size={15} className="text-riskCleared" /> Role-based access
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Wifi size={15} className="text-riskCleared" /> Live edge heartbeat
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Radar size={15} className="text-riskCleared" /> Offline-first field sync
                                </span>
                            </div>
                        </div>

                        {/* Right: logo showcase */}
                        <div className="relative flex justify-center">
                            <div className="relative w-full max-w-md">
                                {/* glow */}
                                <div className="absolute inset-4 rounded-[2rem] bg-gradient-to-br from-accent/60 via-secondary/30 to-mintSurface blur-2xl" />

                                <div className="relative rounded-[2rem] bg-darkBase p-3 shadow-2xl ring-1 ring-secondary/30">
                                    <div className="rounded-[1.5rem] overflow-hidden bg-darkBase">
                                        <img
                                            src={logo}
                                            alt="Dengue-Guardian shield with mosquito radar"
                                            className="w-full h-auto block"
                                        />
                                    </div>

                                    <div className="px-4 pt-4 pb-3 text-center">
                                        <p className="text-xl font-extrabold tracking-[0.2em] text-surface">
                                            <span className="text-accent">DENGUE</span>
                                            <span className="text-textMuted">-</span>
                                            GUARDIAN
                                        </p>
                                    </div>
                                </div>

                                {/* Floating chips */}
                                <div className="absolute -left-4 top-10 bg-surface border border-borderLight shadow-lg rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
                                    <span className="w-8 h-8 rounded-full bg-mintSurface text-riskCleared flex items-center justify-center">
                                        <Thermometer size={16} />
                                    </span>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-textMuted">Microclimate</p>
                                        <p className="text-sm font-extrabold text-darkBase">30.4°C • 78%</p>
                                    </div>
                                </div>

                                <div className="absolute -right-4 bottom-24 bg-surface border border-borderLight shadow-lg rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
                                    <span className="w-8 h-8 rounded-full bg-accent/40 text-primary flex items-center justify-center">
                                        <Radar size={16} />
                                    </span>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-textMuted">Breeding Risk</p>
                                        <p className="text-sm font-extrabold text-riskHigh">High • 0.74</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Stats strip */}
                <section className="max-w-7xl mx-auto px-6 lg:px-10 -mt-2">
                    <div className="bg-surface border border-borderLight rounded-2xl shadow-sm grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-borderLight">
                        {stats.map((s) => (
                            <div key={s.label} className="p-5 text-center">
                                <p className="text-2xl font-extrabold text-primary">{s.value}</p>
                                <p className="text-xs font-bold uppercase text-darkBase mt-0.5">{s.label}</p>
                                <p className="text-[11px] text-textMuted mt-0.5">{s.sub}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Feature cards */}
                <section className="max-w-7xl mx-auto px-6 lg:px-10 py-14 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-surface border border-borderLight p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-secondary transition">
                        <div className="w-12 h-12 rounded-full bg-accent/40 text-primary flex items-center justify-center mb-4">
                            <Cpu size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-darkBase mb-1">
                            Component 1: Edge AI & Sensor Telemetry
                        </h3>
                        <p className="text-sm text-textMuted leading-relaxed">
                            Real-time monitoring of Raspberry Pi 4 health, DHT22 microclimate
                            readings, NEO-6M GPS status and YOLO ONNX model accuracy.
                        </p>
                    </div>

                    <div className="bg-surface border border-borderLight p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-secondary transition">
                        <div className="w-12 h-12 rounded-full bg-mintSurface text-primary flex items-center justify-center mb-4">
                            <Users size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-darkBase mb-1">
                            PHI Officer Verification & Governance
                        </h3>
                        <p className="text-sm text-textMuted leading-relaxed">
                            Centralized approval workflow for Public Health Inspectors
                            registering via the Dengue-Guardian Mobile Field Client.
                        </p>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-surface border-t border-borderLight px-8 py-4 text-center text-xs text-textMuted">
                Dengue-Guardian Research Framework • Oceanic & Eco-Clinical UI System
            </footer>
        </div>
    );
}