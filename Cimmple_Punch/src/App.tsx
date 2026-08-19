import { Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { PunchLogin } from "./pages/PunchLogin";
import PunchInOut from "./pages/PunchInOut";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
  return (
    <>
      <ToastContainer position="bottom-right" autoClose={3000} hideProgressBar={false} />
      <Routes>
        <Route path="/login" element={<PunchLogin />} />
        <Route path="/punch-login" element={<Navigate to="/login" replace />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<PunchInOut />} />
          <Route path="/punch-in-out" element={<PunchInOut />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
