import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Users, MapPin, Map, Shield, FileText, User } from 'lucide-react'
import PortalLayout from '../../components/PortalLayout'

export default function AdminLayout() {
  const [pageTitle, setPageTitle] = useState('User Management')

  const navItems = [
    { to: '/admin/users',         label: 'User Management',    icon: Users },
    { to: '/admin/barangays',     label: 'Barangay Management',icon: MapPin },
    { to: '/admin/streets',       label: 'Streets & Rules',    icon: Map },
    { to: '/admin/penalty-tiers', label: 'Penalty Tiers',      icon: Shield },
    { to: '/admin/audit',         label: 'Audit Log',          icon: FileText },
    { to: '/admin/profile',       label: 'Profile',            icon: User },
  ]

  return (
    <PortalLayout
      portalClass="portal-admin"
      logo="ParkWatch Admin"
      roleLabel="System Administrator"
      navItems={navItems}
      pageTitle={pageTitle}
    >
      <Outlet context={{ setPageTitle }} />
    </PortalLayout>
  )
}
