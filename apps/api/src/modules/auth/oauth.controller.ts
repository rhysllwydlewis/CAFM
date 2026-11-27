import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { oauthAuthorizeSchema, oauthRevokeSchema, oauthTokenSchema } from '@fmstead/shared';
import { SessionGuard, TenantGuard } from '../../core/auth.guards';
import { clientInfo } from '../../core/cookies';
import { parse } from '../../core/validation';
import { OauthService } from './oauth.service';

/** Sign-in for the mobile PWA by OAuth 2.0 + PKCE (P1-06a). Guide: docs/mobile.md. */
@Controller('oauth')
export class OauthController {
  constructor(private readonly oauth: OauthService) {}

  /** Approves a device for the person signed in at this browser. Returns a one-use code. */
  @Post('authorize')
  @HttpCode(200)
  @UseGuards(SessionGuard, TenantGuard)
  authorize(@Body() body: unknown, @Req() req: Request) {
    return this.oauth.authorize(req.auth!, parse(oauthAuthorizeSchema, body));
  }

  @Post('token')
  @HttpCode(200)
  token(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.set('Cache-Control', 'no-store');
    return this.oauth.token(parse(oauthTokenSchema, body), clientInfo(req));
  }

  @Post('revoke')
  @HttpCode(200)
  async revoke(@Body() body: unknown): Promise<Record<string, never>> {
    await this.oauth.revoke(parse(oauthRevokeSchema, body).token);
    return {};
  }

  @Get('devices')
  @UseGuards(SessionGuard, TenantGuard)
  devices(@Req() req: Request) {
    return this.oauth.listDevices(req.auth!);
  }

  @Delete('devices/:id')
  @HttpCode(204)
  @UseGuards(SessionGuard, TenantGuard)
  async removeDevice(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    await this.oauth.removeDevice(req.auth!, id);
  }
}
