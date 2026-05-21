import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { STORE_ACCESS_METADATA, StoreAccessRequirement } from './store-access.decorator';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class StoreAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<StoreAccessRequirement>(STORE_ACCESS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Требуется авторизация');
    }

    const storeId = this.getStoreId(request, requirement);
    if (!storeId) {
      throw new ForbiddenException('Нет доступа к магазину');
    }

    const hasAccess = await this.authService.canAccessStore(user.id, user.role, storeId);
    if (!hasAccess) {
      throw new ForbiddenException('Нет доступа к магазину');
    }

    return true;
  }

  private getStoreId(request: AuthenticatedRequest, requirement: StoreAccessRequirement): string | undefined {
    const source = request[requirement.source];
    const value = source?.[requirement.field];

    if (Array.isArray(value)) {
      return typeof value[0] === 'string' ? value[0] : undefined;
    }

    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
