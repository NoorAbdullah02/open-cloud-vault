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

  async runCleanup(): Promise<{
    deletedSessions: number;
    deletedShares: number;
    deletedLogs: number;
    deletedActivities: number;
    deletedNotifications: number;
    deletedUploadSessions: number;
    trashedFiles: number;
    deletedFolders: number;
  }> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
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

      // 3. Delete stale/expired upload sessions older than 24 hours
      const deletedUploadSessions = await this.prisma.uploadSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { status: 'FAILED', expiresAt: { lt: oneDayAgo } },
            { status: 'COMPLETED', expiresAt: { lt: oneDayAgo } },
          ],
        },
      }).catch(() => ({ count: 0 }));

      // 4. Delete read notifications older than 7 days, or any notifications older than 30 days
      const deletedNotifications = await this.prisma.notification.deleteMany({
        where: {
          OR: [
            { isRead: true, createdAt: { lt: sevenDaysAgo } },
            { createdAt: { lt: thirtyDaysAgo } },
          ],
        },
      }).catch(() => ({ count: 0 }));

      // 5. Delete activity entries older than 14 days and audit logs older than 30 days
      const [deletedLogs, deletedActivities] = await Promise.all([
        this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
        this.prisma.activity.deleteMany({ where: { createdAt: { lt: fourteenDaysAgo } } }),
      ]);

      // 6. Auto-purge trashed files & folders older than trash_retention_days (default 30)
      const retentionSetting = await this.prisma.systemSetting.findUnique({
        where: { key: 'trash_retention_days' },
      });
      const retentionDays = parseInt(retentionSetting?.value || '30', 10) || 30;
      const trashCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

      const expiredTrashedFiles = await this.prisma.file.findMany({
        where: { isTrash: true, trashedAt: { lt: trashCutoff } },
      });

      for (const file of expiredTrashedFiles) {
        await this.prisma.file.delete({ where: { id: file.id } }).catch(() => {});
        await this.storage.deleteStoredObject(file.storageObjectId).catch(() => {});
        await this.prisma.userQuota.updateMany({
          where: { userId: file.ownerId },
          data: { usedStorageBytes: { decrement: file.sizeBytes } },
        }).catch(() => {});
      }

      const deletedFolders = await this.prisma.folder.deleteMany({
        where: { isTrash: true, trashedAt: { lt: trashCutoff } },
      });

      const stats = {
        deletedSessions: deletedSessions.count,
        deletedShares: deletedShares.count,
        deletedLogs: deletedLogs.count,
        deletedActivities: deletedActivities.count,
        deletedNotifications: deletedNotifications.count,
        deletedUploadSessions: deletedUploadSessions.count,
        trashedFiles: expiredTrashedFiles.length,
        deletedFolders: deletedFolders.count,
      };

      if (
        stats.deletedSessions ||
        stats.deletedShares ||
        stats.deletedLogs ||
        stats.deletedActivities ||
        stats.deletedNotifications ||
        stats.deletedUploadSessions ||
        stats.trashedFiles ||
        stats.deletedFolders
      ) {
        this.logger.log(
          `Auto-cleanup complete: sessions=${stats.deletedSessions}, shares=${stats.deletedShares}, activities=${stats.deletedActivities}, notifications=${stats.deletedNotifications}, uploadSessions=${stats.deletedUploadSessions}, logs=${stats.deletedLogs}, trashedFiles=${stats.trashedFiles}, trashedFolders=${stats.deletedFolders}`,
        );
      }

      return stats;
    } catch (err) {
      this.logger.error('Auto-cleanup failed:', err);
      return {
        deletedSessions: 0,
        deletedShares: 0,
        deletedLogs: 0,
        deletedActivities: 0,
        deletedNotifications: 0,
        deletedUploadSessions: 0,
        trashedFiles: 0,
        deletedFolders: 0,
      };
    }
  }
}

