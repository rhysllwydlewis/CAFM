import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Icon } from '@cafm/ui';
import { can, feature, FEATURES, PLAN_LABELS, planFor, type Plan } from '@cafm/shared';
import { findNavItem } from '@/lib/nav';
import { currentUser } from '@/lib/session';

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  return { title: findNavItem((await params).module)?.label ?? 'Not found' };
}

/**
 * A module's page until the module is built (mockups shell-02 and shell-03).
 * Locked when the plan doesn't include it; hidden from anyone whose role can't use it.
 */
export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const item = findNavItem((await params).module);
  if (!item || item.key === 'home') notFound();
  const user = await currentUser();

  let icon = item.icon;
  let heading: string;
  let text: string;
  let badge: string | null = null;
  if (item.permission && !can(user, item.permission)) {
    icon = 'locked';
    heading = `Your role doesn’t include ${item.label}`;
    text = 'Ask your Super User or an administrator if you need access.';
  } else if (item.feature && !feature(user.entitlements, item.feature)) {
    const plan = planFor(item.feature);
    icon = 'locked';
    heading = plan
      ? `${FEATURES[item.feature].label} is part of the ${PLAN_LABELS[plan]} plan`
      : `${FEATURES[item.feature].label} is an add-on`;
    text = `Your organisation is on ${PLAN_LABELS[user.tenant.plan as Plan] ?? user.tenant.plan}. Ask your Super User about ${plan ? 'upgrading' : 'adding it'} to use it.`;
    badge = plan ? PLAN_LABELS[plan] : 'Add-on';
  } else {
    heading = `Coming in Phase ${item.phase}`;
    text = `${item.summary ?? ''} It’s on the roadmap; this page fills in when it’s ready.`;
    badge = `Phase ${item.phase}`;
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{item.label}</h1>
      </div>
      <div className="card">
        <div className="empty module-empty">
          <span className="ic primary module-empty-icon">
            <Icon name={icon} size={24} />
          </span>
          <h2 className="module-empty-title">{heading}</h2>
          <p className="module-empty-text">{text}</p>
          {badge && <span className="badge outline">{badge}</span>}
        </div>
      </div>
    </div>
  );
}
