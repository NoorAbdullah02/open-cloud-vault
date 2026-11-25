import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import * as argon2 from 'argon2';
import * as path from 'path';
import { Readable } from 'stream';

@Injectable()
export class WebdavService {
  private readonly logger = new Logger(WebdavService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async authenticate(authHeader?: string): Promise<{ id: string; email: string } | null> {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return null;
    }
    try {
      const b64 = authHeader.replace(/^Basic\s+/, '').trim();
      const credentials = Buffer.from(b64, 'base64').toString('utf-8');
      const sepIdx = credentials.indexOf(':');
      if (sepIdx <= 0) return null;
      const email = credentials.slice(0, sepIdx);
      const password = credentials.slice(sepIdx + 1);
      if (!email || !password) return null;

      const user = await this.prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
      });
      if (!user) return null;

      const valid = await argon2.verify(user.passwordHash, password);
      if (!valid) return null;

      return { id: user.id, email: user.email };
    } catch (e: any) {
      this.logger.error(`WebDAV auth error: ${e.message}`);
      return null;
    }
  }

  async resolvePath(userId: string, rawPath: string) {
    const cleanPath = decodeURIComponent(rawPath || '')
      .replace(/^\/api\/webdav/, '')
      .replace(/^\/webdav/, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');

    if (!cleanPath) {
      return { type: 'root' as const, folder: null, file: null, parentFolderId: null };
    }

    const segments = cleanPath.split('/').filter(Boolean);
    if (segments[0]?.toLowerCase() === 'secret vault') {
      return null;
    }
    let currentFolderId: string | null = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;

      if (!isLast) {
        const folder = await this.prisma.folder.findFirst({
          where: {
            ownerId: userId,
            name: seg,
            parentId: currentFolderId,
            isTrash: false,
            ...(currentFolderId === null ? { name: seg === 'Secret Vault' ? '__blocked__' : seg } : {}),
          },
        });
        if (!folder) return null;
        currentFolderId = folder.id;
      } else {
        // Could be a folder or a file
        const folder = await this.prisma.folder.findFirst({
          where: { ownerId: userId, name: seg, parentId: currentFolderId, isTrash: false },
        });
        if (folder) {
          return { type: 'folder' as const, folder, file: null, parentFolderId: currentFolderId };
        }

        const file = await this.prisma.file.findFirst({
          where: { ownerId: userId, name: seg, folderId: currentFolderId, isTrash: false },
          include: { storageObject: true },
        });
        if (file) {
          return { type: 'file' as const, folder: null, file, parentFolderId: currentFolderId };
        }

        return { type: 'not_found' as const, folder: null, file: null, parentFolderId: currentFolderId, targetName: seg };
      }
    }

    return null;
  }

  async generatePropfindXml(userId: string, prefix: string, target: any, depth = '1') {
    let xml = `<?xml version="1.0" encoding="utf-8" ?>\n<D:multistatus xmlns:D="DAV:">\n`;

    const cleanPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
    const includeChildren = depth !== '0';

    if (target.type === 'root') {
      // Root collection itself
      xml += `  <D:response>\n    <D:href>${this.escapeXml(cleanPrefix)}</D:href>\n    <D:propstat>\n      <D:prop>\n        <D:displayname>NoorDrive</D:displayname>\n        <D:resourcetype><D:collection/></D:resourcetype>\n      </D:prop>\n      <D:status>HTTP/1.1 200 OK</D:status>\n    </D:propstat>\n  </D:response>\n`;

      if (includeChildren) {
        const [folders, files] = await Promise.all([
          this.prisma.folder.findMany({
            where: { ownerId: userId, parentId: null, isTrash: false, name: { not: 'Secret Vault' } },
          }),
          this.prisma.file.findMany({ where: { ownerId: userId, folderId: null, isTrash: false } }),
        ]);

        for (const fol of folders) {
          xml += this.formatFolderResponse(`${cleanPrefix}${encodeURIComponent(fol.name)}/`, fol);
        }
        for (const fil of files) {
          xml += this.formatFileResponse(`${cleanPrefix}${encodeURIComponent(fil.name)}`, fil);
        }
      }
    } else if (target.type === 'folder') {
      const fol = target.folder;
      xml += this.formatFolderResponse(cleanPrefix, fol);

      if (includeChildren) {
        const [folders, files] = await Promise.all([
          this.prisma.folder.findMany({ where: { ownerId: userId, parentId: fol.id, isTrash: false } }),
          this.prisma.file.findMany({ where: { ownerId: userId, folderId: fol.id, isTrash: false } }),
        ]);

        for (const sub of folders) {
          xml += this.formatFolderResponse(`${cleanPrefix}${encodeURIComponent(sub.name)}/`, sub);
        }
        for (const fil of files) {
          xml += this.formatFileResponse(`${cleanPrefix}${encodeURIComponent(fil.name)}`, fil);
        }
      }
    } else if (target.type === 'file') {
      const fil = target.file;
      xml += this.formatFileResponse(prefix, fil);
    }

    xml += `</D:multistatus>`;
    return xml;
  }

  private formatFolderResponse(href: string, folder: any) {
    const dateStr = (folder.updatedAt || new Date()).toUTCString();
    return `  <D:response>\n    <D:href>${this.escapeXml(href)}</D:href>\n    <D:propstat>\n      <D:prop>\n        <D:displayname>${this.escapeXml(folder.name)}</D:displayname>\n        <D:getlastmodified>${dateStr}</D:getlastmodified>\n        <D:resourcetype><D:collection/></D:resourcetype>\n      </D:prop>\n      <D:status>HTTP/1.1 200 OK</D:status>\n    </D:propstat>\n  </D:response>\n`;
  }

  private formatFileResponse(href: string, file: any) {
    const dateStr = (file.updatedAt || new Date()).toUTCString();
    const size = file.sizeBytes ? file.sizeBytes.toString() : '0';
    const mime = file.mimeType || 'application/octet-stream';
    return `  <D:response>\n    <D:href>${this.escapeXml(href)}</D:href>\n    <D:propstat>\n      <D:prop>\n        <D:displayname>${this.escapeXml(file.name)}</D:displayname>\n        <D:getcontentlength>${size}</D:getcontentlength>\n        <D:getcontenttype>${this.escapeXml(mime)}</D:getcontenttype>\n        <D:getlastmodified>${dateStr}</D:getlastmodified>\n        <D:resourcetype/>\n      </D:prop>\n      <D:status>HTTP/1.1 200 OK</D:status>\n    </D:propstat>\n  </D:response>\n`;
  }

  private escapeXml(unsafe: string) {
    return (unsafe || '').replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }

  async getFileStream(storageObjectId: string) {
    return this.storage.readFileStream(storageObjectId);
  }

  async createFolder(userId: string, name: string, parentId: string | null) {
    return this.prisma.folder.create({
      data: {
        name,
        ownerId: userId,
        parentId,
      },
    });
  }

  async deleteResource(userId: string, target: any) {
    if (target.type === 'folder') {
      if (target.folder.name === 'Secret Vault' && target.folder.parentId === null) {
        return false;
      }
      const res = await this.prisma.folder.updateMany({
        where: { id: target.folder.id, ownerId: userId },
        data: { isTrash: true },
      });
      return res.count > 0;
    }
    if (target.type === 'file') {
      const res = await this.prisma.file.updateMany({
        where: { id: target.file.id, ownerId: userId },
        data: { isTrash: true },
      });
      return res.count > 0;
    }
    return false;
  }

  async moveResource(userId: string, sourceTarget: any, destinationTarget: any) {
    const newName =
      destinationTarget.targetName ||
      (destinationTarget.file
        ? destinationTarget.file.name
        : destinationTarget.folder
          ? destinationTarget.folder.name
          : null);
    const newParentId = destinationTarget.parentFolderId;

    if (sourceTarget.type === 'file') {
      const ext = newName
        ? path.extname(newName).replace('.', '').toLowerCase()
        : sourceTarget.file.extension;
      const res = await this.prisma.file.updateMany({
        where: { id: sourceTarget.file.id, ownerId: userId },
        data: {
          ...(newName ? { name: newName, extension: ext } : {}),
          folderId: newParentId,
        },
      });
      return res.count > 0;
    } else if (sourceTarget.type === 'folder') {
      if (newParentId === sourceTarget.folder.id) {
        return false;
      }
      const res = await this.prisma.folder.updateMany({
        where: { id: sourceTarget.folder.id, ownerId: userId },
        data: {
          ...(newName ? { name: newName } : {}),
          parentId: newParentId,
        },
      });
      return res.count > 0;
    }
    return false;
  }
}
