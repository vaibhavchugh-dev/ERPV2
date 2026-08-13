import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./components/AppShell";
import { ScrollToTop } from "./components/ScrollToTop";
import { LoginPage } from "./pages/LoginPage";
import { JobsPage } from "./pages/JobsPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { QualityListPage } from "./pages/quality/QualityListPage";
import { NcrFormPage } from "./pages/quality/NcrFormPage";
import { ProfilePage } from "./pages/ProfilePage";
import { DashboardPage } from "./pages/DashboardPage";

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:jobOrderId" element={<JobDetailPage />} />
            <Route path="/quality" element={<QualityListPage />} />
            <Route path="/quality/new" element={<NcrFormPage />} />
            <Route path="/quality/:ncrId" element={<NcrFormPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
