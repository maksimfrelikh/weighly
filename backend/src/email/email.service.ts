import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../config/app.config';
import { EMAIL_PROVIDER, EmailProvider } from './email.provider';

export type InviteEmailInput = {
  to: string;
  token: string;
  expiresAt: Date;
};

export type PasswordResetEmailInput = {
  to: string;
  token: string;
  expiresAt: Date;
};

export class EmailDeliveryError extends Error {
  constructor() {
    super('Не удалось отправить письмо');
    this.name = 'EmailDeliveryError';
  }
}

@Injectable()
export class EmailService {
  private readonly appConfig: AppConfiguration;

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    configService: ConfigService,
  ) {
    this.appConfig = configService.getOrThrow<AppConfiguration>('app');
  }

  async sendInviteEmail(input: InviteEmailInput): Promise<void> {
    const inviteUrl = this.buildFrontendUrl('/accept-invite', input.token);
    await this.send({
      to: input.to,
      subject: 'Приглашение в Администратор весов',
      text: [
        'Вас пригласили в Администратор весов.',
        '',
        `Принять приглашение: ${inviteUrl}`,
        `Ссылка действует до ${input.expiresAt.toISOString()}.`,
        '',
        'Если вы не ожидали это приглашение, просто проигнорируйте письмо.',
      ].join('\n'),
      html: [
        '<p>Вас пригласили в Администратор весов.</p>',
        `<p><a href="${escapeHtml(inviteUrl)}">Принять приглашение</a></p>`,
        `<p>Ссылка действует до ${escapeHtml(input.expiresAt.toISOString())}.</p>`,
        '<p>Если вы не ожидали это приглашение, просто проигнорируйте письмо.</p>',
      ].join(''),
    });
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
    const resetUrl = this.buildFrontendUrl('/reset-password', input.token);
    await this.send({
      to: input.to,
      subject: 'Сброс пароля в Администратор весов',
      text: [
        'Для вашей учётной записи в Администратор весов запрошен сброс пароля.',
        '',
        `Сбросить пароль: ${resetUrl}`,
        `Ссылка действует до ${input.expiresAt.toISOString()}.`,
        '',
        'Если вы не запрашивали сброс пароля, просто проигнорируйте письмо.',
      ].join('\n'),
      html: [
        '<p>Для вашей учётной записи в Администратор весов запрошен сброс пароля.</p>',
        `<p><a href="${escapeHtml(resetUrl)}">Сбросить пароль</a></p>`,
        `<p>Ссылка действует до ${escapeHtml(input.expiresAt.toISOString())}.</p>`,
        '<p>Если вы не запрашивали сброс пароля, просто проигнорируйте письмо.</p>',
      ].join(''),
    });
  }

  private buildFrontendUrl(pathname: string, token: string): string {
    const url = new URL(pathname, this.appConfig.frontendOrigin);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async send(input: Parameters<EmailProvider['sendEmail']>[0]): Promise<void> {
    try {
      await this.provider.sendEmail(input);
    } catch {
      throw new EmailDeliveryError();
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
