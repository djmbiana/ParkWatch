import { Routes, Route, Navigate } from "react-router-dom"
import { useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { useToast } from "./components/ToastContext"
import { setApiHandlers } from "./services/api"
import { PermissionsProvider } from "./contexts/PermissionsContext"

import Landing from "./pages/Landing"
import Login from "./pages/Login"
import Register from "./pages/Register"
import PrivacyNotice from "./pages/PrivacyNotice"
import RoleRoute from "./components/RoleRoute"

// Citizen app (public, anonymous - no auth per research paper p.118)
import CitizenLayout from "./pages/citizen/CitizenLayout"
import CitizenHome from "./pages/citizen/CitizenHome"
import ReportWizard from "./pages/citizen/ReportWizard"
import MyReports from "./pages/citizen/MyReports"
import ReportDetail from "./pages/citizen/ReportDetail"
import Alerts from "./pages/citizen/Alerts"
import Account from "./pages/citizen/Account"

// Barangay portal
import BarangayLayout from "./pages/barangay/BarangayLayout"
import BarangayDashboard from "./pages/barangay/BarangayDashboard"
import BarangayQueue from "./pages/barangay/BarangayQueue"
import BarangayReportDetail from "./pages/barangay/BarangayReportDetail"
import BarangayPlateSearch from "./pages/barangay/BarangayPlateSearch"
import BarangayStreets from "./pages/barangay/BarangayStreets"

// MTPB Officer portal
import OfficerLayout from "./pages/mtpb/OfficerLayout"
import OfficerQueue from "./pages/mtpb/OfficerQueue"
import OfficerReportDetail from "./pages/mtpb/OfficerReportDetail"
import OfficerPlateSearch from "./pages/mtpb/OfficerPlateSearch"
import ProfilePage from "./pages/ProfilePage"

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
import AdminUserGroups from "./pages/admin/AdminUserGroups"
import AdminAuditLog from "./pages/admin/AdminAuditLog"

function ApiSetup() {
  const navigate = useNavigate()
  const toast = useToast()
  useEffect(() => { setApiHandlers(navigate, toast) }, [navigate, toast])
  return null
}

export default function App() {
  return (
    <PermissionsProvider>
      <ApiSetup />
      <Routes>
        {/* Public */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/privacy"  element={<PrivacyNotice />} />

        {/* Citizen - public, no auth guard (anonymous reporting) */}
        <Route path="/citizen" element={<CitizenLayout />}>
          <Route index                   element={<CitizenHome />} />
          <Route path="report"           element={<ReportWizard />} />
          <Route path="reports"          element={<MyReports />} />
          <Route path="reports/:reportId" element={<ReportDetail />} />
          <Route path="alerts"           element={<Alerts />} />
          <Route path="account"          element={<Account />} />
        </Route>

        {/* Barangay */}
        <Route path="/barangay" element={
          <RoleRoute allowedRoles={["brgy_official"]}><BarangayLayout /></RoleRoute>
        }>
          <Route index                   element={<BarangayDashboard />} />
          <Route path="queue"            element={<BarangayQueue />} />
          <Route path="reports/:reportId" element={<BarangayReportDetail />} />
          <Route path="plate-search"     element={<BarangayPlateSearch />} />
          <Route path="streets"          element={<BarangayStreets />} />
          <Route path="profile"          element={<ProfilePage />} />
        </Route>

        {/* MTPB Officer */}
        <Route path="/mtpb/officer" element={
          <RoleRoute allowedRoles={["mtpb_officer"]}><OfficerLayout /></RoleRoute>
        }>
          <Route index                   element={<Navigate to="queue" replace />} />
          <Route path="queue"            element={<OfficerQueue />} />
          <Route path="reports/:reportId" element={<OfficerReportDetail />} />
          <Route path="plate-search"     element={<OfficerPlateSearch />} />
          <Route path="profile"          element={<ProfilePage />} />
        </Route>

        {/* MTPB Supervisor */}
        <Route path="/mtpb/supervisor" element={
          <RoleRoute allowedRoles={["mtpb_supervisor"]}><SupervisorLayout /></RoleRoute>
        }>
          <Route index              element={<SupervisorDashboard />} />
          <Route path="escalated"   element={<SupervisorEscalated />} />
          <Route path="reports"     element={<SupervisorReports />} />
          <Route path="officers"    element={<SupervisorOfficers />} />
          <Route path="profile"     element={<ProfilePage />} />
        </Route>

        {/* Admin */}
        <Route path="/admin" element={
          <RoleRoute allowedRoles={["admin"]}><AdminLayout /></RoleRoute>
        }>
          <Route index                   element={<Navigate to="users" replace />} />
          <Route path="users"            element={<AdminUsers />} />
          <Route path="barangays"        element={<AdminBarangays />} />
          <Route path="streets"          element={<AdminStreets />} />
          <Route path="penalty-tiers"    element={<AdminPenaltyTiers />} />
          <Route path="groups"           element={<AdminUserGroups />} />
          <Route path="audit-log"        element={<AdminAuditLog />} />
          <Route path="profile"          element={<ProfilePage />} />
        </Route>

        {/* Fallback */}
        <Route path="/"  element={<Landing />} />
        <Route path="*"  element={<Navigate to="/" replace />} />
      </Routes>
    </PermissionsProvider>
  )
}
