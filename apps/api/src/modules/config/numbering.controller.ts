import { Body, Controller, Get, Param, Put, Req, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DEFAULT_SEQUENCES, formatNumber, validateFormat } from '@fmstead/config-engine';
import { withTenant } from '@fmstead/db';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { recordVersion } from '../../core/config';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

/** Numbering formats for records such as work orders (doc 02 § 0). */
@Controller('config/numbering')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class NumberingController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('settings.manage')
  async list(@Req() req: Request) {
    const tenantId = req.auth!.membership!.tenantId;
    const rows = await withTenant(this.db, tenantId, (tx) => tx.numberSequence.findMany({ where: { tenantId } }));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.entries(DEFAULT_SEQUENCES).map(([key, format]) => {
      const row = byKey.get(key);
      const f = row?.format ?? format;
      return {
        key,
        format: f,
        nextValue: row?.nextValue ?? 1,
        example: formatNumber(f, row?.nextValue ?? 1, new Date(), { SITE: 'CDF' }),
      };
    });
  }

  @Put(':key')
  @RequirePermission('settings.manage')
  async setFormat(@Param('key') key: string, @Body() body: unknown, @Req() req: Request) {
    if (!Object.hasOwn(DEFAULT_SEQUENCES, key)) throw new UnprocessableEntityException({ code: 'unknown_sequence' });
    const { format } = parse(z.object({ format: z.string().trim() }), body);
    const problem = validateFormat(format);
    if (problem) throw new UnprocessableEntityException({ code: 'invalid_format', message: problem });
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const before = await tx.numberSequence.findUnique({ where: { tenantId_key: { tenantId, key } } });
      const row = await tx.numberSequence.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, format },
        update: { format },
      });
      const version = await recordVersion(tx, auth, 'number_sequence', row.id, { key, format });
      await audit(
        tx,
        auth,
        {
          action: 'numbering.updated',
          entityType: 'number_sequence',
          entityId: row.id,
          changes: { before: { format: before?.format ?? DEFAULT_SEQUENCES[key] }, after: { format }, version },
        },
        req.ip,
      );
      return { key, format, nextValue: row.nextValue };
    });
  }
}
