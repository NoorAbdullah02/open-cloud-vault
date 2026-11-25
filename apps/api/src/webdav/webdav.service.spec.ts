import * as argon2 from 'argon2';
import { WebdavService } from './webdav.service';

describe('WebdavService', () => {
  const mockPrisma: any = {
    user: { findUnique: jest.fn() },
    folder: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    file: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const mockStorage: any = { readFileStream: jest.fn() };
  let service: WebdavService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebdavService(mockPrisma, mockStorage);
  });

  it('authenticates Basic Auth passwords that contain colons', async () => {
    const hash = await argon2.hash('pass:with:colons', { type: argon2.argon2id });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      passwordHash: hash,
    });

    const token = Buffer.from('user@example.com:pass:with:colons').toString('base64');
    const result = await service.authenticate(`Basic ${token}`);

    expect(result).toEqual({ id: 'u1', email: 'user@example.com' });
  });

  it('blocks access to Secret Vault via resolvePath', async () => {
    const res = await service.resolvePath('u1', '/api/webdav/Secret%20Vault/secret.pdf');
    expect(res).toBeNull();
    expect(mockPrisma.folder.findFirst).not.toHaveBeenCalled();
  });

  it('excludes Secret Vault and escapes XML characters in PROPFIND output', async () => {
    mockPrisma.folder.findMany.mockResolvedValue([
      { name: 'Docs & Notes', updatedAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    mockPrisma.file.findMany.mockResolvedValue([
      {
        name: 'report<1>&2.xml',
        mimeType: 'application/xml+custom&test',
        sizeBytes: BigInt(42),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const xml = await service.generatePropfindXml(
      'u1',
      '/api/webdav/',
      { type: 'root', folder: null, file: null, parentFolderId: null },
      '1',
    );

    expect(mockPrisma.folder.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'u1', parentId: null, isTrash: false, name: { not: 'Secret Vault' } },
    });
    expect(xml).toContain('Docs &amp; Notes');
    expect(xml).toContain('report&lt;1&gt;&amp;2.xml');
    expect(xml).toContain('application/xml+custom&amp;test');
  });

  it('omits children when PROPFIND Depth is 0', async () => {
    const xml = await service.generatePropfindXml(
      'u1',
      '/api/webdav/',
      { type: 'root', folder: null, file: null, parentFolderId: null },
      '0',
    );

    expect(mockPrisma.folder.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.file.findMany).not.toHaveBeenCalled();
    expect(xml).toContain('<D:displayname>NoorDrive</D:displayname>');
  });
});
