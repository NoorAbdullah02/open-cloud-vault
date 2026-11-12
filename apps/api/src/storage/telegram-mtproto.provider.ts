import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { StorageBackend } from '@prisma/client';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { CustomFile } from 'telegram/client/uploads';
import { Readable } from 'stream';
import {
  GetObjectParams,
  IStorageProvider,
  PutObjectInput,
  StoredObjectResult,
} from './storage-provider.interface';

const TELEGRAM_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB standard limit

@Injectable()
export class TelegramMtprotoProvider implements IStorageProvider {
  readonly backend = StorageBackend.TELEGRAM_MTPROTO;
  private readonly logger = new Logger(TelegramMtprotoProvider.name);
  private client: TelegramClient | null = null;

  isConfigured(): boolean {
    return (
      process.env.TELEGRAM_ENABLED === 'true' &&
      process.env.TELEGRAM_USER_CONSENT === 'true' &&
      Boolean(process.env.TELEGRAM_API_ID) &&
      Boolean(process.env.TELEGRAM_API_HASH) &&
      Boolean(process.env.TELEGRAM_SESSION_STRING)
    );
  }

  private async getClient(): Promise<TelegramClient> {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Telegram MTProto storage is not enabled or user consent has not been granted.',
      );
    }

    if (this.client && this.client.connected) {
      return this.client;
    }

    const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
    const apiHash = process.env.TELEGRAM_API_HASH || '';
    const sessionString = process.env.TELEGRAM_SESSION_STRING || '';

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
      connectionRetries: 5,
    });

    await client.connect();
    this.client = client;
    return client;
  }

  async putObject(input: PutObjectInput): Promise<StoredObjectResult> {
    if (input.sizeBytes > TELEGRAM_MAX_FILE_BYTES) {
      throw new BadRequestException(
        'File exceeds Telegram standard 2 GB per-file limit. Use Local or S3 storage for larger files.',
      );
    }

    const client = await this.getClient();
    const target = input.targetChatId || process.env.TELEGRAM_TARGET_CHANNEL || 'me';

    this.logger.log(`Uploading "${input.fileName}" (${input.sizeBytes} bytes) to Telegram target: ${target}`);

    const filePayload = input.buffer
      ? new CustomFile(input.fileName, input.sizeBytes, '', input.buffer)
      : input.tempFilePath!;

    const sentMessage = await client.sendFile(target, {
      file: filePayload,
      forceDocument: true,
      caption: `NoorDrive | ${input.fileName} | sha256:${input.checksumSha256.slice(0, 16)}`,
    });

    const msgId = sentMessage.id;
    return {
      backend: this.backend,
      objectKey: `tg:${target}:${msgId}`,
      telegramMessageId: msgId,
      telegramChatId: target,
    };
  }

  async getObjectStream(params: GetObjectParams): Promise<NodeJS.ReadableStream> {
    if (!params.telegramMessageId) {
      throw new BadRequestException('Missing Telegram message ID for retrieval');
    }

    const client = await this.getClient();
    const target = params.telegramChatId || process.env.TELEGRAM_TARGET_CHANNEL || 'me';

    const messages = await client.getMessages(target, {
      ids: [params.telegramMessageId],
    });

    const message = messages[0];
    if (!message || !message.media) {
      throw new BadRequestException('File not found in Telegram vault');
    }

    const buffer = (await client.downloadMedia(message, {})) as Buffer;
    return Readable.from(buffer);
  }

  async deleteObject(params: GetObjectParams): Promise<void> {
    if (!params.telegramMessageId) return;
    const client = await this.getClient();
    const target = params.telegramChatId || process.env.TELEGRAM_TARGET_CHANNEL || 'me';
    await client.deleteMessages(target, [params.telegramMessageId], { revoke: true });
  }
}

