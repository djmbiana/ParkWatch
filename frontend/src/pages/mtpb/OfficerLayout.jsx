import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { ClipboardList, Search, User } from 'lucide-react'
import PortalLayout from '../../components/PortalLayout'
import { getStoredUser } from '../../utils/auth'
import { reports } from '../../services/api'

export default function OfficerLayout() {
  const user = getStoredUser()
  const badge = user?.badge_number ?? user?.employee_id ?? '—'
  const [queueCount, setQueueCount] = useState(0)
  const [pageTitle, setPageTitle] = useState('Enforcement Queue')

  useEffect(() => {
    reports.mtpbQueue().then(data => {
      const arr = Array.isArray(data) ? data : (data?.reports ?? [])
      setQueueCount(arr.length)
    }).catch(() => {})
  }, [])

  const navItems = [
    { to: '/mtpb/officer/queue',        label: 'Enforcement Queue',  icon: ClipboardList, badge: queueCount },
    { to: '/mtpb/officer/plate-search', label: 'Violation History',  icon: Search },
    { to: '/mtpb/officer/profile',      label: 'Profile',            icon: User },
  ]

  return (
    <PortalLayout
      portalClass="portal-mtpb"
      logo="MTPB Portal — Malate"
      roleLabel={`MTPB Officer — Badge #${badge}`}
      navItems={navItems}
      pageTitle={pageTitle}
    >
      <Outlet context={{ setPageTitle }} />
    </PortalLayout>
  )
}
