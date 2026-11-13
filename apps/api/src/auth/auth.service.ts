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
import {
  RegisterDto,
  LoginDto,
  PasscodeLoginDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
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
        secret: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'fallback-dev-secret-change-me',
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
    const ownerEmail = (process.env.SUPER_ADMIN_EMAIL || 'sheikhnoorabdullah02@gmail.com').toLowerCase().trim();
    // Unified Master Password / Passcode: reads SUPER_ADMIN_PASSWORD first, with DRIVE_PASSCODE fallback
    const envPasscode = process.env.SUPER_ADMIN_PASSWORD || process.env.DRIVE_PASSCODE || '12345';

    // 1. Locate user (super admin or owner)
    let user = await this.prisma.user.findUnique({
      where: { email: ownerEmail },
    });
    if (!user) {
      // Auto-migrate if another super admin account exists in database
      const fallbackAdmin = await this.prisma.user.findFirst({
        where: { role: Role.SUPER_ADMIN },
      });
      if (fallbackAdmin) {
        user = await this.prisma.user.update({
          where: { id: fallbackAdmin.id },
          data: { email: ownerEmail },
        });
      }
    }
    if (!user) {
      throw new UnauthorizedException('Owner account not seeded. Please run database seed.');
    }

    // 2. Validate passcode against SUPER_ADMIN_PASSWORD / DRIVE_PASSCODE / passwordHash
    let isPasscodeValid = false;
    if (envPasscode && dto.passcode === envPasscode) {
      isPasscodeValid = true;
    } else if (process.env.DRIVE_PASSCODE && dto.passcode === process.env.DRIVE_PASSCODE) {
      isPasscodeValid = true;
    } else {
      const dynamicPasscode = await this.prisma.systemSetting.findUnique({
        where: { key: 'drive_passcode' },
      });
      if (dynamicPasscode && dto.passcode === dynamicPasscode.value) {
        isPasscodeValid = true;
      } else {
        isPasscodeValid = await argon2.verify(user.passwordHash, dto.passcode).catch(() => false);
      }
    }

    if (!isPasscodeValid) {
      this.mail.sendSecurityAlert({
        reason: 'Failed Passcode Attempt on NOOR DRIVE',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Incorrect passcode');
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

    this.mail.sendLoginAlert({
      email: user.email,
      loginMethod: 'Master Passcode',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      deviceName: dto.deviceName,
      platform: dto.platform,
    });

    return this.issueTokensForUser(user.id, user.email, user.role, {
      ...meta,
      deviceName: dto.deviceName,
      platform: dto.platform,
    });
  }

  /**
   * Request a 6-digit OTP to reset password via Brevo email
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const ownerEmail = (dto.email || process.env.ADMIN_NOTIFY_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'sheikhnoorabdullah02@gmail.com')
      .toLowerCase()
      .trim();

    let user = await this.prisma.user.findUnique({
      where: { email: ownerEmail },
    });
    if (!user) {
      user = await this.prisma.user.findFirst({
        where: { role: Role.SUPER_ADMIN },
      });
    }

    if (!user) {
      throw new BadRequestException('User account not found');
    }

    // Generate cryptographically secure 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedOtp,
        resetPasswordExpires: expiresAt,
      },
    });

    // Send email via Brevo
    await this.mail.sendPasswordResetOtp({
      email: user.email,
      otp,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Mask email for display in UI: e.g. sh***02@gmail.com
    const [localPart, domain] = user.email.split('@');
    const maskedLocal =
      localPart.length > 3
        ? `${localPart.slice(0, 2)}***${localPart.slice(-2)}`
        : `${localPart.slice(0, 1)}***`;
    const maskedEmail = `${maskedLocal}@${domain}`;

    return {
      success: true,
      message: `A 6-digit verification code has been sent to ${maskedEmail}`,
      maskedEmail,
      email: user.email,
      expiresInSeconds: 600,
    };
  }

  /**
   * Verify the 6-digit OTP and reset password / passcode
   */
  async resetPassword(
    dto: ResetPasswordDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const ownerEmail = (dto.email || process.env.ADMIN_NOTIFY_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'sheikhnoorabdullah02@gmail.com')
      .toLowerCase()
      .trim();

    let user = await this.prisma.user.findUnique({
      where: { email: ownerEmail },
    });
    if (!user) {
      user = await this.prisma.user.findFirst({
        where: { role: Role.SUPER_ADMIN },
      });
    }

    if (!user) {
      throw new BadRequestException('User account not found');
    }

    if (!user.resetPasswordToken || !user.resetPasswordExpires) {
      throw new BadRequestException('No active password reset request. Please request a new code.');
    }

    if (new Date() > user.resetPasswordExpires) {
      throw new BadRequestException('Verification code has expired. Please request a new code.');
    }

    const hashedInput = crypto.createHash('sha256').update(dto.code.trim()).digest('hex');
    if (hashedInput !== user.resetPasswordToken) {
      throw new BadRequestException('Invalid 6-digit verification code. Please check your email.');
    }

    // Hash new password with Argon2id
    const newPasswordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });

    // Update user password and clear reset token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    // Also update dynamic passcode setting so login works with new code
    await this.prisma.systemSetting.upsert({
      where: { key: 'drive_passcode' },
      update: { value: dto.newPassword },
      create: { key: 'drive_passcode', value: dto.newPassword },
    });

    // Send confirmation email
    this.mail.sendPasswordResetSuccess({
      email: user.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'PASSWORD_RESET_SUCCESS',
      targetType: 'User',
      targetId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Issue tokens so user is immediately logged in
    const tokens = await this.issueTokensForUser(user.id, user.email, user.role, {
      ...meta,
      deviceName: dto.deviceName,
      platform: dto.platform,
    });

    return {
      success: true,
      message: 'Password reset successfully',
      ...tokens,
    };
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

    let valid = false;
    const envPass = process.env.SUPER_ADMIN_PASSWORD || process.env.DRIVE_PASSCODE;
    if (envPass && dto.password === envPass) {
      valid = true;
      // Auto-sync hash in DB to match new SUPER_ADMIN_PASSWORD if changed
      argon2.hash(dto.password, { type: argon2.argon2id }).then((newHash) => {
        this.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: newHash },
        }).catch(() => {});
      }).catch(() => {});
    } else {
      valid = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    }
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

