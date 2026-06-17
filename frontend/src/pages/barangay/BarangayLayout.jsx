import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { LayoutGrid, ClipboardList, Search, User } from 'lucide-react'
import PortalLayout from '../../components/PortalLayout'
import { getStoredUser } from '../../utils/auth'
import { reports } from '../../services/api'

export default function BarangayLayout() {
  const user = getStoredUser()
  const barangayName = user?.barangay_name ?? 'Barangay'
  const [pendingCount, setPendingCount] = useState(0)
  const [pageTitle, setPageTitle] = useState('Dashboard')

  useEffect(() => {
    reports.barangayQueue().then(data => {
      const arr = Array.isArray(data) ? data : (data?.reports ?? [])
      setPendingCount(arr.filter(r => r.status === 'pending').length)
    }).catch(() => {})
  }, [])

  const navItems = [
    { to: '/barangay',        label: 'Dashboard',       icon: LayoutGrid, end: true },
    { to: '/barangay/queue',  label: 'Pending Reports', icon: ClipboardList, badge: pendingCount },
    { to: '/barangay/plate-search', label: 'Violation History', icon: Search },
    { to: '/barangay/profile',      label: 'Profile',           icon: User },
  ]

  return (
    <PortalLayout
      portalClass="portal-barangay"
      logo="ParkWatch — Barangay"
      roleLabel={`Barangay Official — Brgy. ${barangayName}`}
      navItems={navItems}
      pageTitle={pageTitle}
    >
      <Outlet context={{ setPageTitle }} />
    </PortalLayout>
  )
}
