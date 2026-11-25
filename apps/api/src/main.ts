import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { AppModule } from './app.module';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Render (and most PaaS hosts) terminate TLS at a single proxy hop. Without
  // this, every request shares the proxy IP and the global rate limit becomes
  // a single bucket for all users.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      xFrameOptions: false,
      contentSecurityPolicy: false,
    }),
  );
  app.use(cookieParser());

  const configuredOrigins = (
    process.env.CORS_ORIGIN ||
    'http://localhost:3000,https://noor-cloud-vault.onrender.com,https://drive.noor.is-a.dev,https://noordrive.is-a.dev'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://noor-cloud-vault.onrender.com',
    'https://drive.noor.is-a.dev',
    'https://noordrive.is-a.dev',
  ];

  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]));

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      let hostname = '';
      try {
        hostname = new URL(origin).hostname.toLowerCase();
      } catch {
        return callback(null, false);
      }

      const isLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.endsWith('.localhost');

      // Only the explicit allowlist (default origins + CORS_ORIGIN) is trusted.
      // Suffixes such as .is-a.dev / .onrender.com are free-for-anyone domains.
      if (isLocal) {
        return callback(null, true);
      }

      // Unknown origins get no CORS headers, so browsers block them.
      return callback(null, false);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = parseInt(process.env.PORT || process.env.API_PORT || '4000', 10);
  const server = app.getHttpServer();
  // Disable timeouts to support long-running massive file uploads (up to 100GB+)
  if (server) {
    server.requestTimeout = 0;
    server.headersTimeout = 120000;
    server.keepAliveTimeout = 125000;
    server.timeout = 0;
  }
  await app.listen(port, '0.0.0.0');
  console.log(`Noor Drive API running on http://localhost:${port}/api`);

  // Render Free Tier 512MB RAM optimization: Automatically reclaim unused memory
  if (typeof (global as any).gc === 'function') {
    setInterval(() => {
      try {
        (global as any).gc();
      } catch {}
    }, 60000);
  }

  // Render Free Tier Keep-Alive safeguard:
  // Ping public endpoint every 9 minutes to prevent 15-minute inactivity spin-down
  const publicUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://drive.noor.is-a.dev';
  if (process.env.NODE_ENV === 'production' && publicUrl) {
    setInterval(() => {
      fetch(`${publicUrl.replace(/\/$/, '')}/api/shares/app-release`)
        .then((r) => {
          if (r.ok) console.log(`[Keep-Alive] Self-ping successful (${r.status})`);
        })
        .catch(() => {});
    }, 9 * 60 * 1000);
  }
}

bootstrap();
