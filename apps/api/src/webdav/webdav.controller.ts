import {
  Controller,
  All,
  Req,
  Res,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WebdavService } from './webdav.service';

@Controller('webdav')
export class WebdavController {
  private readonly logger = new Logger(WebdavController.name);

  constructor(private readonly webdavService: WebdavService) {}

  @All('*')
  async handleWebdav(@Req() req: Request, @Res() res: Response) {
    const method = req.method.toUpperCase();

    // Standard WebDAV capability discovery
    res.setHeader('DAV', '1, 2');
    res.setHeader('MS-Author-Via', 'DAV');
    res.setHeader(
      'Allow',
      'OPTIONS, GET, HEAD, POST, DELETE, PROPFIND, PROPPATCH, COPY, MOVE, LOCK, UNLOCK, MKCOL',
    );

    if (method === 'OPTIONS') {
      return res.status(200).send();
    }

    // Authenticate user via Basic HTTP Auth
    const user = await this.webdavService.authenticate(req.headers.authorization);
    if (!user) {
      res.setHeader('WWW-Authenticate', 'Basic realm="NOOR DRIVE WebDAV Vault"');
      return res.status(401).send('Unauthorized. Please enter your NOOR DRIVE email and password.');
    }

    const rawPath = req.path;
    const target = await this.webdavService.resolvePath(user.id, rawPath);

    if (method === 'PROPFIND') {
      if (!target || target.type === 'not_found') {
        return res.status(404).send('Resource not found');
      }
      const xml = await this.webdavService.generatePropfindXml(user.id, req.baseUrl + req.path, target);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.status(207).send(xml);
    }

    if (method === 'GET' || method === 'HEAD') {
      if (!target || target.type !== 'file' || !target.file) {
        return res.status(404).send('File not found');
      }
      const file = target.file;
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', file.sizeBytes.toString());
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);

      if (method === 'HEAD') {
        return res.status(200).send();
      }

      try {
        const stream = await this.webdavService.getFileStream(file.storageObjectId);
        return stream.pipe(res);
      } catch (err: any) {
        return res.status(500).send('Error streaming file: ' + err.message);
      }
    }

    if (method === 'MKCOL') {
      if (target && target.type === 'not_found' && target.targetName) {
        await this.webdavService.createFolder(user.id, target.targetName, target.parentFolderId);
        return res.status(201).send('Created');
      }
      return res.status(405).send('Cannot create collection here');
    }

    if (method === 'DELETE') {
      if (!target || target.type === 'not_found' || target.type === 'root') {
        return res.status(404).send('Resource not found');
      }
      await this.webdavService.deleteResource(user.id, target);
      return res.status(204).send();
    }

    if (method === 'LOCK') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Lock-Token', '<opaquelocktoken:noor-cloud-vault-token>');
      const lockXml = `<?xml version="1.0" encoding="utf-8" ?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>Infinity</D:depth>
      <D:timeout>Second-3600</D:timeout>
      <D:locktoken><D:href>opaquelocktoken:noor-cloud-vault-token</D:href></D:locktoken>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`;
      return res.status(200).send(lockXml);
    }

    if (method === 'UNLOCK') {
      return res.status(204).send();
    }

    // Default fallback
    return res.status(200).send();
  }
}
