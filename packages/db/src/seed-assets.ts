import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { AssetAttribute } from '@cafm/shared';
import { seedId } from './ids';

type Attribute = Pick<AssetAttribute, 'key' | 'label' | 'type'> &
  Partial<Pick<AssetAttribute, 'unit' | 'options' | 'min' | 'max'>>;
type SeedClass = readonly [code: string, name: string, group: string, attributes: Attribute[]];

const options = (...values: string[]) => values.map((value) => ({ value, label: value }));

/**
 * The demo classification. The scheme is "custom": codes in the standard
 * schemes (Uniclass, NRM, SFG20) belong to the tenant to add or import, so the
 * demo doesn't claim codes it can't vouch for.
 */
const classes: SeedClass[] = [
  [
    'BOILER',
    'Boilers',
    'Heating & hot water',
    [
      { key: 'output_kw', label: 'Output', type: 'number', unit: 'kW', min: 0 },
      { key: 'fuel', label: 'Fuel', type: 'picklist', options: options('Natural gas', 'Oil', 'Electric', 'Biomass') },
      { key: 'gas_appliance', label: 'Gas appliance', type: 'checkbox' },
    ],
  ],
  ['PUMP', 'Pumps', 'Heating & hot water', [{ key: 'power_kw', label: 'Motor power', type: 'number', unit: 'kW' }]],
  [
    'AHU',
    'Air handling units',
    'Ventilation & AC',
    [
      { key: 'airflow', label: 'Airflow', type: 'number', unit: 'm³/h', min: 0 },
      { key: 'filter_grade', label: 'Filter grade', type: 'text' },
    ],
  ],
  [
    'CHILLER',
    'Chillers',
    'Ventilation & AC',
    [
      { key: 'cooling_kw', label: 'Cooling capacity', type: 'number', unit: 'kW', min: 0 },
      {
        key: 'refrigerant',
        label: 'Refrigerant',
        type: 'picklist',
        options: options('R32', 'R410A', 'R134a', 'R407C'),
      },
      { key: 'refrigerant_kg', label: 'Refrigerant charge', type: 'number', unit: 'kg', min: 0 },
    ],
  ],
  [
    'DB',
    'Distribution boards',
    'Electrical',
    [
      { key: 'ways', label: 'Ways', type: 'number', min: 1 },
      { key: 'rating_a', label: 'Rating', type: 'number', unit: 'A', min: 0 },
    ],
  ],
  ['UPS', 'UPS', 'Electrical', [{ key: 'capacity_kva', label: 'Capacity', type: 'number', unit: 'kVA', min: 0 }]],
  [
    'FIRE-PANEL',
    'Fire alarm panels',
    'Fire & life safety',
    [
      { key: 'zones', label: 'Zones', type: 'number', min: 1 },
      {
        key: 'category',
        label: 'Category',
        type: 'picklist',
        options: options('L1', 'L2', 'L3', 'L4', 'L5', 'P1', 'P2'),
      },
    ],
  ],
  [
    'LIFT',
    'Passenger lifts',
    'Lifts & hoists',
    [
      { key: 'capacity_kg', label: 'Capacity', type: 'number', unit: 'kg', min: 0 },
      { key: 'floors', label: 'Floors served', type: 'number', min: 2 },
    ],
  ],
  [
    'TANK',
    'Water storage',
    'Plumbing & water',
    [{ key: 'capacity_l', label: 'Capacity', type: 'number', unit: 'L', min: 0 }],
  ],
  ['ACCESS', 'Access control', 'Security & access', [{ key: 'readers', label: 'Readers', type: 'number', min: 0 }]],
  [
    'COLD',
    'Refrigeration',
    'Catering',
    [{ key: 'set_temp_c', label: 'Set temperature', type: 'number', unit: '°C', min: -40, max: 20 }],
  ],
  ['NETWORK', 'Network equipment', 'IT & AV', []],
  ['DOOR', 'Doors and shutters', 'Fabric & FF&E', []],
];

