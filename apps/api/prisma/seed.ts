import { PrismaClient, Role, StorageBackend } from '@prisma/client';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@noordrive.local';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMeStrongPassword123!';
  const fullName = process.env.SUPER_ADMIN_NAME || 'Noor Owner';

  // 1. Seed Storage Providers
  await prisma.storageProvider.upsert({
    where: { backend: StorageBackend.LOCAL_DISK },
    update: {},
    create: {
      name: 'Local Vault Disk',
      backend: StorageBackend.LOCAL_DISK,
      isEnabled: true,
      isDefault: true,
      configJson: {
        basePath: process.env.LOCAL_STORAGE_PATH || './storage/vault',
      },
    },
  });

  await prisma.storageProvider.upsert({
    where: { backend: StorageBackend.TELEGRAM_MTPROTO },
    update: {},
    create: {
      name: 'Telegram MTProto Private Vault',
      backend: StorageBackend.TELEGRAM_MTPROTO,
      isEnabled: process.env.TELEGRAM_ENABLED === 'true',
      isDefault: false,
      configJson: {
        targetChannel: process.env.TELEGRAM_TARGET_CHANNEL || 'me',
        maxFileSizeBytes: 2147483648, // 2 GB standard limit
        requiresUserConsent: true,
      },
    },
  });

  await prisma.storageProvider.upsert({
    where: { backend: StorageBackend.S3_COMPATIBLE },
    update: {},
    create: {
      name: 'S3 Compatible Object Storage',
      backend: StorageBackend.S3_COMPATIBLE,
      isEnabled: false,
      isDefault: false,
      configJson: {},
    },
  });

  // 2. Seed System Settings (Personal mode by default: public registration disabled)
  const settings = [
    { key: 'registration_enabled', value: 'false' },
    { key: 'maintenance_mode', value: 'false' },
    { key: 'trash_retention_days', value: '30' },
    { key: 'max_upload_size_bytes', value: '2147483648' },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // 3. Seed Exclusive Super Admin / Personal Owner
  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: Role.SUPER_ADMIN,
        isVerified: true,
        preferredStorageBackend: StorageBackend.TELEGRAM_MTPROTO,
        telegramConsentGiven: true,
        telegramChatTarget: 'me',
        profile: {
          create: {
            fullName,
            theme: 'light',
          },
        },
        quota: {
          create: {
            storageQuotaBytes: BigInt(1099511627776), // 1 TB
            usedStorageBytes: BigInt(0),
            maxFileSizeBytes: BigInt(2147483648), // 2 GB
          },
        },
      },
    });
    console.log(`Personal Owner seeded with passcode in DB: ${email}`);
  } else {
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        preferredStorageBackend: StorageBackend.TELEGRAM_MTPROTO,
        telegramConsentGiven: true,
      },
    });
    console.log(`Personal Owner passcode & Telegram preference updated in DB: ${email}`);
  }
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

