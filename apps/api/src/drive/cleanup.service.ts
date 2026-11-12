import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    // Run initial cleanup 10s after boot, then every 6 hours
    setTimeout(() => this.runCleanup(), 10_000);
    this.intervalHandle = setInterval(() => this.runCleanup(), 6 * 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }

  async runCleanup(): Promise<void> {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // 1. Delete expired or revoked sessions older than 7 days
      const deletedSessions = await this.prisma.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: sevenDaysAgo } },
          ],
        },
      });

      // 2. Delete revoked or expired share links older than 7 days
      const deletedShares = await this.prisma.share.deleteMany({
        where: {
          OR: [
            { isRevoked: true, updatedAt: { lt: sevenDaysAgo } },
            { expiresAt: { lt: sevenDaysAgo } },
          ],
        },
      });

      // 3. Delete old audit logs and activity entries older than 30 days
      const [deletedLogs, deletedActivities] = await Promise.all([
        this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
        this.prisma.activity.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
      ]);

      // 4. Auto-purge trashed files & folders older than trash_retention_days (default 30)
      const retentionSetting = await this.prisma.systemSetting.findUnique({
        where: { key: 'trash_retention_days' },
      });
      const retentionDays = parseInt(retentionSetting?.value || '30', 10) || 30;
      const trashCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

      const expiredTrashedFiles = await this.prisma.file.findMany({
        where: { isTrash: true, trashedAt: { lt: trashCutoff } },
      });

      for (const file of expiredTrashedFiles) {
        await this.prisma.file.delete({ where: { id: file.id } });
        await this.storage.deleteStoredObject(file.storageObjectId).catch(() => {});
        await this.prisma.userQuota.updateMany({
          where: { userId: file.ownerId },
          data: { usedStorageBytes: { decrement: file.sizeBytes } },
        });
      }

      const deletedFolders = await this.prisma.folder.deleteMany({
        where: { isTrash: true, trashedAt: { lt: trashCutoff } },
      });

      if (
        deletedSessions.count ||
        deletedShares.count ||
        deletedLogs.count ||
        deletedActivities.count ||
        expiredTrashedFiles.length ||
        deletedFolders.count
      ) {
        this.logger.log(
          `Auto-cleanup complete: sessions=${deletedSessions.count}, shares=${deletedShares.count}, logs=${deletedLogs.count}, activities=${deletedActivities.count}, trashedFiles=${expiredTrashedFiles.length}, trashedFolders=${deletedFolders.count}`,
        );
      }
    } catch (err) {
      this.logger.error('Auto-cleanup failed:', err);
    }
  }
}

