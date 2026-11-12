export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  USER = 'USER',
  GUEST = 'GUEST',
}

export enum SharePermission {
  VIEWER = 'VIEWER',
  COMMENTER = 'COMMENTER',
  EDITOR = 'EDITOR',
}

export enum StorageBackend {
  LOCAL_DISK = 'LOCAL_DISK',
  TELEGRAM_MTPROTO = 'TELEGRAM_MTPROTO',
  S3_COMPATIBLE = 'S3_COMPATIBLE',
}

export interface UserProfileDto {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isVerified: boolean;
  twoFactorEnabled: boolean;
  storageQuotaBytes: string;
  usedStorageBytes: string;
  preferredStorageBackend: StorageBackend;
  telegramConsentGiven: boolean;
  createdAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  user: UserProfileDto;
}

export interface FileItemDto {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  sizeBytes: string;
  checksumSha256: string;
  storageBackend: StorageBackend;
  folderId: string | null;
  ownerId: string;
  isStarred: boolean;
  isTrash: boolean;
  tags: string[];
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderItemDto {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  isStarred: boolean;
  isTrash: boolean;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

