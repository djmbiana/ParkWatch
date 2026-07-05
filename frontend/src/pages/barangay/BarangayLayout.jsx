import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { LayoutGrid, ClipboardList, Search, Map, User } from 'lucide-react'
import PortalLayout from '../../components/PortalLayout'
import { getStoredUser } from '../../utils/auth'
import { reports } from '../../services/api'
import { usePermissions } from '../../contexts/PermissionsContext'

export default function BarangayLayout() {
  const user = getStoredUser()
  const barangayName = user?.barangay_name ?? 'Barangay'
  const [pendingCount, setPendingCount] = useState(0)
  const [pageTitle, setPageTitle] = useState('Dashboard')
  const { canAccessModule } = usePermissions()

  useEffect(() => {
    reports.barangayQueue().then(data => {
      const arr = Array.isArray(data) ? data : (data?.reports ?? [])
      setPendingCount(arr.filter(r => r.status === 'pending').length)
    }).catch(() => {})
  }, [])

  const navItems = [
    { to: '/barangay',              label: 'Dashboard',       icon: LayoutGrid, end: true },
    { to: '/barangay/queue',        label: 'Pending Reports', icon: ClipboardList, badge: pendingCount },
    { to: '/barangay/plate-search', label: 'Violation History', icon: Search },
    canAccessModule('streets_rules') && { to: '/barangay/streets', label: 'My Streets', icon: Map },
    { to: '/barangay/profile',      label: 'Profile',         icon: User },
  ].filter(Boolean)

  return (
    <PortalLayout
      portalClass="portal-barangay"
      logo="ParkWatch - Barangay"
      roleLabel={`Barangay Official - Brgy. ${barangayName}`}
      navItems={navItems}
      pageTitle={pageTitle}
    >
      <Outlet context={{ setPageTitle }} />
    </PortalLayout>
  )
}
