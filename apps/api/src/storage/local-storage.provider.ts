import { Injectable, NotFoundException } from '@nestjs/common';
import { StorageBackend } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  GetObjectParams,
  IStorageProvider,
  PutObjectInput,
  StoredObjectResult,
} from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  readonly backend = StorageBackend.LOCAL_DISK;
  private readonly basePath: string;

  constructor() {
    const configured = process.env.LOCAL_STORAGE_PATH || './storage/vault';
    this.basePath = path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), '../../', configured);
  }

  isConfigured(): boolean {
    return fs.existsSync(this.basePath);
  }

  async putObject(input: PutObjectInput): Promise<StoredObjectResult> {
    const objectKey = `${crypto.randomUUID()}.bin`;
    await fs.promises.mkdir(this.basePath, { recursive: true });
    const destPath = path.join(this.basePath, objectKey);

    if (input.buffer) {
      await fs.promises.writeFile(destPath, input.buffer);
    } else if (input.tempFilePath) {
      try {
        // Fast instant atomic rename (0ms inode move) if on same filesystem
        await fs.promises.rename(input.tempFilePath, destPath);
      } catch (err: any) {
        if (err?.code === 'EXDEV') {
          await fs.promises.copyFile(input.tempFilePath, destPath);
          await fs.promises.unlink(input.tempFilePath).catch(() => {});
        } else {
          throw err;
        }
      }
    }

    return {
      backend: this.backend,
      objectKey,
    };
  }

  async getObjectStream(params: GetObjectParams): Promise<NodeJS.ReadableStream> {
    const safeKey = path.basename(params.objectKey);
    const fullPath = path.join(this.basePath, safeKey);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('File object not found in local storage');
    }
    const streamOptions: { highWaterMark: number; start?: number; end?: number } = {
      highWaterMark: 1024 * 1024, // 1MB buffer for high-throughput downloads
    };
    if (params.range) {
      streamOptions.start = params.range.start;
      streamOptions.end = params.range.end;
    }
    return fs.createReadStream(fullPath, streamOptions);
  }

  async deleteObject(params: GetObjectParams): Promise<void> {
    const safeKey = path.basename(params.objectKey);
    const fullPath = path.join(this.basePath, safeKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }
}

