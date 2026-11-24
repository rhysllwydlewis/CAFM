import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant } from '@cafm/db';
import { updateBrandingSchema, type BrandingView } from '@cafm/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

/** The organisation's accent colour and sign-in message (doc 02 branding; Enterprise plan). */
@Controller()
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class BrandingController {
  constructor(private readonly db: PrismaService) {}

  private read(tenantId: string): Promise<BrandingView> {
    return withTenant(this.db, tenantId, async (tx) => {
      const row = await tx.tenantBranding.findUnique({ where: { tenantId } });
      return { accentColour: row?.accentColour ?? null, loginMessage: row?.loginMessage ?? null };
    });
  }

  /** What the app shell needs. Every signed-in member may read it: it holds choices only. */
  @Get('branding')
  branding(@Req() req: Request): Promise<BrandingView> {
    return this.read(req.auth!.membership!.tenantId);
  }

  @Get('admin/branding')
  @RequirePermission('settings.manage')
  @RequireFeature('custom_domain')
  adminBranding(@Req() req: Request): Promise<BrandingView> {
    return this.read(req.auth!.membership!.tenantId);
  }

  @Put('admin/branding')
  @RequirePermission('settings.manage')
  @RequireFeature('custom_domain')
  async save(@Req() req: Request, @Body() body: unknown): Promise<BrandingView> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const input = parse(updateBrandingSchema, body);
    const loginMessage = input.loginMessage || null;
    return withTenant(this.db, tenantId, async (tx) => {
      const before = await tx.tenantBranding.findUnique({ where: { tenantId } });
      const data = { accentColour: input.accentColour, loginMessage };
      await tx.tenantBranding.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
      await audit(
        tx,
        auth,
        {
          action: 'settings.branding_updated',
          entityType: 'tenant_branding',
          changes: {
            before: { accentColour: before?.accentColour ?? null, loginMessage: before?.loginMessage ?? null },
            after: data,
          },
        },
        req.ip,
      );
      return data;
    });
  }
}
