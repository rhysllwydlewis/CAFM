import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can, feature, localDate } from '@cafm/shared';
import { ppmAssignees, ppmTemplates } from '@/lib/ppm';
import { currentUser } from '@/lib/session';
import { ScheduleForm } from '../../schedule-form';

export const metadata: Metadata = { title: 'New PPM schedule' };

export default async function NewSchedulePage() {
  const user = await currentUser();
  if (!feature(user.entitlements, 'ppm') || !can(user, 'ppm.manage')) redirect('/app/ppm');
  const [templates, assignees] = await Promise.all([ppmTemplates(), ppmAssignees()]);
  return (
    <div className="page stack g4">
      <div className="page-head">
        <div className="stack g2">
          <Link href="/app/ppm">Planned maintenance</Link>
          <h1 className="page-title">New schedule</h1>
          <p className="page-sub">Choose what is done and how often. You add the assets on the next page.</p>
        </div>
      </div>
      <ScheduleForm
        templates={templates}
        assignees={assignees}
        today={localDate(new Date(), 'Europe/London')}
        canSetCost={can(user, 'costs.read')}
      />
    </div>
  );
}
