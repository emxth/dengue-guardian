import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./LandingPage";
import DashboardLayout from "../shared/components/DashboardLayout";
import EdgeTelemetryDashboard from "../features/edge_telemetry/pages/EdgeTelemetryDashboard";
import PhiApprovalPage from "../features/user_management/pages/PhiApprovalPage";

export default function AppRouter() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Launching Page */}
                <Route path="/" element={<LandingPage />} />

                {/* Admin Portal with Side Navigation */}
                <Route path="/dashboard" element={<DashboardLayout />}>
                    <Route index element={<Navigate to="telemetry" replace />} />
                    <Route path="telemetry" element={<EdgeTelemetryDashboard />} />
                    <Route path="users" element={<PhiApprovalPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}