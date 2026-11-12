import { Module } from '@nestjs/common';
import { DriveService } from './drive.service';
import { DriveController } from './drive.controller';
import { CleanupService } from './cleanup.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [DriveController],
  providers: [DriveService, CleanupService],
})
export class DriveModule {}

