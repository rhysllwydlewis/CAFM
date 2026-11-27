import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { mfaConfirmSchema, mfaPasswordSchema, mfaVerifySchema } from '@fmstead/shared';
import { assertNotDemoLocked } from '../../core/access-rules';
import { SessionGuard } from '../../core/auth.guards';
import {
  clientInfo as client,
  MFA_COOKIE,
  cookieOptions,
  mfaChallengeToken,
  sessionToken,
  setSessionCookie,
} from '../../core/cookies';
import { parse } from '../../core/validation';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';

/** The second step of sign-in is public (it has a challenge cookie); everything else is the signed-in person's own. */
@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly auth: AuthService,
  ) {}

  @Post('verify')
  @HttpCode(200)
  async verify(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { response, session } = await this.auth.verifyMfa(
      mfaChallengeToken(req),
      parse(mfaVerifySchema, body),
      client(req),
      sessionToken(req),
    );
    res.clearCookie(MFA_COOKIE, cookieOptions());
    setSessionCookie(res, session);
    return response;
  }

  @Get()
  @UseGuards(SessionGuard)
  status(@Req() req: Request) {
    return this.mfa.status(req.auth!.account.id);
  }

  @Post('enrol')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  enrol(@Req() req: Request) {
    assertNotDemoLocked(req.auth!.account.isDemo);
    return this.mfa.startEnrolment(req.auth!.account);
  }

  @Post('confirm')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async confirm(@Body() body: unknown, @Req() req: Request) {
    assertNotDemoLocked(req.auth!.account.isDemo);
    const { code } = parse(mfaConfirmSchema, body);
    return { recoveryCodes: await this.mfa.confirmEnrolment(req.auth!.account, code, client(req)) };
  }

  @Post('recovery-codes')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async regenerate(@Body() body: unknown, @Req() req: Request) {
    assertNotDemoLocked(req.auth!.account.isDemo);
    const { password } = parse(mfaPasswordSchema, body);
    return { recoveryCodes: await this.mfa.regenerateRecoveryCodes(req.auth!.account, password, client(req)) };
  }

  @Post('disable')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async disable(@Body() body: unknown, @Req() req: Request): Promise<void> {
    assertNotDemoLocked(req.auth!.account.isDemo);
    const { password } = parse(mfaPasswordSchema, body);
    await this.mfa.disable(req.auth!.account, password, client(req));
  }
}
