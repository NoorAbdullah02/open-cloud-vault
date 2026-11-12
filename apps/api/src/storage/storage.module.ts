import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { LocalStorageProvider } from './local-storage.provider';
import { TelegramMtprotoProvider } from './telegram-mtproto.provider';

@Module({
  providers: [StorageService, LocalStorageProvider, TelegramMtprotoProvider],
  exports: [StorageService],
})
export class StorageModule {}

