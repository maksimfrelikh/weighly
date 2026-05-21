import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { AppConfiguration } from '../config/app.config';
import type { EmailProvider, SendEmailInput } from './email.provider';

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly appConfig: AppConfiguration;
  private readonly resend: Resend;

  constructor(configService: ConfigService) {
    this.appConfig = configService.getOrThrow<AppConfiguration>('app');
    this.resend = new Resend(this.appConfig.resendApiKey);
  }

  async sendEmail(input: SendEmailInput): Promise<void> {
    const response = await this.resend.emails.send({
      from: this.appConfig.emailFrom,
      to: input.to,
      replyTo: this.appConfig.emailReplyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }
  }
}
