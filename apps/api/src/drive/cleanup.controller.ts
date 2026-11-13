import { Controller, Get, Post, Query, Headers, UnauthorizedException } from '@nestjs/common';
import { CleanupService } from './cleanup.service';

@Controller('cleanup')
export class CleanupController {
  constructor(private readonly cleanupService: CleanupService) {}

  @Get('run')
  async triggerGet(
    @Query('secret') secret?: string,
    @Headers('x-cron-secret') headerSecret?: string,
  ) {
    return this.handleCleanup(secret || headerSecret);
  }

  @Post('run')
  async triggerPost(
    @Query('secret') secret?: string,
    @Headers('x-cron-secret') headerSecret?: string,
  ) {
    return this.handleCleanup(secret || headerSecret);
  }

  private async handleCleanup(providedSecret?: string) {
    const validSecret = process.env.CRON_SECRET || '42020277bf18898ec64efea81e64e984';
    if (!providedSecret || providedSecret !== validSecret) {
      throw new UnauthorizedException('Invalid or missing cleanup secret');
    }
    const stats = await this.cleanupService.runCleanup();
    return {
      success: true,
      timestamp: new Date().toISOString(),
      stats,
    };
  }
}
