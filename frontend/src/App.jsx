import { Routes, Route, Navigate } from "react-router-dom"
import { useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { useToast } from "./components/ToastContext"
import { setApiHandlers } from "./services/api"

import Login from "./pages/Login"
import Register from "./pages/Register"
import RoleRoute from "./components/RoleRoute"

import CitizenHome from "./pages/citizen/CitizenHome"

// Barangay portal
import BarangayLayout from "./pages/barangay/BarangayLayout"
import BarangayDashboard from "./pages/barangay/BarangayDashboard"
import BarangayQueue from "./pages/barangay/BarangayQueue"
import BarangayReportDetail from "./pages/barangay/BarangayReportDetail"
import BarangayPlateSearch from "./pages/barangay/BarangayPlateSearch"

// MTPB Officer portal
import OfficerLayout from "./pages/mtpb/OfficerLayout"
import OfficerQueue from "./pages/mtpb/OfficerQueue"
import OfficerReportDetail from "./pages/mtpb/OfficerReportDetail"
import OfficerPlateSearch from "./pages/mtpb/OfficerPlateSearch"
import OfficerProfile from "./pages/mtpb/OfficerProfile"

// MTPB Supervisor portal
import SupervisorLayout from "./pages/mtpb/SupervisorLayout"
import SupervisorDashboard from "./pages/mtpb/SupervisorDashboard"
import SupervisorEscalated from "./pages/mtpb/SupervisorEscalated"
import SupervisorReports from "./pages/mtpb/SupervisorReports"
import SupervisorOfficers from "./pages/mtpb/SupervisorOfficers"

// Admin portal
import AdminLayout from "./pages/admin/AdminLayout"
import AdminUsers from "./pages/admin/AdminUsers"
import AdminBarangays from "./pages/admin/AdminBarangays"
import AdminStreets from "./pages/admin/AdminStreets"
import AdminPenaltyTiers from "./pages/admin/AdminPenaltyTiers"
import AdminAudit from "./pages/admin/AdminAudit"

function ApiSetup() {
  const navigate = useNavigate()
  const toast = useToast()
  useEffect(() => { setApiHandlers(navigate, toast) }, [navigate, toast])
  return null
}

export default function App() {
  return (
    <>
      <ApiSetup />
      <Routes>
        {/* Public */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Citizen */}
        <Route path="/citizen" element={
          <RoleRoute allowedRoles={["citizen"]}><CitizenHome /></RoleRoute>
        } />

        {/* Barangay */}
        <Route path="/barangay" element={
          <RoleRoute allowedRoles={["brgy_official"]}><BarangayLayout /></RoleRoute>
        }>
          <Route index element={<BarangayDashboard />} />
          <Route path="queue"            element={<BarangayQueue />} />
          <Route path="reports/:reportId" element={<BarangayReportDetail />} />
          <Route path="plate-search"     element={<BarangayPlateSearch />} />
        </Route>

        {/* MTPB Officer */}
        <Route path="/mtpb/officer" element={
          <RoleRoute allowedRoles={["mtpb_officer"]}><OfficerLayout /></RoleRoute>
        }>
          <Route index element={<Navigate to="queue" replace />} />
          <Route path="queue"             element={<OfficerQueue />} />
          <Route path="reports/:reportId" element={<OfficerReportDetail />} />
          <Route path="plate-search"      element={<OfficerPlateSearch />} />
          <Route path="profile"           element={<OfficerProfile />} />
        </Route>

        {/* MTPB Supervisor */}
        <Route path="/mtpb/supervisor" element={
          <RoleRoute allowedRoles={["mtpb_supervisor"]}><SupervisorLayout /></RoleRoute>
        }>
          <Route index element={<SupervisorDashboard />} />
          <Route path="escalated" element={<SupervisorEscalated />} />
          <Route path="reports"   element={<SupervisorReports />} />
          <Route path="officers"  element={<SupervisorOfficers />} />
        </Route>

        {/* Admin */}
        <Route path="/admin" element={
          <RoleRoute allowedRoles={["admin"]}><AdminLayout /></RoleRoute>
        }>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users"          element={<AdminUsers />} />
          <Route path="barangays"      element={<AdminBarangays />} />
          <Route path="streets"        element={<AdminStreets />} />
          <Route path="penalty-tiers"  element={<AdminPenaltyTiers />} />
          <Route path="audit"          element={<AdminAudit />} />
        </Route>

        {/* Fallback */}
        <Route path="/"  element={<Navigate to="/login" replace />} />
        <Route path="*"  element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}
