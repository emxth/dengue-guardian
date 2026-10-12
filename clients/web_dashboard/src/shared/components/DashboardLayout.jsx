import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { Cpu, Users, LogOut } from "lucide-react";
import logo from "../../assets/DengueGuardian.jpg";

export default function DashboardLayout() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex bg-background">
            {/* Left Side Navigation */}
            <aside className="w-64 bg-surface border-r border-borderLight flex flex-col justify-between">
                <div>
                    {/* Top Brand Header (#3674B5 Guardian Cobalt) */}
                    <div className="bg-primary text-surface p-5 flex items-center gap-3">
                        {/* Logo Badge Container */}
                        <div className="w-12 h-12 shrink-0 bg-[#0A1122] rounded-xl overflow-hidden flex items-center justify-center border border-secondary/40 shadow-inner">
                            <img
                                src={logo}
                                alt="Dengue-Guardian logo"
                                className="w-full h-full object-contain scale-125"
                            />
                        </div>
                        <div>
                            <h1 className="font-bold text-base leading-tight">
                                Dengue-Guardian
                            </h1>
                            <p className="text-xs text-accent">Admin & Telemetry</p>
                        </div>
                    </div>

                    {/* Navigation Links */}
                    <div className="p-4">
                        <p className="text-xs font-bold uppercase text-textMuted px-3 mb-2">
                            Control Modules
                        </p>
                        <nav className="space-y-1.5">
                            <NavLink
                                to="/dashboard/telemetry"
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold transition ${isActive
                                        ? "bg-mintSurface text-primary border-l-4 border-primary"
                                        : "text-textMuted hover:bg-background"
                                    }`
                                }
                            >
                                <Cpu size={18} />
                                Edge Telemetry
                            </NavLink>

                            <NavLink
                                to="/dashboard/users"
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold transition ${isActive
                                        ? "bg-mintSurface text-primary border-l-4 border-primary"
                                        : "text-textMuted hover:bg-background"
                                    }`
                                }
                            >
                                <Users size={18} />
                                User Management
                            </NavLink>
                        </nav>
                    </div>
                </div>

                {/* Bottom Logout / Back to Launch Button */}
                <div className="p-4 border-t border-borderLight">
                    <button
                        onClick={() => navigate("/")}
                        className="w-full bg-mintSurface border border-primary text-primary hover:bg-accent/40 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
                    >
                        <LogOut size={15} />
                        Exit to Launch Page
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col">
                {/* Top Header Bar */}
                <header className="bg-surface border-b border-borderLight px-8 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-darkBase">
                            MOH Supervisor & Edge System Portal
                        </h2>
                        <p className="text-xs text-textMuted">
                            Component 1 Telemetry & PHI Field Officer Access Control
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="bg-mintSurface text-primary border border-secondary/40 px-3 py-1 rounded-full text-xs font-bold">
                            Admin Session Active
                        </span>
                    </div>
                </header>

                {/* Active Tab Page Content */}
                <main className="p-8 flex-1 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}