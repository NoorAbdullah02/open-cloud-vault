import { Injectable, BadRequestException } from '@nestjs/common';
import { StorageBackend } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageProvider } from './local-storage.provider';
import { TelegramMtprotoProvider } from './telegram-mtproto.provider';
import {
  GetObjectParams,
  IStorageProvider,
  PutObjectInput,
  StoredObjectResult,
} from './storage-provider.interface';

@Injectable()
export class StorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly localProvider: LocalStorageProvider,
    private readonly telegramProvider: TelegramMtprotoProvider,
  ) {}

  getProvider(backend: StorageBackend): IStorageProvider {
    switch (backend) {
      case StorageBackend.LOCAL_DISK:
        return this.localProvider;
      case StorageBackend.TELEGRAM_MTPROTO:
        if (!this.telegramProvider.isConfigured()) {
          throw new BadRequestException(
            'Telegram MTProto storage is not configured or consent is not granted.',
          );
        }
        return this.telegramProvider;
      default:
        throw new BadRequestException(`Storage backend ${backend} is not active yet.`);
    }
  }

  async storeFile(
    backend: StorageBackend,
    input: PutObjectInput,
  ): Promise<{ storageObjectId: string; result: StoredObjectResult }> {
    const provider = this.getProvider(backend);
    const dbProvider = await this.prisma.storageProvider.findUnique({
      where: { backend },
    });

    if (!dbProvider) {
      throw new BadRequestException(`Storage provider ${backend} not registered in database`);
    }

    const result = await provider.putObject(input);

    const storageObject = await this.prisma.storageObject.create({
      data: {
        providerId: dbProvider.id,
        backend,
        objectKey: result.objectKey,
        telegramMessageId: result.telegramMessageId,
        telegramChatId: result.telegramChatId,
        checksumSha256: input.checksumSha256,
        sizeBytes: BigInt(input.sizeBytes),
      },
    });

    return { storageObjectId: storageObject.id, result };
  }

  async readFileStream(storageObjectId: string): Promise<NodeJS.ReadableStream> {
    const obj = await this.prisma.storageObject.findUnique({
      where: { id: storageObjectId },
    });
    if (!obj) {
      throw new BadRequestException('Storage object not found');
    }
    const provider = this.getProvider(obj.backend);
    const params: GetObjectParams = {
      objectKey: obj.objectKey,
      telegramMessageId: obj.telegramMessageId,
      telegramChatId: obj.telegramChatId,
    };
    return provider.getObjectStream(params);
  }

  async deleteStoredObject(storageObjectId: string): Promise<void> {
    const referencingFilesCount = await this.prisma.file.count({
      where: { storageObjectId },
    });
    const referencingVersionsCount = await this.prisma.fileVersion.count({
      where: { storageObjectId },
    });
    if (referencingFilesCount > 0 || referencingVersionsCount > 0) {
      return;
    }

    const obj = await this.prisma.storageObject.findUnique({
      where: { id: storageObjectId },
    });
    if (!obj) return;
    const provider = this.getProvider(obj.backend);
    await provider.deleteObject({
      objectKey: obj.objectKey,
      telegramMessageId: obj.telegramMessageId,
      telegramChatId: obj.telegramChatId,
    });
    await this.prisma.storageObject.delete({ where: { id: obj.id } });
  }

  getProviderStatuses() {
    return [
      {
        backend: StorageBackend.LOCAL_DISK,
        name: 'Local Vault Disk',
        configured: this.localProvider.isConfigured(),
      },
      {
        backend: StorageBackend.TELEGRAM_MTPROTO,
        name: 'Telegram MTProto Private Vault',
        configured: this.telegramProvider.isConfigured(),
        requiresConsent: true,
        maxFileSizeBytes: 2 * 1024 * 1024 * 1024,
      },
    ];
  }
}

