import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { resetConfirmSchema, resetRequestSchema } from '@fmstead/shared';
import { clientInfo } from '../../core/cookies';
import { parse } from '../../core/validation';
import { PasswordResetService, RESET_REQUESTED } from './password-reset.service';

@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Post()
  @HttpCode(202)
  async request(@Body() body: unknown, @Req() req: Request) {
    await this.resets.request(parse(resetRequestSchema, body).identifier, clientInfo(req));
    return { message: RESET_REQUESTED };
  }

  @Get(':token')
  check(@Param('token') token: string) {
    return this.resets.check(token);
  }

  @Post('confirm')
  @HttpCode(204)
  async confirm(@Body() body: unknown, @Req() req: Request): Promise<void> {
    const { token, password } = parse(resetConfirmSchema, body);
    await this.resets.confirm(token, password, clientInfo(req));
  }
}
