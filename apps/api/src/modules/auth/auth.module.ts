import { Module } from '@nestjs/common';
import { AcceptInviteController } from './accept-invite.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimiter, ResetRateLimiter } from './login-rate-limiter';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';

@Module({
  controllers: [AuthController, PasswordResetController, AcceptInviteController],
  providers: [AuthService, LoginRateLimiter, ResetRateLimiter, PasswordResetService],
})
export class AuthModule {}
