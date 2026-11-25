import { ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';

/**
 * These tests exercise the authentication rules without touching a database.
 * Prisma, JWT, audit and mail are replaced with lightweight mocks so the
 * security-critical branches run quickly and deterministically.
 */
describe('AuthService', () => {
  const owner = {
    id: 'user-1',
    email: 'owner@example.com',
    role: 'SUPER_ADMIN',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$invalid$invalid',
    isVerified: true,
    isSuspended: false,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    preferredStorageBackend: 'TELEGRAM_MTPROTO',
    telegramConsentGiven: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const userRecord = {
    ...owner,
    profile: { fullName: 'Noor Owner' },
    quota: { storageQuotaBytes: BigInt(1024), usedStorageBytes: BigInt(0) },
  };

  let prisma: any;
  let jwt: any;
  let audit: any;
  let mail: any;
  let service: AuthService;

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SUPER_ADMIN_EMAIL: owner.email,
      SUPER_ADMIN_PASSWORD: 'correct-passcode',
    };
    delete process.env.DRIVE_PASSCODE;

    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(owner),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(owner),
        create: jest.fn(),
      },
      device: { upsert: jest.fn().mockResolvedValue({ id: 'device-1' }) },
      session: {
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      share: { findMany: jest.fn() },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-access-token') };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    mail = {
      sendSecurityAlert: jest.fn().mockResolvedValue(true),
      sendLoginAlert: jest.fn().mockResolvedValue(true),
      sendPasswordResetOtp: jest.fn().mockResolvedValue(true),
      sendPasswordResetSuccess: jest.fn().mockResolvedValue(true),
    };

    // The second user lookup (after session creation) needs the full record.
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args?.include ? userRecord : owner),
    );

    service = new AuthService(prisma, jwt, audit, mail);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('loginWithPasscode', () => {
    it('rejects an incorrect passcode and raises a security alert', async () => {
      await expect(
        service.loginWithPasscode({ passcode: 'wrong' }, { ipAddress: '127.0.0.1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mail.sendSecurityAlert).toHaveBeenCalledTimes(1);
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('accepts the configured SUPER_ADMIN_PASSWORD and issues tokens', async () => {
      const result = await service.loginWithPasscode(
        { passcode: 'correct-passcode', deviceName: 'Test', platform: 'web' },
        { ipAddress: '127.0.0.1' },
      );

      expect(result).toMatchObject({
        accessToken: 'signed-access-token',
        refreshToken: expect.any(String),
        user: { id: owner.id, email: owner.email },
      });
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSCODE_LOGIN_SUCCESS' }),
      );
    });

    it('requires a TOTP code when 2FA is enabled', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...owner, twoFactorEnabled: true });

      await expect(
        service.loginWithPasscode({ passcode: 'correct-passcode' }, {}),
      ).resolves.toEqual({ requiresTwoFactor: true });
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid TOTP code', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...owner,
        twoFactorEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      });

      await expect(
        service.loginWithPasscode({ passcode: 'correct-passcode', totpCode: '000000' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a suspended account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...owner, isSuspended: true });

      await expect(
        service.login({ email: owner.email, password: 'correct-passcode' }, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepts the SUPER_ADMIN_PASSWORD environment override', async () => {
      const result: any = await service.login(
        { email: owner.email, password: 'correct-passcode' },
        {},
      );

      expect(result.accessToken).toBe('signed-access-token');
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
    });

    it('does not accept the master password for a non-owner account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...owner,
        id: 'user-2',
        email: 'member@example.com',
        role: 'USER',
      });

      await expect(
        service.login({ email: 'member@example.com', password: 'correct-passcode' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('rejects a revoked or unknown refresh token', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('unknown', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rotates the refresh token on success', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: owner,
      });

      const result = await service.refreshTokens('valid-token', {});

      expect(result.accessToken).toBe('signed-access-token');
      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('register', () => {
    it('is disabled unless the registration_enabled setting is true', async () => {
      await expect(
        service.register(
          { email: 'new@example.com', password: 'password123', fullName: 'New User' },
          {},
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('database-backed passcodes', () => {
    it('accepts an Argon2-hashed dynamic passcode', async () => {
      const hash = await argon2.hash('hashed-pass');
      prisma.systemSetting.findUnique.mockResolvedValue({ key: 'drive_passcode', value: hash });

      const result: any = await service.loginWithPasscode(
        { passcode: 'hashed-pass' },
        {},
      );

      expect(result.accessToken).toBe('signed-access-token');
      expect(prisma.systemSetting.update).not.toHaveBeenCalled();
    });

    it('transparently upgrades a legacy plaintext dynamic passcode', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        key: 'drive_passcode',
        value: 'legacy-pass',
      });

      const result: any = await service.loginWithPasscode(
        { passcode: 'legacy-pass' },
        {},
      );

      expect(result.accessToken).toBe('signed-access-token');
      const stored = prisma.systemSetting.update.mock.calls[0][0].data.value;
      expect(stored).toMatch(/^\$argon2/);
      expect(await argon2.verify(stored, 'legacy-pass')).toBe(true);
    });
  });

  describe('password reset', () => {
    it('clears the reset token when email delivery is unavailable', async () => {
      mail.sendPasswordResetOtp.mockResolvedValue(false);

      await expect(service.forgotPassword({}, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: owner.id },
        data: { resetPasswordToken: null, resetPasswordExpires: null },
      });
    });

    it('never promotes a reset password to the global master passcode', async () => {
      const code = '123456';
      prisma.user.findUnique.mockResolvedValue({
        ...owner,
        resetPasswordToken: crypto.createHash('sha256').update(code).digest('hex'),
        resetPasswordExpires: new Date(Date.now() + 60_000),
      });

      const result: any = await service.resetPassword(
        { code, newPassword: 'new-pass-123' },
        {},
      );

      expect(result.accessToken).toBe('signed-access-token');
      expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
    });
  });
});
