import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:syncfusion_flutter_pdfviewer/pdfviewer.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:xml/xml.dart';
import '../../core/api_client.dart';

class DriveScreen extends StatefulWidget {
  const DriveScreen({super.key});

  @override
  State<DriveScreen> createState() => _DriveScreenState();
}

class _DriveScreenState extends State<DriveScreen> with WidgetsBindingObserver {
  String _view = 'my-drive';
  String? _folderId;
  String _search = '';
  bool _isGrid = false;
  bool _loading = true;
  Color _accentColor = const Color(0xFF18181B);

  // Live upload progress state
  String? _uploadingName;
  int _uploadLoaded = 0;
  int _uploadTotal = 0;
  double _uploadSpeed = 0;
  int _uploadEtaSeconds = 0;
  bool _syncingDrive = false;
  CancelToken? _uploadCancelToken;

  Map<String, dynamic>? _user;
  List<dynamic> _folders = [];
  List<dynamic> _files = [];
  List<dynamic> _breadcrumbs = [];
  final Map<String, Map<String, List<dynamic>>> _driveCache = {};
  final Set<String> _selectedKeys = {};
  Timer? _searchDebounce;
  Timer? _realtimeSyncTimer;
  String? _authToken;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadAccentColor();
    _loadUser();
    _loadDrive();
    _checkForAppUpdate(silent: true);

