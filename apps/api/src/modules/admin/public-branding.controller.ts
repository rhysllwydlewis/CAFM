import { Controller, Get, Param } from '@nestjs/common';
import { withTenant } from '@fmstead/db';
import { resolveEntitlements, type PublicSignInMessage } from '@fmstead/shared';
import { PrismaService } from '../../core/prisma.service';

/**
 * The sign-in message an organisation chose to show on its own sign-in page (doc 02 branding).
 * Needs no session, so it must not reveal which organisations exist: an unknown organisation, a suspended
 * one, one without the branding feature and one with no message all answer the same `{ message: null }`.
 */
@Controller('public')
export class PublicBrandingController {
  constructor(private readonly db: PrismaService) {}

  @Get('sign-in-message/:slug')
  async signInMessage(@Param('slug') slug: string): Promise<PublicSignInMessage> {
    const none: PublicSignInMessage = { message: null };
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return none;
    const tenant = await this.db.tenant.findUnique({ where: { slug } });
    if (!tenant || tenant.status !== 'active') return none;
    return withTenant(this.db, tenant.id, async (tx) => {
      const current = await tx.tenant.findFirst({
        where: { id: tenant.id, status: 'active' },
        select: { plan: true, entitlements: true },
      });
      if (!current || !resolveEntitlements(current.plan, current.entitlements).features.includes('custom_domain'))
        return none;
      const row = await tx.tenantBranding.findUnique({ where: { tenantId: tenant.id } });
      return { message: row?.loginMessage || null };
    });
  }
}