type SeedAsset = {
  key: string;
  name: string;
  location: string;
  parent?: string;
  class?: string;
  status?: string;
  make?: string;
  model?: string;
  serial?: string;
  installedOn?: string;
  supplier?: string;
  lifeYears?: number;
  costMinor?: number;
  criticality?: string;
  condition?: string;
  attributes?: Record<string, unknown>;
  /** What it serves: locations by code and other assets by key. */
  serves?: { locations?: string[]; assets?: string[] };
};

/** Cardiff HQ's plant, from the asset register mockups. Costs are in pence. */
const demoEstates: SeedAsset[] = [
  {
    key: 'lthw',
    name: 'LTHW heating system',
    location: 'CDF-PLANT',
    criticality: 'high',
    condition: 'B',
    serves: { locations: ['CDF-G', 'CDF-2'], assets: ['ahu-1'] },
  },
  {
    key: 'boiler-1',
    name: 'Boiler 1',
    location: 'CDF-PLANT',
    parent: 'lthw',
    class: 'BOILER',
    make: 'Hamworthy',
    model: 'Wessex ModuMax 254',
    serial: 'HW-2014-883101',
    installedOn: '2014-03-14',
    supplier: 'Heatcare Wales',
    lifeYears: 20,
    costMinor: 1_850_000,
    criticality: 'high',
    condition: 'B',
    attributes: { output_kw: 254, fuel: 'Natural gas', gas_appliance: true },
  },
  {
    key: 'boiler-2',
    name: 'Boiler 2',
    location: 'CDF-PLANT',
    parent: 'lthw',
    class: 'BOILER',
    make: 'Hamworthy',
    model: 'Wessex ModuMax 254',
    serial: 'HW-2014-883102',
    installedOn: '2014-03-14',
    supplier: 'Heatcare Wales',
    lifeYears: 20,
    costMinor: 1_850_000,
    criticality: 'high',
    condition: 'B',
    attributes: { output_kw: 254, fuel: 'Natural gas', gas_appliance: true },
  },
  {
    key: 'booster',
    name: 'Booster pump set',
    location: 'CDF-PLANT',
    class: 'PUMP',
    make: 'Grundfos',
    model: 'Hydro MPC',
    installedOn: '2009-06-01',
    lifeYears: 15,
    costMinor: 640_000,
    criticality: 'high',
    condition: 'D',
    attributes: { power_kw: 7.5 },
  },
  {
    key: 'ahu-1',
    name: 'AHU-1',
    location: 'CDF',
    class: 'AHU',
    make: 'Swegon',
    model: 'Gold RX 40',
    installedOn: '2016-09-20',
    lifeYears: 20,
    costMinor: 4_200_000,
    criticality: 'high',
    condition: 'C',
    attributes: { airflow: 14000, filter_grade: 'F7' },
    serves: { locations: ['CDF-2', 'CDF-K'] },
  },
  {
    key: 'fire-panel',
    name: 'Fire alarm panel',
    location: 'CDF-G',
    class: 'FIRE-PANEL',
    make: 'Advanced',
    model: 'MxPro 5',
    installedOn: '2021-02-08',
    lifeYears: 15,
    costMinor: 1_150_000,
    criticality: 'critical',
    condition: 'A',
    attributes: { zones: 24, category: 'L1' },
  },
  {
    key: 'lift-1',
    name: 'Passenger lift 1',
    location: 'CDF-G',
    class: 'LIFT',
    make: 'Otis',
    model: 'Gen2 Comfort',
    installedOn: '2015-11-02',
    lifeYears: 25,
    costMinor: 5_800_000,
    criticality: 'high',
    condition: 'B',
    attributes: { capacity_kg: 1000, floors: 3 },
  },
  {
    key: 'ups-a',
    name: 'UPS-A',
    location: 'CDF-B1',
    class: 'UPS',
    make: 'Schneider',
    model: 'Galaxy VX 500kVA',
    installedOn: '2022-05-17',
    lifeYears: 12,
    costMinor: 9_600_000,
    criticality: 'critical',
    condition: 'A',
    attributes: { capacity_kva: 500 },
  },
  {
    key: 'db-2',
    name: 'Distribution board DB-2',
    location: 'CDF-2',
    class: 'DB',
    make: 'Schneider',
    model: 'Prisma P',
    installedOn: '2016-01-12',
    lifeYears: 30,
    costMinor: 185_000,
    criticality: 'medium',
    condition: 'B',
    attributes: { ways: 24, rating_a: 160 },
  },
  {
    key: 'freezer-3',
    name: 'Freezer 3',
    location: 'CDF-K',
    class: 'COLD',
    status: 'alarm',
    make: 'Foster',
    model: 'EP1440L',
    installedOn: '2018-04-23',
    lifeYears: 12,
    costMinor: 320_000,
    criticality: 'medium',
    condition: 'B',
    attributes: { set_temp_c: -18 },
  },
];

