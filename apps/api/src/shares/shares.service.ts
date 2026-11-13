import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { SharePermission, StorageBackend } from '@prisma/client';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as archiver from 'archiver';
import { Response } from 'express';
import { MailService } from '../mail/mail.service';

@Injectable()
export class SharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async createShare(
    ownerId: string,
    dto: {
      type: 'file' | 'folder';
      targetId: string;
      permission?: SharePermission;
      expiresInHours?: number;
    },
  ) {
    if (dto.type === 'file') {
      const file = await this.prisma.file.findUnique({ where: { id: dto.targetId } });
      if (!file || file.ownerId !== ownerId) throw new NotFoundException('File not found');
    } else {
      const folder = await this.prisma.folder.findUnique({ where: { id: dto.targetId } });
      if (!folder || folder.ownerId !== ownerId) throw new NotFoundException('Folder not found');
    }

    const shareToken = crypto.randomBytes(24).toString('base64url');
    let expiresAt: Date | null = null;
    if (dto.expiresInHours && dto.expiresInHours > 0) {
      expiresAt = new Date(Date.now() + dto.expiresInHours * 3600 * 1000);
    }

    const share = await this.prisma.share.create({
      data: {
        ownerId,
        fileId: dto.type === 'file' ? dto.targetId : null,
        folderId: dto.type === 'folder' ? dto.targetId : null,
        permission: dto.permission || SharePermission.VIEWER,
        shareToken,
        expiresAt,
      },
      include: {
        file: { select: { id: true, name: true, sizeBytes: true, mimeType: true } },
        folder: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      actorId: ownerId,
      action: 'SHARE_CREATE',
      targetType: dto.type === 'file' ? 'File' : 'Folder',
      targetId: dto.targetId,
      metadata: { permission: share.permission },
    });

    return share;
  }

  async listShares(ownerId: string, targetType?: 'file' | 'folder', targetId?: string) {
    const where: any = { ownerId, isRevoked: false };
    if (targetType === 'file' && targetId) where.fileId = targetId;
    if (targetType === 'folder' && targetId) where.folderId = targetId;

    return this.prisma.share.findMany({
      where,
      include: {
        file: { select: { id: true, name: true, sizeBytes: true, mimeType: true } },
        folder: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeShare(ownerId: string, shareId: string) {
    const share = await this.prisma.share.findUnique({ where: { id: shareId } });
    if (!share || share.ownerId !== ownerId) throw new NotFoundException('Share not found');

    await this.prisma.share.update({
      where: { id: shareId },
      data: { isRevoked: true },
    });

    return { revoked: true };
  }

  private async validateShareToken(token: string) {
    const share = await this.prisma.share.findUnique({
      where: { shareToken: token },
      include: {
        file: { include: { storageObject: true } },
        folder: true,
      },
    });

    if (!share || share.isRevoked) {
      throw new NotFoundException('This share link is invalid or has been revoked');
    }
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new ForbiddenException('This share link has expired');
    }
    return share;
  }

  private async isFolderDescendant(rootFolderId: string, candidateFolderId: string): Promise<boolean> {
    if (rootFolderId === candidateFolderId) return true;
    let currentId: string | null = candidateFolderId;
    while (currentId) {
      if (currentId === rootFolderId) return true;
      const folder = await this.prisma.folder.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      if (!folder) return false;
      currentId = folder.parentId;
    }
    return false;
  }

  async getPublicShare(
    token: string,
    subFolderId?: string,
    meta?: { ipAddress?: string; userAgent?: string; referer?: string },
  ) {
    const share = await this.validateShareToken(token);

    await this.prisma.share.update({
      where: { id: share.id },
      data: { accessCount: { increment: 1 } },
    });

    const itemName = share.file ? share.file.name : share.folder ? share.folder.name : 'Shared Item';
    const itemType = share.file ? 'file' : 'folder';
    const itemSize = share.file ? `${(Number(share.file.sizeBytes) / (1024 * 1024)).toFixed(2)} MB` : undefined;

    // Send email alert to admin with all visitor information
    this.mail.sendShareAccessAlert({
      itemType,
      itemName,
      itemSize,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      referer: meta?.referer,
      action: 'VIEW',
    });

    if (share.file) {
      if (share.file.isTrash) throw new NotFoundException('File is no longer available');
      return {
        type: 'file',
        permission: share.permission,
        file: {
          id: share.file.id,
          name: share.file.name,
          mimeType: share.file.mimeType,
          sizeBytes: share.file.sizeBytes.toString(),
          extension: share.file.extension,
        },
      };
    }

    if (share.folder) {
      const targetFolderId = subFolderId || share.folder.id;
      const allowed = await this.isFolderDescendant(share.folder.id, targetFolderId);
      if (!allowed) {
        throw new ForbiddenException('Access denied outside shared folder');
      }

      const [currentFolder, subFolders, files] = await Promise.all([
        this.prisma.folder.findUnique({ where: { id: targetFolderId } }),
        this.prisma.folder.findMany({
          where: { parentId: targetFolderId, isTrash: false },
          orderBy: { name: 'asc' },
        }),
        this.prisma.file.findMany({
          where: { folderId: targetFolderId, isTrash: false },
          orderBy: { updatedAt: 'desc' },
        }),
      ]);

      return {
        type: 'folder',
        permission: share.permission,
        rootFolderId: share.folder.id,
        folder: currentFolder,
        subFolders,
        files: files.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes.toString(),
          extension: f.extension,
        })),
      };
    }

    throw new NotFoundException('Shared resource not found');
  }

  async downloadSharedFile(
    token: string,
    fileId: string,
    meta?: { ipAddress?: string; userAgent?: string; referer?: string },
  ) {
    const share = await this.validateShareToken(token);

    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { storageObject: true },
    });
    if (!file || file.isTrash) throw new NotFoundException('File not found');

    if (share.fileId) {
      if (share.fileId !== fileId) throw new ForbiddenException('Access denied');
    } else if (share.folderId) {
      if (!file.folderId) throw new ForbiddenException('Access denied');
      const allowed = await this.isFolderDescendant(share.folderId, file.folderId);
      if (!allowed) throw new ForbiddenException('Access denied');
    } else {
      throw new ForbiddenException('Access denied');
    }

    // Send email alert to admin that this shared file was downloaded
    this.mail.sendShareAccessAlert({
      itemType: 'file',
      itemName: file.name,
      itemSize: `${(Number(file.sizeBytes) / (1024 * 1024)).toFixed(2)} MB`,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      referer: meta?.referer,
      action: 'DOWNLOAD',
    });

    const stream = await this.storage.readFileStream(file.storageObjectId);
    return { file, stream };
  }

  private computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async uploadToSharedFolder(
    token: string,
    file: Express.Multer.File,
    subFolderId?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const share = await this.validateShareToken(token);

    if (share.permission !== SharePermission.EDITOR || !share.folderId) {
      if (file.path) await fs.promises.unlink(file.path).catch(() => {});
      throw new ForbiddenException('This share link does not allow uploading');
    }

    const targetFolderId = subFolderId || share.folderId;
    const allowed = await this.isFolderDescendant(share.folderId, targetFolderId);
    if (!allowed) {
      if (file.path) await fs.promises.unlink(file.path).catch(() => {});
      throw new ForbiddenException('Target folder is outside the shared folder');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: share.ownerId },
      include: { quota: true },
    });
    if (!owner) {
      if (file.path) await fs.promises.unlink(file.path).catch(() => {});
      throw new NotFoundException('Owner not found');
    }

    if (owner.quota && owner.quota.storageQuotaBytes > BigInt(0)) {
      const projected = owner.quota.usedStorageBytes + BigInt(file.size);
      if (projected > owner.quota.storageQuotaBytes) {
        if (file.path) await fs.promises.unlink(file.path).catch(() => {});
        throw new BadRequestException('Owner storage quota exceeded');
      }
    }

    try {
      const checksumSha256 = file.buffer
        ? crypto.createHash('sha256').update(file.buffer).digest('hex')
        : await this.computeFileSha256(file.path);
      const ext = path.extname(file.originalname).replace('.', '').toLowerCase() || 'bin';

      const backend = owner.preferredStorageBackend || StorageBackend.TELEGRAM_MTPROTO;

      let storageObjectId: string;
      const existingStorageObject = await this.prisma.storageObject.findFirst({
        where: {
          checksumSha256,
          backend,
        },
      });

      if (existingStorageObject) {
        storageObjectId = existingStorageObject.id;
      } else {
        const stored = await this.storage.storeFile(backend, {
          tempFilePath: file.path,
          buffer: file.buffer,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256,
          targetChatId: owner.telegramChatTarget || 'me',
        });
        storageObjectId = stored.storageObjectId;
      }

      const created = await this.prisma.file.create({
        data: {
          name: file.originalname,
          extension: ext,
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
          checksumSha256,
          storageObjectId,
          folderId: targetFolderId,
          ownerId: owner.id,
        },
      });

      await this.prisma.fileVersion.create({
        data: {
          fileId: created.id,
          versionNumber: 1,
          sizeBytes: BigInt(file.size),
          checksumSha256,
          storageObjectId,
        },
      });

      if (owner.quota) {
        await this.prisma.userQuota.update({
          where: { userId: owner.id },
          data: { usedStorageBytes: { increment: BigInt(file.size) } },
        });
      }

      await this.audit.log({
        actorId: owner.id,
        action: 'PUBLIC_UPLOAD',
        targetType: 'file',
        targetId: created.id,
        ipAddress: 'public-share',
        metadata: {
          sharedUpload: true,
          shareToken: token,
          fileName: created.name,
          backend,
        },
      });

      return {
        id: created.id,
        name: created.name,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes.toString(),
        extension: created.extension,
      };
    } finally {
      if (file.path) {
        await fs.promises.unlink(file.path).catch(() => {});
      }
    }
  }

  async streamSharedFolderAsZip(
    token: string,
    subFolderId: string | undefined,
    res: Response,
    meta?: { ipAddress?: string; userAgent?: string; referer?: string },
  ) {
    const share = await this.validateShareToken(token);
    if (!share.folderId) {
      throw new BadRequestException('This share link is not a folder');
    }

    const targetFolderId = subFolderId || share.folderId;
    const allowed = await this.isFolderDescendant(share.folderId, targetFolderId);
    if (!allowed) {
      throw new ForbiddenException('Target folder is outside the shared folder');
    }

    const folder = await this.prisma.folder.findUnique({
      where: { id: targetFolderId },
    });
    if (!folder) throw new NotFoundException('Folder not found');

    // Send email alert to admin that this shared folder was downloaded as ZIP
    this.mail.sendShareAccessAlert({
      itemType: 'folder',
      itemName: `${folder.name}.zip`,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      referer: meta?.referer,
      action: 'DOWNLOAD',
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(folder.name)}.zip"`,
    );

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err: any) => {
      throw err;
    });
    archive.pipe(res);

    const appendFolder = async (currentFolderId: string, prefix: string) => {
      const [files, subFolders] = await Promise.all([
        this.prisma.file.findMany({
          where: { folderId: currentFolderId, isTrash: false },
        }),
        this.prisma.folder.findMany({
          where: { parentId: currentFolderId, isTrash: false },
        }),
      ]);

      for (const f of files) {
        try {
          const stream = await this.storage.readFileStream(f.storageObjectId);
          archive.append(stream as any, { name: `${prefix}${f.name}` });
        } catch {}
      }

      for (const sf of subFolders) {
        await appendFolder(sf.id, `${prefix}${sf.name}/`);
      }
    };

    await appendFolder(folder.id, '');
    await archive.finalize();
  }
}

