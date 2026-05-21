import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EmailModule } from '../email/email.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { CsrfService } from './csrf.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RolesGuard } from './roles.guard';
import { SessionGuard } from './session.guard';
import { StoreAccessGuard } from './store-access.guard';

@Module({
  imports: [EmailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    CsrfService,
    RateLimitService,
    SessionGuard,
    RolesGuard,
    StoreAccessGuard,
    CsrfGuard,
    RateLimitGuard,
    {
      provide: APP_GUARD,
      useExisting: CsrfGuard,
    },
  ],
  exports: [AuthService, CsrfService, RateLimitService, SessionGuard, RolesGuard, StoreAccessGuard, CsrfGuard, RateLimitGuard],
})
export class AuthModule {}
