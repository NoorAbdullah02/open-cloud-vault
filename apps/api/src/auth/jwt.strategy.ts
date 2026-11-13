import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
}

const sessionCache = new Map<string, { user: any; cachedAt: number }>();
const SESSION_CACHE_TTL_MS = 30_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'fallback-dev-secret-change-me',
    });
  }

  async validate(payload: JwtPayload) {
    const cached = sessionCache.get(payload.sessionId);
    if (cached && Date.now() - cached.cachedAt < SESSION_CACHE_TTL_MS) {
      return cached.user;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      sessionCache.delete(payload.sessionId);
      throw new UnauthorizedException('Session expired or revoked');
    }

    if (session.user.isSuspended) {
      sessionCache.delete(payload.sessionId);
      throw new UnauthorizedException('Account is suspended');
    }

    const userObj = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
    };
    sessionCache.set(payload.sessionId, { user: userObj, cachedAt: Date.now() });
    return userObj;
  }
}

