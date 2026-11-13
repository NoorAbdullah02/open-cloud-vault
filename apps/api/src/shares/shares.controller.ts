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
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as os from 'os';
import { Response, Request } from 'express';
import { SharePermission } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SharesService } from './shares.service';

let cachedRelease: { version: string; sizeBytes: number; downloadUrl: string; fetchedAt: number } | null = null;

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

@Controller('shares')
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Get('app-release')
  async getAppRelease() {
    if (cachedRelease && Date.now() - cachedRelease.fetchedAt < 60_000) {
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
    @Query('folderId') folderId: string | undefined,
    @Req() req: Request,
  ) {
    return this.sharesService.getPublicShare(token, folderId, {
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      userAgent: req.headers['user-agent'],
      referer: (req.headers['referer'] || req.headers['referrer']) as string,
    });
  }

  @Get('public/:token/download/:fileId')
  async downloadSharedFile(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Query('inline') inline: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const { file, stream } = await this.sharesService.downloadSharedFile(token, fileId, {
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      userAgent: req.headers['user-agent'],
      referer: (req.headers['referer'] || req.headers['referrer']) as string,
    });
    const disposition = inline === 'true' ? 'inline' : 'attachment';
    const accurateMime = getAccurateMimeType(file.extension || file.name.split('.').pop() || '', file.mimeType);
    res.setHeader('Content-Type', accurateMime);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(file.name)}"`,
    );
    stream.pipe(res);
  }

  @Post('public/:token/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: os.tmpdir(),
        filename: (req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `noor-shared-upload-${uniqueSuffix}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
        },
      }),
      limits: { fileSize: 100 * 1024 * 1024 * 1024 }, // 100 GB Massive File Limit
    }),
  )
  uploadToSharedFolder(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string,
  ) {
    return this.sharesService.uploadToSharedFolder(token, file, folderId);
  }

  @Get('public/:token/download-zip')
  async downloadSharedFolderZip(
    @Param('token') token: string,
    @Query('folderId') folderId: string | undefined,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    return this.sharesService.streamSharedFolderAsZip(token, folderId, res, {
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      userAgent: req.headers['user-agent'],
      referer: (req.headers['referer'] || req.headers['referrer']) as string,
    });
  }
}

