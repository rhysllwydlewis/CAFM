'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

export function AdminMenu({
  canManageSettings,
  canManagePeople,
  canReadRoles,
  canReadPeople,
  canReadAudit,
}: {
  canManageSettings: boolean;
  canManagePeople: boolean;
  canReadRoles: boolean;
  canReadPeople: boolean;
  canReadAudit: boolean;
}) {
  const path = usePathname();
  const items = [
    canManageSettings && { href: '/app/admin', label: 'Overview' },
    canManagePeople && { href: '/app/admin/users', label: 'Users and licences' },
    canReadRoles && { href: '/app/admin/roles', label: 'Roles and permissions' },
    canReadPeople && { href: '/app/admin/teams', label: 'Teams' },
    canManageSettings && { href: '/app/admin/modules', label: 'Modules and navigation' },
    canManageSettings && { href: '/app/admin/terminology', label: 'Terminology' },
    canManageSettings && { href: '/app/admin/branding', label: 'Branding' },
    canManageSettings && { href: '/app/admin/fields', label: 'Custom fields' },
    canManageSettings && { href: '/app/admin/service-levels', label: 'Service levels' },
    canManageSettings && { href: '/app/admin/security', label: 'Security and sign-in' },
    canReadAudit && { href: '/app/admin/audit', label: 'Audit log' },
  ].filter((item): item is { href: string; label: string } => !!item);
  return (
    <nav className="card" aria-label="Administration" style={{ alignSelf: 'start' }}>
      <div className={'card-b ' + styles.menu}>
        {items.map((item) => (
          <Link key={item.href} href={item.href} aria-current={path === item.href ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
