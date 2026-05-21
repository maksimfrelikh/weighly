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
    super('Email delivery failed');
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
      subject: 'Scale Admin invitation',
      text: [
        'You have been invited to Scale Admin.',
        '',
        `Accept the invitation: ${inviteUrl}`,
        `This invitation expires at ${input.expiresAt.toISOString()}.`,
        '',
        'If you did not expect this invitation, ignore this email.',
      ].join('\n'),
      html: [
        '<p>You have been invited to Scale Admin.</p>',
        `<p><a href="${escapeHtml(inviteUrl)}">Accept the invitation</a></p>`,
        `<p>This invitation expires at ${escapeHtml(input.expiresAt.toISOString())}.</p>`,
        '<p>If you did not expect this invitation, ignore this email.</p>',
      ].join(''),
    });
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
    const resetUrl = this.buildFrontendUrl('/reset-password', input.token);
    await this.send({
      to: input.to,
      subject: 'Scale Admin password reset',
      text: [
        'A password reset was requested for your Scale Admin account.',
        '',
        `Reset your password: ${resetUrl}`,
        `This password reset link expires at ${input.expiresAt.toISOString()}.`,
        '',
        'If you did not request this reset, ignore this email.',
      ].join('\n'),
      html: [
        '<p>A password reset was requested for your Scale Admin account.</p>',
        `<p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>`,
        `<p>This password reset link expires at ${escapeHtml(input.expiresAt.toISOString())}.</p>`,
        '<p>If you did not request this reset, ignore this email.</p>',
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
