import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as os from 'os';
import { Response } from 'express';
import { StorageBackend } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { DriveService } from './drive.service';

function getAccurateMimeType(ext: string, fallbackMime?: string): string {
  const cleanExt = (ext || '').toLowerCase().replace(/^\./, '');
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    txt: 'text/plain; charset=utf-8',
    log: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    json: 'application/json; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    ts: 'text/plain; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    py: 'text/plain; charset=utf-8',
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
  };
  if (mimeMap[cleanExt]) return mimeMap[cleanExt];
  if (fallbackMime && fallbackMime !== 'application/octet-stream') return fallbackMime;
  return 'application/octet-stream';
}

@UseGuards(JwtAuthGuard)
@Controller('drive')
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('folderId') folderId?: string,
    @Query('view') view?: any,
    @Query('search') search?: string,
    @Query('filterType') filterType?: any,
    @Query('sizeMin') sizeMin?: string,
    @Query('dateFilter') dateFilter?: any,
  ) {
    return this.driveService.listDrive(user.id, {
      folderId,
      view,
      search,
      filterType,
      sizeMin,
      dateFilter,
    });
  }

  @Post('folders')
  createFolder(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string; parentId?: string },
  ) {
    return this.driveService.createFolder(user.id, body.name, body.parentId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: os.tmpdir(),
        filename: (req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `noor-upload-${uniqueSuffix}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
        },
      }),
      limits: {
        fileSize: 100 * 1024 * 1024 * 1024, // 100 GB Massive File Limit
      },
    }),
  )
  uploadFile(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string,
    @Body('backend') backend?: StorageBackend,
  ) {
    return this.driveService.uploadFile(user.id, file, folderId, backend);
  }

  @Get('files/:id/download')
  async downloadFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    const { file, stream } = await this.driveService.getFileForDownload(user.id, id);
    const disposition = inline === 'true' ? 'inline' : 'attachment';
    const accurateMime = getAccurateMimeType(file.extension || file.name.split('.').pop() || '', file.mimeType);
    res.setHeader('Content-Type', accurateMime);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(file.name)}"`,
    );
    if (inline === 'true') {
      res.setHeader('Cache-Control', 'private, max-age=3600');
    }
    stream.pipe(res);
  }

  @Get('storage/duplicates')
  getDuplicates(@CurrentUser() user: AuthUser) {
    return this.driveService.getDuplicates(user.id);
  }

  @Get('storage/large-files')
  getLargeFiles(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: number,
  ) {
    return this.driveService.getLargeFiles(user.id, limit);
  }

  @Get('folders/:id/download')
  async downloadFolderZip(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.driveService.streamFolderAsZip(user.id, id, res);
  }

  @Patch(':type/:id/star')
  toggleStar(
    @CurrentUser() user: AuthUser,
    @Param('type') type: 'file' | 'folder',
    @Param('id') id: string,
  ) {
    return this.driveService.toggleStar(user.id, type, id);
  }

  @Patch(':type/:id/rename')
  renameItem(
    @CurrentUser() user: AuthUser,
    @Param('type') type: 'file' | 'folder',
    @Param('id') id: string,
    @Body('name') name: string,
  ) {
    return this.driveService.renameItem(user.id, type, id, name);
  }

  @Patch(':type/:id/move')
  moveItem(
    @CurrentUser() user: AuthUser,
    @Param('type') type: 'file' | 'folder',
    @Param('id') id: string,
    @Body('parentId') parentId: string | null,
  ) {
    return this.driveService.moveItem(user.id, type, id, parentId ?? null);
  }

  @Patch(':type/:id/trash')
  trashItem(
    @CurrentUser() user: AuthUser,
    @Param('type') type: 'file' | 'folder',
    @Param('id') id: string,
  ) {
    return this.driveService.trashItem(user.id, type, id);
  }

  @Patch(':type/:id/restore')
  restoreItem(
    @CurrentUser() user: AuthUser,
    @Param('type') type: 'file' | 'folder',
    @Param('id') id: string,
  ) {
    return this.driveService.restoreItem(user.id, type, id);
  }

  @Delete('files/:id')
  permanentlyDeleteFile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.driveService.permanentlyDeleteFile(user.id, id);
  }

  @Delete('folders/:id')
  permanentlyDeleteFolder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.driveService.permanentlyDeleteFolder(user.id, id);
  }

  @Get('files/:id/versions')
  getFileVersions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.driveService.getFileVersions(user.id, id);
  }

  @Post('files/:id/versions/:versionNumber/restore')
  restoreFileVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('versionNumber') versionNumber: string,
  ) {
    return this.driveService.restoreFileVersion(user.id, id, parseInt(versionNumber, 10));
  }

  @Post('vault/move-in')
  moveToVault(
    @CurrentUser() user: AuthUser,
    @Body('type') type: 'file' | 'folder',
    @Body('id') id: string,
  ) {
    return this.driveService.moveToVault(user.id, type, id);
  }

  @Post('vault/move-out')
  moveFromVault(
    @CurrentUser() user: AuthUser,
    @Body('type') type: 'file' | 'folder',
    @Body('id') id: string,
  ) {
    return this.driveService.moveFromVault(user.id, type, id);
  }

  @Delete('trash/purge-expired')
  purgeExpiredTrash(@CurrentUser() user: AuthUser) {
    return this.driveService.purgeExpiredTrash(user.id);
  }

  @Delete('trash/empty')
  emptyTrash(@CurrentUser() user: AuthUser) {
    return this.driveService.emptyTrash(user.id);
  }

  @Post('bulk')
  bulkAction(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      action: 'trash' | 'restore' | 'delete' | 'move';
      items: { type: 'file' | 'folder'; id: string }[];
      targetFolderId?: string | null;
    },
  ) {
    return this.driveService.bulkAction(
      user.id,
      body.action,
      body.items || [],
      body.targetFolderId ?? null,
    );
  }

  @Get('storage/providers')
  getStorageProviders() {
    return this.driveService.getStorageProviders();
  }

  @Patch('storage/preferences')
  updateStoragePreferences(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      preferredStorageBackend: StorageBackend;
      telegramConsentGiven?: boolean;
      telegramChatTarget?: string;
    },
  ) {
    return this.driveService.updateStoragePreferences(user.id, body);
  }
}

