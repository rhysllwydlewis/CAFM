import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { type Upload, uploadOptions } from '../attachments/attachment-file';
import { AttachmentsService } from '../attachments/attachments.service';

@Controller('helpdesk')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('helpdesk')
export class RequestAttachmentsController {
  constructor(private readonly files: AttachmentsService) {}

  @Get('mine/:id/attachments')
  @RequirePermission('requests.create')
  listMine(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.list(req, { type: 'ownRequest', id });
  }

  @Put('mine/:id/attachments')
  @RequirePermission('requests.create')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadMine(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Upload) {
    return this.files.upload(req, { type: 'ownRequest', id }, file);
  }

  @Get('mine/:id/attachments/:fileId')
  @RequirePermission('requests.create')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  downloadMine(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.files.download(req, { type: 'ownRequest', id }, fileId);
  }

  @Get('requests/:id/attachments')
  @RequirePermission('requests.read')
  listStaff(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.list(req, { type: 'staffRequest', id });
  }

  @Get('requests/:id/attachments/:fileId')
  @RequirePermission('requests.read')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  downloadStaff(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.files.download(req, { type: 'staffRequest', id }, fileId);
  }
}
