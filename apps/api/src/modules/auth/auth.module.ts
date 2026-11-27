import { Module } from '@nestjs/common';
import { AcceptInviteController } from './accept-invite.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimiter, ResetRateLimiter } from './login-rate-limiter';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { OauthController } from './oauth.controller';
import { OauthService } from './oauth.service';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';

@Module({
  controllers: [AuthController, PasswordResetController, AcceptInviteController, OauthController, MfaController],
  providers: [AuthService, LoginRateLimiter, ResetRateLimiter, PasswordResetService, OauthService, MfaService],
})
export class AuthModule {}
