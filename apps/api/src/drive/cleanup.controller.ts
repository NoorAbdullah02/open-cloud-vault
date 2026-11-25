import { Controller, Get, Post, Query, Headers, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
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
    const validSecret = process.env.CRON_SECRET;

    // Fail closed: no hardcoded fallback that allows anonymous destructive cleanup.
    if (
      !validSecret ||
      !providedSecret ||
      Buffer.byteLength(providedSecret) !== Buffer.byteLength(validSecret) ||
      !crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(validSecret))
    ) {
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

