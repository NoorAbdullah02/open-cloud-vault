import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { StorageBackend } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';

@Injectable()
export class DriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private serializeFile(f: any) {
    const { storageObject, fileTags, ...rest } = f;
    return {
      ...rest,
      sizeBytes: f.sizeBytes.toString(),
      storageBackend: storageObject?.backend ?? StorageBackend.LOCAL_DISK,
      tags: fileTags ? fileTags.map((ft: any) => ft.tag.name) : [],
    };
  }

  async listDrive(
    userId: string,
    query: {
      folderId?: string;
      view?: 'my-drive' | 'starred' | 'recent' | 'trash' | 'photos' | 'videos' | 'documents';
      search?: string;
    },
  ) {
    const view = query.view || 'my-drive';
    const folderId = query.folderId || null;

    if (query.search) {
      const term = query.search.trim();
      const [folders, files] = await Promise.all([
        this.prisma.folder.findMany({
          where: {
            ownerId: userId,
            isTrash: false,
            name: { contains: term, mode: 'insensitive' },
          },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.file.findMany({
          where: {
            ownerId: userId,
            isTrash: false,
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { extension: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
            ],
          },
          include: { storageObject: true, fileTags: { include: { tag: true } } },
          orderBy: { updatedAt: 'desc' },
        }),
      ]);
      return { folders, files: files.map((f) => this.serializeFile(f)), breadcrumbs: [] };
    }

    const folderWhere: any = { ownerId: userId };
    const fileWhere: any = { ownerId: userId };

    if (view === 'trash') {
      folderWhere.isTrash = true;
      fileWhere.isTrash = true;
    } else if (view === 'starred') {
      folderWhere.isTrash = false;
      folderWhere.isStarred = true;
      fileWhere.isTrash = false;
      fileWhere.isStarred = true;
    } else if (view === 'recent') {
      folderWhere.id = '__none__'; // recent focuses on files
      fileWhere.isTrash = false;
    } else if (view === 'photos') {
      folderWhere.id = '__none__';
      fileWhere.isTrash = false;
      fileWhere.mimeType = { startsWith: 'image/' };
    } else if (view === 'videos') {
      folderWhere.id = '__none__';
      fileWhere.isTrash = false;
      fileWhere.mimeType = { startsWith: 'video/' };
    } else if (view === 'documents') {
      folderWhere.id = '__none__';
      fileWhere.isTrash = false;
      fileWhere.OR = [
        { mimeType: { contains: 'pdf' } },
        { mimeType: { startsWith: 'text/' } },
        { mimeType: { contains: 'document' } },
        { mimeType: { contains: 'sheet' } },
      ];
    } else {
      folderWhere.isTrash = false;
      folderWhere.parentId = folderId;
      fileWhere.isTrash = false;
      fileWhere.folderId = folderId;
    }

    const [folders, files] = await Promise.all([
      this.prisma.folder.findMany({
        where: folderWhere,
        orderBy: { name: 'asc' },
      }),
      this.prisma.file.findMany({
        where: fileWhere,
        include: { storageObject: true, fileTags: { include: { tag: true } } },
        orderBy: view === 'recent' ? { lastAccessedAt: 'desc' } : { updatedAt: 'desc' },
        take: view === 'recent' ? 50 : 200,
      }),
    ]);

    const breadcrumbs = folderId ? await this.buildBreadcrumbs(userId, folderId) : [];

    return {
      folders,
      files: files.map((f) => this.serializeFile(f)),
      breadcrumbs,
    };
  }

  private async buildBreadcrumbs(userId: string, folderId: string) {
    const crumbs: { id: string; name: string }[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: currentId },
      });
      if (!folder || folder.ownerId !== userId) break;
      crumbs.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parentId;
    }
    return crumbs;
  }

  async createFolder(userId: string, name: string, parentId?: string) {
    if (!name || !name.trim()) {
      throw new BadRequestException('Folder name is required');
    }

    if (parentId) {
      const parent = await this.prisma.folder.findUnique({ where: { id: parentId } });
      if (!parent || parent.ownerId !== userId) {
        throw new NotFoundException('Parent folder not found');
      }
    }

    const folder = await this.prisma.folder.create({
      data: {
        name: name.trim(),
        parentId: parentId || null,
        ownerId: userId,
      },
    });

    await this.audit.log({
      actorId: userId,
      action: 'FOLDER_CREATE',
      targetType: 'Folder',
      targetId: folder.id,
      metadata: { name: folder.name },
    });

    return folder;
  }

  async uploadFile(
    userId: string,
    file: Express.Multer.File,
    folderId?: string,
    requestedBackend?: StorageBackend,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { quota: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.quota) {
      const projected = user.quota.usedStorageBytes + BigInt(file.size);
      if (projected > user.quota.storageQuotaBytes) {
        await fs.promises.unlink(file.path).catch(() => {});
        throw new BadRequestException('Storage quota exceeded');
      }
    }

    if (folderId) {
      const folder = await this.prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.ownerId !== userId) {
        await fs.promises.unlink(file.path).catch(() => {});
        throw new NotFoundException('Target folder not found');
      }
    }

    // Determine storage backend with strict consent check for Telegram
    let backend = requestedBackend || user.preferredStorageBackend || StorageBackend.TELEGRAM_MTPROTO;
    if (backend === StorageBackend.TELEGRAM_MTPROTO && !user.telegramConsentGiven) {
      await fs.promises.unlink(file.path).catch(() => {});
      throw new ForbiddenException(
        'Explicit consent is required before storing files on Telegram MTProto.',
      );
    }

    const checksumSha256 = file.buffer
      ? crypto.createHash('sha256').update(file.buffer).digest('hex')
      : await this.computeFileSha256(file.path);
    const ext = path.extname(file.originalname).replace('.', '').toLowerCase() || 'bin';

    try {
      const { storageObjectId } = await this.storage.storeFile(backend, {
        tempFilePath: file.path,
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksumSha256,
        targetChatId: user.telegramChatTarget || undefined,
      });

      const createdFile = await this.prisma.file.create({
        data: {
          name: file.originalname,
          extension: ext,
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
          checksumSha256,
          storageObjectId,
          folderId: folderId || null,
          ownerId: userId,
        },
        include: { storageObject: true },
      });

      await this.prisma.fileVersion.create({
        data: {
          fileId: createdFile.id,
          versionNumber: 1,
          sizeBytes: BigInt(file.size),
          checksumSha256,
          storageObjectId,
        },
      });

      if (user.quota) {
        await this.prisma.userQuota.update({
          where: { userId },
          data: { usedStorageBytes: { increment: BigInt(file.size) } },
        });
      }

      await this.prisma.activity.create({
        data: {
          userId,
          fileId: createdFile.id,
          action: 'UPLOAD',
          details: { fileName: createdFile.name, backend },
        },
      });

      return this.serializeFile(createdFile);
    } finally {
      await fs.promises.unlink(file.path).catch(() => {});
    }
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

  async getFileForDownload(userId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { storageObject: true },
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this file');
    }

    await this.prisma.file.update({
      where: { id: fileId },
      data: { lastAccessedAt: new Date() },
    });

    const stream = await this.storage.readFileStream(file.storageObjectId);
    return { file, stream };
  }

  async streamFolderAsZip(userId: string, folderId: string, res: any) {
    const folder = await this.prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.ownerId !== userId) {
      throw new NotFoundException('Folder not found');
    }

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
          where: { ownerId: userId, folderId: currentFolderId, isTrash: false },
        }),
        this.prisma.folder.findMany({
          where: { ownerId: userId, parentId: currentFolderId, isTrash: false },
        }),
      ]);

      for (const f of files) {
        const stream = await this.storage.readFileStream(f.storageObjectId);
        archive.append(stream as any, { name: `${prefix}${f.name}` });
      }

      for (const sf of subFolders) {
        await appendFolder(sf.id, `${prefix}${sf.name}/`);
      }
    };

    await appendFolder(folder.id, '');
    await archive.finalize();
  }

  async toggleStar(userId: string, type: 'file' | 'folder', id: string) {
    if (type === 'file') {
      const file = await this.prisma.file.findUnique({ where: { id } });
      if (!file || file.ownerId !== userId) throw new NotFoundException('File not found');
      const updated = await this.prisma.file.update({
        where: { id },
        data: { isStarred: !file.isStarred },
        include: { storageObject: true },
      });
      return this.serializeFile(updated);
    } else {
      const folder = await this.prisma.folder.findUnique({ where: { id } });
      if (!folder || folder.ownerId !== userId) throw new NotFoundException('Folder not found');
      return this.prisma.folder.update({
        where: { id },
        data: { isStarred: !folder.isStarred },
      });
    }
  }

  async renameItem(userId: string, type: 'file' | 'folder', id: string, newName: string) {
    if (!newName.trim()) throw new BadRequestException('Name cannot be empty');
    if (type === 'file') {
      const file = await this.prisma.file.findUnique({ where: { id } });
      if (!file || file.ownerId !== userId) throw new NotFoundException('File not found');
      const updated = await this.prisma.file.update({
        where: { id },
        data: { name: newName.trim() },
        include: { storageObject: true },
      });
      return this.serializeFile(updated);
    } else {
      const folder = await this.prisma.folder.findUnique({ where: { id } });
      if (!folder || folder.ownerId !== userId) throw new NotFoundException('Folder not found');
      return this.prisma.folder.update({
        where: { id },
        data: { name: newName.trim() },
      });
    }
  }

  async moveItem(
    userId: string,
    type: 'file' | 'folder',
    id: string,
    targetFolderId: string | null,
  ) {
    if (targetFolderId) {
      const target = await this.prisma.folder.findUnique({ where: { id: targetFolderId } });
      if (!target || target.ownerId !== userId || target.isTrash) {
        throw new NotFoundException('Destination folder not found');
      }
    }

    if (type === 'file') {
      const file = await this.prisma.file.findUnique({ where: { id } });
      if (!file || file.ownerId !== userId) throw new NotFoundException('File not found');
      const updated = await this.prisma.file.update({
        where: { id },
        data: { folderId: targetFolderId ?? null },
        include: { storageObject: true },
      });
      return this.serializeFile(updated);
    } else {
      const folder = await this.prisma.folder.findUnique({ where: { id } });
      if (!folder || folder.ownerId !== userId) throw new NotFoundException('Folder not found');
      if (targetFolderId === id) {
        throw new BadRequestException('Cannot move a folder into itself');
      }
      // Prevent circular move into a descendant
      let cursor: string | null = targetFolderId;
      while (cursor) {
        if (cursor === id) {
          throw new BadRequestException('Cannot move a folder into its own subfolder');
        }
        const parent = await this.prisma.folder.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = parent?.parentId ?? null;
      }
      return this.prisma.folder.update({
        where: { id },
        data: { parentId: targetFolderId ?? null },
      });
    }
  }

  async trashItem(userId: string, type: 'file' | 'folder', id: string) {
    if (type === 'file') {
      const file = await this.prisma.file.findUnique({ where: { id } });
      if (!file || file.ownerId !== userId) throw new NotFoundException('File not found');
      const updated = await this.prisma.file.update({
        where: { id },
        data: { isTrash: true, trashedAt: new Date() },
        include: { storageObject: true },
      });
      return this.serializeFile(updated);
    } else {
      const folder = await this.prisma.folder.findUnique({ where: { id } });
      if (!folder || folder.ownerId !== userId) throw new NotFoundException('Folder not found');
      return this.prisma.folder.update({
        where: { id },
        data: { isTrash: true, trashedAt: new Date() },
      });
    }
  }

  async restoreItem(userId: string, type: 'file' | 'folder', id: string) {
    if (type === 'file') {
      const file = await this.prisma.file.findUnique({ where: { id } });
      if (!file || file.ownerId !== userId) throw new NotFoundException('File not found');
      const updated = await this.prisma.file.update({
        where: { id },
        data: { isTrash: false, trashedAt: null },
        include: { storageObject: true },
      });
      return this.serializeFile(updated);
    } else {
      const folder = await this.prisma.folder.findUnique({ where: { id } });
      if (!folder || folder.ownerId !== userId) throw new NotFoundException('Folder not found');
      return this.prisma.folder.update({
        where: { id },
        data: { isTrash: false, trashedAt: null },
      });
    }
  }

  async permanentlyDeleteFile(userId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.ownerId !== userId) throw new NotFoundException('File not found');

    await this.prisma.file.delete({ where: { id: fileId } });
    await this.storage.deleteStoredObject(file.storageObjectId);

    await this.prisma.userQuota.updateMany({
      where: { userId },
      data: { usedStorageBytes: { decrement: file.sizeBytes } },
    });

    await this.audit.log({
      actorId: userId,
      action: 'FILE_PERMANENT_DELETE',
      targetType: 'File',
      targetId: fileId,
      metadata: { name: file.name },
    });

    return { deleted: true };
  }

  async permanentlyDeleteFolder(userId: string, folderId: string) {
    const folder = await this.prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.ownerId !== userId) throw new NotFoundException('Folder not found');

    await this.prisma.folder.delete({ where: { id: folderId } });

    await this.audit.log({
      actorId: userId,
      action: 'FOLDER_PERMANENT_DELETE',
      targetType: 'Folder',
      targetId: folderId,
      metadata: { name: folder.name },
    });

    return { deleted: true };
  }

  async emptyTrash(userId: string) {
    const trashedFiles = await this.prisma.file.findMany({
      where: { ownerId: userId, isTrash: true },
    });

    for (const file of trashedFiles) {
      await this.prisma.file.delete({ where: { id: file.id } });
      await this.storage.deleteStoredObject(file.storageObjectId);
      await this.prisma.userQuota.updateMany({
        where: { userId },
        data: { usedStorageBytes: { decrement: file.sizeBytes } },
      });
    }

    await this.prisma.folder.deleteMany({
      where: { ownerId: userId, isTrash: true },
    });

    return { emptied: true, count: trashedFiles.length };
  }

  async updateStoragePreferences(
    userId: string,
    dto: {
      preferredStorageBackend: StorageBackend;
      telegramConsentGiven?: boolean;
      telegramChatTarget?: string;
    },
  ) {
    if (
      dto.preferredStorageBackend === StorageBackend.TELEGRAM_MTPROTO &&
      !dto.telegramConsentGiven
    ) {
      throw new BadRequestException(
        'You must explicitly grant consent to use Telegram MTProto storage.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferredStorageBackend: dto.preferredStorageBackend,
        telegramConsentGiven: dto.telegramConsentGiven ?? false,
        telegramChatTarget: dto.telegramChatTarget,
      },
    });

    return {
      preferredStorageBackend: updated.preferredStorageBackend,
      telegramConsentGiven: updated.telegramConsentGiven,
      telegramChatTarget: updated.telegramChatTarget,
    };
  }

  getStorageProviders() {
    return this.storage.getProviderStatuses();
  }
}