const assets: Record<string, SeedAsset[]> = {
  'demo-estates': demoEstates,
  'starter-demo': [
    {
      key: 'dock-leveller',
      name: 'Dock leveller 1',
      location: 'ST-WH',
      make: 'Hörmann',
      model: 'HLS 2',
      criticality: 'medium',
      condition: 'B',
    },
  ],
};

/**
 * A stable ID that sorts in reference order, so the register lists the demo
 * assets as AST-00001, AST-00002 and so on. The first eight digits are the
 * position; the rest comes from a hash, so IDs differ between organisations.
 */
function assetSeedId(slug: string, key: string, index: number): string {
  const hashed = seedId(`asset:${slug}:${key}`);
  return `${(index + 1).toString(16).padStart(8, '0')}${hashed.slice(8)}`;
}

/** Sample record for the demo boiler. Reset removes its records with the asset. */
async function seedBoilerRecords(tx: Prisma.TransactionClient, tenantId: string, assetId: string) {
  await tx.assetTag.createMany({
    data: (
      [
        ['qr', 'BOILER-2'],
        ['barcode', 'CDF-00003'],
        ['nfc', 'BOILER-2-NFC'],
      ] as const
    ).map(([kind, code]) => ({
      id: seedId('asset-tag:demo-estates:' + kind),
      tenantId,
      assetId,
      kind,
      code,
    })),
    skipDuplicates: true,
  });
  const meterId = seedId('asset-meter:demo-estates:boiler-2');
  const meter = await tx.assetMeter.upsert({
    where: { id: meterId },
    create: { id: meterId, tenantId, assetId, name: 'Run hours', unit: 'h', rolloverAt: '1000' },
    update: {},
  });
  if (!(await tx.assetMeterReading.count({ where: { tenantId, meterId: meter.id } }))) {
    await tx.assetMeterReading.createMany({
      data: [
        {
          tenantId,
          meterId,
          submission: seedId('boiler-baseline'),
          recordedAt: new Date('2026-11-18T09:00Z'),
          value: '992.3',
          total: '992.3',
          rolledOver: false,
        },
        {
          tenantId,
          meterId,
          submission: seedId('boiler-rollover'),
          recordedAt: new Date('2026-11-20T09:00Z'),
          value: '14.2',
          total: '1014.2',
          rolledOver: true,
        },
      ],
    });
  }
  const warrantyId = seedId('warranty:demo-estates:boiler-2');
  await tx.assetWarranty.upsert({
    where: { id: warrantyId },
    create: {
      id: warrantyId,
      tenantId,
      assetId,
      provider: 'Heatcare Wales',
      reference: 'WTY-BOILER-2',
      startsOn: new Date('2025-12-14T00:00Z'),
      expiresOn: new Date('2027-12-14T00:00Z'),
      noticeDays: 30,
    },
    update: {},
  });
  await tx.warrantyClaim.createMany({
    data: {
      id: seedId('warranty-claim:demo-estates:boiler-2'),
      tenantId,
      warrantyId,
      reference: 'HW-942',
      status: 'accepted',
      filedOn: new Date('2026-09-01T00:00Z'),
    },
    skipDuplicates: true,
  });

  const id = seedId('asset-attachment:demo-estates:boiler-2');
  if (!(await tx.recordAttachment.findUnique({ where: { id } }))) {
    const contents = 'BT /F1 14 Tf 72 720 Td (FM Stead demo - Boiler 2 maintenance record) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${contents.length} >>\nstream\n${contents}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((object, index) => {
      const offset = String(pdf.length).padStart(10, '0');
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
      return offset + ' 00000 n \n';
    });
    const start = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    const data = Buffer.from(pdf, 'ascii');
    await tx.recordAttachment.create({
      data: {
        id,
        tenantId,
        assetId,
        filename: 'Boiler 2 maintenance record.pdf',
        mediaType: 'application/pdf',
        byteLength: data.length,
        checksum: createHash('sha256').update(data).digest('hex'),
        storage: { create: { data } },
      },
    });
  }
}

