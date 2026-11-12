import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { Role, StorageBackend } from '@prisma/client';
import { RegisterDto, LoginDto, PasscodeLoginDto, ChangePasswordDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async issueTokensForUser(
    userId: string,
    email: string,
    role: Role,
    meta: { ipAddress?: string; userAgent?: string; deviceName?: string; platform?: string },
  ) {
    const deviceHash = crypto
      .createHash('sha256')
      .update(`${meta.deviceName || 'Web Browser'}:${meta.platform || 'web'}:${meta.userAgent || ''}`)
      .digest('hex');

    const device = await this.prisma.device.upsert({
      where: { userId_deviceHash: { userId, deviceHash } },
      update: { lastActive: new Date() },
      create: {
        userId,
        deviceName: meta.deviceName || 'Web Browser',
        platform: meta.platform || 'web',
        deviceHash,
      },
    });

    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const hashedRefreshToken = this.hashToken(rawRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const session = await this.prisma.session.create({
      data: {
        userId,
        deviceId: device.id,
        refreshToken: hashedRefreshToken,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        expiresAt,
      },
    });

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        email,
        role,
        sessionId: session.id,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      },
    );

    const userRecord = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, quota: true },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: userRecord!.id,
        email: userRecord!.email,
        fullName: userRecord!.profile?.fullName || 'Owner',
        role: userRecord!.role,
        isVerified: userRecord!.isVerified,
        twoFactorEnabled: userRecord!.twoFactorEnabled,
        preferredStorageBackend: userRecord!.preferredStorageBackend,
        telegramConsentGiven: userRecord!.telegramConsentGiven,
        storageQuotaBytes: (userRecord!.quota?.storageQuotaBytes ?? BigInt(0)).toString(),
        usedStorageBytes: (userRecord!.quota?.usedStorageBytes ?? BigInt(0)).toString(),
        createdAt: userRecord!.createdAt.toISOString(),
      },
    };
  }

  async register(
    dto: RegisterDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const regSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'registration_enabled' },
    });

    if (regSetting?.value !== 'true') {
      throw new ForbiddenException(
        'Public registration is disabled in personal mode. Sign in with your owner account or enable registration in settings.',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        role: Role.USER,
        isVerified: true,
        preferredStorageBackend: StorageBackend.LOCAL_DISK,
        profile: {
          create: { fullName: dto.fullName.trim() },
        },
        quota: {
          create: {
            storageQuotaBytes: BigInt(53687091200),
            usedStorageBytes: BigInt(0),
          },
        },
      },
    });

    await this.audit.log({
      actorId: user.id,
      action: 'USER_REGISTER',
      targetType: 'User',
      targetId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return this.issueTokensForUser(user.id, user.email, user.role, {
      ...meta,
      deviceName: dto.deviceName,
      platform: dto.platform,
    });
  }

  async loginWithPasscode(
    dto: PasscodeLoginDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const ownerEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@noordrive.local';
    const envPasscode = process.env.DRIVE_PASSCODE;

    if (envPasscode) {
      if (dto.passcode !== envPasscode) {
        throw new UnauthorizedException('Invalid passcode');
      }
      const user = await this.prisma.user.findUnique({
        where: { email: ownerEmail },
      });
      if (!user) {
        throw new UnauthorizedException('Owner account not seeded');
      }
      if (user.twoFactorEnabled) {
        if (!dto.totpCode) {
          return { requiresTwoFactor: true };
        }
        const isTotpValid = authenticator.check(dto.totpCode, user.twoFactorSecret || '');
        if (!isTotpValid) {
          throw new UnauthorizedException('Invalid two-factor authentication code');
        }
      }
      await this.audit.log({
        actorId: user.id,
        action: 'PASSCODE_LOGIN_SUCCESS',
        targetType: 'User',
        targetId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return this.issueTokensForUser(user.id, user.email, user.role, {
        ...meta,
        deviceName: dto.deviceName,
        platform: dto.platform,
      });
    }

    return this.login(
      {
        email: ownerEmail,
        password: dto.passcode,
        totpCode: dto.totpCode,
        deviceName: dto.deviceName,
        platform: dto.platform,
      },
      meta,
    );
  }

  async login(dto: LoginDto, meta: { ipAddress?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.isSuspended) {
      throw new ForbiddenException('Account is suspended');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      await this.audit.log({
        actorId: user.id,
        action: 'LOGIN_FAILED',
        targetType: 'User',
        targetId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.twoFactorEnabled) {
      if (!dto.totpCode) {
        return { requiresTwoFactor: true };
      }
      const isTotpValid = authenticator.check(dto.totpCode, user.twoFactorSecret || '');
      if (!isTotpValid) {
        throw new UnauthorizedException('Invalid two-factor authentication code');
      }
    }

    await this.audit.log({
      actorId: user.id,
      action: 'LOGIN_SUCCESS',
      targetType: 'User',
      targetId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return this.issueTokensForUser(user.id, user.email, user.role, {
      ...meta,
      deviceName: dto.deviceName,
      platform: dto.platform,
    });
  }

  async refreshTokens(
    rawRefreshToken: string,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const hashed = this.hashToken(rawRefreshToken);
    const existingSession = await this.prisma.session.findUnique({
      where: { refreshToken: hashed },
      include: { user: true },
    });

    if (!existingSession || existingSession.revokedAt || existingSession.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate refresh token: revoke old session
    await this.prisma.session.update({
      where: { id: existingSession.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokensForUser(
      existingSession.user.id,
      existingSession.user.email,
      existingSession.user.role,
      meta,
    );
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async logoutAllDevices(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      actorId: userId,
      action: 'LOGOUT_ALL_DEVICES',
      targetType: 'User',
      targetId: userId,
    });
    return { success: true };
  }

  async getSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { device: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    const otpauthUrl = authenticator.keyuri(user.email, 'Noor Drive', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async verifyAndEnableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('2FA setup not initiated');
    }

    const valid = authenticator.check(code, user.twoFactorSecret);
    if (!valid) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    await this.audit.log({
      actorId: userId,
      action: '2FA_ENABLED',
      targetType: 'User',
      targetId: userId,
    });

    return { twoFactorEnabled: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await this.audit.log({
      actorId: userId,
      action: 'PASSWORD_CHANGED',
      targetType: 'User',
      targetId: userId,
    });

    return { success: true };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, quota: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    return {
      id: user.id,
      email: user.email,
      fullName: user.profile?.fullName || 'Owner',
      role: user.role,
      isVerified: user.isVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      preferredStorageBackend: user.preferredStorageBackend,
      telegramConsentGiven: user.telegramConsentGiven,
      storageQuotaBytes: (user.quota?.storageQuotaBytes ?? BigInt(0)).toString(),
      usedStorageBytes: (user.quota?.usedStorageBytes ?? BigInt(0)).toString(),
      createdAt: user.createdAt.toISOString(),
    };
  }
}

