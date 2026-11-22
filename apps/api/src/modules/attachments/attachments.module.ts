import { Module } from '@nestjs/common';
import { AttachmentStore } from './attachment-store';
import { AttachmentsService } from './attachments.service';

@Module({ providers: [AttachmentStore, AttachmentsService], exports: [AttachmentsService] })
export class AttachmentsModule {}
