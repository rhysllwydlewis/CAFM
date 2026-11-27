import type { Prisma, PrismaClient } from '@prisma/client';
import { addDays, firstOccurrenceOnOrAfter, localDate, weekStart, type PpmCalendarUnit } from '@fmstead/shared';
import { seedId } from './ids';
import { PPM_TIME_ZONE, startingPoint } from './ppm-generator';
import type { Tx } from './index';

type Step = { label: string; kind: 'tick' | 'pass_fail' | 'number' | 'text'; required: boolean; unit?: string };
const step = (label: string, kind: Step['kind'], required = true, unit?: string): Step => ({
  label,
  kind,
  required,
  ...(unit ? { unit } : {}),
});

/**
 * The demo estate's maintenance library and schedules, from the PPM mockups. Dates are counted from the day the demo
 * is seeded, so the planner always has visits coming up. No jobs are raised here: the hourly run (or Generate now)
 * does that, as it would for a real organisation.
 */
export async function seedPpm(db: PrismaClient): Promise<void> {
  const slug = 'demo-estates';
  const tenantId = seedId('tenant:' + slug);
  const technician = seedId('membership:demo-estates:technician');
  const today = localDate(new Date(), PPM_TIME_ZONE);
  const asset = async (name: string) =>
    db.asset.findFirst({ where: { tenantId, name: { contains: name } }, select: { id: true } });

  const templates = [
    {
      key: 'boiler',
      name: 'Boiler annual service and gas safety check',
      description: 'Annual service of a commercial boiler, with the gas safety record.',
      discipline: 'Mechanical',
      criticality: 'statutory',
      durationMinutes: 180,
      skills: 'Gas Safe (commercial)',
      safetyNotes: 'Isolate and make safe before work. Display signage. Check for gas before opening the burner.',
      steps: [
        step('Isolate and make safe; display signage', 'pass_fail'),
        step('Check flue integrity and terminal clearances', 'pass_fail'),
        step('Combustion analysis: CO₂ (%)', 'number', true, '%'),
        step('Inspect and clean burner and heat exchanger', 'pass_fail'),
        step('Check safety devices: flame failure, overheat stat', 'pass_fail'),
        step('Gas tightness test (mbar)', 'number', true, 'mbar'),
        step('Record pressure and expansion vessel charge', 'number', false, 'bar'),
        step('Gas safety record issued', 'tick'),
      ],
    },
    {
      key: 'ahu',
      name: 'AHU filter change',
      description: 'Replace the air handling unit filters and check the fan belts.',
      discipline: 'HVAC',
      criticality: 'optimal',
      durationMinutes: 60,
      skills: 'HVAC technician',
      safetyNotes: 'Isolate the unit and wait for the fans to stop. Wear a dust mask.',
      steps: [
        step('Unit isolated', 'tick'),
        step('Filters replaced', 'tick'),
        step('Fan belt condition', 'pass_fail'),
        step('Pressure drop across the filters (Pa)', 'number', false, 'Pa'),
      ],
    },
    {
      key: 'fire-alarm',
      name: 'Fire alarm weekly test',
      description: 'Weekly test of one manual call point, with the log entry.',
      discipline: 'Fire safety',
      criticality: 'statutory',
      durationMinutes: 30,
      skills: null,
      safetyNotes: 'Tell the occupants before the test and the monitoring centre before the sounders run.',
      steps: [
        step('Call point tested', 'pass_fail'),
        step('Sounders heard in every zone', 'pass_fail'),
        step('Panel reset and log entry made', 'tick'),
      ],
    },
    {
      key: 'lift',
      name: 'Lift thorough examination (LOLER)',
      description: 'Six-monthly thorough examination of a passenger lift.',
      discipline: 'Lifts',
      criticality: 'statutory',
      durationMinutes: 120,
      skills: 'Lift engineer',
      safetyNotes: 'Take the lift out of service and barrier the doors.',
      steps: [step('Report of thorough examination issued', 'tick'), step('Defects found', 'text', false)],
    },
  ] as const;
  for (const template of templates) {
    const id = seedId('ppm-template:demo-estates:' + template.key);
    await db.ppmTaskTemplate.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        name: template.name,
        description: template.description,
        discipline: template.discipline,
        criticality: template.criticality,
        durationMinutes: template.durationMinutes,
        skills: template.skills,
        safetyNotes: template.safetyNotes,
        steps: template.steps as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const [boiler1, boiler2, ahu, panel, lift] = await Promise.all([
    asset('Boiler 1'),
    asset('Boiler 2'),
    asset('AHU-1'),
    asset('Fire alarm panel'),
    asset('Passenger lift 1'),
  ]);
  const firstOfNextMonth = `${addDays(today.slice(0, 8) + '28', 4).slice(0, 8)}01`;
  const monday = addDays(weekStart(today), 7);
  const schedules = [
    {
      key: 'boiler',
      number: 'PPM-0142',
      title: 'Boiler annual service and gas safety check',
      template: 'boiler',
      unit: 'month' as PpmCalendarUnit,
      interval: 12,
      startsOn: firstOfNextMonth,
      leadDays: 28,
      priority: 2,
      cost: 81_000,
      duration: 180,
      assets: [boiler1, boiler2],
    },
    {
      key: 'ahu',
      number: 'PPM-0143',
      title: 'AHU filter change',
      template: 'ahu',
      unit: 'month' as PpmCalendarUnit,
      interval: 3,
      startsOn: addDays(today, 14),
      leadDays: 28,
      priority: 3,
      cost: 18_500,
      duration: 60,
      assets: [ahu],
    },
    {
      key: 'fire-alarm',
      number: 'PPM-0144',
      title: 'Fire alarm weekly test',
      template: 'fire-alarm',
      unit: 'week' as PpmCalendarUnit,
      interval: 1,
      startsOn: monday,
      leadDays: 7,
      priority: 3,
      cost: 0,
      duration: 30,
      assets: [panel],
    },
    {
      key: 'lift',
      number: 'PPM-0145',
      title: 'Lift thorough examination',
      template: 'lift',
      unit: 'month' as PpmCalendarUnit,
      interval: 6,
      startsOn: addDays(today, 45),
      leadDays: 60,
      priority: 3,
      cost: 32_000,
      duration: 120,
      assets: [lift],
    },
  ];
  for (const item of schedules) {
    const id = seedId('ppm-schedule:demo-estates:' + item.key);
    const schedule = await db.ppmSchedule.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        number: item.number,
        title: item.title,
        templateId: seedId('ppm-template:demo-estates:' + item.template),
        discipline: templates.find((t) => t.key === item.template)!.discipline,
        criticality: templates.find((t) => t.key === item.template)!.criticality,
        freqType: 'calendar',
        calendarUnit: item.unit,
        interval: item.interval,
        mode: 'fixed',
        startsOn: new Date(item.startsOn + 'T00:00:00Z'),
        leadDays: item.leadDays,
        durationMinutes: item.duration,
        priority: item.priority,
        assigneeId: technician,
        estimatedCostMinor: item.cost,
      },
    });
    for (const target of item.assets) {
      if (!target) continue;
      const rowId = seedId(`ppm-schedule-asset:demo-estates:${item.key}:${target.id}`);
      await db.ppmScheduleAsset.upsert({
        where: { id: rowId },
        update: {},
        create: {
          id: rowId,
          tenantId,
          scheduleId: schedule.id,
          assetId: target.id,
          nextDueOn: new Date(firstOccurrenceOnOrAfter(item.startsOn, item.unit, item.interval, today) + 'T00:00:00Z'),
        },
      });
    }
  }

  // Boiler 2 has a run-hours meter, so its burner is also serviced every 1,000 hours.
  if (boiler2) {
    const id = seedId('ppm-schedule:demo-estates:burner');
    const row = await db.ppmSchedule.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        number: 'PPM-0146',
        title: 'Boiler burner service every 1,000 run hours',
        templateId: seedId('ppm-template:demo-estates:boiler'),
        discipline: 'Mechanical',
        criticality: 'optimal',
        freqType: 'meter',
        meterName: 'Run hours',
        meterInterval: '1000',
        mode: 'floating',
        startsOn: new Date(today + 'T00:00:00Z'),
        leadDays: 28,
        durationMinutes: 120,
        priority: 3,
        assigneeId: technician,
        estimatedCostMinor: 42_000,
      },
    });
    const rowId = seedId('ppm-schedule-asset:demo-estates:burner:' + boiler2.id);
    if (!(await db.ppmScheduleAsset.findFirst({ where: { id: rowId } }))) {
      const point = await startingPoint(db as unknown as Tx, tenantId, row, boiler2, today, null);
      await db.ppmScheduleAsset.create({
        data: { id: rowId, tenantId, scheduleId: row.id, assetId: boiler2.id, nextDueTotal: point.nextDueTotal },
      });
    }
  }

  // New schedules people add carry on from the seeded numbers.
  await db.$executeRaw`
    INSERT INTO number_sequence (id, tenant_id, key, format, next_value, updated_at)
    VALUES (gen_random_uuid(), ${tenantId}::uuid, 'ppm_schedule', 'PPM-{0000}', 147, now())
    ON CONFLICT (tenant_id, key)
    DO UPDATE SET next_value = GREATEST(number_sequence.next_value, EXCLUDED.next_value)`;
}
