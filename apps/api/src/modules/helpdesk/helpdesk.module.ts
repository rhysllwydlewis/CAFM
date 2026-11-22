import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { HelpdeskSettingsController } from './helpdesk-settings.controller';
import { InboundMailController } from './inbound-mail.controller';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [RequestsController, HelpdeskSettingsController, InboundMailController, NotificationsController],
})
export class HelpdeskModule {}
