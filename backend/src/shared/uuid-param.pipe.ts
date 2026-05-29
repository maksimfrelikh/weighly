import { BadRequestException, Injectable, ParseUUIDPipe } from '@nestjs/common';
import { I18nContext, I18nService } from 'nestjs-i18n';

// Shared ParseUUIDPipe instance for UUID path params (:storeId, :userId,
// :productId, :catalogVersionId, :bannerId, :id and friends). Prevents
// Prisma value-parsing errors against `@db.Uuid` columns from falling
// through to Nest's default exception filter as English 500 "Internal
// server error" (BUG-REG-071) and likewise blocks bogus-UUID input from
// reaching service code that would otherwise raise a Prisma error
// (BUG-REG-069 family). All schema IDs are v4 (`@default(uuid())`).
@Injectable()
export class RussianParseUUIDPipe extends ParseUUIDPipe {
  // Plain field + assignment (no constructor parameter property) so the
  // file parses under `node --test --experimental-strip-types`, which the
  // CI uses to run *.spec.ts directly without a TS transform step.
  private readonly i18n: I18nService;
  constructor(i18n: I18nService) {
    super({ version: '4' });
    this.i18n = i18n;
    this.exceptionFactory = () => {
      // ParseUUIDPipe's exceptionFactory has no DI hook; read the request lang via I18nContext when available, else force RU for callers outside the request lifecycle.
      const ctx = I18nContext.current();
      return new BadRequestException(
        ctx ? ctx.t('errors.common.invalidId') : this.i18n.t('errors.common.invalidId', { lang: 'ru' }),
      );
    };
  }
}
