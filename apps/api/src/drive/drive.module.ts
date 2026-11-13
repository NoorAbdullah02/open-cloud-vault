import { Module } from '@nestjs/common';
import { DriveService } from './drive.service';
import { DriveController } from './drive.controller';
import { CleanupService } from './cleanup.service';
import { CleanupController } from './cleanup.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [DriveController, CleanupController],
  providers: [DriveService, CleanupService],
  exports: [DriveService, CleanupService],
})
export class DriveModule {}

