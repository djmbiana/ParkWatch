import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Users, MapPin, Map, Shield, User, UsersRound, ClipboardList } from 'lucide-react'
import PortalLayout from '../../components/PortalLayout'
import { usePermissions } from '../../contexts/PermissionsContext'

export default function AdminLayout() {
  const [pageTitle, setPageTitle] = useState('User Management')
  const { canAccessModule, group } = usePermissions()
  const isSuperAdmin = !!group?.is_system_role

  // Build nav items, hiding entries the user's group cannot even read.
  const navItems = [
    canAccessModule('users_mgt')     && { to: '/admin/users',         label: 'User Management',    icon: Users },
    canAccessModule('brgy_mgt')      && { to: '/admin/barangays',     label: 'Barangay Management',icon: MapPin },
    canAccessModule('streets_rules') && { to: '/admin/streets',       label: 'Streets & Rules',    icon: Map },
    canAccessModule('penalty')       && { to: '/admin/penalty-tiers', label: 'Penalty Tiers',      icon: Shield },
    isSuperAdmin                     && { to: '/admin/groups',        label: 'User Groups',        icon: UsersRound },
    isSuperAdmin                     && { to: '/admin/audit-log',     label: 'Audit Log',          icon: ClipboardList },
                                         { to: '/admin/profile',      label: 'Profile',            icon: User },
  ].filter(Boolean)

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
