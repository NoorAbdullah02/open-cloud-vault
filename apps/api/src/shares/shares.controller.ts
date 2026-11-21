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

let cachedRelease: any = null;

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
    const defaultTag = 'v1.0.69';
    const baseReleaseUrl = 'https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest/download';
    let version = defaultTag;
    let apkAsset: any = null;
    let windowsAsset: any = null;
    let windowsPortableAsset: any = null;
    let macAsset: any = null;
    let macZipAsset: any = null;
    let linuxAsset: any = null;
    let linuxTarAsset: any = null;

    try {
      const res = await fetch(
        'https://api.github.com/repos/NoorAbdullah02/open-cloud-vault/releases/latest',
        { headers: { 'User-Agent': 'NoorDrive-API' } },
      );
      if (res.ok) {
        const latestRel: any = await res.json();
        if (latestRel) {
          version = latestRel.tag_name || defaultTag;
          const assets = latestRel.assets || [];
          apkAsset = assets.find((a: any) => String(a.name).endsWith('.apk'));
          windowsAsset = assets.find((a: any) => String(a.name).endsWith('.exe'));
          windowsPortableAsset = assets.find((a: any) => String(a.name).includes('Portable') || (String(a.name).endsWith('.zip') && String(a.name).includes('Windows')));
          macAsset = assets.find((a: any) => String(a.name).endsWith('.dmg'));
          macZipAsset = assets.find((a: any) => String(a.name).includes('macOS') && String(a.name).endsWith('.zip'));
          linuxAsset = assets.find((a: any) => String(a.name).endsWith('.deb'));
          linuxTarAsset = assets.find((a: any) => String(a.name).endsWith('.tar.gz') && String(a.name).includes('linux'));
        }
      }
    } catch {}

    const apkUrl = `${baseReleaseUrl}/noor-drive.apk`;
    const windowsUrl = `${baseReleaseUrl}/NoorDrive-Setup.exe`;
    const windowsPortableUrl = `${baseReleaseUrl}/NoorDrive-Windows-Portable.zip`;
    const macUrl = `${baseReleaseUrl}/NoorDrive.dmg`;
    const macZipUrl = `${baseReleaseUrl}/NoorDrive-macOS.zip`;
    const linuxUrl = `${baseReleaseUrl}/noor-drive-linux.deb`;
    const linuxTarUrl = `${baseReleaseUrl}/noor-drive-linux.tar.gz`;

    const publicBase = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://drive.noor.is-a.dev';
    const webdavUrl = `${publicBase.replace(/\/$/, '')}/api/webdav`;

    cachedRelease = {
      version,
      sizeBytes: Number(apkAsset?.size || 32165505),
      downloadUrl: apkUrl,
      platforms: {
        apk: apkUrl,
        windows: windowsUrl,
        windowsPortable: windowsPortableUrl,
        mac: macUrl,
        macZip: macZipUrl,
        linux: linuxUrl,
        linuxTar: linuxTarUrl,
        android: {
          name: 'noor-drive.apk',
          url: apkUrl,
          sizeBytes: Number(apkAsset?.size || 32165505),
        },
        windowsData: {
          name: windowsAsset?.name || 'NoorDrive-Setup.exe',
          url: windowsUrl,
          sizeBytes: Number(windowsAsset?.size || 15724741),
          portableUrl: windowsPortableUrl,
        },
        macData: {
          name: macAsset?.name || 'NoorDrive.dmg',
          url: macUrl,
          sizeBytes: Number(macAsset?.size || 28296659),
          zipUrl: macZipUrl,
        },
        linuxData: {
          name: linuxAsset?.name || 'noor-drive-linux.deb',
          url: linuxUrl,
          sizeBytes: Number(linuxAsset?.size || 12804532),
          tarUrl: linuxTarUrl,
        },
      },
      webdavUrl,
      fetchedAt: Date.now(),
    };

    return cachedRelease;
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
    const meta = {
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      userAgent: req.headers['user-agent'],
      referer: (req.headers['referer'] || req.headers['referrer']) as string,
    };
    const rangeHeader = req.headers.range;
    let parsedRange: { start: number; end: number } | undefined;
    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : undefined;
      if (!isNaN(start)) {
        parsedRange = { start, end: end !== undefined && !isNaN(end) ? end : -1 };
      }
    }

    const file = await this.sharesService.getSharedFileRecord(token, fileId, meta, parsedRange);
    const totalSize = Number(file.sizeBytes);
    const disposition = inline === 'true' ? 'inline' : 'attachment';
    const accurateMime = getAccurateMimeType(file.extension || file.name.split('.').pop() || '', file.mimeType);
    const safeAscii = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    res.setHeader('Content-Type', accurateMime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );

    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (isNaN(start) || start >= totalSize || (parts[1] && (isNaN(end) || end < start || end >= totalSize))) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        res.status(416).end();
        return;
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', chunkSize.toString());
      if (inline === 'true') {
        res.setHeader('Cache-Control', 'private, max-age=3600');
      }

      const rangeStream = await this.sharesService.getSharedFileStream(file.storageObjectId, { start, end });
      req.on('close', () => {
        if (!res.writableEnded) {
          (rangeStream as any).destroy?.();
        }
      });
      rangeStream.pipe(res);
      return;
    }

    res.setHeader('Content-Length', totalSize.toString());
    if (inline === 'true') {
      res.setHeader('Cache-Control', 'private, max-age=3600');
    }
    const fullStream = await this.sharesService.getSharedFileStream(file.storageObjectId);
    req.on('close', () => {
      if (!res.writableEnded) {
        (fullStream as any).destroy?.();
      }
    });
    fullStream.pipe(res);
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

