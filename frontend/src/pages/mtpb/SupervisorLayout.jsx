import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { LayoutGrid, AlertTriangle, FileText, Users } from 'lucide-react'
import PortalLayout from '../../components/PortalLayout'
import { getStoredUser } from '../../utils/auth'
import { reports } from '../../services/api'

export default function SupervisorLayout() {
  const user = getStoredUser()
  const lastName = user?.last_name ?? 'Supervisor'
  const [escalatedCount, setEscalatedCount] = useState(0)
  const [pageTitle, setPageTitle] = useState('Overview')

  useEffect(() => {
    reports.analyticsSum().then(s => {
      setEscalatedCount(s?.escalated_now ?? 0)
    }).catch(() => {})
  }, [])

  const navItems = [
    { to: '/mtpb/supervisor',           label: 'Overview',           icon: LayoutGrid, end: true },
    { to: '/mtpb/supervisor/escalated', label: 'Escalated Reports',  icon: AlertTriangle, badge: escalatedCount },
    { to: '/mtpb/supervisor/reports',   label: 'Reports',            icon: FileText },
    { to: '/mtpb/supervisor/officers',  label: 'Officers',           icon: Users },
  ]

  return (
    <PortalLayout
      portalClass="portal-supervisor"
      logo="MTPB Supervisor — Malate"
      roleLabel={`Insp. ${lastName} — MTPB`}
      navItems={navItems}
      pageTitle={pageTitle}
    >
      <Outlet context={{ setPageTitle }} />
    </PortalLayout>
  )
}
