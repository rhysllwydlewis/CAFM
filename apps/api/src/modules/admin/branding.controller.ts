import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { withTenant } from '@cafm/db';
import {
  logoMatchesType,
  logoUploadSchema,
  MAX_LOGO_BYTES,
  updateBrandingSchema,
  type BrandingView,
} from '@cafm/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

/** The organisation's accent colour, sign-in message, logo and email sender name (doc 02 branding; Enterprise plan). */
@Controller()
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class BrandingController {
  constructor(private readonly db: PrismaService) {}

  private read(tenantId: string): Promise<BrandingView> {
    return withTenant(this.db, tenantId, async (tx) => {
      const row = await tx.tenantBranding.findUnique({ where: { tenantId } });
      return {
        accentColour: row?.accentColour ?? null,
        loginMessage: row?.loginMessage ?? null,
        senderName: row?.senderName ?? null,
        hasLogo: !!row?.logo,
        logoVersion: row?.logo ? row.updatedAt.getTime() : null,
      };
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
      const senderName = input.senderName === undefined ? (before?.senderName ?? null) : input.senderName || null;
      const data = { accentColour: input.accentColour, loginMessage, senderName };
      const saved = await tx.tenantBranding.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      });
      await audit(
        tx,
        auth,
        {
          action: 'settings.branding_updated',
          entityType: 'tenant_branding',
          changes: {
            before: {
              accentColour: before?.accentColour ?? null,
              loginMessage: before?.loginMessage ?? null,
              senderName: before?.senderName ?? null,
            },
            after: data,
          },
        },
        req.ip,
      );
      return {
        ...data,
        hasLogo: !!before?.logo,
        logoVersion: before?.logo ? saved.updatedAt.getTime() : null,
      };
    });
  }

  /** The logo image. Every signed-in member may read it, as it appears in the menu. */
  @Get('branding/logo')
  async logo(@Req() req: Request, @Res() res: Response): Promise<void> {
    const tenantId = req.auth!.membership!.tenantId;
    const row = await withTenant(this.db, tenantId, (tx) => tx.tenantBranding.findUnique({ where: { tenantId } }));
    if (!row?.logo || !row.logoType) throw new NotFoundException('No logo has been uploaded.');
    res
      .status(200)
      .set({
        'Content-Type': row.logoType,
        'Content-Length': String(row.logo.length),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=0, must-revalidate',
        ETag: `"${row.updatedAt.getTime()}"`,
      })
      .end(Buffer.from(row.logo));
  }

  @Put('admin/branding/logo')
  @RequirePermission('settings.manage')
  @RequireFeature('custom_domain')
  async uploadLogo(@Req() req: Request, @Body() body: unknown): Promise<BrandingView> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const input = parse(logoUploadSchema, body);
    const bytes = Buffer.from(input.dataBase64, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES || !logoMatchesType(bytes, input.contentType))
      throw new BadRequestException('Use a PNG, JPEG or WebP image of 64 KB or smaller.');
    await withTenant(this.db, tenantId, async (tx) => {
      const data = { logo: bytes, logoType: input.contentType };
      await tx.tenantBranding.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
      await audit(
        tx,
        auth,
        {
          action: 'settings.branding_logo_updated',
          entityType: 'tenant_branding',
          changes: { after: { logoType: input.contentType, bytes: bytes.length } },
        },
        req.ip,
      );
    });
    return this.read(tenantId);
  }

  @Delete('admin/branding/logo')
  @RequirePermission('settings.manage')
  @RequireFeature('custom_domain')
  async removeLogo(@Req() req: Request): Promise<BrandingView> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    await withTenant(this.db, tenantId, async (tx) => {
      await tx.tenantBranding.updateMany({ where: { tenantId }, data: { logo: null, logoType: null } });
      await audit(
        tx,
        auth,
        { action: 'settings.branding_logo_removed', entityType: 'tenant_branding', changes: {} },
        req.ip,
      );
    });
    return this.read(tenantId);
  }
}
