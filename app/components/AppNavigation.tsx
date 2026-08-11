'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type PermissionRow = {
  permission_key: string
  is_allowed: boolean
}

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    permission: 'view_dashboard',
  },
  {
    href: '/customers',
    label: 'Customers',
    permission: 'view_customers',
  },
  {
    href: '/tools',
    label: 'Tools',
    permission: 'view_tools',
  },
  {
    href: '/jobs',
    label: 'Jobs',
    permission: 'view_jobs',
  },
  {
    href: '/reports',
    label: 'Reports',
    permission: 'view_reports',
  },
] as const

export default function AppNavigation() {
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadPermissions = async () => {
      const { data, error } = await supabase.rpc(
        'get_current_user_permissions_v1'
      )

      if (error) {
        console.error('Permission load failed:', error)
        setPermissions([])
      } else {
        setPermissions((data ?? []) as PermissionRow[])
      }

      setLoaded(true)
    }

    void loadPermissions()
  }, [])

  const allowedPermissions = useMemo(() => {
    return new Set(
      permissions
        .filter((permission) => permission.is_allowed)
        .map((permission) => permission.permission_key)
    )
  }, [permissions])

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => allowedPermissions.has(item.permission))
  }, [allowedPermissions])

  if (!loaded) {
    return null
  }

  if (visibleNavItems.length === 0) {
    return null
  }

  return (
    <nav className="flex gap-6 text-sm">
      {visibleNavItems.map((item) => (
        <a key={item.href} href={item.href} className="hover:text-blue-400">
          {item.label}
        </a>
      ))}
    </nav>
  )
}