import { Module } from '@nestjs/common';
import { EMAIL_PROVIDER } from './email.provider';
import { EmailService } from './email.service';
import { ResendEmailProvider } from './resend-email.provider';

@Module({
  providers: [
    EmailService,
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      useExisting: ResendEmailProvider,
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
