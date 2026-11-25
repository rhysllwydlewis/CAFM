import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { newToken, withTenant, type Prisma } from '@cafm/db';
import { importFileSchema, type ImportBatchRecord, type ImportPreview } from '@cafm/shared';
import { assertNotDelegated } from '../../core/delegation';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { toCsv } from '../../core/csv';
import { appUrl, queueTenantEmail } from '../../core/mail';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { INVITE_TTL_MS } from './invites.controller';
import { peopleTemplate, planPeopleImport, type PeoplePlan } from './people-import';

const SHOWN_ISSUES = 200;

function preview(result: PeoplePlan): ImportPreview {
  return {
    rows: result.rows,
    creates: result.issues.length ? 0 : result.ordered.length,
    issueCount: result.issues.length,
    issues: result.issues.slice(0, SHOWN_ISSUES),
    // The shared preview shape names its columns for locations: code is the email, kind the role.
    sample: result.ordered
      .slice(0, 20)
      .map(({ row, email, roleName }) => ({ row, code: email, name: email, kind: roleName, parentCode: null })),
  };
}

function batchRecord(row: Prisma.ImportBatchGetPayload<object>): ImportBatchRecord {
  return {
    id: row.id,
    entityType: row.entityType,
    fileName: row.fileName,
    status: row.status as ImportBatchRecord['status'],
    rowCount: row.rowCount,
    createdAt: row.createdAt.toISOString(),
    rolledBackAt: row.rolledBackAt?.toISOString() ?? null,
  };
}

/**
 * Imports people as invitations. It needs people.invite across the whole organisation, like the invite form,
 * and every role is checked against what the importer may grant.
 */
@Controller('people')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class PeopleImportController {
  constructor(private readonly db: PrismaService) {}

  @Get('import/template')
  @RequirePermission('people.invite')
  template(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertNotDelegated(req.auth!);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="people-import-template.csv"',
      'Cache-Control': 'no-store',
    });
    return `${peopleTemplate()}\r\n`;
  }

  /** Checks a file and reports every problem without saving or sending anything. `?format=csv` returns the error report. */
  @Post('import/preview')
  @RequirePermission('people.invite')
  async preview(
    @Body() body: unknown,
    @Query('format') format: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { csv } = parse(importFileSchema, body);
    const auth = req.auth!;
    assertNotDelegated(auth);
    const result = await withTenant(this.db, auth.membership!.tenantId, (tx) => planPeopleImport(tx, auth, csv));
    if (format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="people-import-errors.csv"',
        'Cache-Control': 'no-store',
      });
      return toCsv(
        ['line', 'column', 'problem'],
        result.issues.map(({ row, column, message }) => [row, column, message]),
      );
    }
    return preview(result);
  }

  /** All or nothing: a file with any problem sends no invitations. */
  @Post('import')
  @RequirePermission('people.invite')
  async apply(@Body() body: unknown, @Req() req: Request): Promise<ImportBatchRecord> {
    const { csv, fileName } = parse(importFileSchema, body);
    const auth = req.auth!;
    assertNotDelegated(auth);
    const membership = auth.membership!;
    const tenantId = membership.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const result = await planPeopleImport(tx, auth, csv);
      if (result.issues.length) {
        throw new UnprocessableEntityException({
          code: 'import_invalid',
          message: 'Fix the problems in the file and try again. Nothing was imported.',
          issueCount: result.issues.length,
          issues: result.issues.slice(0, SHOWN_ISSUES),
        });
      }
      // A new invitation replaces any earlier pending one to the same address, as on the invite form.
      await tx.invite.updateMany({
        where: { tenantId, email: { in: result.ordered.map((item) => item.email) }, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created: string[] = [];
      for (const item of result.ordered) {
        const { token, tokenHash } = newToken();
        const invite = await tx.invite.create({
          data: {
            tenantId,
            email: item.email,
            role: item.role,
            licence: item.licence,
            tokenHash,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
            invitedByMembershipId: membership.id,
          },
        });
        created.push(invite.id);
        await queueTenantEmail(tx, tenantId, {
          to: item.email,
          subject: `${auth.account.name} invited you to ${membership.tenant.name} on CAFM`,
          text: [
            'Hello,',
            '',
            `${auth.account.name} has invited you to join ${membership.tenant.name} on CAFM as ${item.roleName}.`,
            '',
            `Accept the invitation (the link works for 7 days): ${appUrl()}/accept-invite/${token}`,
          ].join('\n'),
          capture: membership.tenant.demo,
        });
      }
      const batch = await tx.importBatch.create({
        data: {
          tenantId,
          entityType: 'invite',
          fileName: fileName ?? null,
          rowCount: created.length,
          createdIds: created,
          createdBy: membership.id,
        },
      });
      await audit(
        tx,
        auth,
        {
          action: 'people.imported',
          entityType: 'import_batch',
          entityId: batch.id,
          changes: { rows: created.length, fileName: fileName ?? null },
        },
        req.ip,
      );
      return batchRecord(batch);
    });
  }

  @Get('import/batches')
  @RequirePermission('people.invite')
  async batches(@Req() req: Request): Promise<ImportBatchRecord[]> {
    const auth = req.auth!;
    assertNotDelegated(auth);
    return withTenant(this.db, auth.membership!.tenantId, async (tx) =>
      (
        await tx.importBatch.findMany({ where: { entityType: 'invite' }, orderBy: { createdAt: 'desc' }, take: 20 })
      ).map(batchRecord),
    );
  }

  /**
   * Withdraws the invitations an import sent that nobody has used yet. If anyone has accepted, nothing changes.
   * Emails already sent cannot be unsent, but their links stop working.
   */
  @Post('import/:batchId/rollback')
  @RequirePermission('people.invite')
  async rollback(@Param('batchId', ParseUUIDPipe) batchId: string, @Req() req: Request): Promise<ImportBatchRecord> {
    const auth = req.auth!;
    assertNotDelegated(auth);
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const batch = await tx.importBatch.findFirst({ where: { id: batchId, entityType: 'invite' } });
      if (!batch) throw new NotFoundException({ code: 'import_not_found', message: 'Import not found.' });
      if (batch.status !== 'applied')
        throw new ConflictException({ code: 'import_rolled_back', message: 'This import was already rolled back.' });
      const ids = batch.createdIds as string[];
      const accepted = await tx.invite.count({ where: { id: { in: ids }, acceptedAt: { not: null } } });
      if (accepted)
        throw new ConflictException({
          code: 'import_in_use',
          message: 'Some of these people have already accepted their invitation.',
        });
      const revoked = await tx.invite.updateMany({
        where: { id: { in: ids }, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const updated = await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: 'rolled_back', rolledBackAt: new Date(), rolledBackBy: auth.membership!.id },
      });
      await audit(
        tx,
        auth,
        {
          action: 'people.import_rolled_back',
          entityType: 'import_batch',
          entityId: batch.id,
          changes: { rows: revoked.count },
        },
        req.ip,
      );
      return batchRecord(updated);
    });
  }
}
