import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./LandingPage";
import DashboardLayout from "../shared/components/DashboardLayout";
import EdgeTelemetryDashboard from "../features/edge_telemetry/pages/EdgeTelemetryDashboard";
import PhiApprovalPage from "../features/user_management/pages/PhiApprovalPage";
import PreventionDashboard from "../features/prevention_intelligence/pages/PreventionDashboard";
import AreaPreventionOverview from "../features/prevention_intelligence/pages/AreaPreventionOverview";
import InterventionEffectivenessAnalytics from "../features/prevention_intelligence/pages/InterventionEffectivenessAnalytics";
import InterventionRecordReview from "../features/prevention_intelligence/pages/InterventionRecordReview";
import RecommendationValidation from "../features/prevention_intelligence/pages/RecommendationValidation";
import AdaptiveLearningMonitor from "../features/prevention_intelligence/pages/AdaptiveLearningMonitor";
import KnowledgeGraphScreen from "../features/prevention_intelligence/pages/KnowledgeGraphScreen";
import CommunityAlertsReports from "../features/prevention_intelligence/pages/CommunityAlertsReports";

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

                    {/* Component 4: Prevention Intelligence Routes */}
                    <Route path="prevention" element={<PreventionDashboard />} />
                    <Route path="prevention/area" element={<AreaPreventionOverview />} />
                    <Route path="prevention/analytics" element={<InterventionEffectivenessAnalytics />} />
                    <Route path="prevention/records" element={<InterventionRecordReview />} />
                    <Route path="prevention/validation" element={<RecommendationValidation />} />
                    <Route path="prevention/learning" element={<AdaptiveLearningMonitor />} />
                    <Route path="prevention/knowledge-graph" element={<KnowledgeGraphScreen />} />
                    <Route path="prevention/alerts" element={<CommunityAlertsReports />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}