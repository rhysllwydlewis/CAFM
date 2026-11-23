import { Module } from '@nestjs/common';
import { AcceptInviteController } from './accept-invite.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimiter, ResetRateLimiter } from './login-rate-limiter';
import { OauthController } from './oauth.controller';
import { OauthService } from './oauth.service';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';

@Module({
  controllers: [AuthController, PasswordResetController, AcceptInviteController, OauthController],
  providers: [AuthService, LoginRateLimiter, ResetRateLimiter, PasswordResetService, OauthService],
})
export class AuthModule {}
