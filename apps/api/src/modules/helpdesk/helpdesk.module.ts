import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { RequestAttachmentsController } from './request-attachments.controller';
import { RequestsController } from './requests.controller';
import { HelpdeskSettingsController } from './helpdesk-settings.controller';
import { InboundMailController } from './inbound-mail.controller';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [AttachmentsModule],
  controllers: [
    RequestsController,
    HelpdeskSettingsController,
    InboundMailController,
    NotificationsController,
    RequestAttachmentsController,
  ],
})
export class HelpdeskModule {}
