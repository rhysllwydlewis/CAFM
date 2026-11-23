'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

export function AdminMenu({
  canManageSettings,
  canManagePeople,
}: {
  canManageSettings: boolean;
  canManagePeople: boolean;
}) {
  const path = usePathname();
  const items = [
    canManageSettings && { href: '/app/admin', label: 'Overview' },
    canManagePeople && { href: '/app/admin/users', label: 'Users and licences' },
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
