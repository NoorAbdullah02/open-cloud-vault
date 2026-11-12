import { StorageBackend } from '@prisma/client';

export interface PutObjectInput {
  tempFilePath?: string;
  buffer?: Buffer;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  targetChatId?: string;
}

export interface StoredObjectResult {
  backend: StorageBackend;
  objectKey: string;
  telegramMessageId?: number;
  telegramChatId?: string;
}

export interface GetObjectParams {
  objectKey: string;
  telegramMessageId?: number | null;
  telegramChatId?: string | null;
}

export interface IStorageProvider {
  readonly backend: StorageBackend;
  isConfigured(): boolean;
  putObject(input: PutObjectInput): Promise<StoredObjectResult>;
  getObjectStream(params: GetObjectParams): Promise<NodeJS.ReadableStream>;
  deleteObject(params: GetObjectParams): Promise<void>;
}

