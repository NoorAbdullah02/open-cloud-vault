import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { StorageBackend } from '@prisma/client';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { CustomFile } from 'telegram/client/uploads';
import { Readable, PassThrough } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  GetObjectParams,
  IStorageProvider,
  PutObjectInput,
  StoredObjectResult,
} from './storage-provider.interface';

const TELEGRAM_SINGLE_PART_BYTES = 1800 * 1024 * 1024; // 1.8 GB safe chunk limit (Telegram limit is 2 GB)

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
      connectionRetries: 3,
      timeout: 15,
      useWSS: false,
    });

    // 15-second connect timeout to prevent indefinite hangs
    const connectPromise = client.connect();
    let connectTimer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      connectTimer = setTimeout(
        () => reject(new Error('Telegram MTProto connect timed out after 15s')),
        15000,
      );
    });

    try {
      await Promise.race([connectPromise, timeoutPromise]);
    } finally {
      clearTimeout(connectTimer!);
    }

    this.client = client;
    return client;
  }

  async putObject(input: PutObjectInput): Promise<StoredObjectResult> {
    const client = await this.getClient();
    const target = input.targetChatId || process.env.TELEGRAM_TARGET_CHANNEL || 'me';

    // Timeout based on file size (minimum 35 seconds, or ~1MB/sec rate limit buffer)
    const timeoutMs = Math.max(35000, Math.ceil(input.sizeBytes / 25000) * 1000);

    // 1. Single Part Upload (if file is <= 1.8 GB)
    if (input.sizeBytes <= TELEGRAM_SINGLE_PART_BYTES) {
      this.logger.log(`Uploading single file "${input.fileName}" (${input.sizeBytes} bytes) to Telegram target: ${target}`);

      const filePayload = input.buffer
        ? new CustomFile(input.fileName, input.sizeBytes, '', input.buffer)
        : input.tempFilePath!;

      let sendTimer: NodeJS.Timeout;
      const sendPromise = client.sendFile(target, {
        file: filePayload,
        forceDocument: true,
        caption: `NoorDrive | ${input.fileName} | sha256:${input.checksumSha256.slice(0, 16)}`,
      });
      const timeoutSend = new Promise<never>((_, reject) => {
        sendTimer = setTimeout(
          () => reject(new Error(`Telegram sendFile timed out after ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs,
        );
      });

      const sentMessage: any = await Promise.race([sendPromise, timeoutSend]).finally(() => {
        clearTimeout(sendTimer!);
      });

      const msgId = sentMessage.id;
      return {
        backend: this.backend,
        objectKey: `tg:${target}:${msgId}`,
        telegramMessageId: msgId,
        telegramChatId: target,
      };
    }

    // 2. Multi-Part Auto-Chunking for Massive Files (5GB, 10GB, 20GB, 50GB+)
    const totalChunks = Math.ceil(input.sizeBytes / TELEGRAM_SINGLE_PART_BYTES);
    this.logger.log(
      `Auto-chunking massive file "${input.fileName}" (${input.sizeBytes} bytes) into ${totalChunks} parts for Telegram...`,
    );

    const chunkMessageIds: number[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * TELEGRAM_SINGLE_PART_BYTES;
      const end = Math.min((i + 1) * TELEGRAM_SINGLE_PART_BYTES, input.sizeBytes);
      const partSize = end - start;
      const partSuffix = `part${(i + 1).toString().padStart(3, '0')}`;
      const tempChunkPath = path.join(
        os.tmpdir(),
        `noor-chunk-${Date.now()}-${i}-${path.basename(input.fileName)}`,
      );

      this.logger.log(`Preparing & uploading Part ${i + 1}/${totalChunks} (${partSize} bytes) to Telegram...`);

      if (input.tempFilePath) {
        await new Promise((resolve, reject) => {
          const readStream = fs.createReadStream(input.tempFilePath!, { start, end: end - 1 });
          const writeStream = fs.createWriteStream(tempChunkPath);
          readStream.pipe(writeStream);
          writeStream.on('finish', () => resolve(true));
          writeStream.on('error', reject);
        });
      } else if (input.buffer) {
        const slice = input.buffer.subarray(start, end);
        await fs.promises.writeFile(tempChunkPath, slice);
      }

      try {
        const sentMessage = await client.sendFile(target, {
          file: tempChunkPath,
          forceDocument: true,
          caption: `NoorDrive | ${input.fileName} (${partSuffix}) | sha256:${input.checksumSha256.slice(0, 16)}`,
        });
        chunkMessageIds.push(sentMessage.id);
      } finally {
        await fs.promises.unlink(tempChunkPath).catch(() => {});
      }
    }

    const multiMetadata = JSON.stringify({
      type: 'multipart',
      target,
      totalChunks,
      chunkMessageIds,
      sizeBytes: input.sizeBytes,
    });

    return {
      backend: this.backend,
      objectKey: multiMetadata,
      telegramMessageId: chunkMessageIds[0],
      telegramChatId: target,
    };
  }

  async getObjectStream(params: GetObjectParams): Promise<NodeJS.ReadableStream> {
    const client = await this.getClient();
    const defaultTarget = params.telegramChatId || process.env.TELEGRAM_TARGET_CHANNEL || 'me';

    // Check if multipart
    if (params.objectKey && params.objectKey.startsWith('{')) {
      try {
        const meta = JSON.parse(params.objectKey);
        if (meta.type === 'multipart' && Array.isArray(meta.chunkMessageIds)) {
          const target = meta.target || defaultTarget;
          const chunkMessageIds: number[] = meta.chunkMessageIds;
          const passThrough = new PassThrough();

          (async () => {
            try {
              for (let i = 0; i < chunkMessageIds.length; i++) {
                const msgId = chunkMessageIds[i];
                const messages = await client.getMessages(target, { ids: [msgId] });
                const message = messages[0];
                if (!message || !message.media) {
                  throw new BadRequestException(`Chunk part ${i + 1} not found in Telegram vault`);
                }
                const buffer = (await client.downloadMedia(message, {})) as Buffer;
                const canContinue = passThrough.write(buffer);
                if (!canContinue) {
                  await new Promise((resolve) => passThrough.once('drain', resolve));
                }
              }
              passThrough.end();
            } catch (err) {
              passThrough.destroy(err as Error);
            }
          })();

          return passThrough;
        }
      } catch (e: any) {
        this.logger.error(`Failed to parse multipart objectKey: ${e.message}`);
      }
    }

    // Standard single file stream
    if (!params.telegramMessageId) {
      throw new BadRequestException('Missing Telegram message ID for retrieval');
    }

    const messages = await client.getMessages(defaultTarget, {
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
    const client = await this.getClient();
    const target = params.telegramChatId || process.env.TELEGRAM_TARGET_CHANNEL || 'me';

    if (params.objectKey && params.objectKey.startsWith('{')) {
      try {
        const meta = JSON.parse(params.objectKey);
        if (meta.type === 'multipart' && Array.isArray(meta.chunkMessageIds)) {
          await client.deleteMessages(meta.target || target, meta.chunkMessageIds, { revoke: true });
          return;
        }
      } catch {}
    }

    if (!params.telegramMessageId) return;
    await client.deleteMessages(target, [params.telegramMessageId], { revoke: true });
  }
}

