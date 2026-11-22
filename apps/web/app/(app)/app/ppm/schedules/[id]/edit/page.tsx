import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { can, feature, localDate } from '@cafm/shared';
import { ppmAssignees, ppmSchedule, ppmTemplates } from '@/lib/ppm';
import { currentUser } from '@/lib/session';
import { ScheduleForm } from '../../../schedule-form';

export const metadata: Metadata = { title: 'Edit PPM schedule' };

export default async function EditSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!feature(user.entitlements, 'ppm') || !can(user, 'ppm.manage')) redirect('/app/ppm');
  const { id } = await params;
  const [schedule, templates, assignees] = await Promise.all([ppmSchedule(id), ppmTemplates(), ppmAssignees()]);
  if (!schedule) notFound();
  return (
    <div className="page stack g4">
      <div className="page-head">
        <div className="stack g2">
          <Link href={`/app/ppm/schedules/${schedule.id}`}>{schedule.number}</Link>
          <h1 className="page-title">Edit {schedule.title}</h1>
          <p className="page-sub">
            Changing how often, from when, or fixed against floating works each asset’s next visit out again. Jobs
            already raised are left alone.
          </p>
        </div>
      </div>
      <ScheduleForm
        schedule={schedule}
        templates={templates}
        assignees={assignees}
        today={localDate(new Date(), 'Europe/London')}
        canSetCost={can(user, 'costs.read')}
      />
    </div>
  );
}
