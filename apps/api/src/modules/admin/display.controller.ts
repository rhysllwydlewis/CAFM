import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Tx } from '@cafm/db';
import {
  MODULES,
  TERMS,
  feature,
  updateModulesSchema,
  updateTermsSchema,
  type DisplaySettings,
  type ModuleSettingView,
  type TermView,
} from '@cafm/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

async function readDisplay(tx: Tx, tenantId: string): Promise<DisplaySettings> {
  const [modules, terms] = await Promise.all([
    tx.moduleSetting.findMany({ where: { tenantId } }),
    tx.termOverride.findMany({ where: { tenantId } }),
  ]);
  return {
    modules: modules.map((m) => ({ key: m.moduleKey, enabled: m.enabled, label: m.label, position: m.position })),
    terms: terms.map((t) => ({ key: t.termKey, singular: t.singular, plural: t.plural })),
  };
}

/** Which modules are on, their own names and order, and the organisation's own words (doc 03 § Admin). */
@Controller()
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class DisplayController {
  constructor(private readonly db: PrismaService) {}

  /** What the menu needs. Every signed-in member may read it: it holds choices only, no plan or role details. */
  @Get('display')
  async display(@Req() req: Request): Promise<DisplaySettings> {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, (tx) => readDisplay(tx, tenantId));
  }

  @Get('admin/modules')
  @RequirePermission('settings.manage')
  async modules(@Req() req: Request): Promise<ModuleSettingView[]> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const display = await withTenant(this.db, tenantId, (tx) => readDisplay(tx, tenantId));
    return MODULES.map((m) => {
      const own = display.modules.find((d) => d.key === m.key);
      return {
        key: m.key,
        standardLabel: m.label,
        feature: m.feature ?? null,
        inPlan: !m.feature || feature(auth.access!.entitlements, m.feature),
        enabled: own?.enabled ?? true,
        label: own?.label ?? null,
        position: own?.position ?? null,
      };
    });
  }

  /** Saves the choice for every module listed. A module set to its standard state has its row removed. */
  @Put('admin/modules')
  @RequirePermission('settings.manage')
  async saveModules(@Req() req: Request, @Body() body: unknown): Promise<DisplaySettings> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const input = parse(updateModulesSchema, body);
    return withTenant(this.db, tenantId, async (tx) => {
      const before = await readDisplay(tx, tenantId);
      for (const m of input.modules) {
        const standard = m.enabled && m.label === null && m.position === null;
        if (standard) {
          await tx.moduleSetting.deleteMany({ where: { tenantId, moduleKey: m.key } });
        } else {
          const data = { enabled: m.enabled, label: m.label, position: m.position };
          await tx.moduleSetting.upsert({
            where: { tenantId_moduleKey: { tenantId, moduleKey: m.key } },
            create: { tenantId, moduleKey: m.key, ...data },
            update: data,
          });
        }
      }
      const after = await readDisplay(tx, tenantId);
      await audit(
        tx,
        auth,
        {
          action: 'settings.modules_updated',
          entityType: 'module_setting',
          changes: { before: before.modules, after: after.modules },
        },
        req.ip,
      );
      return after;
    });
  }

  @Get('admin/terminology')
  @RequirePermission('settings.manage')
  async terminology(@Req() req: Request): Promise<TermView[]> {
    const tenantId = req.auth!.membership!.tenantId;
    const display = await withTenant(this.db, tenantId, (tx) => readDisplay(tx, tenantId));
    return TERMS.map((t) => {
      const own = display.terms.find((d) => d.key === t.key);
      return { ...t, custom: own ? { singular: own.singular, plural: own.plural } : null };
    });
  }

  /** Saves the words listed. `custom: null` puts the standard words back. */
  @Put('admin/terminology')
  @RequirePermission('settings.manage')
  async saveTerminology(@Req() req: Request, @Body() body: unknown): Promise<DisplaySettings> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const input = parse(updateTermsSchema, body);
    return withTenant(this.db, tenantId, async (tx) => {
      const before = await readDisplay(tx, tenantId);
      for (const t of input.terms) {
        if (t.custom === null) {
          await tx.termOverride.deleteMany({ where: { tenantId, termKey: t.key } });
        } else {
          await tx.termOverride.upsert({
            where: { tenantId_termKey: { tenantId, termKey: t.key } },
            create: { tenantId, termKey: t.key, ...t.custom },
            update: t.custom,
          });
        }
      }
      const after = await readDisplay(tx, tenantId);
      await audit(
        tx,
        auth,
        {
          action: 'settings.terminology_updated',
          entityType: 'term_override',
          changes: { before: before.terms, after: after.terms },
        },
        req.ip,
      );
      return after;
    });
  }
}
