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
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { StorageBackend } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { DriveService } from './drive.service';

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
  ) {
    return this.driveService.listDrive(user.id, { folderId, view, search });
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
      storage: memoryStorage(),
      limits: {
        fileSize: 512 * 1024 * 1024, // 512 MB in-memory stream limit
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
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(file.name)}"`,
    );
    if (inline === 'true') {
      res.setHeader('Cache-Control', 'private, max-age=3600');
    }
    stream.pipe(res);
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

  @Delete('trash/empty')
  emptyTrash(@CurrentUser() user: AuthUser) {
    return this.driveService.emptyTrash(user.id);
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

