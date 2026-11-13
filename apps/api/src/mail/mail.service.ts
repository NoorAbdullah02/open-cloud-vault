import { Injectable, Logger } from '@nestjs/common';

export interface SendMailOptions {
  to?: string;
  subject: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private get apiKey(): string | undefined {
    return process.env.BREVO_API_KEY;
  }

  private get adminEmail(): string {
    return process.env.ADMIN_NOTIFY_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'sheikhnoorabdullah02@gmail.com';
  }

  private get senderEmail(): string {
    return process.env.MAIL_FROM || process.env.BREVO_SENDER_EMAIL || this.adminEmail;
  }

  /**
   * Send a formatted email notification via Brevo v3 REST API
   */
  async sendMail(options: SendMailOptions): Promise<boolean> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      this.logger.debug(`[MailService] BREVO_API_KEY not configured. Skipping email: ${options.subject}`);
      return false;
    }

    const recipient = options.to || this.adminEmail;

    const metadataRows = options.metadata
      ? Object.entries(options.metadata)
          .filter(([_, v]) => v !== undefined && v !== null && v !== '')
          .map(
            ([k, v]) =>
              `<tr>
                <td style="padding:6px 12px;font-weight:600;color:#64748b;font-size:12px;text-transform:capitalize;">${k.replace(/([A-Z])/g, ' $1')}:</td>
                <td style="padding:6px 12px;color:#0f172a;font-size:12px;font-family:monospace;background:#f1f5f9;border-radius:6px;">${String(v)}</td>
              </tr>`,
          )
          .join('')
      : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:24px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.03);">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
            <div style="width:40px;height:40px;background:#0f172a;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:18px;font-weight:bold;line-height:40px;text-align:center;">
              ☁️
            </div>
            <div>
              <h2 style="margin:0;color:#0f172a;font-size:18px;font-weight:700;">NOOR DRIVE</h2>
              <span style="color:#64748b;font-size:11px;font-weight:500;">Cloud Vault Security & Notifications</span>
            </div>
          </div>
          
          <div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:16px;border-radius:12px;margin-bottom:20px;">
            <h3 style="margin:0 0 6px 0;color:#0f172a;font-size:15px;font-weight:600;">${options.title}</h3>
            <p style="margin:0;color:#334155;font-size:13px;line-height:1.5;">${options.message}</p>
          </div>

          ${
            metadataRows
              ? `<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${metadataRows}</table>`
              : ''
          }

          <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;">
              This is an automated notification from your personal NOOR DRIVE instance.
              <br>© ${new Date().getFullYear()} NOOR DRIVE. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: 'NOOR DRIVE Vault',
            email: this.senderEmail,
          },
          to: [{ email: recipient, name: 'Noor Owner' }],
          subject: options.subject,
          htmlContent,
        }),
      });

      if (!response.ok) {
        const errData = await response.text();
        this.logger.error(`[MailService] Brevo API error (${response.status}): ${errData}`);
        return false;
      }

      this.logger.log(`[MailService] Notification successfully sent to ${recipient}: ${options.subject}`);
      return true;
    } catch (err: any) {
      this.logger.error(`[MailService] Failed to send email via Brevo: ${err.message}`);
      return false;
    }
  }

  /**
   * Send a login alert when a session is established
   */
  async sendLoginAlert(meta: {
    email: string;
    ipAddress?: string;
    userAgent?: string;
    deviceName?: string;
    platform?: string;
    loginMethod: string;
  }) {
    // Run asynchronously in background without delaying auth response
    setImmediate(async () => {
      await this.sendMail({
        subject: `🔔 New Login to NOOR DRIVE (${meta.platform || 'Device'})`,
        title: 'New Device / Session Authenticated',
        message: `Your NOOR DRIVE account (${meta.email}) was just accessed via ${meta.loginMethod}. If this was you, no action is needed.`,
        metadata: {
          Time: new Date().toLocaleString(),
          Method: meta.loginMethod,
          Device: meta.deviceName || 'Unknown Device',
          Platform: meta.platform || 'Web Browser',
          IPAddress: meta.ipAddress || 'Not recorded',
          UserAgent: meta.userAgent || 'Not recorded',
        },
      });
    });
  }

  /**
   * Send a 6-digit OTP verification email for password/passcode reset
   */
  async sendPasswordResetOtp(meta: {
    email: string;
    otp: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<boolean> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      this.logger.debug(`[MailService] BREVO_API_KEY not configured. Skipping OTP send.`);
      return false;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:24px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:36px;box-shadow:0 10px 30px rgba(0,0,0,0.04);">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="width:52px;height:52px;background:#0f172a;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;color:#ffffff;font-size:24px;line-height:52px;margin-bottom:12px;">
              🔐
            </div>
            <h2 style="margin:0;color:#0f172a;font-size:22px;font-weight:700;">Password Reset Code</h2>
            <p style="margin:6px 0 0;color:#64748b;font-size:13px;">NOOR DRIVE Security Verification</p>
          </div>

          <div style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:18px;padding:24px;text-align:center;margin-bottom:24px;">
            <p style="margin:0 0 10px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your 6-Digit Verification Code</p>
            <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#0f172a;font-family:monospace;padding:8px 0;">
              ${meta.otp}
            </div>
            <p style="margin:8px 0 0;color:#ef4444;font-size:12px;font-weight:600;">⏱️ Valid for 10 minutes only</p>
          </div>

          <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 20px;">
            Enter this code on the NOOR DRIVE login screen to set a new password and unlock your personal vault. 
            If you did not request this code, your account is safe and you can safely ignore this email.
          </p>

          <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px;padding:12px;font-size:12px;color:#64748b;margin-bottom:20px;">
            <tr>
              <td style="padding:6px 12px;font-weight:600;">Recipient:</td>
              <td style="padding:6px 12px;color:#0f172a;">${meta.email}</td>
            </tr>
            <tr>
              <td style="padding:6px 12px;font-weight:600;">IP Address:</td>
              <td style="padding:6px 12px;color:#0f172a;">${meta.ipAddress || 'Not recorded'}</td>
            </tr>
            <tr>
              <td style="padding:6px 12px;font-weight:600;">Time:</td>
              <td style="padding:6px 12px;color:#0f172a;">${new Date().toLocaleString()}</td>
            </tr>
          </table>

          <div style="border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;">
              NOOR DRIVE Personal Cloud Vault • End-to-End Encrypted
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: 'NOOR DRIVE Vault',
            email: this.senderEmail,
          },
          to: [{ email: meta.email, name: 'Noor Owner' }],
          subject: `🔐 NOOR DRIVE Password Reset Code: ${meta.otp}`,
          htmlContent,
        }),
      });

      if (!response.ok) {
        const errData = await response.text();
        this.logger.error(`[MailService] Failed to send OTP email (${response.status}): ${errData}`);
        return false;
      }

      this.logger.log(`[MailService] OTP successfully sent to ${meta.email}`);
      return true;
    } catch (err: any) {
      this.logger.error(`[MailService] Error sending OTP email: ${err.message}`);
      return false;
    }
  }

  /**
   * Send a confirmation that password was successfully reset
   */
  async sendPasswordResetSuccess(meta: {
    email: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    setImmediate(async () => {
      await this.sendMail({
        to: meta.email,
        subject: `✅ Your NOOR DRIVE Password Was Successfully Changed`,
        title: 'Password Reset Successful',
        message: `Your NOOR DRIVE password has been updated. You can now use your new password/passcode to unlock your drive.`,
        metadata: {
          Time: new Date().toLocaleString(),
          Email: meta.email,
          IPAddress: meta.ipAddress || 'Not recorded',
          UserAgent: meta.userAgent || 'Not recorded',
        },
      });
    });
  }

  /**
   * Send a 6-digit OTP verification email specifically for Secret Vault PIN setup/update
   */
  async sendVaultPinOtp(meta: {
    email: string;
    otp: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<boolean> {
    const apiKey = this.apiKey;
    if (!apiKey) return false;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:24px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:36px;box-shadow:0 10px 30px rgba(0,0,0,0.04);">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="width:52px;height:52px;background:#b45309;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;color:#ffffff;font-size:24px;line-height:52px;margin-bottom:12px;">
              🔒
            </div>
            <h2 style="margin:0;color:#0f172a;font-size:22px;font-weight:700;">Secret Vault PIN Verification</h2>
            <p style="margin:6px 0 0;color:#64748b;font-size:13px;">NOOR DRIVE Private Safe Folder</p>
          </div>

          <div style="background:#fffbeb;border:1px dashed #fde68a;border-radius:18px;padding:24px;text-align:center;margin-bottom:24px;">
            <p style="margin:0 0 10px 0;color:#92400e;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your 6-Digit Vault PIN Setup Code</p>
            <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#78350f;font-family:monospace;padding:8px 0;">
              ${meta.otp}
            </div>
            <p style="margin:8px 0 0;color:#dc2626;font-size:12px;font-weight:600;">⏱️ Valid for 10 minutes only</p>
          </div>

          <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 20px;">
            Use this code inside NOOR DRIVE to set or update your Private Vault PIN. Your private files in the Secret Vault are protected and encrypted.
          </p>

          <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px;padding:12px;font-size:12px;color:#64748b;margin-bottom:20px;">
            <tr>
              <td style="padding:6px 12px;font-weight:600;">Recipient:</td>
              <td style="padding:6px 12px;color:#0f172a;">${meta.email}</td>
            </tr>
            <tr>
              <td style="padding:6px 12px;font-weight:600;">IP Address:</td>
              <td style="padding:6px 12px;color:#0f172a;">${meta.ipAddress || 'Not recorded'}</td>
            </tr>
            <tr>
              <td style="padding:6px 12px;font-weight:600;">Time:</td>
              <td style="padding:6px 12px;color:#0f172a;">${new Date().toLocaleString()}</td>
            </tr>
          </table>

          <div style="border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;">
              NOOR DRIVE Secret Vault • Private Safe Folder Protection
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: 'NOOR DRIVE Vault',
            email: this.senderEmail,
          },
          to: [{ email: meta.email, name: 'Noor Owner' }],
          subject: `🔐 NOOR DRIVE Secret Vault Code: ${meta.otp}`,
          htmlContent,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Send notification when Secret Vault PIN is updated
   */
  async sendVaultPinChanged(meta: {
    email: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    setImmediate(async () => {
      await this.sendMail({
        to: meta.email,
        subject: `🔒 Secret Vault PIN Updated Successfully`,
        title: 'Secret Vault PIN Changed',
        message: `Your NOOR DRIVE Secret Vault PIN has been successfully updated. Use your new PIN to unlock private files.`,
        metadata: {
          Time: new Date().toLocaleString(),
          Email: meta.email,
          IPAddress: meta.ipAddress || 'Not recorded',
          UserAgent: meta.userAgent || 'Not recorded',
        },
      });
    });
  }

  /**
   * Send notification when Secret Vault is unlocked
   */
  async sendVaultUnlockedAlert(meta: {
    email: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    setImmediate(async () => {
      await this.sendMail({
        to: meta.email,
        subject: `🔓 Secret Vault Opened on NOOR DRIVE`,
        title: 'Secret Vault Unlocked',
        message: `Your private Secret Vault was just unlocked. If this was not you, please change your PIN immediately.`,
        metadata: {
          Time: new Date().toLocaleString(),
          IPAddress: meta.ipAddress || 'Not recorded',
          UserAgent: meta.userAgent || 'Not recorded',
        },
      });
    });
  }

  /**
   * Send instant notification when a shared link is opened, viewed, or downloaded
   */
  async sendShareAccessAlert(meta: {
    itemType: 'file' | 'folder';
    itemName: string;
    itemSize?: string;
    ipAddress?: string;
    userAgent?: string;
    referer?: string;
    action: 'VIEW' | 'DOWNLOAD';
  }) {
    setImmediate(async () => {
      const isDownload = meta.action === 'DOWNLOAD';
      const actionText = isDownload ? 'Downloaded' : 'Clicked & Opened';
      const icon = isDownload ? '📥' : '👀';

      await this.sendMail({
        subject: `${icon} Share Link ${actionText}: "${meta.itemName}" from ${meta.ipAddress || 'Visitor'}`,
        title: `Shared ${meta.itemType.toUpperCase()} ${actionText}`,
        message: `A visitor just ${actionText.toLowerCase()} your public share link for "${meta.itemName}". All available visitor information has been logged below:`,
        metadata: {
          Item: meta.itemName,
          Type: meta.itemType,
          Action: isDownload ? 'File Download' : 'Link Preview / View',
          Size: meta.itemSize || 'N/A',
          IPAddress: meta.ipAddress || 'Not recorded',
          DeviceAndBrowser: meta.userAgent || 'Not recorded',
          Referrer: meta.referer || 'Direct link visit',
          Time: new Date().toLocaleString(),
        },
      });
    });
  }

  /**
   * Send instant notification when a file upload is completed
   */
  async sendUploadAlert(meta: {
    email?: string;
    fileName: string;
    sizeBytes: number | bigint;
    backend: string;
    folderName?: string;
    isDeduplicated?: boolean;
    ipAddress?: string;
  }) {
    setImmediate(async () => {
      const b = typeof meta.sizeBytes === 'bigint' ? Number(meta.sizeBytes) : meta.sizeBytes;
      let sizeStr = '0 B';
      if (b && b > 0) {
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(b) / Math.log(k));
        sizeStr = `${(b / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
      }

      const isTg = meta.backend === 'TELEGRAM_MTPROTO';
      const backendLabel = isTg ? 'Telegram MTProto Cloud Vault' : 'Local Vault Disk';
      const subject = meta.isDeduplicated
        ? `⚡ Instant Upload: "${meta.fileName}" saved to NOOR DRIVE`
        : `☁️ File Uploaded: "${meta.fileName}" (${sizeStr}) to NOOR DRIVE`;

      await this.sendMail({
        to: meta.email,
        subject,
        title: 'File Upload Completed',
        message: meta.isDeduplicated
          ? `File "${meta.fileName}" was instantly matched via SHA-256 deduplication and added to your NOOR DRIVE vault.`
          : `A new file "${meta.fileName}" was successfully uploaded and saved into your NOOR DRIVE vault.`,
        metadata: {
          FileName: meta.fileName,
          FileSize: sizeStr,
          StorageBackend: backendLabel,
          Folder: meta.folderName || 'Root / Home',
          Deduplicated: meta.isDeduplicated ? 'Yes (0 ms transfer)' : 'No (Fresh upload)',
          IPAddress: meta.ipAddress || 'Authorized User Session',
          Time: new Date().toLocaleString(),
        },
      });
    });
  }

  /**
   * Send a security alert for suspicious activity (e.g. repeated invalid passcodes)
   */
  async sendSecurityAlert(meta: {
    reason: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    setImmediate(async () => {
      await this.sendMail({
        subject: `⚠️ SECURITY WARNING: Failed Access Attempt on NOOR DRIVE`,
        title: 'Unauthorized Access Attempt Blocked',
        message: `A client attempted to access your drive and was blocked. Details of the request are below:`,
        metadata: {
          Time: new Date().toLocaleString(),
          Reason: meta.reason,
          IPAddress: meta.ipAddress || 'Not recorded',
          UserAgent: meta.userAgent || 'Not recorded',
        },
      });
    });
  }
}
