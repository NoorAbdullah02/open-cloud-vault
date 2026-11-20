import { Module } from '@nestjs/common';
import { WebdavController } from './webdav.controller';
import { WebdavService } from './webdav.service';
import { StorageModule } from '../storage/storage.module';
import { DriveModule } from '../drive/drive.module';

@Module({
  imports: [StorageModule, DriveModule],
  controllers: [WebdavController],
  providers: [WebdavService],
  exports: [WebdavService],
})
export class WebdavModule {}
