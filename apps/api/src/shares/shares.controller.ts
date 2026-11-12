import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { SharePermission } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SharesService } from './shares.service';

let cachedRelease: { version: string; sizeBytes: number; downloadUrl: string; fetchedAt: number } | null = null;

@Controller('shares')
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Get('app-release')
  async getAppRelease() {
    if (cachedRelease && Date.now() - cachedRelease.fetchedAt < 300_000) {
      return cachedRelease;
    }
    try {
      const res = await fetch(
        'https://api.github.com/repos/NoorAbdullah02/open-cloud-vault/releases/latest',
        { headers: { 'User-Agent': 'NoorDrive-API' } },
      );
      if (res.ok) {
        const data: any = await res.json();
        const apk = (data.assets || []).find((a: any) => String(a.name).endsWith('.apk'));
        if (apk) {
          cachedRelease = {
            version: data.tag_name || 'latest',
            sizeBytes: Number(apk.size || 0),
            downloadUrl: apk.browser_download_url,
            fetchedAt: Date.now(),
          };
          return cachedRelease;
        }
      }
    } catch {}
    return {
      version: 'v1.0.7',
      sizeBytes: 24734313,
      downloadUrl:
        'https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest/download/noor-drive.apk',
    };
  }

  // Authenticated Owner Endpoints
  @UseGuards(JwtAuthGuard)
  @Post()
  createShare(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      type: 'file' | 'folder';
      targetId: string;
      permission?: SharePermission;
      expiresInHours?: number;
    },
  ) {
    return this.sharesService.createShare(user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  listShares(
    @CurrentUser() user: AuthUser,
    @Query('type') type?: 'file' | 'folder',
    @Query('targetId') targetId?: string,
  ) {
    return this.sharesService.listShares(user.id, type, targetId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  revokeShare(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sharesService.revokeShare(user.id, id);
  }

  // Public Share Link Endpoints (No Passcode Needed, Scoped to Share Token)
  @Get('public/:token')
  getPublicShare(
    @Param('token') token: string,
    @Query('folderId') folderId?: string,
  ) {
    return this.sharesService.getPublicShare(token, folderId);
  }

  @Get('public/:token/download/:fileId')
  async downloadSharedFile(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    const { file, stream } = await this.sharesService.downloadSharedFile(token, fileId);
    const disposition = inline === 'true' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(file.name)}"`,
    );
    stream.pipe(res);
  }

  @Post('public/:token/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 512 * 1024 * 1024 },
    }),
  )
  uploadToSharedFolder(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string,
  ) {
    return this.sharesService.uploadToSharedFolder(token, file, folderId);
  }
}

