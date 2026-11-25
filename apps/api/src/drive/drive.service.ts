import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { StorageBackend } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import * as argon2 from 'argon2';
import { MailService } from '../mail/mail.service';
import { safeZipEntryName } from '../common/utils/zip-path.util';

const vaultFolderIdsCache = new Map<string, { ids: string[]; cachedAt: number }>();
const lastCameraConsolidateMap = new Map<string, number>();

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
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
      view?: 'my-drive' | 'starred' | 'recent' | 'trash' | 'photos' | 'videos' | 'documents' | 'vault' | 'camera' | 'camera-uploads';
      search?: string;
      filterType?: 'all' | 'pdf' | 'image' | 'video' | 'audio' | 'document' | 'archive';
      sizeMin?: string | number;
      dateFilter?: 'today' | 'week' | 'month';
    },
  ) {
    const view = query.view || 'my-drive';
    let folderId = query.folderId || null;

    // Consolidate duplicate Camera Uploads folders into one canonical folder (run at most once per 10m unless camera view)
    const lastConsolidated = lastCameraConsolidateMap.get(userId) || 0;
    if (view === 'camera' || view === 'camera-uploads' || Date.now() - lastConsolidated > 600_000) {
      lastCameraConsolidateMap.set(userId, Date.now());
      await this.consolidateDuplicateCameraFolders(userId).catch(() => {});
    }

    if (view === 'trash') {
      await this.purgeExpiredTrash(userId).catch(() => {});
    }

    const allVaultFolderIds = await this.getAllVaultFolderIds(userId);

    if (query.search) {
      const term = query.search.trim();
      const folderSearchWhere: any = {
        ownerId: userId,
        isTrash: false,
        name: { contains: term, mode: 'insensitive' },
      };
      const fileSearchWhere: any = {
        ownerId: userId,
        isTrash: false,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { extension: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ],
      };

      if (view === 'vault') {
        folderSearchWhere.id = { in: allVaultFolderIds };
        fileSearchWhere.folderId = { in: allVaultFolderIds };
      } else {
        folderSearchWhere.id = { notIn: allVaultFolderIds };
        folderSearchWhere.name = { not: 'Secret Vault' };
        fileSearchWhere.AND = [
          {
            OR: [
              { folderId: null },
              { folderId: { notIn: allVaultFolderIds } },
            ],
          },
        ];
      }

      const [folders, files] = await Promise.all([
        this.prisma.folder.findMany({
          where: folderSearchWhere,
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.file.findMany({
          where: fileSearchWhere,
          include: { storageObject: true, fileTags: { include: { tag: true } } },
          orderBy: { updatedAt: 'desc' },
        }),
      ]);
      return { folders, files: files.map((f) => this.serializeFile(f)), breadcrumbs: [] };
    }

    const folderWhere: any = { ownerId: userId };
    const fileWhere: any = { ownerId: userId };
    let breadcrumbs: { id: string; name: string }[] = [];
    let resolvedFolderId = folderId;
    if (
      resolvedFolderId === 'camera' ||
      resolvedFolderId === 'camera-uploads' ||
      resolvedFolderId === 'camera_uploads' ||
      view === 'camera' ||
      view === 'camera-uploads'
    ) {
      const camFolder = await this.getOrCreateCameraUploadsFolder(userId);
      resolvedFolderId = camFolder.id;
    }

    if (view === 'vault') {
      const vaultFolder = await this.getOrCreateVaultFolder(userId);
      let activeFolderId = folderId;
      if (activeFolderId && !allVaultFolderIds.includes(activeFolderId)) {
        throw new ForbiddenException('Access denied to private vault folder');
      }
      if (!activeFolderId) {
        activeFolderId = vaultFolder.id;
      }
      folderWhere.isTrash = false;
      folderWhere.parentId = activeFolderId;
      fileWhere.isTrash = false;
      fileWhere.folderId = activeFolderId;
      if (activeFolderId === vaultFolder.id) {
        breadcrumbs = [{ id: vaultFolder.id, name: 'Secret Vault 🔒' }];
      } else {
        breadcrumbs = await this.buildBreadcrumbs(userId, activeFolderId);
        if (breadcrumbs.length > 0 && breadcrumbs[0].id === vaultFolder.id) {
          breadcrumbs[0].name = 'Secret Vault 🔒';
        }
      }
    } else if (view === 'trash') {
      folderWhere.isTrash = true;
      folderWhere.id = { notIn: allVaultFolderIds };
      folderWhere.name = { not: 'Secret Vault' };
      fileWhere.isTrash = true;
      fileWhere.AND = [
        {
          OR: [
            { folderId: null },
            { folderId: { notIn: allVaultFolderIds } },
          ],
        },
      ];
    } else if (view === 'starred') {
      folderWhere.isTrash = false;
      folderWhere.isStarred = true;
      folderWhere.id = { notIn: allVaultFolderIds };
      folderWhere.name = { not: 'Secret Vault' };
      fileWhere.isTrash = false;
      fileWhere.isStarred = true;
      fileWhere.AND = [
        {
          OR: [
            { folderId: null },
            { folderId: { notIn: allVaultFolderIds } },
          ],
        },
      ];
    } else if (view === 'recent') {
      folderWhere.id = '__none__'; // recent focuses on files
      fileWhere.isTrash = false;
      fileWhere.AND = [
        {
          OR: [
            { folderId: null },
            { folderId: { notIn: allVaultFolderIds } },
          ],
        },
      ];
    } else if (view === 'photos') {
      folderWhere.id = '__none__';
      fileWhere.isTrash = false;
      fileWhere.mimeType = { startsWith: 'image/' };
      fileWhere.AND = [
        {
          OR: [
            { folderId: null },
            { folderId: { notIn: allVaultFolderIds } },
          ],
        },
      ];
    } else if (view === 'videos') {
      folderWhere.id = '__none__';
      fileWhere.isTrash = false;
      fileWhere.mimeType = { startsWith: 'video/' };
      fileWhere.AND = [
        {
          OR: [
            { folderId: null },
            { folderId: { notIn: allVaultFolderIds } },
          ],
        },
      ];
    } else if (view === 'documents') {
      folderWhere.id = '__none__';
      fileWhere.isTrash = false;
      fileWhere.OR = [
        { mimeType: { contains: 'pdf' } },
        { mimeType: { startsWith: 'text/' } },
        { mimeType: { contains: 'document' } },
        { mimeType: { contains: 'sheet' } },
      ];
      fileWhere.AND = [
        {
          OR: [
            { folderId: null },
            { folderId: { notIn: allVaultFolderIds } },
          ],
        },
      ];
    } else {
      if (resolvedFolderId) {
        if (allVaultFolderIds.includes(resolvedFolderId)) {
          throw new ForbiddenException('Access denied to private vault folder');
        }
        folderWhere.isTrash = false;
        folderWhere.parentId = resolvedFolderId;
        fileWhere.isTrash = false;
        fileWhere.folderId = resolvedFolderId;
      } else {
        folderWhere.isTrash = false;
        folderWhere.parentId = null;
        folderWhere.name = { not: 'Secret Vault' };
        folderWhere.id = { notIn: allVaultFolderIds };
        fileWhere.isTrash = false;
        fileWhere.folderId = null;
      }
    }

    // Apply Smart Search Filters
    if (query.filterType && query.filterType !== 'all') {
      if (query.filterType === 'pdf') {
        fileWhere.extension = 'pdf';
      } else if (query.filterType === 'image') {
        fileWhere.mimeType = { startsWith: 'image/' };
      } else if (query.filterType === 'video') {
        fileWhere.mimeType = { startsWith: 'video/' };
      } else if (query.filterType === 'audio') {
        fileWhere.mimeType = { startsWith: 'audio/' };
      } else if (query.filterType === 'document') {
        fileWhere.extension = { in: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'xlsx', 'xls', 'pptx', 'ppt', 'md', 'csv'] };
      } else if (query.filterType === 'archive') {
        fileWhere.extension = { in: ['zip', 'rar', '7z', 'tar', 'gz'] };
      }
    }

    if (query.sizeMin) {
      fileWhere.sizeBytes = { gte: BigInt(query.sizeMin) };
    }

    if (query.dateFilter) {
      const now = Date.now();
      if (query.dateFilter === 'today') {
        fileWhere.createdAt = { gte: new Date(now - 24 * 60 * 60 * 1000) };
      } else if (query.dateFilter === 'week') {
        fileWhere.createdAt = { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
      } else if (query.dateFilter === 'month') {
        fileWhere.createdAt = { gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
      }
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

    if (breadcrumbs.length === 0 && resolvedFolderId) {
      breadcrumbs = await this.buildBreadcrumbs(userId, resolvedFolderId);
    }

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

  async createFolder(userId: string, name: string, parentId?: string, view?: string) {
    if (!name || !name.trim()) {
      throw new BadRequestException('Folder name is required');
    }

    const cleanName = name.trim();

    // Singleton check: Prevent duplicate "Camera Uploads" folders at root
    if (
      (cleanName.toLowerCase() === 'camera uploads' || cleanName.toLowerCase() === 'camera-uploads') &&
      (!parentId || parentId === 'null')
    ) {
      return this.getOrCreateCameraUploadsFolder(userId);
    }

    let targetParentId = parentId;
    if (targetParentId === 'vault' || (!targetParentId && view === 'vault')) {
      const vaultFolder = await this.getOrCreateVaultFolder(userId);
      targetParentId = vaultFolder.id;
    } else if (targetParentId) {
      const parent = await this.prisma.folder.findUnique({ where: { id: targetParentId } });
      if (!parent || parent.ownerId !== userId) {
        throw new NotFoundException('Parent folder not found');
      }
    }

    const folder = await this.prisma.folder.create({
      data: {
        name: cleanName,
        parentId: targetParentId || null,
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
    view?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { quota: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.quota && user.quota.storageQuotaBytes > BigInt(0)) {
      const projected = user.quota.usedStorageBytes + BigInt(file.size);
      if (projected > user.quota.storageQuotaBytes) {
        await fs.promises.unlink(file.path).catch(() => {});
        throw new BadRequestException('Storage quota exceeded');
      }
    }

    let targetFolderId = folderId;
    if (targetFolderId === 'vault' || (!targetFolderId && view === 'vault')) {
      const vaultFolder = await this.getOrCreateVaultFolder(userId);
      targetFolderId = vaultFolder.id;
    } else if (
      targetFolderId === 'camera' ||
      targetFolderId === 'camera-uploads' ||
      targetFolderId === 'camera_uploads' ||
      (!targetFolderId && (view === 'camera' || view === 'camera-uploads'))
    ) {
      const cameraFolder = await this.getOrCreateCameraUploadsFolder(userId);
      targetFolderId = cameraFolder.id;
    } else if (targetFolderId) {
      const folder = await this.prisma.folder.findUnique({ where: { id: targetFolderId } });
      if (!folder || folder.ownerId !== userId) {
        await fs.promises.unlink(file.path).catch(() => {});
        throw new NotFoundException('Target folder not found');
      }
    }

    // Determine storage backend with strict consent check for Telegram
    let backend = requestedBackend || user.preferredStorageBackend || StorageBackend.TELEGRAM_MTPROTO;
    const envConsent = process.env.TELEGRAM_USER_CONSENT === 'true';
    const hasConsent = user.telegramConsentGiven || envConsent || user.role === 'SUPER_ADMIN';

    if (backend === StorageBackend.TELEGRAM_MTPROTO && !hasConsent) {
      await fs.promises.unlink(file.path).catch(() => {});
      throw new ForbiddenException(
        'Explicit consent is required before storing files on Telegram MTProto.',
      );
    }

    if (backend === StorageBackend.TELEGRAM_MTPROTO && !user.telegramConsentGiven && hasConsent) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { telegramConsentGiven: true },
      }).catch(() => {});
    }

    const checksumSha256 = file.buffer
      ? crypto.createHash('sha256').update(file.buffer).digest('hex')
      : await this.computeFileSha256(file.path);
    const ext = path.extname(file.originalname).replace('.', '').toLowerCase() || 'bin';

    try {
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
        try {
          const stored = await this.storage.storeFile(backend, {
            tempFilePath: file.path,
            buffer: file.buffer,
            fileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            checksumSha256,
            targetChatId: user.telegramChatTarget || undefined,
          });
          storageObjectId = stored.storageObjectId;
        } catch (storeErr: any) {
          // If Telegram upload times out or fails, automatically fallback to LOCAL_DISK
          if (backend === StorageBackend.TELEGRAM_MTPROTO) {
            this.logger.warn(
              `Telegram upload failed for "${file.originalname}" (${storeErr.message}). Automatically falling back to LOCAL_DISK.`,
            );
            backend = StorageBackend.LOCAL_DISK;
            const fallbackStored = await this.storage.storeFile(backend, {
              tempFilePath: file.path,
              buffer: file.buffer,
              fileName: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              checksumSha256,
            });
            storageObjectId = fallbackStored.storageObjectId;
          } else {
            throw storeErr;
          }
        }
      }

      const createdFile = await this.prisma.file.create({
        data: {
          name: file.originalname,
          extension: ext,
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
          checksumSha256,
          storageObjectId,
          folderId: targetFolderId || null,
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

      // Send email alert to admin notification recipient
      const notifyEmail = process.env.ADMIN_NOTIFY_EMAIL || process.env.SUPER_ADMIN_EMAIL || user.email;
      if (notifyEmail) {
        const folderName = targetFolderId
          ? (await this.prisma.folder.findUnique({ where: { id: targetFolderId }, select: { name: true } }))?.name
          : undefined;
        this.mail
          .sendUploadAlert({
            email: notifyEmail,
            fileName: createdFile.name,
            sizeBytes: createdFile.sizeBytes,
            backend,
            folderName,
            isDeduplicated: !!existingStorageObject,
          })
          .catch((err) => this.logger.warn(`Failed to dispatch upload alert email: ${err.message}`));
      }

      return {
        ...this.serializeFile(createdFile),
        isDeduplicated: !!existingStorageObject,
      };
    } finally {
      await fs.promises.unlink(file.path).catch(() => {});
    }
  }

  private computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async getFileRecord(userId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { storageObject: true },
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this file');
    }

    // Update lastAccessedAt asynchronously in background so range requests are zero latency
    this.prisma.file
      .update({
        where: { id: fileId },
        data: { lastAccessedAt: new Date() },
      })
      .catch(() => {});

    return file;
  }

  async getFileStream(storageObjectId: string, range?: { start: number; end: number }) {
    return this.storage.readFileStream(storageObjectId, range);
  }

  async getFileForDownload(
    userId: string,
    fileId: string,
    range?: { start: number; end: number },
  ) {
    const file = await this.getFileRecord(userId, fileId);
    const stream = await this.getFileStream(file.storageObjectId, range);
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
        archive.append(stream as any, { name: `${prefix}${safeZipEntryName(f.name)}` });
      }

      for (const sf of subFolders) {
        await appendFolder(sf.id, `${prefix}${safeZipEntryName(sf.name)}/`);
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
    const trimmed = newName.trim();
    if (!trimmed) throw new BadRequestException('Name cannot be empty');
    if (type === 'file') {
      const file = await this.prisma.file.findUnique({ where: { id } });
      if (!file || file.ownerId !== userId) throw new NotFoundException('File not found');

      // Preserve or update extension intelligently
      const originalExt = file.extension || (file.name.includes('.') ? file.name.split('.').pop() || '' : '');
      let finalName = trimmed;
      let newExt = trimmed.includes('.') ? trimmed.split('.').pop() || '' : '';

      if (!newExt && originalExt) {
        finalName = `${trimmed}.${originalExt}`;
        newExt = originalExt;
      }

      const updated = await this.prisma.file.update({
        where: { id },
        data: {
          name: finalName,
          extension: (newExt || originalExt || '').toLowerCase(),
        },
        include: { storageObject: true },
      });

      await this.prisma.activity.create({
        data: {
          userId,
          fileId: id,
          action: 'RENAME',
          details: { oldName: file.name, newName: finalName },
        },
      }).catch(() => {});

      return this.serializeFile(updated);
    } else {
      const folder = await this.prisma.folder.findUnique({ where: { id } });
      if (!folder || folder.ownerId !== userId) throw new NotFoundException('Folder not found');
      return this.prisma.folder.update({
        where: { id },
        data: { name: trimmed },
      });
    }
  }

  async replaceFile(
    userId: string,
    fileId: string,
    file: Express.Multer.File,
    requestedBackend?: StorageBackend,
  ) {
    const existingFile = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { storageObject: true },
    });
    if (!existingFile || existingFile.ownerId !== userId) {
      throw new NotFoundException('Target file to replace not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { quota: true },
    });
    if (!user) throw new NotFoundException('User not found');

    let backend = requestedBackend || existingFile.storageObject?.backend || StorageBackend.TELEGRAM_MTPROTO;

    const checksumSha256 = file.buffer
      ? crypto.createHash('sha256').update(file.buffer).digest('hex')
      : await this.computeFileSha256(file.path);
    const ext = path.extname(file.originalname).replace('.', '').toLowerCase() || existingFile.extension || 'bin';

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
      try {
        const stored = await this.storage.storeFile(backend, {
          tempFilePath: file.path,
          buffer: file.buffer,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256,
          targetChatId: user.telegramChatTarget || undefined,
        });
        storageObjectId = stored.storageObjectId;
      } catch (storeErr: any) {
        if (backend === StorageBackend.TELEGRAM_MTPROTO) {
          this.logger.warn(
            `Telegram upload failed for replace "${file.originalname}" (${storeErr.message}). Falling back to LOCAL_DISK.`,
          );
          backend = StorageBackend.LOCAL_DISK;
          const fallbackStored = await this.storage.storeFile(backend, {
            tempFilePath: file.path,
            buffer: file.buffer,
            fileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            checksumSha256,
          });
          storageObjectId = fallbackStored.storageObjectId;
        } else {
          throw storeErr;
        }
      }
    }

    // Save previous version in history
    await this.prisma.fileVersion.create({
      data: {
        fileId: existingFile.id,
        versionNumber: existingFile.version,
        sizeBytes: existingFile.sizeBytes,
        checksumSha256: existingFile.checksumSha256,
        storageObjectId: existingFile.storageObjectId,
      },
    }).catch(() => {});

    // Update the existing File record in-place, keeping file.id IDENTICAL
    // This preserves all public share links (/share/<token>), stars, comments, and tags!
    const nextVersion = existingFile.version + 1;
    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: {
        name: file.originalname,
        extension: ext,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        checksumSha256,
        storageObjectId,
        version: nextVersion,
        updatedAt: new Date(),
      },
      include: { storageObject: true },
    });

    // Update quota diff
    const sizeDiff = BigInt(file.size) - existingFile.sizeBytes;
    if (user.quota && sizeDiff !== BigInt(0)) {
      await this.prisma.userQuota.update({
        where: { userId },
        data: { usedStorageBytes: { increment: sizeDiff } },
      }).catch(() => {});
    }

    // Record activity
    await this.prisma.activity.create({
      data: {
        userId,
        fileId: existingFile.id,
        action: 'REPLACE',
        details: {
          previousVersion: existingFile.version,
          newVersion: nextVersion,
          fileName: file.originalname,
          sizeBytes: file.size,
        },
      },
    }).catch(() => {});

    return this.serializeFile(updated);
  }

  async updateTextContent(userId: string, fileId: string, content: string) {
    const existingFile = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { storageObject: true },
    });
    if (!existingFile || existingFile.ownerId !== userId) {
      throw new NotFoundException('Target file not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { quota: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const buffer = Buffer.from(content ?? '', 'utf8');
    const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    let backend = existingFile.storageObject?.backend || StorageBackend.LOCAL_DISK;

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
      try {
        const stored = await this.storage.storeFile(backend, {
          buffer,
          fileName: existingFile.name,
          mimeType: existingFile.mimeType || 'text/plain',
          sizeBytes: buffer.length,
          checksumSha256,
          targetChatId: user.telegramChatTarget || undefined,
        });
        storageObjectId = stored.storageObjectId;
      } catch (storeErr: any) {
        if (backend === StorageBackend.TELEGRAM_MTPROTO) {
          this.logger.warn(
            `Telegram upload failed for text update "${existingFile.name}" (${storeErr.message}). Falling back to LOCAL_DISK.`,
          );
          backend = StorageBackend.LOCAL_DISK;
          const fallbackStored = await this.storage.storeFile(backend, {
            buffer,
            fileName: existingFile.name,
            mimeType: existingFile.mimeType || 'text/plain',
            sizeBytes: buffer.length,
            checksumSha256,
          });
          storageObjectId = fallbackStored.storageObjectId;
        } else {
          throw storeErr;
        }
      }
    }

    // Save previous version in history
    await this.prisma.fileVersion.create({
      data: {
        fileId: existingFile.id,
        versionNumber: existingFile.version,
        sizeBytes: existingFile.sizeBytes,
        checksumSha256: existingFile.checksumSha256,
        storageObjectId: existingFile.storageObjectId,
      },
    }).catch(() => {});

    const nextVersion = existingFile.version + 1;
    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: {
        sizeBytes: BigInt(buffer.length),
        checksumSha256,
        storageObjectId,
        version: nextVersion,
        updatedAt: new Date(),
      },
      include: { storageObject: true },
    });

    // Update quota diff
    const sizeDiff = BigInt(buffer.length) - existingFile.sizeBytes;
    if (user.quota && sizeDiff !== BigInt(0)) {
      await this.prisma.userQuota.update({
        where: { userId },
        data: { usedStorageBytes: { increment: sizeDiff } },
      }).catch(() => {});
    }

    // Record activity
    await this.prisma.activity.create({
      data: {
        userId,
        fileId: existingFile.id,
        action: 'UPDATE_CONTENT',
        details: {
          previousVersion: existingFile.version,
          newVersion: nextVersion,
          fileName: existingFile.name,
          sizeBytes: buffer.length,
        },
      },
    }).catch(() => {});

    return this.serializeFile(updated);
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

  async bulkAction(
    userId: string,
    action: 'trash' | 'restore' | 'delete' | 'move',
    items: { type: 'file' | 'folder'; id: string }[],
    targetFolderId: string | null = null,
  ) {
    let succeeded = 0;
    let failed = 0;
    for (const item of items) {
      try {
        if (action === 'trash') {
          await this.trashItem(userId, item.type, item.id);
        } else if (action === 'restore') {
          await this.restoreItem(userId, item.type, item.id);
        } else if (action === 'delete') {
          if (item.type === 'file') {
            await this.permanentlyDeleteFile(userId, item.id);
          } else {
            await this.permanentlyDeleteFolder(userId, item.id);
          }
        } else if (action === 'move') {
          await this.moveItem(userId, item.type, item.id, targetFolderId);
        }
        succeeded++;
      } catch {
        failed++;
      }
    }
    return { succeeded, failed };
  }

  async getDuplicates(userId: string) {
    const allVaultFolderIds = await this.getAllVaultFolderIds(userId);
    const files = await this.prisma.file.findMany({
      where: {
        ownerId: userId,
        isTrash: false,
        AND: [
          {
            OR: [
              { folderId: null },
              { folderId: { notIn: allVaultFolderIds } },
            ],
          },
        ],
      },
      include: { folder: true, storageObject: true },
      orderBy: { createdAt: 'desc' },
    });

    const groupsMap = new Map<string, any[]>();
    for (const f of files) {
      if (!f.checksumSha256) continue;
      const key = `${f.checksumSha256}_${f.sizeBytes.toString()}`;
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key)!.push(f);
    }

    let totalPotentialSavings = BigInt(0);
    const duplicateGroups: any[] = [];

    for (const [, list] of groupsMap.entries()) {
      if (list.length > 1) {
        const sizeBytes = list[0].sizeBytes;
        const wasted = sizeBytes * BigInt(list.length - 1);
        totalPotentialSavings += wasted;
        duplicateGroups.push({
          checksum: list[0].checksumSha256,
          sizeBytes: sizeBytes.toString(),
          count: list.length,
          wastedBytes: wasted.toString(),
          files: list.map((f) => ({
            ...this.serializeFile(f),
            folderName: f.folder?.name || 'My Drive (Root)',
          })),
        });
      }
    }

    return {
      totalGroups: duplicateGroups.length,
      totalWastedBytes: totalPotentialSavings.toString(),
      groups: duplicateGroups,
    };
  }

  async getLargeFiles(userId: string, limit = 50) {
    const allVaultFolderIds = await this.getAllVaultFolderIds(userId);
    const files = await this.prisma.file.findMany({
      where: {
        ownerId: userId,
        isTrash: false,
        AND: [
          {
            OR: [
              { folderId: null },
              { folderId: { notIn: allVaultFolderIds } },
            ],
          },
        ],
      },
      include: { folder: true, storageObject: true },
      orderBy: { sizeBytes: 'desc' },
      take: Number(limit) || 50,
    });

    return files.map((f) => ({
      ...this.serializeFile(f),
      folderName: f.folder?.name || 'My Drive (Root)',
    }));
  }

  // --- Auto-Purge 30-Day Trash ---
  async purgeExpiredTrash(userId: string) {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const expiredFiles = await this.prisma.file.findMany({
      where: {
        ownerId: userId,
        isTrash: true,
        trashedAt: { lt: cutoffDate },
      },
      select: { id: true, storageObjectId: true },
    });

    for (const f of expiredFiles) {
      await this.prisma.file.delete({ where: { id: f.id } }).catch(() => {});
      await this.storage.deleteStoredObject(f.storageObjectId).catch(() => {});
    }

    await this.prisma.folder.deleteMany({
      where: {
        ownerId: userId,
        isTrash: true,
        trashedAt: { lt: cutoffDate },
      },
    }).catch(() => {});
  }

  // --- Camera Uploads Folder Singleton Management ---
  async consolidateDuplicateCameraFolders(userId: string): Promise<string> {
    const folders = await this.prisma.folder.findMany({
      where: {
        ownerId: userId,
        name: { equals: 'Camera Uploads', mode: 'insensitive' },
        parentId: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (folders.length === 0) {
      const created = await this.prisma.folder.create({
        data: { name: 'Camera Uploads', ownerId: userId, parentId: null },
      });
      return created.id;
    }

    const primary = folders[0];
    if (primary.isTrash) {
      await this.prisma.folder.update({
        where: { id: primary.id },
        data: { isTrash: false, trashedAt: null },
      });
    }

    if (folders.length > 1) {
      const dupIds = folders.slice(1).map((f) => f.id);
      await this.prisma.file.updateMany({
        where: { folderId: { in: dupIds } },
        data: { folderId: primary.id },
      });
      await this.prisma.folder.updateMany({
        where: { parentId: { in: dupIds } },
        data: { parentId: primary.id },
      });
      await this.prisma.folder.deleteMany({
        where: { id: { in: dupIds } },
      });
    }

    return primary.id;
  }

  async getOrCreateCameraUploadsFolder(userId: string) {
    const primaryId = await this.consolidateDuplicateCameraFolders(userId);
    return this.prisma.folder.findUniqueOrThrow({
      where: { id: primaryId },
    });
  }

  // --- Secret Vault ---
  async getOrCreateVaultFolder(userId: string) {
    let vaultFolder = await this.prisma.folder.findFirst({
      where: { ownerId: userId, name: 'Secret Vault', parentId: null },
    });
    if (!vaultFolder) {
      vaultFolder = await this.prisma.folder.create({
        data: { name: 'Secret Vault', ownerId: userId },
      });
    }
    return vaultFolder;
  }

  async getAllVaultFolderIds(userId: string): Promise<string[]> {
    const cached = vaultFolderIdsCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < 30_000) {
      return cached.ids;
    }
    const vaultFolder = await this.getOrCreateVaultFolder(userId);
    const vaultIds = new Set<string>([vaultFolder.id]);
    const allFolders = await this.prisma.folder.findMany({
      where: { ownerId: userId, isTrash: false },
      select: { id: true, parentId: true },
    });
    let added = true;
    while (added) {
      added = false;
      for (const f of allFolders) {
        if (f.parentId && vaultIds.has(f.parentId) && !vaultIds.has(f.id)) {
          vaultIds.add(f.id);
          added = true;
        }
      }
    }
    const ids = Array.from(vaultIds);
    vaultFolderIdsCache.set(userId, { ids, cachedAt: Date.now() });
    return ids;
  }

  async moveToVault(userId: string, type: 'file' | 'folder', id: string) {
    vaultFolderIdsCache.delete(userId);
    const vault = await this.getOrCreateVaultFolder(userId);
    const moved = await this.moveItem(userId, type, id, vault.id);

    // Immediately revoke any existing public shares for this item and its descendants
    try {
      if (type === 'file') {
        await this.prisma.share.updateMany({
          where: { fileId: id, isRevoked: false },
          data: { isRevoked: true },
        });
      } else {
        const allVaultFolderIds = await this.getAllVaultFolderIds(userId);
        await this.prisma.share.updateMany({
          where: {
            isRevoked: false,
            OR: [
              { folderId: { in: allVaultFolderIds } },
              { file: { folderId: { in: allVaultFolderIds } } },
            ],
          },
          data: { isRevoked: true },
        });
      }
    } catch {}

    return moved;
  }

  async moveFromVault(userId: string, type: 'file' | 'folder', id: string) {
    vaultFolderIdsCache.delete(userId);
    return this.moveItem(userId, type, id, null);
  }

  // --- Secret Vault PIN Management via Email OTP ---
  async getVaultPinStatus() {
    const pinSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'secret_vault_pin_hash' },
    });
    return { isPinSet: !!pinSetting };
  }

  async requestVaultPinOtp(userEmail: string, meta: { ipAddress?: string; userAgent?: string }) {
    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || process.env.SUPER_ADMIN_EMAIL || userEmail || 'sheikhnoorabdullah02@gmail.com';
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await this.prisma.systemSetting.upsert({
      where: { key: 'vault_pin_otp' },
      update: { value: JSON.stringify({ hash: hashedOtp, expiresAt }) },
      create: { key: 'vault_pin_otp', value: JSON.stringify({ hash: hashedOtp, expiresAt }) },
    });

    await this.mail.sendVaultPinOtp({
      email: adminEmail,
      otp,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const [local, domain] = adminEmail.split('@');
    const masked = local.length > 3 ? `${local.slice(0, 2)}***${local.slice(-2)}@${domain}` : `${local.slice(0, 1)}***@${domain}`;
    return {
      success: true,
      message: `6-digit verification code sent to ${masked}`,
      maskedEmail: masked,
      expiresInSeconds: 600,
    };
  }

  async setVaultPin(code: string, newPin: string, userEmail: string, meta: { ipAddress?: string; userAgent?: string }) {
    const otpSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'vault_pin_otp' },
    });
    if (!otpSetting) {
      throw new BadRequestException('No verification code requested. Please click "Send Code".');
    }

    const { hash, expiresAt } = JSON.parse(otpSetting.value);
    if (Date.now() > expiresAt) {
      throw new BadRequestException('Verification code has expired. Please request a new code.');
    }

    const inputHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
    if (inputHash !== hash) {
      throw new BadRequestException('Incorrect 6-digit verification code. Please check your email.');
    }

    if (!newPin || newPin.length < 4 || newPin.length > 8) {
      throw new BadRequestException('PIN must be between 4 and 8 digits.');
    }

    const pinHash = await argon2.hash(newPin, { type: argon2.argon2id });
    await this.prisma.systemSetting.upsert({
      where: { key: 'secret_vault_pin_hash' },
      update: { value: pinHash },
      create: { key: 'secret_vault_pin_hash', value: pinHash },
    });

    // Delete used OTP
    await this.prisma.systemSetting.delete({ where: { key: 'vault_pin_otp' } }).catch(() => {});

    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || process.env.SUPER_ADMIN_EMAIL || userEmail;
    this.mail.sendVaultPinChanged({
      email: adminEmail,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { success: true, message: 'Secret Vault PIN set successfully!' };
  }

  async verifyVaultPin(pin: string, userEmail: string, meta: { ipAddress?: string; userAgent?: string }) {
    const pinSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'secret_vault_pin_hash' },
    });

    if (!pinSetting) {
      return { valid: false, needsSetup: true, message: 'Secret Vault PIN is not set yet. Please set up your PIN.' };
    }

    const isValid = await argon2.verify(pinSetting.value, pin).catch(() => false);
    if (isValid) {
      const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || process.env.SUPER_ADMIN_EMAIL || userEmail;
      this.mail.sendVaultUnlockedAlert({
        email: adminEmail,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return { valid: true };
    }

    return { valid: false, message: 'Incorrect Secret Vault PIN. Please try again.' };
  }

  // --- File Versioning ---
  async getFileVersions(userId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { storageObject: true },
        },
      },
    });
    if (!file || file.ownerId !== userId) throw new NotFoundException('File not found');

    return {
      fileId: file.id,
      fileName: file.name,
      currentVersion: file.version,
      versions: file.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        sizeBytes: v.sizeBytes.toString(),
        checksumSha256: v.checksumSha256,
        isCurrent: v.versionNumber === file.version,
        createdAt: v.createdAt,
      })),
    };
  }

  async restoreFileVersion(userId: string, fileId: string, versionNumber: number) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { versions: true },
    });
    if (!file || file.ownerId !== userId) throw new NotFoundException('File not found');

    const targetVersion = file.versions.find((v) => v.versionNumber === versionNumber);
    if (!targetVersion) throw new NotFoundException(`Version ${versionNumber} not found`);

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: {
        version: versionNumber,
        sizeBytes: targetVersion.sizeBytes,
        checksumSha256: targetVersion.checksumSha256,
        storageObjectId: targetVersion.storageObjectId,
        updatedAt: new Date(),
      },
      include: { storageObject: true },
    });

    await this.prisma.activity.create({
      data: {
        userId,
        fileId,
        action: 'UPDATE',
        details: { message: `Restored to Version ${versionNumber}` },
      },
    });

    return this.serializeFile(updated);
  }

  async streamBatchSelectionAsZip(
    userId: string,
    fileIds: string[],
    folderIds: string[],
    res: any,
  ) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="noor-drive-selection.zip"',
    );

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', () => {
      if (!res.headersSent) res.status(500).end();
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
        try {
          const stream = await this.storage.readFileStream(f.storageObjectId);
          archive.append(stream as any, { name: `${prefix}${safeZipEntryName(f.name)}` });
        } catch {}
      }

      for (const sf of subFolders) {
        await appendFolder(sf.id, `${prefix}${safeZipEntryName(sf.name)}/`);
      }
    };

    if (folderIds && folderIds.length > 0) {
      const folders = await this.prisma.folder.findMany({
        where: { id: { in: folderIds }, ownerId: userId, isTrash: false },
      });
      for (const folder of folders) {
        await appendFolder(folder.id, `${safeZipEntryName(folder.name)}/`);
      }
    }

    if (fileIds && fileIds.length > 0) {
      const files = await this.prisma.file.findMany({
        where: { id: { in: fileIds }, ownerId: userId, isTrash: false },
      });
      for (const f of files) {
        try {
          const stream = await this.storage.readFileStream(f.storageObjectId);
          archive.append(stream as any, { name: safeZipEntryName(f.name) });
        } catch {}
      }
    }

    await archive.finalize();
  }
}
