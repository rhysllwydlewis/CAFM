import type { PrismaClient } from '@prisma/client';
import { DEFAULT_SITE_CALENDAR, type LocationDetails, type SiteCalendar } from '@fmstead/shared';
import { seedId } from './ids';

type SeedLocation = readonly [
  code: string,
  name: string,
  kind: string,
  parent: string | null,
  details?: LocationDetails,
  jurisdiction?: SiteCalendar['jurisdiction'],
];
const extraSites = [
  ['BRS', 'Bristol Office', 51.4545, -2.5879, 'england'],
  ['MAN', 'Manchester Warehouse', 53.4808, -2.2426, 'england'],
  ['RVL', 'Riverside Academy', 51.5842, -2.9977, 'wales'],
  ['SFG', 'St Fagans High School', 51.4847, -3.2724, 'wales'],
  ['QST', 'Queen Street Retail Unit', 51.482, -3.174, 'wales'],
  ['CBT', 'Cabot Circus Unit', 51.458, -2.585, 'england'],
  ['PCN', 'Pontcanna Clinic', 51.4881, -3.1961, 'wales'],
  ['NPT', 'Newport Data Centre', 51.588, -2.967, 'wales'],
  ['SWA', 'Swansea Depot', 51.6361, -3.9436, 'wales'],
  ['BUT', 'Bute Residential', 51.4643, -3.1664, 'wales'],
] as const;
const sites: SeedLocation[] = [
  ['EST', 'Demo Estates Ltd', 'portfolio', null],
  ['CYM', 'Wales region', 'region', 'EST'],
  ['ENG', 'England region', 'region', 'EST'],
  [
    'CDF',
    'Cardiff HQ',
    'site',
    'CYM',
    {
      address: '1 Callaghan Square, Cardiff CF10 5BT',
      latitude: 51.4748,
      longitude: -3.1763,
      grossArea: 8420,
      netArea: 6980,
      useClass: 'E(g)(i) Office',
      listed: false,
      contact: 'Hana Patel · 029 2000 1000',
      parking: 'Visitor bays are off the service road.',
      hazards: 'Sign in at reception before entering the plant room.',
    },
    'wales',
  ],
  ['CDF-B1', 'Basement', 'floor', 'CDF', { grossArea: 1120, useClass: 'Plant and parking' }],
  ['CDF-PLANT', 'Plant room B1', 'space', 'CDF-B1'],
  ['CDF-G', 'Ground', 'floor', 'CDF', { grossArea: 1310, useClass: 'Reception and café' }],
  ['CDF-2', 'Level 2', 'floor', 'CDF', { grossArea: 1210, useClass: 'Meeting rooms and kitchen' }],
  ['CDF-K', 'Kitchen K2.01', 'space', 'CDF-2'],
  [
    'LLD',
    'Llandaff Primary School',
    'site',
    'CYM',
    {
      address: 'Llandaff, Cardiff',
      latitude: 51.4953,
      longitude: -3.2187,
      useClass: 'Education',
    },
    'wales',
  ],
  ...extraSites.map(([code, name, latitude, longitude, jurisdiction]): SeedLocation => [
    code,
    name,
    'site',
    jurisdiction === 'wales' ? 'CYM' : 'ENG',
    { latitude, longitude },
    jurisdiction,
  ]),
];
for (const code of ['LLD', ...extraSites.map(([id]) => id)]) {
  sites.push(
    [code + '-BL', 'Main building', 'building', code],
    [code + '-G', 'Ground floor', 'floor', code + '-BL'],
    [code + '-R', 'Reception', 'space', code + '-G'],
  );
}

const locations: Record<string, SeedLocation[]> = {
  'demo-estates': sites,
  'starter-demo': [['ST-WH', 'Starter warehouse', 'site', null, { latitude: 51.74, longitude: -2.22 }, 'england']],
};

export async function seedLocations(db: PrismaClient): Promise<void> {
  for (const [slug, rows] of Object.entries(locations)) {
    const tenantId = seedId(`tenant:${slug}`);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`locations:${tenantId}`}))`;
      for (const [code, name, kind, parent, details, jurisdiction] of rows) {
        const id = seedId(`location:${slug}:${code}`);
        const siteCalendar = jurisdiction
          ? {
              ...DEFAULT_SITE_CALENDAR,
              jurisdiction,
              hours:
                code === 'CDF'
                  ? DEFAULT_SITE_CALENDAR.hours.map((window) => ({
                      ...window,
                      opens: '07:00',
                      closes: '19:00',
                    }))
                  : DEFAULT_SITE_CALENDAR.hours,
            }
          : undefined;
        const existing = await tx.location.findUnique({
          where: { id },
          select: { version: true, siteCalendar: true, details: true },
        });
        if (existing) {
          if (
            existing.version === 1 &&
            ((siteCalendar && !existing.siteCalendar) || (details && !Object.keys(existing.details as object).length))
          ) {
            await tx.location.update({
              where: { id },
              data: {
                details: Object.keys(existing.details as object).length ? undefined : details,
                siteCalendar: existing.siteCalendar ? undefined : siteCalendar,
              },
            });
          }
          continue;
        }
        const parentId = parent ? seedId(`location:${slug}:${parent}`) : null;
        await tx.location.create({ data: { id, tenantId, code, name, kind, parentId, details, siteCalendar } });
        const ancestors = parentId
          ? await tx.locationPath.findMany({
              where: { tenantId, descendantId: parentId },
              select: { ancestorId: true },
            })
          : [];
        await tx.locationPath.createMany({
          data: [...ancestors, { ancestorId: id }].map(({ ancestorId }) => ({
            tenantId,
            ancestorId,
            descendantId: id,
          })),
        });
      }
      if (slug === 'demo-estates') {
        const grant = {
          tenantId,
          membershipId: seedId('membership:demo-estates:technician'),
          locationId: seedId('location:demo-estates:CDF'),
        };
        await tx.membershipSite.upsert({
          where: { tenantId_membershipId_locationId: grant },
          create: grant,
          update: {},
        });
      }
    });
  }
}
