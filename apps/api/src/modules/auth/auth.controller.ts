import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  DEMO_PASSWORD,
  DEMO_PERSONAS,
  loginRequestSchema,
  selectOrganisationSchema,
  updatePreferencesSchema,
} from '@fmstead/shared';
import { assertNotDemoLocked } from '../../core/access-rules';
import { SessionGuard } from '../../core/auth.guards';
import { parse } from '../../core/validation';
import { clientInfo as client, cookieOptions, sessionToken, setMfaCookie, setSessionCookie } from '../../core/cookies';
import { SESSION_COOKIE } from '../../core/session';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { response, session, challenge } = await this.auth.login(
      parse(loginRequestSchema, body),
      client(req),
      sessionToken(req),
    );
    if (session) setSessionCookie(res, session);
    if (challenge) setMfaCookie(res, challenge);
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

  /** Always succeeds and clears the cookie, even if the session has already expired. */
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(sessionToken(req), client(req));
    res.clearCookie(SESSION_COOKIE, cookieOptions());
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: Request) {
    const user = this.auth.currentUser(req.auth!);
    if (!user) throw new ForbiddenException({ code: 'organisation_required' });
    return user;
  }

  /**
   * Saves the signed-in person's own display choices. Only ever their own account, so it needs a session but no
   * permission. "View as" is refused by the session guard, so it can't change the viewed person's choices, and the
   * shared demo personas can't save any, so one visitor's choices never reach the next.
   */
  @Patch('preferences')
  @UseGuards(SessionGuard)
  updatePreferences(@Req() req: Request, @Body() body: unknown) {
    assertNotDemoLocked(req.auth!.account.isDemo);
    return this.auth.updatePreferences(req.auth!.account.id, parse(updatePreferencesSchema, body));
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
