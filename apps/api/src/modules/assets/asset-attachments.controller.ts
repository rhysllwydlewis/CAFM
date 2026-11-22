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

@Controller('assets/:assetId/attachments')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('assets')
export class AssetAttachmentsController {
  constructor(private readonly files: AttachmentsService) {}

  @Get()
  @RequirePermission('assets.read')
  list(@Req() req: Request, @Param('assetId', ParseUUIDPipe) id: string) {
    return this.files.list(req, { type: 'asset', id });
  }

  @Put()
  @RequirePermission('assets.manage')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(@Req() req: Request, @Param('assetId', ParseUUIDPipe) id: string, @UploadedFile() file?: Upload) {
    return this.files.upload(req, { type: 'asset', id }, file);
  }

  @Get(':fileId')
  @RequirePermission('assets.read')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  download(
    @Req() req: Request,
    @Param('assetId', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.files.download(req, { type: 'asset', id }, fileId);
  }
}
