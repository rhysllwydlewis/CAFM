import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { DEMO_PASSWORD, DEMO_PERSONAS, loginRequestSchema, selectOrganisationSchema } from '@cafm/shared';
import { SessionGuard } from '../../core/auth.guards';
import { SESSION_COOKIE } from '../../core/session';
import { AuthService, type ClientInfo, type SessionIssued } from './auth.service';

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error.issues.map((i) => i.message));
  return result.data;
}

function client(req: Request): ClientInfo {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function setSessionCookie(res: Response, s: SessionIssued): void {
  res.cookie(SESSION_COOKIE, s.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Without "Keep me signed in" the cookie ends with the browser; the server still expires it after 12 hours.
    ...(s.persistent ? { expires: s.expiresAt } : {}),
  });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { response, session } = await this.auth.login(parse(loginRequestSchema, body), client(req));
    setSessionCookie(res, session);
    return response;
  }

  @Post('select-organisation')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async selectOrganisation(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { membershipId } = parse(selectOrganisationSchema, body);
    const { response, session } = await this.auth.selectOrganisation(req.auth!, membershipId, client(req));
    setSessionCookie(res, session);
    return response;
  }

  @Get('organisations')
  @UseGuards(SessionGuard)
  organisations(@Req() req: Request) {
    return this.auth.listOrganisations(req.auth!.account.id);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.auth!, client(req));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: Request) {
    const user = this.auth.currentUser(req.auth!);
    if (!user) throw new ForbiddenException({ code: 'organisation_required' });
    return user;
  }

  /** Demo credentials for the login page. Only exists when DEMO_MODE=true (doc 06, risk R11). */
  @Get('demo-accounts')
  demoAccounts() {
    if (process.env.DEMO_MODE !== 'true') throw new NotFoundException();
    return {
      password: DEMO_PASSWORD,
      personas: DEMO_PERSONAS.map(({ key, name, email, roleLabel, description, group, featured }) => ({
        key,
        name,
        email,
        roleLabel,
        description,
        group,
        featured,
      })),
    };
  }
}
