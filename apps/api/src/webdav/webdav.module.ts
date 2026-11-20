import { Module } from '@nestjs/common';
import { WebdavController } from './webdav.controller';
import { WebdavService } from './webdav.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [WebdavController],
  providers: [WebdavService],
  exports: [WebdavService],
})
export class WebdavModule {}
