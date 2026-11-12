import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/api_client.dart';

class DriveScreen extends StatefulWidget {
  const DriveScreen({super.key});

  @override
  State<DriveScreen> createState() => _DriveScreenState();
}

class _DriveScreenState extends State<DriveScreen> {
  String _view = 'my-drive';
  String? _folderId;
  String _search = '';
  bool _isGrid = false;
  bool _loading = true;

  // Live upload progress state
  String? _uploadingName;
  int _uploadLoaded = 0;
  int _uploadTotal = 0;
  double _uploadSpeed = 0;
  bool _syncingTelegram = false;

  Map<String, dynamic>? _user;
  List<dynamic> _folders = [];
  List<dynamic> _files = [];
  List<dynamic> _breadcrumbs = [];
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _loadUser();
    _loadDrive();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }

  String _formatBytes(dynamic bytesVal) {
    final bytes = int.tryParse(bytesVal?.toString() ?? '0') ?? 0;
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    int i = 0;
    double val = bytes.toDouble();
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return '${val.toStringAsFixed(2)} ${units[i]}';
  }

  Future<void> _loadUser() async {
    try {
      final res = await apiClient.dio.get('/auth/me');
      if (mounted) setState(() => _user = res.data);
    } catch (_) {}
  }

  Future<void> _loadDrive({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final res = await apiClient.dio.get(
        '/drive',
        queryParameters: {
          'view': _view,
          if (_folderId != null) 'folderId': _folderId,
          if (_search.isNotEmpty) 'search': _search,
        },
      );
      if (mounted) {
        setState(() {
          _folders = res.data['folders'] ?? [];
          _files = res.data['files'] ?? [];
          _breadcrumbs = res.data['breadcrumbs'] ?? [];
        });
      }
    } catch (e) {
      if (mounted) _showSnack('Error loading drive: $e', isError: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: isError ? const Color(0xFFE11D48) : const Color(0xFF059669),
      ),
    );
  }

  Future<void> _uploadSingleFile(String path, String name, String? targetFolderId) async {
    final startTime = DateTime.now();
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(path, filename: name),
      if (targetFolderId != null) 'folderId': targetFolderId,
      'backend': 'TELEGRAM_MTPROTO',
    });

    await apiClient.dio.post(
      '/drive/upload',
      data: formData,
      onSendProgress: (sent, total) {
        if (!mounted) return;
        final elapsed = DateTime.now().difference(startTime).inMilliseconds / 1000.0;
        setState(() {
          _uploadingName = name;
          _uploadLoaded = sent;
          _uploadTotal = total;
          _uploadSpeed = elapsed > 0.1 ? sent / elapsed : 0;
          _syncingTelegram = total > 0 && sent >= total;
        });
      },
    );
  }

  Future<void> _uploadFiles() async {
    final result = await FilePicker.platform.pickFiles(allowMultiple: true);
    if (result == null || result.files.isEmpty) return;

    try {
      for (final f in result.files) {
        if (f.path == null) continue;
        await _uploadSingleFile(f.path!, f.name, _folderId);
      }
      _showSnack('Uploaded to Telegram Vault!');
      await _loadDrive(silent: true);
      await _loadUser();
    } catch (e) {
      _showSnack('Upload failed: $e', isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _uploadingName = null;
          _syncingTelegram = false;
        });
      }
    }
  }

  Future<void> _uploadFolder() async {
    final dirPath = await FilePicker.platform.getDirectoryPath();
    if (dirPath == null) return;

    final rootDir = Directory(dirPath);
    final rootName = rootDir.uri.pathSegments.where((s) => s.isNotEmpty).last;

    try {
      final createdRoot = await apiClient.dio.post('/drive/folders', data: {
        'name': rootName,
        if (_folderId != null) 'parentId': _folderId,
      });
      final rootFolderId = createdRoot.data['id'] as String;

      final entities = rootDir.listSync(recursive: true);
      for (final entity in entities) {
        if (entity is File) {
          final fileName = entity.uri.pathSegments.last;
          await _uploadSingleFile(entity.path, fileName, rootFolderId);
        }
      }
      _showSnack('Folder "$rootName" uploaded to Telegram!');
      await _loadDrive(silent: true);
      await _loadUser();
    } catch (e) {
      _showSnack('Folder upload failed: $e', isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _uploadingName = null;
          _syncingTelegram = false;
        });
      }
    }
  }

  Future<void> _createFolder() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New Folder'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Folder name'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;

    await apiClient.dio.post('/drive/folders', data: {
      'name': name,
      if (_folderId != null) 'parentId': _folderId,
    });
    _loadDrive(silent: true);
  }

  Future<void> _renameItem(String type, String id, String currentName) async {
    final controller = TextEditingController(text: currentName);
    final newName = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rename'),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (newName == null || newName.isEmpty) return;

    await apiClient.dio.patch('/drive/$type/$id/rename', data: {'name': newName});
    _showSnack('Renamed');
    _loadDrive(silent: true);
  }

  Future<void> _previewOrOpenFile(dynamic file) async {
    final mime = (file['mimeType'] ?? '') as String;
    if (mime.startsWith('image/')) {
      final token = await apiClient.storage.read(key: 'access_token');
      if (!mounted) return;
      showDialog(
        context: context,
        builder: (_) => Dialog.fullscreen(
          backgroundColor: Colors.black,
          child: Scaffold(
            backgroundColor: Colors.black,
            appBar: AppBar(
              backgroundColor: Colors.black,
              foregroundColor: Colors.white,
              title: Text(file['name'], overflow: TextOverflow.ellipsis),
              actions: [
                IconButton(
                  icon: const Icon(Icons.download),
                  onPressed: () => _downloadAndOpen(file),
                ),
              ],
            ),
            body: Center(
              child: InteractiveViewer(
                child: Image.network(
                  '${ApiClient.baseUrl}/drive/files/${file['id']}/download?inline=true',
                  headers: token != null ? {'Authorization': 'Bearer $token'} : null,
                  loadingBuilder: (_, child, progress) => progress == null
                      ? child
                      : const CircularProgressIndicator(color: Colors.white),
                ),
              ),
            ),
          ),
        ),
      );
      return;
    }
    await _downloadAndOpen(file);
  }

  Future<void> _downloadAndOpen(dynamic file) async {
    try {
      final dir = await getTemporaryDirectory();
      final savePath = '${dir.path}/${file['name']}';
      await apiClient.dio.download('/drive/files/${file['id']}/download', savePath);
      await OpenFilex.open(savePath);
    } catch (e) {
      _showSnack('Download failed: $e', isError: true);
    }
  }

  Future<void> _openShareDialog(String type, String id, String name) async {
    String permission = type == 'folder' ? 'EDITOR' : 'VIEWER';
    int expiresHours = 0;

    final existingRes = await apiClient.dio.get('/shares', queryParameters: {
      'type': type,
      'targetId': id,
    });
    List<dynamic> links = List.from(existingRes.data ?? []);

    if (!mounted) return;
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => AlertDialog(
          title: Text('Share "$name"', overflow: TextOverflow.ellipsis),
          content: SizedBox(
            width: 360,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    value: permission,
                    decoration: const InputDecoration(labelText: 'Permission'),
                    items: [
                      const DropdownMenuItem(value: 'VIEWER', child: Text('Viewer (View & Download)')),
                      if (type == 'folder')
                        const DropdownMenuItem(value: 'EDITOR', child: Text('Editor (Can Upload)')),
                    ],
                    onChanged: (v) => setModalState(() => permission = v!),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int>(
                    value: expiresHours,
                    decoration: const InputDecoration(labelText: 'Expiration'),
                    items: const [
                      DropdownMenuItem(value: 0, child: Text('Never expires')),
                      DropdownMenuItem(value: 24, child: Text('24 Hours')),
                      DropdownMenuItem(value: 168, child: Text('7 Days')),
                    ],
                    onChanged: (v) => setModalState(() => expiresHours = v!),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.link),
                      label: const Text('Create & Copy Share Link'),
                      onPressed: () async {
                        final res = await apiClient.dio.post('/shares', data: {
                          'type': type,
                          'targetId': id,
                          'permission': permission,
                          if (expiresHours > 0) 'expiresInHours': expiresHours,
                        });
                        final token = res.data['shareToken'];
                        final webBase = ApiClient.baseUrl.replaceAll('/api', '');
                        final shareUrl = '$webBase/share/$token';
                        await Clipboard.setData(ClipboardData(text: shareUrl));
                        setModalState(() => links.insert(0, res.data));
                        _showSnack('Share link copied!');
                      },
                    ),
                  ),
                  if (links.isNotEmpty) ...[
                    const Divider(height: 24),
                    for (final l in links)
                      ListTile(
                        dense: true,
                        title: Text('/share/${l['shareToken']}', overflow: TextOverflow.ellipsis),
                        subtitle: Text('${l['permission']} • ${l['accessCount']} views'),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline, color: Colors.red),
                          onPressed: () async {
                            await apiClient.dio.delete('/shares/${l['id']}');
                            setModalState(() => links.removeWhere((x) => x['id'] == l['id']));
                          },
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
          ],
        ),
      ),
    );
  }

  Future<void> _openSecurityDialog() async {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final sessionsRes = await apiClient.dio.get('/auth/sessions');
    final sessions = List<dynamic>.from(sessionsRes.data ?? []);

    if (!mounted) return;
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Passcode & Security'),
        content: SizedBox(
          width: 360,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: currentCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Current Passcode'),
                ),
                TextField(
                  controller: newCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'New Passcode'),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () async {
                    try {
                      await apiClient.dio.post('/auth/change-password', data: {
                        'currentPassword': currentCtrl.text,
                        'newPassword': newCtrl.text,
                      });
                      if (ctx.mounted) Navigator.pop(ctx);
                      _showSnack('Passcode updated');
                    } catch (e) {
                      _showSnack('Failed: $e', isError: true);
                    }
                  },
                  child: const Text('Update Passcode'),
                ),
                const Divider(height: 24),
                Text('Active Devices (${sessions.length})', style: const TextStyle(fontWeight: FontWeight.bold)),
                for (final s in sessions)
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.smartphone),
                    title: Text(s['device']?['deviceName'] ?? 'Device'),
                    subtitle: Text(s['ipAddress'] ?? ''),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await apiClient.dio.post('/auth/logout-all');
              await apiClient.storage.deleteAll();
              if (ctx.mounted) Navigator.pop(ctx);
              if (mounted) context.go('/login');
            },
            child: const Text('Lock All Devices', style: TextStyle(color: Colors.red)),
          ),
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        ],
      ),
    );
  }

  Future<void> _toggleStar(String type, String id) async {
    await apiClient.dio.patch('/drive/$type/$id/star');
    _loadDrive(silent: true);
  }

  Future<void> _trashItem(String type, String id) async {
    await apiClient.dio.patch('/drive/$type/$id/trash');
    _showSnack('Moved to Trash');
    _loadDrive(silent: true);
  }

  Future<void> _restoreItem(String type, String id) async {
    await apiClient.dio.patch('/drive/$type/$id/restore');
    _showSnack('Restored');
    _loadDrive(silent: true);
  }

  Future<void> _permanentDelete(String type, String id) async {
    await apiClient.dio.delete('/drive/${type == 'file' ? 'files' : 'folders'}/$id');
    _showSnack('Permanently deleted');
    _loadDrive(silent: true);
    _loadUser();
  }

  Future<void> _emptyTrash() async {
    await apiClient.dio.delete('/drive/trash/empty');
    _showSnack('Trash emptied');
    _loadDrive(silent: true);
    _loadUser();
  }

  Future<void> _lockVault() async {
    try {
      await apiClient.dio.post('/auth/logout');
    } catch (_) {}
    await apiClient.storage.deleteAll();
    if (mounted) context.go('/login');
  }

  void _goBack() {
    if (_breadcrumbs.length > 1) {
      setState(() => _folderId = _breadcrumbs[_breadcrumbs.length - 2]['id']);
      _loadDrive();
    } else if (_folderId != null) {
      setState(() => _folderId = null);
      _loadDrive();
    } else if (_view != 'my-drive') {
      setState(() => _view = 'my-drive');
      _loadDrive();
    }
  }

  @override
  Widget build(BuildContext context) {
    final canGoBack = _folderId != null || _view != 'my-drive';
    final usedBytes = int.tryParse(_user?['usedStorageBytes']?.toString() ?? '0') ?? 0;
    final quotaBytes = int.tryParse(_user?['storageQuotaBytes']?.toString() ?? '1') ?? 1;
    final usedRatio = (usedBytes / quotaBytes).clamp(0.0, 1.0);

    return PopScope(
      canPop: !canGoBack,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && canGoBack) _goBack();
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F7F9),
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          leading: canGoBack
              ? IconButton(
                  icon: const Icon(Icons.arrow_back, color: Color(0xFF0F172A)),
                  onPressed: _goBack,
                )
              : null,
          title: const Text(
            'NOOR DRIVE',
            style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0F172A), fontSize: 18),
          ),
          actions: [
            IconButton(
              icon: Icon(_isGrid ? Icons.view_list : Icons.grid_view, color: const Color(0xFF18181B)),
              onPressed: () => setState(() => _isGrid = !_isGrid),
              tooltip: 'Toggle Grid/List',
            ),
            IconButton(
              icon: const Icon(Icons.create_new_folder_outlined, color: Color(0xFF18181B)),
              onPressed: _createFolder,
              tooltip: 'New Folder',
            ),
            IconButton(
              icon: const Icon(Icons.drive_folder_upload_outlined, color: Color(0xFF18181B)),
              onPressed: _uploadFolder,
              tooltip: 'Upload Folder',
            ),
            if (_view == 'trash' && (_files.isNotEmpty || _folders.isNotEmpty))
              IconButton(
                icon: const Icon(Icons.delete_sweep, color: Color(0xFFE11D48)),
                onPressed: _emptyTrash,
                tooltip: 'Empty Trash',
              ),
            IconButton(
              icon: const Icon(Icons.lock_outline, color: Color(0xFF64748B)),
              onPressed: _lockVault,
              tooltip: 'Lock Vault',
            ),
          ],
        ),
        drawer: Drawer(
          backgroundColor: Colors.white,
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    const DrawerHeader(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [Color(0xFF18181B), Color(0xFF2563EB)],
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          CircleAvatar(
                            radius: 26,
                            backgroundImage: AssetImage('assets/owner.jpg'),
                          ),
                          SizedBox(height: 10),
                          Text(
                            'NOOR DRIVE',
                            style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                          ),
                          Text(
                            'Telegram Cloud Vault',
                            style: TextStyle(color: Colors.white70, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    for (final item in [
                      ('my-drive', 'My Drive', Icons.folder_outlined),
                      ('recent', 'Recent', Icons.access_time),
                      ('starred', 'Starred', Icons.star_outline),
                      ('photos', 'Photos', Icons.image_outlined),
                      ('videos', 'Videos', Icons.videocam_outlined),
                      ('documents', 'Documents', Icons.description_outlined),
                      ('trash', 'Trash', Icons.delete_outline),
                    ])
                      ListTile(
                        leading: Icon(item.$3, color: _view == item.$1 ? const Color(0xFF2563EB) : null),
                        title: Text(item.$2),
                        selected: _view == item.$1,
                        onTap: () {
                          setState(() {
                            _view = item.$1;
                            _folderId = null;
                          });
                          Navigator.pop(context);
                          _loadDrive();
                        },
                      ),
                    const Divider(),
                    ListTile(
                      leading: const Icon(Icons.security, color: Color(0xFF059669)),
                      title: const Text('Passcode & Security'),
                      onTap: () {
                        Navigator.pop(context);
                        _openSecurityDialog();
                      },
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Telegram Vault Storage', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 6),
                      LinearProgressIndicator(value: usedRatio, minHeight: 6, borderRadius: BorderRadius.circular(4)),
                      const SizedBox(height: 6),
                      Text(
                        '${_formatBytes(usedBytes)} of ${_formatBytes(quotaBytes)}',
                        style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _uploadingName != null ? null : _uploadFiles,
          backgroundColor: const Color(0xFF18181B),
          foregroundColor: Colors.white,
          icon: _uploadingName != null
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                )
              : const Icon(Icons.upload_file),
          label: Text(_uploadingName != null ? 'Uploading...' : 'Upload'),
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: TextField(
                decoration: InputDecoration(
                  hintText: 'Search your Telegram vault...',
                  prefixIcon: const Icon(Icons.search),
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                ),
                onChanged: (val) {
                  _searchDebounce?.cancel();
                  _searchDebounce = Timer(const Duration(milliseconds: 300), () {
                    _search = val;
                    _loadDrive(silent: true);
                  });
                },
              ),
            ),
            if (_uploadingName != null)
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _syncingTelegram
                          ? 'Syncing "$_uploadingName" to Telegram...'
                          : 'Uploading "$_uploadingName"',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                    const SizedBox(height: 6),
                    LinearProgressIndicator(
                      value: _uploadTotal > 0 ? _uploadLoaded / _uploadTotal : null,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_formatBytes(_uploadLoaded)} / ${_formatBytes(_uploadTotal)} • ${_formatBytes(_uploadSpeed.toInt())}/s',
                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                    ),
                  ],
                ),
              ),
            if (_breadcrumbs.isNotEmpty)
              SizedBox(
                height: 36,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    TextButton(
                      onPressed: () {
                        setState(() => _folderId = null);
                        _loadDrive();
                      },
                      child: const Text('Root'),
                    ),
                    for (final b in _breadcrumbs)
                      Row(
                        children: [
                          const Icon(Icons.chevron_right, size: 16),
                          TextButton(
                            onPressed: () {
                              setState(() => _folderId = b['id']);
                              _loadDrive();
                            },
                            child: Text(b['name']),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: () => _loadDrive(silent: true),
                      child: _isGrid
                          ? GridView.builder(
                              padding: const EdgeInsets.all(12),
                              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 2,
                                crossAxisSpacing: 10,
                                mainAxisSpacing: 10,
                                childAspectRatio: 1.05,
                              ),
                              itemCount: _folders.length + _files.length,
                              itemBuilder: (context, index) {
                                if (index < _folders.length) {
                                  final folder = _folders[index];
                                  return InkWell(
                                    onTap: () {
                                      setState(() => _folderId = folder['id']);
                                      _loadDrive();
                                    },
                                    child: Card(
                                      color: Colors.white,
                                      elevation: 0,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(16),
                                        side: const BorderSide(color: Color(0xFFE2E8F0)),
                                      ),
                                      child: Padding(
                                        padding: const EdgeInsets.all(12),
                                        child: Column(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            const Icon(Icons.folder, size: 40, color: Color(0xFFF59E0B)),
                                            const SizedBox(height: 8),
                                            Text(
                                              folder['name'],
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(fontWeight: FontWeight.w600),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  );
                                }
                                final file = _files[index - _folders.length];
                                return InkWell(
                                  onTap: () => _previewOrOpenFile(file),
                                  child: Card(
                                    color: Colors.white,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      side: const BorderSide(color: Color(0xFFE2E8F0)),
                                    ),
                                    child: Padding(
                                      padding: const EdgeInsets.all(12),
                                      child: Column(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          const Icon(Icons.insert_drive_file, size: 36, color: Color(0xFF4F46E5)),
                                          const SizedBox(height: 8),
                                          Text(
                                            file['name'],
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                                          ),
                                          Text(
                                            _formatBytes(file['sizeBytes']),
                                            style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                );
                              },
                            )
                          : ListView(
                              padding: const EdgeInsets.all(12),
                              children: [
                                for (final folder in _folders)
                                  Card(
                                    color: Colors.white,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      side: const BorderSide(color: Color(0xFFE2E8F0)),
                                    ),
                                    child: ListTile(
                                      leading: const Icon(Icons.folder, color: Color(0xFFF59E0B)),
                                      title: Text(folder['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
                                      onTap: () {
                                        setState(() => _folderId = folder['id']);
                                        _loadDrive();
                                      },
                                      trailing: PopupMenuButton<String>(
                                        onSelected: (action) {
                                          if (action == 'share') _openShareDialog('folder', folder['id'], folder['name']);
                                          if (action == 'rename') _renameItem('folder', folder['id'], folder['name']);
                                          if (action == 'star') _toggleStar('folder', folder['id']);
                                          if (action == 'trash') _trashItem('folder', folder['id']);
                                          if (action == 'restore') _restoreItem('folder', folder['id']);
                                          if (action == 'delete') _permanentDelete('folder', folder['id']);
                                        },
                                        itemBuilder: (_) => _view == 'trash'
                                            ? const [
                                                PopupMenuItem(value: 'restore', child: Text('Restore')),
                                                PopupMenuItem(value: 'delete', child: Text('Delete Forever')),
                                              ]
                                            : const [
                                                PopupMenuItem(value: 'share', child: Text('Share')),
                                                PopupMenuItem(value: 'rename', child: Text('Rename')),
                                                PopupMenuItem(value: 'star', child: Text('Star / Unstar')),
                                                PopupMenuItem(value: 'trash', child: Text('Move to Trash')),
                                              ],
                                      ),
                                    ),
                                  ),
                                for (final file in _files)
                                  Card(
                                    color: Colors.white,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      side: const BorderSide(color: Color(0xFFE2E8F0)),
                                    ),
                                    child: ListTile(
                                      leading: const Icon(Icons.insert_drive_file, color: Color(0xFF4F46E5)),
                                      title: Text(file['name'], maxLines: 1, overflow: TextOverflow.ellipsis),
                                      subtitle: Text('${_formatBytes(file['sizeBytes'])} • Telegram'),
                                      onTap: () => _previewOrOpenFile(file),
                                      trailing: PopupMenuButton<String>(
                                        onSelected: (action) {
                                          if (action == 'download') _downloadAndOpen(file);
                                          if (action == 'share') _openShareDialog('file', file['id'], file['name']);
                                          if (action == 'rename') _renameItem('file', file['id'], file['name']);
                                          if (action == 'star') _toggleStar('file', file['id']);
                                          if (action == 'trash') _trashItem('file', file['id']);
                                          if (action == 'restore') _restoreItem('file', file['id']);
                                          if (action == 'delete') _permanentDelete('file', file['id']);
                                        },
                                        itemBuilder: (_) => _view == 'trash'
                                            ? const [
                                                PopupMenuItem(value: 'restore', child: Text('Restore')),
                                                PopupMenuItem(value: 'delete', child: Text('Delete Forever')),
                                              ]
                                            : const [
                                                PopupMenuItem(value: 'download', child: Text('Download & Open')),
                                                PopupMenuItem(value: 'share', child: Text('Share')),
                                                PopupMenuItem(value: 'rename', child: Text('Rename')),
                                                PopupMenuItem(value: 'star', child: Text('Star / Unstar')),
                                                PopupMenuItem(value: 'trash', child: Text('Move to Trash')),
                                              ],
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