const pad = (n: number) => `AST-${String(n).padStart(5, '0')}`;

/** Classes and assets for the demo tenants. Safe to run again: existing rows are left as people edited them. */
export async function seedAssets(db: PrismaClient): Promise<void> {
  for (const [slug, rows] of Object.entries(assets)) {
    const tenantId = seedId(`tenant:${slug}`);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assets:${tenantId}`}))`;
      for (const [position, [code, name, group, attributes]] of classes.entries()) {
        const id = seedId(`asset-class:${slug}:${code}`);
        await tx.assetClass.upsert({
          where: { id },
          create: { id, tenantId, scheme: 'custom', code, name, group, attributes, position },
          update: {},
        });
      }
      for (const [index, asset] of rows.entries()) {
        const id = assetSeedId(slug, asset.key, index);
        if (await tx.asset.findUnique({ where: { id }, select: { id: true } })) continue;
        await tx.asset.create({
          data: {
            id,
            tenantId,
            number: pad(index + 1),
            name: asset.name,
            locationId: seedId(`location:${slug}:${asset.location}`),
            parentId: asset.parent
              ? assetSeedId(
                  slug,
                  asset.parent,
                  rows.findIndex((r) => r.key === asset.parent),
                )
              : null,
            classId: asset.class ? seedId(`asset-class:${slug}:${asset.class}`) : null,
            status: asset.status ?? 'in_service',
            make: asset.make,
            model: asset.model,
            serial: asset.serial,
            installedOn: asset.installedOn ? new Date(`${asset.installedOn}T00:00:00Z`) : null,
            supplier: asset.supplier,
            expectedLifeYears: asset.lifeYears,
            replacementCostMinor: asset.costMinor,
            criticality: asset.criticality ?? 'medium',
            condition: asset.condition,
            attributes: (asset.attributes ?? {}) as Prisma.InputJsonObject,
          },
        });
      }
      const serving = rows.flatMap((asset, index) => [
        ...(asset.serves?.locations ?? []).map((code) => ({
          tenantId,
          assetId: assetSeedId(slug, asset.key, index),
          locationId: seedId(`location:${slug}:${code}`),
        })),
        ...(asset.serves?.assets ?? []).map((key) => ({
          tenantId,
          assetId: assetSeedId(slug, asset.key, index),
          servedAssetId: assetSeedId(
            slug,
            key,
            rows.findIndex((row) => row.key === key),
          ),
        })),
      ]);
      await tx.assetServes.createMany({ data: serving, skipDuplicates: true });
      if (slug === 'demo-estates') {
        await seedBoilerRecords(
          tx,
          tenantId,
          assetSeedId(
            slug,
            'boiler-2',
            rows.findIndex(({ key }) => key === 'boiler-2'),
          ),
        );
      }
      // New assets people add carry on from the seeded numbers.
      await tx.$executeRaw`
        INSERT INTO number_sequence (id, tenant_id, key, format, next_value, updated_at)
        VALUES (gen_random_uuid(), ${tenantId}::uuid, 'asset', 'AST-{00000}', ${rows.length + 1}, now())
        ON CONFLICT (tenant_id, key)
        DO UPDATE SET next_value = GREATEST(number_sequence.next_value, EXCLUDED.next_value)`;
    });
  }
}
