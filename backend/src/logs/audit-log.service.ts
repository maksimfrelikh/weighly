import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuditLogClient = {
  auditLog: {
    create(args: Prisma.AuditLogCreateArgs): Promise<unknown>;
  };
};

type AuditLogCreateInput = Omit<Prisma.AuditLogUncheckedCreateInput, 'beforeData' | 'afterData' | 'metadata'> & {
  beforeData?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
  afterData?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
  metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
};

const REDACTED = '[REDACTED]';
const SECRET_KEY_PATTERN = /(^|_)(password|sessiontoken|session_token|resettoken|reset_token|invitetoken|invite_token|apitoken|api_token|tokenhash|token_hash|apitokenhash|api_token_hash)($|_)/i;
const SECRET_TEXT_PATTERN = /(password|sessionToken|session_token|resetToken|reset_token|inviteToken|invite_token|apiToken|api_token)\s*[:=]\s*([^\s,;"'}]+)/gi;

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  create(args: Prisma.AuditLogCreateArgs): Promise<unknown>;
  create(client: AuditLogClient, args: Prisma.AuditLogCreateArgs): Promise<unknown>;
  create(clientOrArgs: AuditLogClient | Prisma.AuditLogCreateArgs, maybeArgs?: Prisma.AuditLogCreateArgs): Promise<unknown> {
    const client = maybeArgs ? (clientOrArgs as AuditLogClient) : this.prisma;
    const args = maybeArgs ?? (clientOrArgs as Prisma.AuditLogCreateArgs);

    return client.auditLog.create({
      ...args,
      data: this.redactAuditData(args.data as AuditLogCreateInput),
    });
  }

  redact(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }
    if (typeof value === 'string') {
      return value.replace(SECRET_TEXT_PATTERN, (_match, key) => `${key}=${REDACTED}`);
    }
    if (typeof value !== 'object') {
      return value;
    }

    const redacted: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
      redacted[key] = this.isSecretKey(key) ? REDACTED : this.redact(childValue);
    }
    return redacted;
  }

  private redactAuditData(data: AuditLogCreateInput): Prisma.AuditLogUncheckedCreateInput {
    return {
      ...data,
      beforeData: this.redactJsonField(data.beforeData),
      afterData: this.redactJsonField(data.afterData),
      metadata: this.redactJsonField(data.metadata),
    };
  }

  private redactJsonField(value: AuditLogCreateInput['metadata']): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null || value === Prisma.JsonNull || value === Prisma.DbNull) {
      return Prisma.JsonNull;
    }
    return this.redact(value) as Prisma.InputJsonValue;
  }

  private isSecretKey(key: string): boolean {
    return SECRET_KEY_PATTERN.test(key.replace(/[^a-z0-9_]/gi, '_'));
  }
}