    // Real-Time Sync Engine: 4s background refresh
    _realtimeSyncTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (mounted && _uploadingName == null) {
        _loadDrive(silent: true);
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadDrive(silent: true);
    }
  }

  void _toggleSelect(String type, String id) {
    final key = '$type:$id';
    setState(() {
      if (_selectedKeys.contains(key)) {
        _selectedKeys.remove(key);
      } else {
        _selectedKeys.add(key);
      }
    });
  }

  void _toggleSelectAll() {
    setState(() {
      final total = _folders.length + _files.length;
      if (_selectedKeys.length == total && total > 0) {
        _selectedKeys.clear();
      } else {
        for (final f in _folders) {
          _selectedKeys.add('folder:${f['id']}');
        }
        for (final f in _files) {
          _selectedKeys.add('file:${f['id']}');
        }
      }
    });
  }

  void _selectAll() {
    _toggleSelectAll();
  }

  Future<void> _bulkAction(String action) async {
    if (_selectedKeys.isEmpty) return;
    final items = _selectedKeys.map((k) {
      final parts = k.split(':');
      return {'type': parts[0], 'id': parts[1]};
    }).toList();
    final selectedCopy = Set<String>.from(_selectedKeys);

    setState(() {
      _folders = _folders.where((f) => !selectedCopy.contains('folder:${f['id']}')).toList();
      _files = _files.where((f) => !selectedCopy.contains('file:${f['id']}')).toList();
      _selectedKeys.clear();
    });

    try {
      await apiClient.dio.post('/drive/bulk', data: {'action': action, 'items': items});
      final label = action == 'restore'
          ? 'Restored'
          : action == 'delete'
              ? 'Permanently deleted'
              : 'Moved to Trash';
      _showSnack('$label (${items.length} items)');
      _driveCache.clear();
      _loadDrive(silent: true);
      if (action == 'delete') _loadUser();
    } catch (e) {
      _showSnack('Bulk action failed: $e', isError: true);
      _loadDrive(silent: true);
    }
  }

  Future<void> _loadAccentColor() async {
    final hex = await apiClient.storage.read(key: 'accent_color');
    if (hex != null && mounted) {
      setState(() => _accentColor = Color(int.parse(hex)));
    }
  }

  Future<void> _setAccentColor(Color color) async {
    setState(() => _accentColor = color);
    await apiClient.storage.write(key: 'accent_color', value: color.value.toString());
  }

  Future<void> _checkForAppUpdate({bool silent = false}) async {
    try {
      String tag = '';
      String downloadUrl =
          'https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest/download/noor-drive.apk';

      try {
        final apiRes = await Dio(
          BaseOptions(connectTimeout: const Duration(seconds: 20)),
        ).get('${ApiClient.baseUrl}/shares/app-release');
        tag = (apiRes.data['version'] ?? '') as String;
        if (apiRes.data['downloadUrl'] != null) {
          downloadUrl = apiRes.data['downloadUrl'].toString();
        }
      } catch (_) {
        final ghRes = await Dio().get(
          'https://api.github.com/repos/NoorAbdullah02/open-cloud-vault/releases/latest',
        );
        tag = (ghRes.data['tag_name'] ?? '') as String;
        final apkAsset = (ghRes.data['assets'] as List?)?.firstWhere(
          (a) => (a['name'] ?? '').toString().endsWith('.apk'),
          orElse: () => null,
        );
        if (apkAsset != null && apkAsset['browser_download_url'] != null) {
          downloadUrl = apkAsset['browser_download_url'].toString();
        }
      }

      final match = RegExp(r'v1\.0\.(\d+)').firstMatch(tag);
      final remoteBuild = match != null ? int.tryParse(match.group(1)!) ?? 0 : 0;

      if (remoteBuild > ApiClient.buildNumber && mounted) {
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) {
            bool downloading = false;
            double progress = 0;
            return StatefulBuilder(
              builder: (ctx, setModalState) => AlertDialog(
                title: const Text('Update Available!'),
                content: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('NOOR DRIVE Build #$remoteBuild is ready to install (Current: #${ApiClient.buildNumber}).'),
                    if (downloading) ...[
                      const SizedBox(height: 14),
                      LinearProgressIndicator(value: progress > 0 ? progress : null),
                      const SizedBox(height: 6),
                      Text(
                        'Downloading update... ${(progress * 100).round()}%',
                        style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                      ),
                    ],
                  ],
                ),
                actions: [
                  if (!downloading)
                    TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Later')),
                  ElevatedButton(
                    onPressed: downloading
                        ? null
                        : () async {
                            setModalState(() => downloading = true);
                            try {
                              final dir = (await getExternalStorageDirectory()) ??
                                  (await getApplicationDocumentsDirectory());
                              final apkPath = '${dir.path}/noor-drive-update-v$remoteBuild.apk';
                              await Dio().download(
                                downloadUrl,
                                apkPath,
                                onReceiveProgress: (rec, total) {
                                  if (total > 0) {
                                    setModalState(() => progress = rec / total);
                                  }
                                },
                              );
                              if (ctx.mounted) Navigator.pop(ctx);
                              final result = await OpenFilex.open(
                                apkPath,
                                type: 'application/vnd.android.package-archive',
                              );
                              if (result.type != ResultType.done && mounted) {
                                _showSnack(
                                  'Allow "Install unknown apps" for NOOR DRIVE in Android Settings, then tap Check for Updates again.',
                                  isError: true,
                                );
                              }
                            } catch (e) {
                              setModalState(() => downloading = false);
                              _showSnack('Update download failed: $e', isError: true);
                            }
                          },
                    child: Text(downloading ? 'Downloading...' : 'Download & Update'),
                  ),
                ],
              ),
            );
          },
        );
      } else if (!silent && mounted) {
        _showSnack('You are on the latest version (Build #${ApiClient.buildNumber})');
      }
    } catch (_) {
      if (!silent && mounted) _showSnack('Could not check for updates', isError: true);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _realtimeSyncTimer?.cancel();
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

  String _formatDateTime(dynamic isoVal) {
    if (isoVal == null) return '';
    final dt = DateTime.tryParse(isoVal.toString())?.toLocal();
    if (dt == null) return '';
    return DateFormat('MMM d, y • h:mm a').format(dt);
  }

  Future<void> _loadUser() async {
    try {
      final res = await apiClient.dio.get('/auth/me');
      if (mounted) setState(() => _user = res.data);
    } catch (_) {}
  }

  Future<void> _loadDrive({bool silent = false}) async {
    _authToken ??= await apiClient.storage.read(key: 'access_token');
    if (!silent) _selectedKeys.clear();
    final cacheKey = '$_view:${_folderId ?? 'root'}:$_search';
    final cached = _driveCache[cacheKey];
    if (cached != null && !silent) {
      setState(() {
        _folders = cached['folders']!;
        _files = cached['files']!;
        _breadcrumbs = cached['breadcrumbs']!;
        _loading = false;
      });
    } else if (!silent) {
      setState(() => _loading = true);
    }

    try {
      final res = await apiClient.dio.get(
        '/drive',
        queryParameters: {
          'view': _view,
          if (_folderId != null) 'folderId': _folderId,
          if (_search.isNotEmpty) 'search': _search,
        },
      );
      final folders = List<dynamic>.from(res.data['folders'] ?? []);
      final files = List<dynamic>.from(res.data['files'] ?? []);
      final breadcrumbs = List<dynamic>.from(res.data['breadcrumbs'] ?? []);
      _driveCache[cacheKey] = {
        'folders': folders,
        'files': files,
        'breadcrumbs': breadcrumbs,
      };
      if (mounted) {
        setState(() {
          _folders = folders;
          _files = files;
          _breadcrumbs = breadcrumbs;
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
    _uploadCancelToken = CancelToken();
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(path, filename: name),
      if (targetFolderId != null) 'folderId': targetFolderId,
      'backend': 'TELEGRAM_MTPROTO',
    });

    await apiClient.dio.post(
      '/drive/upload',
      data: formData,
      cancelToken: _uploadCancelToken,
      onSendProgress: (sent, total) {
        if (!mounted) return;
        final elapsed = DateTime.now().difference(startTime).inMilliseconds / 1000.0;
        final speed = elapsed > 0.1 ? sent / elapsed : 0.0;
        final remaining = (total - sent).clamp(0, total);
        final eta = speed > 0 ? (remaining / speed).ceil() : 0;
        setState(() {
          _uploadingName = name;
          _uploadLoaded = sent;
          _uploadTotal = total;
          _uploadSpeed = speed;
          _uploadEtaSeconds = eta;
          _syncingDrive = total > 0 && sent >= total;
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
      _showSnack('Uploaded to NOOR DRIVE!');
      await _loadDrive(silent: true);
      await _loadUser();
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) {
        _showSnack('Upload cancelled', isError: true);
      } else {
        _showSnack('Upload failed: ${e.message}', isError: true);
      }
    } catch (e) {
      _showSnack('Upload failed: $e', isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _uploadingName = null;
          _syncingDrive = false;
          _uploadCancelToken = null;
        });
      }
    }
  }

  Future<void> _uploadFolder() async {
    final dirPath = await FilePicker.platform.getDirectoryPath();
    if (dirPath == null) return;

    final rootDir = Directory(dirPath);
    final segments = rootDir.uri.pathSegments.where((s) => s.isNotEmpty).toList();
    final rootName = segments.isNotEmpty ? segments.last : 'Uploaded Folder';

    List<File> filesToUpload = [];
    try {
      final entities = rootDir.listSync(recursive: true);
      filesToUpload = entities.whereType<File>().toList();
    } catch (_) {
      // Android 11+ Scoped Storage fallback: create folder & pick files inside it
      if (!mounted) return;
      final nameCtrl = TextEditingController(text: rootName);
      final customName = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Upload Folder Files'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Android restricts direct folder reading. Confirm the folder name and select the files to upload into it:',
                style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Folder Name'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, nameCtrl.text.trim()),
              child: const Text('Select Files'),
            ),
          ],
        ),
      );
      if (customName == null || customName.isEmpty) return;

      final picked = await FilePicker.platform.pickFiles(allowMultiple: true);
      if (picked == null || picked.files.isEmpty) return;

      try {
        final createdRoot = await apiClient.dio.post('/drive/folders', data: {
          'name': customName,
          if (_folderId != null) 'parentId': _folderId,
        });
        final rootFolderId = createdRoot.data['id'] as String;
        for (final pf in picked.files) {
          if (pf.path != null) {
            await _uploadSingleFile(pf.path!, pf.name, rootFolderId);
          }
        }
        _showSnack('Folder "$customName" uploaded to NOOR DRIVE!');
        _driveCache.clear();
        await _loadDrive(silent: true);
        await _loadUser();
      } catch (e) {
        _showSnack('Folder upload failed: $e', isError: true);
      } finally {
        if (mounted) {
          setState(() {
            _uploadingName = null;
            _syncingDrive = false;
            _uploadCancelToken = null;
          });
        }
      }
      return;
    }

    try {
      final createdRoot = await apiClient.dio.post('/drive/folders', data: {
        'name': rootName,
        if (_folderId != null) 'parentId': _folderId,
      });
      final rootFolderId = createdRoot.data['id'] as String;

      final subfolderCache = <String, String>{};
      final basePrefix = rootDir.path.endsWith(Platform.pathSeparator)
          ? rootDir.path
          : '${rootDir.path}${Platform.pathSeparator}';

      for (final file in filesToUpload) {
        String targetFolderId = rootFolderId;
        final rel = file.path.startsWith(basePrefix)
            ? file.path.substring(basePrefix.length)
            : file.uri.pathSegments.last;
        final parts = rel.split(Platform.pathSeparator);
        if (parts.length > 1) {
          final subParts = parts.sublist(0, parts.length - 1);
          String built = '';
          for (final part in subParts) {
            built = built.isEmpty ? part : '$built/$part';
            if (subfolderCache.containsKey(built)) {
              targetFolderId = subfolderCache[built]!;
            } else {
              final subRes = await apiClient.dio.post('/drive/folders', data: {
                'name': part,
                'parentId': targetFolderId,
              });
              targetFolderId = subRes.data['id'] as String;
              subfolderCache[built] = targetFolderId;
            }
          }
        }
        final fileName = parts.last;
        await _uploadSingleFile(file.path, fileName, targetFolderId);
      }
      _showSnack('Folder "$rootName" uploaded to NOOR DRIVE!');
      _driveCache.clear();
      await _loadDrive(silent: true);
      await _loadUser();
    } catch (e) {
      _showSnack('Folder upload failed: $e', isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _uploadingName = null;
          _syncingDrive = false;
          _uploadCancelToken = null;
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

    try {
      final res = await apiClient.dio.post('/drive/folders', data: {
        'name': name,
        if (_folderId != null) 'parentId': _folderId,
      });
      if (mounted && res.data is Map) {
        setState(() {
          _folders = [res.data, ..._folders];
        });
      }
      _loadDrive(silent: true);
    } catch (e) {
      _showSnack('Could not create folder: $e', isError: true);
    }
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
    if (newName == null || newName.isEmpty || newName == currentName) return;

    if (mounted) {
      setState(() {
        if (type == 'folder') {
          _folders = _folders.map((f) => f['id'] == id ? {...Map.from(f), 'name': newName} : f).toList();
        } else {
          _files = _files.map((f) => f['id'] == id ? {...Map.from(f), 'name': newName} : f).toList();
        }
      });
    }
    try {
      await apiClient.dio.patch('/drive/$type/$id/rename', data: {'name': newName});
      _showSnack('Renamed');
      _loadDrive(silent: true);
    } catch (e) {
      _showSnack('Rename failed: $e', isError: true);
      _loadDrive(silent: true);
    }
  }

  String _cleanDocTitle(String name) {
    final withoutExt = name.replaceAll(RegExp(r'\.[^/.]+$'), '');
    return withoutExt.replaceAll(RegExp(r'[_-]+'), ' ').trim();
  }

  Map<String, dynamic> _getFileVisualInfo(dynamic file) {
    final mime = (file['mimeType'] ?? '') as String;
    final fileName = (file['name'] ?? '').toString();
    final ext = (file['extension'] ?? (fileName.contains('.') ? fileName.split('.').last : '')).toString().toLowerCase();

    if (mime.startsWith('image/')) {
      return {'icon': Icons.image, 'color': const Color(0xFF0284C7), 'bg': const Color(0xFFF0F9FF), 'label': 'IMG'};
    }
    if (mime.startsWith('video/')) {
      return {'icon': Icons.videocam, 'color': const Color(0xFF9333EA), 'bg': const Color(0xFFFAF5FF), 'label': 'VID'};
    }
    if (mime.startsWith('audio/')) {
      return {'icon': Icons.audiotrack, 'color': const Color(0xFFDB2777), 'bg': const Color(0xFFFDF2F8), 'label': 'AUDIO'};
    }
    if (ext == 'pptx' || ext == 'ppt' || mime.contains('presentationml') || mime.contains('powerpoint')) {
      return {'icon': Icons.slideshow, 'color': const Color(0xFFEA580C), 'bg': const Color(0xFFFFF7ED), 'label': 'PPTX'};
    }
    if (ext == 'docx' || ext == 'doc' || mime.contains('wordprocessingml') || mime.contains('word')) {
      return {'icon': Icons.description, 'color': const Color(0xFF2563EB), 'bg': const Color(0xFFEFF6FF), 'label': 'DOCX'};
    }
    if (ext == 'pdf' || mime.contains('pdf')) {
      return {'icon': Icons.picture_as_pdf, 'color': const Color(0xFFE11D48), 'bg': const Color(0xFFFFF1F2), 'label': 'PDF'};
    }
    if (ext == 'xlsx' || ext == 'xls' || ext == 'csv' || mime.contains('spreadsheet') || mime.contains('excel')) {
      return {'icon': Icons.table_chart, 'color': const Color(0xFF059669), 'bg': const Color(0xFFECFDF5), 'label': 'SHEET'};
    }
    if (ext == 'zip' || ext == 'rar' || mime.contains('zip')) {
      return {'icon': Icons.folder_zip, 'color': const Color(0xFFD97706), 'bg': const Color(0xFFFFFBEB), 'label': 'ZIP'};
    }
    return {'icon': Icons.insert_drive_file, 'color': const Color(0xFF6366F1), 'bg': const Color(0xFFEEF2FF), 'label': ext.toUpperCase()};
  }

  Widget _buildFilePreview(dynamic file) {
    final mime = (file['mimeType'] ?? '').toString().toLowerCase();
    final fileName = (file['name'] ?? '').toString();
    final ext = (file['extension'] ?? (fileName.contains('.') ? fileName.split('.').last : '')).toString().toLowerCase();
    final isImage = mime.startsWith('image/');
    final isPptx = ext == 'pptx' || ext == 'ppt' || mime.contains('presentation') || mime.contains('powerpoint');
    final isDocx = ext == 'docx' || ext == 'doc' || mime.contains('word');
    final isPdf = ext == 'pdf' || mime.contains('pdf');
    final isSheet = ext == 'xlsx' || ext == 'xls' || ext == 'csv' || mime.contains('spreadsheet') || mime.contains('excel');

    if (isImage) {
      final imgUrl = '${ApiClient.baseUrl}/drive/files/${file['id']}/download?inline=true';
      return SizedBox(
        height: 94,
        width: double.infinity,
        child: Image.network(
          imgUrl,
          headers: _authToken != null ? {'Authorization': 'Bearer $_authToken'} : null,
          fit: BoxFit.cover,
          errorBuilder: (ctx, err, stack) => Container(
            color: const Color(0xFFF0F9FF),
            child: const Center(
              child: Icon(Icons.image, size: 36, color: Color(0xFF0284C7)),
            ),
          ),
        ),
      );
    }

    if (isPptx) {
      final title = _cleanDocTitle(fileName.isNotEmpty ? fileName : 'Presentation');
      return Container(
        height: 94,
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
          ),
          border: Border(bottom: BorderSide(color: Color(0xFFEA580C), width: 2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                  decoration: BoxDecoration(
                    color: const Color(0x33F97316),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.slideshow, size: 10, color: Color(0xFFFB923C)),
                      SizedBox(width: 3),
                      Text(
                        'SLIDE 1',
                        style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: Color(0xFFFB923C)),
                      ),
                    ],
                  ),
                ),
                const Text('16:9 HD', style: TextStyle(fontSize: 8, color: Colors.white38, fontWeight: FontWeight.bold)),
              ],
            ),
            SizedBox(
              width: double.infinity,
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Colors.white, height: 1.15),
              ),
            ),
            Row(
              children: [
                Container(width: 4, height: 4, decoration: const BoxDecoration(color: Color(0xFFF97316), shape: BoxShape.circle)),
                const SizedBox(width: 4),
                Expanded(
                  child: Container(
                    height: 3,
                    decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                const SizedBox(width: 6),
                const Text('Open', style: TextStyle(fontSize: 8, color: Color(0xFFFB923C))),
              ],
            ),
          ],
        ),
      );
    }

    if (isDocx) {
      final title = _cleanDocTitle(fileName.isNotEmpty ? fileName : 'Document');
      return Container(
        height: 94,
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: const BoxDecoration(
          color: Color(0xFFF8FAFC),
          border: Border(bottom: BorderSide(color: Color(0xFF2563EB), width: 2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                  decoration: BoxDecoration(
                    color: const Color(0x222563EB),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.description, size: 10, color: Color(0xFF2563EB)),
                      SizedBox(width: 3),
                      Text(
                        'DOCX',
                        style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: Color(0xFF2563EB)),
                      ),
                    ],
                  ),
                ),
                const Text('Page 1', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8))),
              ],
            ),
            SizedBox(
              width: double.infinity,
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Color(0xFF1E293B), height: 1.15),
              ),
            ),
            Column(
              children: [
                Container(height: 2.5, width: double.infinity, decoration: BoxDecoration(color: const Color(0xFFCBD5E1), borderRadius: BorderRadius.circular(2))),
                const SizedBox(height: 3),
                Container(height: 2.5, width: 70, decoration: BoxDecoration(color: const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(2))),
              ],
            ),
          ],
        ),
      );
    }

    if (isPdf) {
      final title = _cleanDocTitle(fileName.isNotEmpty ? fileName : 'PDF Document');
      return Container(
        height: 94,
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: const BoxDecoration(
          color: Color(0xFFFFF1F2),
          border: Border(bottom: BorderSide(color: Color(0xFFE11D48), width: 2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                  decoration: BoxDecoration(
                    color: const Color(0x33E11D48),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.picture_as_pdf, size: 10, color: Color(0xFFE11D48)),
                      SizedBox(width: 3),
                      Text(
                        'PDF',
                        style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: Color(0xFFE11D48)),
                      ),
                    ],
                  ),
                ),
                const Text('Vector', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8))),
              ],
            ),
            SizedBox(
              width: double.infinity,
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Color(0xFF881337), height: 1.15),
              ),
            ),
            Column(
              children: [
                Container(height: 2.5, width: double.infinity, decoration: BoxDecoration(color: const Color(0xFFFECDD3), borderRadius: BorderRadius.circular(2))),
                const SizedBox(height: 3),
                Container(height: 2.5, width: 60, decoration: BoxDecoration(color: const Color(0xFFFFE4E6), borderRadius: BorderRadius.circular(2))),
              ],
            ),
          ],
        ),
      );
    }

    if (isSheet) {
      final title = _cleanDocTitle(fileName.isNotEmpty ? fileName : 'Spreadsheet');
      return Container(
        height: 94,
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: const BoxDecoration(
          color: Color(0xFFECFDF5),
          border: Border(bottom: BorderSide(color: Color(0xFF059669), width: 2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                  decoration: BoxDecoration(
                    color: const Color(0x33059669),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.table_chart, size: 10, color: Color(0xFF059669)),
                      SizedBox(width: 3),
                      Text(
                        'SHEET 1',
                        style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: Color(0xFF059669)),
                      ),
                    ],
                  ),
                ),
                const Text('Grid', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8))),
              ],
            ),
            SizedBox(
              width: double.infinity,
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Color(0xFF064E3B), height: 1.15),
              ),
            ),
            Row(
              children: [
                for (int i = 0; i < 3; i++)
                  Expanded(
                    child: Container(
                      margin: const EdgeInsets.only(right: 3),
                      height: 10,
                      decoration: BoxDecoration(
                        color: const Color(0xFFA7F3D0),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      );
    }

    // Fallback for audio, video, zip, others
    final vis = _getFileVisualInfo(file);
    return Container(
      height: 94,
      width: double.infinity,
      color: vis['bg'] as Color,
      child: Center(
        child: Icon(
          vis['icon'] as IconData,
          size: 38,
          color: vis['color'] as Color,
        ),
      ),
    );
  }

  Future<void> _previewOrOpenFile(dynamic file) async {
    final mime = (file['mimeType'] ?? '') as String;
    final ext = (file['extension'] ?? '').toString().toLowerCase();
    final token = await apiClient.storage.read(key: 'access_token');
    final authHeaders = token != null ? {'Authorization': 'Bearer $token'} : <String, String>{};
    final inlineUrl = '${ApiClient.baseUrl}/drive/files/${file['id']}/download?inline=true';

    // 1. In-App Image Preview
    if (mime.startsWith('image/')) {
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
            body: _MobileZoomableImageViewer(
              imageUrl: inlineUrl,
              headers: authHeaders,
            ),
          ),
        ),
      );
      return;
    }

    // 2. In-App PDF Preview
    if (mime.contains('pdf') || ext == 'pdf') {
      if (!mounted) return;
      showDialog(
        context: context,
        builder: (_) => Dialog.fullscreen(
          backgroundColor: Colors.white,
          child: Scaffold(
            backgroundColor: Colors.white,
            appBar: AppBar(
              backgroundColor: Colors.white,
              foregroundColor: const Color(0xFF0F172A),
              title: Text(file['name'], overflow: TextOverflow.ellipsis),
              actions: [
                IconButton(
                  icon: const Icon(Icons.download),
                  onPressed: () => _downloadAndOpen(file),
                ),
              ],
            ),
            body: SfPdfViewer.network(
              inlineUrl,
              headers: authHeaders,
            ),
          ),
        ),
      );
      return;
    }

    // 3. In-App Word (.docx) Preview
    if (ext == 'docx' || mime.contains('wordprocessingml')) {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (_) => const Center(child: CircularProgressIndicator()),
      );
      try {
        final res = await apiClient.dio.get<List<int>>(
          '/drive/files/${file['id']}/download?inline=true',
          options: Options(responseType: ResponseType.bytes),
        );
        final archive = ZipDecoder().decodeBytes(res.data!);
        final docFile = archive.files.firstWhere((f) => f.name == 'word/document.xml');
        final xmlStr = utf8.decode(docFile.content as List<int>);
        final doc = XmlDocument.parse(xmlStr);
        final paragraphs = doc
            .findAllElements('w:p')
            .map((p) => p.findAllElements('w:t').map((t) => t.innerText).join())
            .where((line) => line.trim().isNotEmpty)
            .toList();

        if (!mounted) return;
        Navigator.of(context, rootNavigator: true).pop();
        showDialog(
          context: context,
          builder: (_) => Dialog.fullscreen(
            backgroundColor: Colors.white,
            child: Scaffold(
              backgroundColor: Colors.white,
              appBar: AppBar(
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF0F172A),
                title: Text(file['name'], overflow: TextOverflow.ellipsis),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.download),
                    onPressed: () => _downloadAndOpen(file),
                  ),
                ],
              ),
              body: ListView.separated(
                padding: const EdgeInsets.all(20),
                itemCount: paragraphs.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) => SelectableText(
                  paragraphs[i],
                  style: const TextStyle(fontSize: 15, height: 1.5, color: Color(0xFF0F172A)),
                ),
              ),
            ),
          ),
        );
        return;
      } catch (_) {
        if (mounted) Navigator.of(context, rootNavigator: true).pop();
        await _downloadAndOpen(file);
        return;
      }
    }

    // 4. In-App PowerPoint (.pptx) Slide Preview
    if (ext == 'pptx' || mime.contains('presentationml')) {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (_) => const Center(child: CircularProgressIndicator()),
      );
      try {
        final res = await apiClient.dio.get<List<int>>(
          '/drive/files/${file['id']}/download?inline=true',
          options: Options(responseType: ResponseType.bytes),
        );
        final archive = ZipDecoder().decodeBytes(res.data!);
        final slideFiles = archive.files
            .where((f) => RegExp(r'^ppt/slides/slide\d+\.xml$').hasMatch(f.name))
            .toList()
          ..sort((a, b) {
            final na = int.tryParse(RegExp(r'slide(\d+)\.xml').firstMatch(a.name)?.group(1) ?? '0') ?? 0;
            final nb = int.tryParse(RegExp(r'slide(\d+)\.xml').firstMatch(b.name)?.group(1) ?? '0') ?? 0;
            return na.compareTo(nb);
          });

        final slides = <Map<String, dynamic>>[];
        for (final sf in slideFiles) {
          final xmlStr = utf8.decode(sf.content as List<int>);
          final pBlocks = xmlStr.split(RegExp(r'<\/?(?:\w+:)?p[ >]', caseSensitive: false));
          final lines = <String>[];
          for (final block in pBlocks) {
            final tMatches = RegExp(r'<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>', caseSensitive: false)
                .allMatches(block);
            if (tMatches.isNotEmpty) {
              final text = tMatches
                  .map((m) => m.group(1) ?? '')
                  .join()
                  .replaceAll('&amp;', '&')
                  .replaceAll('&lt;', '<')
                  .replaceAll('&gt;', '>')
                  .replaceAll('&quot;', '"')
                  .replaceAll('&#39;', "'")
                  .trim();
              if (text.isNotEmpty) lines.add(text);
            }
          }
          final numStr = RegExp(r'slide(\d+)\.xml').firstMatch(sf.name)?.group(1) ?? '?';
          slides.add({'number': numStr, 'lines': lines});
        }

        if (!mounted) return;
        Navigator.of(context, rootNavigator: true).pop();
        showDialog(
          context: context,
          builder: (_) => Dialog.fullscreen(
            backgroundColor: const Color(0xFFF6F7F9),
            child: Scaffold(
              backgroundColor: const Color(0xFFF6F7F9),
              appBar: AppBar(
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF0F172A),
                title: Text(file['name'], overflow: TextOverflow.ellipsis),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.download),
                    onPressed: () => _downloadAndOpen(file),
                  ),
                ],
              ),
              body: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: slides.length,
                itemBuilder: (_, i) {
                  final s = slides[i];
                  final lines = s['lines'] as List<String>;
                  return Card(
                    color: Colors.white,
                    elevation: 0,
                    margin: const EdgeInsets.only(bottom: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: const BorderSide(color: Color(0xFFE2E8F0)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'SLIDE ${s['number']}',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFFD97706),
                            ),
                          ),
                          const Divider(),
                          for (final line in lines)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: SelectableText(line, style: const TextStyle(fontSize: 14)),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        );
        return;
      } catch (_) {
        if (mounted) Navigator.of(context, rootNavigator: true).pop();
        await _downloadAndOpen(file);
        return;
      }
    }

    // 5. In-App Text / Markdown / Code Preview
    if (mime.startsWith('text/') || ['md', 'txt', 'json', 'csv', 'log'].contains(ext)) {
      try {
        final res = await apiClient.dio.get(
          '/drive/files/${file['id']}/download?inline=true',
          options: Options(responseType: ResponseType.plain),
        );
        if (!mounted) return;
        showDialog(
          context: context,
          builder: (_) => Dialog.fullscreen(
            backgroundColor: Colors.white,
            child: Scaffold(
              backgroundColor: Colors.white,
              appBar: AppBar(
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF0F172A),
                title: Text(file['name'], overflow: TextOverflow.ellipsis),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.download),
                    onPressed: () => _downloadAndOpen(file),
                  ),
                ],
              ),
              body: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: SelectableText(
                  res.data?.toString() ?? '',
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
                ),
              ),
            ),
          ),
        );
        return;
      } catch (_) {
        if (mounted) Navigator.of(context, rootNavigator: true).pop();
        await _downloadAndOpen(file);
        return;
      }
    }

    // Fallback for Video/Audio/Other -> download and open in native Android viewer
    await _downloadAndOpen(file);
  }

  Future<void> _downloadAndOpen(dynamic file) async {
    try {
      _showSnack('Downloading ${file['name']}...');
      final dir = await getTemporaryDirectory();
      final savePath = '${dir.path}/${file['name']}';
      await apiClient.dio.download('/drive/files/${file['id']}/download', savePath);
      await OpenFilex.open(savePath);
    } catch (e) {
      _showSnack('Download failed: $e', isError: true);
    }
  }

  Future<void> _printFile(dynamic file) async {
    try {
      _showSnack('Preparing "${file['name']}" for printing...');
      final dir = await getTemporaryDirectory();
      final savePath = '${dir.path}/${file['name']}';
      final token = await apiClient.storage.read(key: 'access_token');
      await apiClient.dio.download(
        '/drive/files/${file['id']}/download',
        savePath,
        options: Options(
          headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        ),
      );
      await Share.shareXFiles(
        [XFile(savePath)],
        subject: 'Print: ${file['name']}',
        text: 'Print file: ${file['name']}',
      );
    } catch (e) {
      _showSnack('Print preparation failed: $e', isError: true);
    }
  }

  Future<void> _downloadFolderZip(dynamic folder) async {
    try {
      _showSnack('Preparing ${folder['name']}.zip...');
      final dir = await getTemporaryDirectory();
      final savePath = '${dir.path}/${folder['name']}.zip';
      await apiClient.dio.download('/drive/folders/${folder['id']}/download', savePath);
      await OpenFilex.open(savePath);
    } catch (e) {
      _showSnack('Folder download failed: $e', isError: true);
    }
  }

  Future<void> _confirmAction({
    required String title,
    required String message,
    required String confirmText,
    required Future<void> Function() onConfirm,
  }) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFE11D48), foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(confirmText),
          ),
        ],
      ),
    );
    if (ok == true) await onConfirm();
  }

  Future<void> _openShareDialog(String type, String id, String name) async {
    String permission = type == 'folder' ? 'EDITOR' : 'VIEWER';
    int expiresHours = 0;

    final existingRes = await apiClient.dio.get('/shares', queryParameters: {
      'type': type,
      'targetId': id,
    });
    List<dynamic> links = List.from(existingRes.data ?? []);

    Future<String> getOrCreateShareUrl({bool forceNew = false}) async {
      final matching = links.where((l) => l['permission'] == permission).toList();
      if (!forceNew && matching.isNotEmpty) {
        final token = matching[0]['shareToken'];
        final webBase = ApiClient.baseUrl.replaceAll('/api', '');
        return '$webBase/share/$token';
      }
      final res = await apiClient.dio.post('/shares', data: {
        'type': type,
        'targetId': id,
        'permission': permission,
        if (expiresHours > 0) 'expiresInHours': expiresHours,
      });
      links.insert(0, res.data);
      final token = res.data['shareToken'];
      final webBase = ApiClient.baseUrl.replaceAll('/api', '');
      return '$webBase/share/$token';
    }

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
                crossAxisAlignment: CrossAxisAlignment.stretch,
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

                  // Quick WhatsApp Direct Share Button
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF25D366),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: const Text('Share to WhatsApp'),
                    onPressed: () async {
                      final shareUrl = await getOrCreateShareUrl();
                      setModalState(() {});
                      final waUri = Uri.parse(
                        'https://api.whatsapp.com/send?text=${Uri.encodeComponent('Check out "$name" on NOOR DRIVE:\n$shareUrl')}',
                      );
                      if (await canLaunchUrl(waUri)) {
                        await launchUrl(waUri, mode: LaunchMode.externalApplication);
                      } else {
                        await Share.share('Check out "$name" on NOOR DRIVE:\n$shareUrl', subject: name);
                      }
                    },
                  ),
                  const SizedBox(height: 8),

                  // System Share to Any App (Telegram, Messenger, Bluetooth, Gmail)
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    icon: const Icon(Icons.share_outlined),
                    label: const Text('Share via Any App...'),
                    onPressed: () async {
                      final shareUrl = await getOrCreateShareUrl();
                      setModalState(() {});
                      await Share.share('Check out "$name" on NOOR DRIVE:\n$shareUrl', subject: name);
                    },
                  ),
                  const SizedBox(height: 8),

                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0F172A),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    icon: const Icon(Icons.add_link),
                    label: Text(type == 'folder' && permission == 'EDITOR'
                        ? 'Create Editor Link (Can Upload)'
                        : 'Create New Link'),
                    onPressed: () async {
                      final shareUrl = await getOrCreateShareUrl(forceNew: true);
                      await Clipboard.setData(ClipboardData(text: shareUrl));
                      setModalState(() {});
                      _showSnack('Share link created & copied!');
                    },
                  ),
                  const SizedBox(height: 8),

                  // Create / Copy Link Button
                  TextButton.icon(
                    icon: const Icon(Icons.link),
                    label: const Text('Copy Current Link'),
                    onPressed: () async {
                      final shareUrl = await getOrCreateShareUrl();
                      await Clipboard.setData(ClipboardData(text: shareUrl));
                      setModalState(() {});
                      _showSnack('Share link copied to clipboard!');
                    },
                  ),

                  if (links.isNotEmpty) ...[
                    const Divider(height: 24),
                    const Text(
                      'Active Share Links',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                    ),
                    const SizedBox(height: 8),
                    for (final l in links)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text('/share/${l['shareToken']}', overflow: TextOverflow.ellipsis),
                        subtitle: Text('${l['permission']} • ${l['accessCount']} views'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.copy, size: 18, color: Color(0xFF4F46E5)),
                              onPressed: () async {
                                final webBase = ApiClient.baseUrl.replaceAll('/api', '');
                                await Clipboard.setData(ClipboardData(text: '$webBase/share/${l['shareToken']}'));
                                _showSnack('Copied link!');
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, size: 18, color: Colors.red),
                              onPressed: () async {
                                await apiClient.dio.delete('/shares/${l['id']}');
                                setModalState(() => links.removeWhere((x) => x['id'] == l['id']));
                              },
                            ),
                          ],
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
    setState(() {
      if (type == 'file') {
        _files = _files.map((f) => f['id'] == id ? {...f, 'isStarred': !(f['isStarred'] ?? false)} : f).toList();
      } else {
        _folders = _folders.map((f) => f['id'] == id ? {...f, 'isStarred': !(f['isStarred'] ?? false)} : f).toList();
      }
    });
    await apiClient.dio.patch('/drive/$type/$id/star');
  }

  Future<void> _trashItem(String type, String id) async {
    setState(() {
      if (type == 'file') {
        _files = _files.where((f) => f['id'] != id).toList();
      } else {
        _folders = _folders.where((f) => f['id'] != id).toList();
      }
    });
    await apiClient.dio.patch('/drive/$type/$id/trash');
    _showSnack('Moved to Trash');
  }

  Future<void> _restoreItem(String type, String id) async {
    setState(() {
      if (type == 'file') {
        _files = _files.where((f) => f['id'] != id).toList();
      } else {
        _folders = _folders.where((f) => f['id'] != id).toList();
      }
    });
    await apiClient.dio.patch('/drive/$type/$id/restore');
    _showSnack('Restored');
  }

  Future<void> _permanentDelete(String type, String id) async {
    setState(() {
      if (type == 'file') {
        _files = _files.where((f) => f['id'] != id).toList();
      } else {
        _folders = _folders.where((f) => f['id'] != id).toList();
      }
    });
    await apiClient.dio.delete('/drive/${type == 'file' ? 'files' : 'folders'}/$id');
    _showSnack('Permanently deleted');
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
          leading: _selectedKeys.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.close, color: Color(0xFF0F172A)),
                  onPressed: () => setState(() => _selectedKeys.clear()),
                  tooltip: 'Cancel Selection',
                )
              : (canGoBack
                  ? IconButton(
                      icon: const Icon(Icons.arrow_back, color: Color(0xFF0F172A)),
                      onPressed: _goBack,
                    )
                  : null),
          title: Text(
            _selectedKeys.isNotEmpty
                ? '${_selectedKeys.length} selected'
                : 'NOOR DRIVE',
            style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0F172A), fontSize: 18),
          ),
          actions: [
            if (_selectedKeys.isNotEmpty) ...[
              IconButton(
                icon: Icon(
                  _selectedKeys.length == (_folders.length + _files.length) && (_folders.length + _files.length) > 0
                      ? Icons.deselect
                      : Icons.select_all,
                  color: const Color(0xFF4F46E5),
                ),
                onPressed: _toggleSelectAll,
                tooltip: _selectedKeys.length == (_folders.length + _files.length)
                    ? 'Deselect All'
                    : 'Select All',
              ),
              if (_view == 'trash') ...[
                IconButton(
                  icon: const Icon(Icons.restore_from_trash, color: Color(0xFF059669)),
                  onPressed: () => _bulkAction('restore'),
                  tooltip: 'Restore Selected',
                ),
                IconButton(
                  icon: const Icon(Icons.delete_forever, color: Color(0xFFE11D48)),
                  onPressed: () => _confirmAction(
                    title: 'Delete ${_selectedKeys.length} items forever?',
                    message: 'All selected items will be permanently deleted.',
                    confirmText: 'Delete Forever',
                    onConfirm: () => _bulkAction('delete'),
                  ),
                  tooltip: 'Delete Forever',
                ),
              ] else
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: Color(0xFFE11D48)),
                  onPressed: () => _confirmAction(
                    title: 'Move ${_selectedKeys.length} items to Trash?',
                    message: 'You can restore selected items later from Trash.',
                    confirmText: 'Move to Trash',
                    onConfirm: () => _bulkAction('trash'),
                  ),
                  tooltip: 'Move to Trash',
                ),
            ] else ...[
              IconButton(
                icon: Icon(_isGrid ? Icons.view_list : Icons.grid_view, color: const Color(0xFF18181B)),
                onPressed: () => setState(() => _isGrid = !_isGrid),
                tooltip: 'Toggle Grid/List',
              ),
              if (_files.isNotEmpty || _folders.isNotEmpty)
                IconButton(
                  icon: const Icon(Icons.checklist, color: Color(0xFF4F46E5)),
                  onPressed: _selectAll,
                  tooltip: 'Select All',
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
                  onPressed: () => _confirmAction(
                    title: 'Empty Trash?',
                    message: 'All trashed items will be permanently deleted.',
                    confirmText: 'Empty Trash',
                    onConfirm: _emptyTrash,
                  ),
                  tooltip: 'Empty Trash',
                ),
              IconButton(
                icon: const Icon(Icons.lock_outline, color: Color(0xFF64748B)),
                onPressed: _lockVault,
                tooltip: 'Lock Vault',
              ),
            ],
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
                    DrawerHeader(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [_accentColor, const Color(0xFF2563EB)],
                        ),
                      ),
                      child: const Column(
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
                            'Personal Cloud Vault',
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
                    ListTile(
                      leading: Icon(Icons.palette_outlined, color: _accentColor),
                      title: const Text('Customize Theme Color'),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Row(
                          children: [
                            for (final c in const [
                              Color(0xFF18181B),
                              Color(0xFF2563EB),
                              Color(0xFF4F46E5),
                              Color(0xFF059669),
                              Color(0xFFE11D48),
                            ])
                              GestureDetector(
                                onTap: () => _setAccentColor(c),
                                child: Container(
                                  margin: const EdgeInsets.only(right: 10),
                                  width: 24,
                                  height: 24,
                                  decoration: BoxDecoration(
                                    color: c,
                                    shape: BoxShape.circle,
                                    border: _accentColor.value == c.value
                                        ? Border.all(color: Colors.black26, width: 3)
                                        : null,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
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
                    ListTile(
                      leading: const Icon(Icons.system_update, color: Color(0xFF2563EB)),
                      title: const Text('Check for App Update'),
                      onTap: () {
                        Navigator.pop(context);
                        _checkForAppUpdate(silent: false);
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
                      const Text('NOOR DRIVE Storage', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
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
          backgroundColor: _accentColor,
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
                  hintText: 'Search NOOR DRIVE...',
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
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            _syncingDrive
                                ? 'Saving "$_uploadingName" to NOOR DRIVE...'
                                : 'Uploading "$_uploadingName" (${_uploadTotal > 0 ? ((_uploadLoaded / _uploadTotal) * 100).round() : 0}%)',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, size: 18, color: Color(0xFFE11D48)),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          onPressed: () => _uploadCancelToken?.cancel('Cancelled by user'),
                          tooltip: 'Cancel Upload',
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    LinearProgressIndicator(
                      value: _uploadTotal > 0 ? _uploadLoaded / _uploadTotal : null,
                      color: _accentColor,
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '${_formatBytes(_uploadLoaded)} / ${_formatBytes(_uploadTotal)}',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                        ),
                        Text(
                          _syncingDrive
                              ? 'Finalizing...'
                              : '${_formatBytes(_uploadSpeed.toInt())}/s • ${_uploadEtaSeconds}s left',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                        ),
                      ],
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
            if (_files.isNotEmpty || _folders.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${_folders.length} folders, ${_files.length} files',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF64748B)),
                    ),
                    TextButton.icon(
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      icon: Icon(
                        _selectedKeys.length == (_folders.length + _files.length) && (_folders.length + _files.length) > 0
                            ? Icons.check_box
                            : Icons.check_box_outline_blank,
                        size: 16,
                        color: const Color(0xFF4F46E5),
                      ),
                      label: Text(
                        _selectedKeys.length == (_folders.length + _files.length) && (_folders.length + _files.length) > 0
                            ? 'Deselect All'
                            : 'Select All',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF4F46E5)),
                      ),
                      onPressed: _toggleSelectAll,
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
                                childAspectRatio: 0.88,
                              ),
                              itemCount: _folders.length + _files.length,
                              itemBuilder: (context, index) {
                                if (index < _folders.length) {
                                  final folder = _folders[index];
                                  final isSelected = _selectedKeys.contains('folder:${folder['id']}');
                                  return Card(
                                    color: isSelected ? const Color(0xFFEEF2FF) : Colors.white,
                                    elevation: 0,
                                    clipBehavior: Clip.antiAlias,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      side: BorderSide(
                                        color: isSelected ? const Color(0xFF4F46E5) : const Color(0xFFE2E8F0),
                                        width: isSelected ? 2 : 1,
                                      ),
                                    ),
                                    child: Stack(
                                      children: [
                                        if (_selectedKeys.isNotEmpty)
                                          Positioned(
                                            top: 6,
                                            left: 6,
                                            child: Icon(
                                              isSelected ? Icons.check_circle : Icons.radio_button_unchecked,
                                              size: 20,
                                              color: isSelected ? const Color(0xFF4F46E5) : const Color(0xFF94A3B8),
                                            ),
                                          ),
                                        InkWell(
                                          borderRadius: BorderRadius.circular(16),
                                          onLongPress: () => _toggleSelect('folder', folder['id']),
                                          onTap: () {
                                            if (_selectedKeys.isNotEmpty) {
                                              _toggleSelect('folder', folder['id']);
                                            } else {
                                              setState(() => _folderId = folder['id']);
                                              _loadDrive();
                                            }
                                          },
                                          child: Center(
                                            child: Padding(
                                              padding: const EdgeInsets.all(12),
                                              child: Column(
                                                mainAxisAlignment: MainAxisAlignment.center,
                                                children: [
                                                  const Icon(Icons.folder, size: 42, color: Color(0xFFF59E0B)),
                                                  const SizedBox(height: 8),
                                                  SizedBox(
                                                    width: double.infinity,
                                                    child: Text(
                                                      folder['name'],
                                                      maxLines: 1,
                                                      overflow: TextOverflow.ellipsis,
                                                      textAlign: TextAlign.center,
                                                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ),
                                        ),
                                        Positioned(
                                          top: 2,
                                          right: 2,
                                          child: Material(
                                            color: Colors.transparent,
                                            child: PopupMenuButton<String>(
                                              icon: const Icon(Icons.more_vert, size: 18, color: Color(0xFF64748B)),
                                              onSelected: (action) {
                                                if (action == 'download') _downloadFolderZip(folder);
                                                if (action == 'share') _openShareDialog('folder', folder['id'], folder['name']);
                                                if (action == 'rename') _renameItem('folder', folder['id'], folder['name']);
                                                if (action == 'star') _toggleStar('folder', folder['id']);
                                                if (action == 'trash') {
                                                  _confirmAction(
                                                    title: 'Move to Trash?',
                                                    message: 'Move "${folder['name']}" to Trash?',
                                                    confirmText: 'Move to Trash',
                                                    onConfirm: () => _trashItem('folder', folder['id']),
                                                  );
                                                }
                                                if (action == 'restore') _restoreItem('folder', folder['id']);
                                                if (action == 'delete') {
                                                  _confirmAction(
                                                    title: 'Delete Forever?',
                                                    message: 'Permanently delete "${folder['name']}"?',
                                                    confirmText: 'Delete',
                                                    onConfirm: () => _permanentDelete('folder', folder['id']),
                                                  );
                                                }
                                              },
                                              itemBuilder: (_) => _view == 'trash'
                                                  ? const [
                                                      PopupMenuItem(value: 'restore', child: Text('Restore')),
                                                      PopupMenuItem(value: 'delete', child: Text('Delete Forever')),
                                                    ]
                                                  : const [
                                                      PopupMenuItem(value: 'download', child: Text('Download (.zip)')),
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
                                  );
                                }
                                final file = _files[index - _folders.length];
                                final isSelected = _selectedKeys.contains('file:${file['id']}');
                                return Card(
                                  color: isSelected ? const Color(0xFFEEF2FF) : Colors.white,
                                  elevation: 0,
                                  clipBehavior: Clip.antiAlias,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    side: BorderSide(
                                      color: isSelected ? const Color(0xFF4F46E5) : const Color(0xFFE2E8F0),
                                      width: isSelected ? 2 : 1,
                                    ),
                                  ),
                                  child: Stack(
                                    children: [
                                      if (_selectedKeys.isNotEmpty)
                                        Positioned(
                                          top: 6,
                                          left: 6,
                                          child: Icon(
                                            isSelected ? Icons.check_circle : Icons.radio_button_unchecked,
                                            size: 20,
                                            color: isSelected ? const Color(0xFF4F46E5) : const Color(0xFF94A3B8),
                                          ),
                                        ),
                                      InkWell(
                                        borderRadius: BorderRadius.circular(16),
                                        onLongPress: () => _toggleSelect('file', file['id']),
                                        onTap: () {
                                          if (_selectedKeys.isNotEmpty) {
                                            _toggleSelect('file', file['id']);
                                          } else {
                                            _previewOrOpenFile(file);
                                          }
                                        },
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            ClipRRect(
                                              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                                              child: _buildFilePreview(file),
                                            ),
                                            Expanded(
                                              child: Padding(
                                                padding: const EdgeInsets.fromLTRB(10, 8, 10, 6),
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                                  children: [
                                                    SizedBox(
                                                      width: double.infinity,
                                                      child: Text(
                                                        file['name'],
                                                        maxLines: 1,
                                                        overflow: TextOverflow.ellipsis,
                                                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                                                      ),
                                                    ),
                                                    Row(
                                                      children: [
                                                        Text(
                                                          _formatBytes(file['sizeBytes']),
                                                          style: const TextStyle(fontSize: 10.5, color: Color(0xFF64748B)),
                                                        ),
                                                        if (file['createdAt'] != null) ...[
                                                          const Text(' • ', style: TextStyle(fontSize: 10.5, color: Color(0xFF94A3B8))),
                                                          Expanded(
                                                            child: Text(
                                                              _formatDateTime(file['createdAt']),
                                                              maxLines: 1,
                                                              overflow: TextOverflow.ellipsis,
                                                              style: const TextStyle(fontSize: 9.5, color: Color(0xFF94A3B8)),
                                                            ),
                                                          ),
                                                        ],
                                                      ],
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Positioned(
                                        top: 2,
                                        right: 2,
                                        child: Material(
                                          color: Colors.transparent,
                                          child: PopupMenuButton<String>(
                                            icon: const Icon(Icons.more_vert, size: 18, color: Color(0xFF64748B)),
                                            onSelected: (action) {
                                              if (action == 'download') _downloadAndOpen(file);
                                              if (action == 'share') _openShareDialog('file', file['id'], file['name']);
                                              if (action == 'print') _printFile(file);
                                              if (action == 'rename') _renameItem('file', file['id'], file['name']);
                                              if (action == 'star') _toggleStar('file', file['id']);
                                              if (action == 'trash') {
                                                _confirmAction(
                                                  title: 'Move to Trash?',
                                                  message: 'Move "${file['name']}" to Trash?',
                                                  confirmText: 'Move to Trash',
                                                  onConfirm: () => _trashItem('file', file['id']),
                                                );
                                              }
                                              if (action == 'restore') _restoreItem('file', file['id']);
                                              if (action == 'delete') {
                                                _confirmAction(
                                                  title: 'Delete Forever?',
                                                  message: 'Permanently delete "${file['name']}"?',
                                                  confirmText: 'Delete',
                                                  onConfirm: () => _permanentDelete('file', file['id']),
                                                );
                                              }
                                            },
                                            itemBuilder: (_) => _view == 'trash'
                                                ? const [
                                                    PopupMenuItem(value: 'restore', child: Text('Restore')),
                                                    PopupMenuItem(value: 'delete', child: Text('Delete Forever')),
                                                  ]
                                                : const [
                                                    PopupMenuItem(value: 'download', child: Text('Download & Open')),
                                                    PopupMenuItem(value: 'share', child: Text('Share')),
                                                    PopupMenuItem(
                                                      value: 'print',
                                                      child: Row(
                                                        children: const [
                                                          Icon(Icons.print, size: 16, color: Color(0xFF64748B)),
                                                          SizedBox(width: 8),
                                                          Text('Print File'),
                                                        ],
                                                      ),
                                                    ),
                                                    PopupMenuItem(value: 'rename', child: Text('Rename')),
                                                    PopupMenuItem(value: 'star', child: Text('Star / Unstar')),
                                                    PopupMenuItem(value: 'trash', child: Text('Move to Trash')),
                                                  ],
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            )
                          : ListView(
                              padding: const EdgeInsets.all(12),
                              children: [
                                for (final folder in _folders)
                                  Card(
                                    color: _selectedKeys.contains('folder:${folder['id']}')
                                        ? const Color(0xFFEEF2FF)
                                        : Colors.white,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      side: BorderSide(
                                        color: _selectedKeys.contains('folder:${folder['id']}')
                                            ? const Color(0xFF4F46E5)
                                            : const Color(0xFFE2E8F0),
                                        width: _selectedKeys.contains('folder:${folder['id']}') ? 2 : 1,
                                      ),
                                    ),
                                    child: ListTile(
                                      leading: Icon(
                                        _selectedKeys.contains('folder:${folder['id']}')
                                            ? Icons.check_circle
                                            : (_selectedKeys.isNotEmpty ? Icons.radio_button_unchecked : Icons.folder),
                                        color: _selectedKeys.contains('folder:${folder['id']}')
                                            ? const Color(0xFF4F46E5)
                                            : (_selectedKeys.isNotEmpty ? const Color(0xFF94A3B8) : const Color(0xFFF59E0B)),
                                      ),
                                      title: Text(folder['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
                                      onLongPress: () => _toggleSelect('folder', folder['id']),
                                      onTap: () {
                                        if (_selectedKeys.isNotEmpty) {
                                          _toggleSelect('folder', folder['id']);
                                        } else {
                                          setState(() => _folderId = folder['id']);
                                          _loadDrive();
                                        }
                                      },
                                      trailing: PopupMenuButton<String>(
                                        onSelected: (action) {
                                          if (action == 'download') _downloadFolderZip(folder);
                                          if (action == 'share') _openShareDialog('folder', folder['id'], folder['name']);
                                          if (action == 'rename') _renameItem('folder', folder['id'], folder['name']);
                                          if (action == 'star') _toggleStar('folder', folder['id']);
                                          if (action == 'trash') {
                                            _confirmAction(
                                              title: 'Move to Trash?',
                                              message: 'Move "${folder['name']}" to Trash?',
                                              confirmText: 'Move to Trash',
                                              onConfirm: () => _trashItem('folder', folder['id']),
                                            );
                                          }
                                          if (action == 'restore') _restoreItem('folder', folder['id']);
                                          if (action == 'delete') {
                                            _confirmAction(
                                              title: 'Delete Forever?',
                                              message: 'Permanently delete "${folder['name']}"?',
                                              confirmText: 'Delete',
                                              onConfirm: () => _permanentDelete('folder', folder['id']),
                                            );
                                          }
                                        },
                                        itemBuilder: (_) => _view == 'trash'
                                            ? const [
                                                PopupMenuItem(value: 'restore', child: Text('Restore')),
                                                PopupMenuItem(value: 'delete', child: Text('Delete Forever')),
                                              ]
                                            : const [
                                                PopupMenuItem(value: 'download', child: Text('Download (.zip)')),
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
                                    color: _selectedKeys.contains('file:${file['id']}')
                                        ? const Color(0xFFEEF2FF)
                                        : Colors.white,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      side: BorderSide(
                                        color: _selectedKeys.contains('file:${file['id']}')
                                            ? const Color(0xFF4F46E5)
                                            : const Color(0xFFE2E8F0),
                                        width: _selectedKeys.contains('file:${file['id']}') ? 2 : 1,
                                      ),
                                    ),
                                    child: ListTile(
                                      leading: _selectedKeys.contains('file:${file['id']}')
                                          ? const Icon(Icons.check_circle, color: Color(0xFF4F46E5), size: 28)
                                          : (_selectedKeys.isNotEmpty
                                              ? const Icon(Icons.radio_button_unchecked, color: Color(0xFF94A3B8), size: 28)
                                              : Builder(builder: (_) {
                                                  final vis = _getFileVisualInfo(file);
                                                  final mime = (file['mimeType'] ?? '').toString().toLowerCase();
                                                  if (mime.startsWith('image/')) {
                                                    final imgUrl = '${ApiClient.baseUrl}/drive/files/${file['id']}/download?inline=true';
                                                    return ClipRRect(
                                                      borderRadius: BorderRadius.circular(8),
                                                      child: SizedBox(
                                                        width: 40,
                                                        height: 40,
                                                        child: Image.network(
                                                          imgUrl,
                                                          headers: _authToken != null ? {'Authorization': 'Bearer $_authToken'} : null,
                                                          fit: BoxFit.cover,
                                                          errorBuilder: (_, __, ___) => Container(
                                                            color: vis['bg'] as Color,
                                                            child: Icon(vis['icon'] as IconData, size: 22, color: vis['color'] as Color),
                                                          ),
                                                        ),
                                                      ),
                                                    );
                                                  }
                                                  return Container(
                                                    width: 40,
                                                    height: 40,
                                                    decoration: BoxDecoration(
                                                      color: vis['bg'] as Color,
                                                      borderRadius: BorderRadius.circular(8),
                                                    ),
                                                    child: Center(
                                                      child: Icon(
                                                        vis['icon'] as IconData,
                                                        size: 22,
                                                        color: vis['color'] as Color,
                                                      ),
                                                    ),
                                                  );
                                                })),
                                      title: Text(file['name'], maxLines: 1, overflow: TextOverflow.ellipsis),
                                      subtitle: Text(
                                        '${_formatBytes(file['sizeBytes'])}${file['createdAt'] != null ? ' • ${_formatDateTime(file['createdAt'])}' : ''}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      onLongPress: () => _toggleSelect('file', file['id']),
                                      onTap: () {
                                        if (_selectedKeys.isNotEmpty) {
                                          _toggleSelect('file', file['id']);
                                        } else {
                                          _previewOrOpenFile(file);
                                        }
                                      },
                                      trailing: PopupMenuButton<String>(
                                        onSelected: (action) {
                                          if (action == 'download') _downloadAndOpen(file);
                                          if (action == 'share') _openShareDialog('file', file['id'], file['name']);
                                          if (action == 'print') _printFile(file);
                                          if (action == 'rename') _renameItem('file', file['id'], file['name']);
                                          if (action == 'star') _toggleStar('file', file['id']);
                                          if (action == 'trash') {
                                            _confirmAction(
                                              title: 'Move to Trash?',
                                              message: 'Move "${file['name']}" to Trash?',
                                              confirmText: 'Move to Trash',
                                              onConfirm: () => _trashItem('file', file['id']),
                                            );
                                          }
                                          if (action == 'restore') _restoreItem('file', file['id']);
                                          if (action == 'delete') {
                                            _confirmAction(
                                              title: 'Delete Forever?',
                                              message: 'Permanently delete "${file['name']}"?',
                                              confirmText: 'Delete',
                                              onConfirm: () => _permanentDelete('file', file['id']),
                                            );
                                          }
                                        },
                                        itemBuilder: (_) => _view == 'trash'
                                            ? const [
                                                PopupMenuItem(value: 'restore', child: Text('Restore')),
                                                PopupMenuItem(value: 'delete', child: Text('Delete Forever')),
                                              ]
                                            : const [
                                                PopupMenuItem(value: 'download', child: Text('Download & Open')),
                                                PopupMenuItem(value: 'share', child: Text('Share')),
                                                PopupMenuItem(
                                                  value: 'print',
                                                  child: Row(
                                                    children: const [
                                                      Icon(Icons.print, size: 16, color: Color(0xFF64748B)),
                                                      SizedBox(width: 8),
                                                      Text('Print File'),
                                                    ],
                                                  ),
                                                ),
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

class _MobileZoomableImageViewer extends StatefulWidget {
  final String imageUrl;
  final Map<String, String>? headers;

  const _MobileZoomableImageViewer({
    required this.imageUrl,
    this.headers,
  });

  @override
  State<_MobileZoomableImageViewer> createState() => _MobileZoomableImageViewerState();
}

class _MobileZoomableImageViewerState extends State<_MobileZoomableImageViewer>
    with SingleTickerProviderStateMixin {
  late TransformationController _transformationController;
  TapDownDetails? _doubleTapDetails;
  AnimationController? _animationController;
  Animation<Matrix4>? _animation;
  double _currentScale = 1.0;

  @override
  void initState() {
    super.initState();
    _transformationController = TransformationController();
    _transformationController.addListener(_onTransformationChanged);
  }

  void _onTransformationChanged() {
    final scale = _transformationController.value.getMaxScaleOnAxis();
    if (mounted && (_currentScale - scale).abs() > 0.05) {
      setState(() {
        _currentScale = scale;
      });
    }
  }

  @override
  void dispose() {
    _transformationController.removeListener(_onTransformationChanged);
    _transformationController.dispose();
    _animationController?.dispose();
    super.dispose();
  }

  void _animateTo(Matrix4 target) {
    _animationController?.dispose();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 240),
    );
    _animation = Matrix4Tween(
      begin: _transformationController.value,
      end: target,
    ).animate(CurvedAnimation(
      parent: _animationController!,
      curve: Curves.easeOutCubic,
    ));

    _animationController!.addListener(() {
      _transformationController.value = _animation!.value;
    });
    _animationController!.forward();
  }

  void _handleDoubleTap() {
    final currentScale = _transformationController.value.getMaxScaleOnAxis();
    if (currentScale > 1.2) {
      _animateTo(Matrix4.identity());
    } else {
      final position = _doubleTapDetails?.localPosition ?? Offset.zero;
      final target = Matrix4.identity()
        ..translate(-position.dx * 1.5, -position.dy * 1.5)
        ..scale(2.5);
      _animateTo(target);
    }
  }

  void _zoomIn() {
    final scale = _transformationController.value.getMaxScaleOnAxis();
    final targetScale = (scale * 1.4).clamp(0.6, 5.0);
    final target = Matrix4.identity()..scale(targetScale);
    _animateTo(target);
  }

  void _zoomOut() {
    final scale = _transformationController.value.getMaxScaleOnAxis();
    final targetScale = (scale / 1.4).clamp(0.6, 5.0);
    final target = targetScale <= 1.05 ? Matrix4.identity() : (Matrix4.identity()..scale(targetScale));
    _animateTo(target);
  }

  void _resetZoom() {
    _animateTo(Matrix4.identity());
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        GestureDetector(
          onDoubleTapDown: (d) => _doubleTapDetails = d,
          onDoubleTap: _handleDoubleTap,
          child: Center(
            child: InteractiveViewer(
              transformationController: _transformationController,
              minScale: 0.5,
              maxScale: 5.0,
              child: Image.network(
                widget.imageUrl,
                headers: widget.headers,
                loadingBuilder: (_, child, progress) => progress == null
                    ? child
                    : const CircularProgressIndicator(color: Colors.white),
              ),
            ),
          ),
        ),

        // Floating Zoom Toolbar & Percentage
        Positioned(
          bottom: 24,
          left: 0,
          right: 0,
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xCC0F172A),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white12),
                boxShadow: const [
                  BoxShadow(color: Colors.black45, blurRadius: 12, offset: Offset(0, 4)),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    icon: const Icon(Icons.zoom_out, color: Colors.white, size: 20),
                    onPressed: _zoomOut,
                    visualDensity: VisualDensity.compact,
                    tooltip: 'Zoom Out',
                  ),
                  GestureDetector(
                    onTap: _resetZoom,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Text(
                        '${(_currentScale * 100).round()}%',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.zoom_in, color: Colors.white, size: 20),
                    onPressed: _zoomIn,
                    visualDensity: VisualDensity.compact,
                    tooltip: 'Zoom In',
                  ),
                  Container(
                    width: 1,
                    height: 16,
                    color: Colors.white24,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                  ),
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Colors.white, size: 18),
                    onPressed: _resetZoom,
                    visualDensity: VisualDensity.compact,
                    tooltip: 'Reset Zoom',
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
