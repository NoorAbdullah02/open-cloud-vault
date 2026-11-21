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
import 'package:local_auth/local_auth.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:syncfusion_flutter_pdfviewer/pdfviewer.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';
import 'package:xml/xml.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/sharing_service.dart';
import '../../core/desktop_sync_service.dart';
import '../../core/system_tray_service.dart';
import '../../core/updater_service.dart';
import '../../core/encryption_service.dart';
import '../../main.dart';

class DriveScreen extends ConsumerStatefulWidget {
  const DriveScreen({super.key});

  @override
  ConsumerState<DriveScreen> createState() => _DriveScreenState();
}

class _DriveScreenState extends ConsumerState<DriveScreen> with WidgetsBindingObserver {
  String _view = 'my-drive';
  String? _folderId;
  String _search = '';
  String _filterType = 'all';
  bool _vaultUnlocked = false;
  final TextEditingController _searchController = TextEditingController();
  bool _isGrid = false;
  bool _isDualSide = true;
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

  // Offline storage & registry
  final Map<String, Map<String, dynamic>> _offlineFiles = {};

  // Auto-sync preferences
  bool _autoSyncEnabled = false;
  bool _autoSyncWifiOnly = true;
  String? _lastAutoSyncTime;

  Map<String, dynamic>? _user;
  List<dynamic> _folders = [];
  List<dynamic> _files = [];
  List<dynamic> _breadcrumbs = [];
  final Map<String, Map<String, List<dynamic>>> _driveCache = {};
  final Set<String> _selectedKeys = {};
  Timer? _searchDebounce;
  Timer? _realtimeSyncTimer;
  String? _authToken;
  bool _isFetchingDrive = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadAccentColor();
    _loadUser();
    _loadOfflineRegistry();
    _loadAutoSyncSettings();
    _loadDrive();
    _checkForAppUpdate(silent: true);

    if (Platform.isAndroid || Platform.isIOS) {
      const MethodChannel('com.noordrive.app/sharing').setMethodCallHandler((call) async {
        if (call.method == 'onFilesShared') {
          _checkIncomingSharedFiles();
        }
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _checkIncomingSharedFiles();
      });
    } else {
      // Desktop platforms: Initialize ~/NoorDrive local folder sync
      DesktopSyncService.instance.initialize().then((_) {
        DesktopSyncService.instance.start();
      });
    }

    // Real-Time Sync Engine: 25s non-blocking background refresh
    _realtimeSyncTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      if (mounted && _uploadingName == null && _view != 'offline' && !_isFetchingDrive) {
        _loadDrive(silent: true);
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (Platform.isAndroid || Platform.isIOS) {
        _checkIncomingSharedFiles();
      }
    }
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      if (_vaultUnlocked) {
        setState(() {
          _vaultUnlocked = false;
          if (_view == 'vault') {
            _view = 'my-drive';
            _folderId = null;
          }
        });
      }
    }
    if (state == AppLifecycleState.resumed) {
      if (_view != 'offline') {
        _loadDrive(silent: true);
      }
      if (_autoSyncEnabled) {
        _triggerAutoSyncCheck();
      }
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
    // ignore: deprecated_member_use
    await apiClient.storage.write(key: 'accent_color', value: color.value.toString());
  }

  Future<void> _checkForAppUpdate({bool silent = false}) async {
    try {
      if (silent) {
        final lastCheckStr = await apiClient.storage.read(key: 'last_update_check_time');
        if (lastCheckStr != null) {
          final lastTime = int.tryParse(lastCheckStr) ?? 0;
          final elapsedMs = DateTime.now().millisecondsSinceEpoch - lastTime;
          // In background silent mode: check at most once every 24 hours
          if (elapsedMs < const Duration(hours: 24).inMilliseconds) {
            return;
          }
        }
      }

      final info = await UpdaterService.checkUpdate();
      if (info != null && mounted) {
        if (silent) {
          final dismissed = await apiClient.storage.read(key: 'dismissed_update_version');
          if (dismissed == info.version) return;
        }
        if (!mounted) return;
        await UpdaterService.showUpdateDialog(context, info);
      } else if (!silent && mounted) {
        _showSnack('You are on the latest version (Build #${ApiClient.buildNumber})');
      }
    } catch (e) {
      if (!silent && mounted) {
        _showSnack('Update check failed: $e', isError: true);
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _realtimeSyncTimer?.cancel();
    _searchDebounce?.cancel();
    _searchController.dispose();
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
    if (_isFetchingDrive) return;
    _isFetchingDrive = true;

    try {
      _authToken ??= await apiClient.storage.read(key: 'access_token');
      if (!silent) _selectedKeys.clear();

      if (_view == 'offline') {
        if (mounted) {
          setState(() {
            _folders = [];
            _breadcrumbs = [{'id': 'offline', 'name': 'Offline Files'}];
            _files = _offlineFiles.values.toList();
            _loading = false;
          });
        }
        return;
      }

      final cacheKey = '$_view:${_folderId ?? 'root'}:$_search:$_filterType';
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
            if (_filterType != 'all') 'filterType': _filterType,
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

        final hasChanged = _folders.length != folders.length ||
            _files.length != files.length ||
            _breadcrumbs.length != breadcrumbs.length;

        if (mounted && (!silent || hasChanged)) {
          setState(() {
            _folders = folders;
            _files = files;
            _breadcrumbs = breadcrumbs;
            _loading = false;
          });
        }
      } catch (e) {
        if (_offlineFiles.isNotEmpty && _view != 'offline' && !silent) {
          if (mounted) {
            _showSnack('Offline Mode: Disconnected from network. Showing cached offline files.', isError: true);
            setState(() {
              _view = 'offline';
              _folders = [];
              _breadcrumbs = [{'id': 'offline', 'name': 'Offline Files'}];
              _files = _offlineFiles.values.toList();
              _loading = false;
            });
          }
        } else if (mounted && !silent) {
        _showSnack('Error loading drive: $e', isError: true);
      }
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    } finally {
      _isFetchingDrive = false;
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

  Future<void> _uploadSingleFile(
    String? path,
    String name,
    String? targetFolderId, {
    List<int>? bytes,
  }) async {
    final startTime = DateTime.now();
    _uploadCancelToken = CancelToken();
    final effectiveTarget = targetFolderId ??
        (_view == 'vault'
            ? (_breadcrumbs.isNotEmpty ? _breadcrumbs.first['id'] : 'vault')
            : null);

    MultipartFile multipartFile;
    if (path != null && path.isNotEmpty && await File(path).exists()) {
      multipartFile = await MultipartFile.fromFile(path, filename: name);
    } else if (bytes != null && bytes.isNotEmpty) {
      multipartFile = MultipartFile.fromBytes(bytes, filename: name);
    } else {
      throw Exception('Unable to access file data for "$name"');
    }

    final mapData = <String, dynamic>{
      'file': multipartFile,
      'backend': 'TELEGRAM_MTPROTO',
    };
    if (effectiveTarget != null) {
      mapData['folderId'] = effectiveTarget;
    } else if (_view != 'all' && _view != 'my-drive') {
      mapData['view'] = _view;
    }

    final formData = FormData.fromMap(mapData);

    DateTime lastProgressTime = DateTime.now();
    final res = await apiClient.dio.post(
      '/drive/upload',
      data: formData,
      cancelToken: _uploadCancelToken,
      onSendProgress: (sent, total) {
        if (!mounted) return;
        final now = DateTime.now();
        final isDone = total > 0 && sent >= total;
        if (isDone || now.difference(lastProgressTime).inMilliseconds >= 250) {
          lastProgressTime = now;
          final elapsed = now.difference(startTime).inMilliseconds / 1000.0;
          final speed = elapsed > 0.1 ? sent / elapsed : 0.0;
          final remaining = (total - sent).clamp(0, total);
          final eta = speed > 0 ? (remaining / speed).ceil() : 0;
          setState(() {
            _uploadingName = name;
            _uploadLoaded = sent;
            _uploadTotal = total;
            _uploadSpeed = speed;
            _uploadEtaSeconds = eta;
            _syncingDrive = isDone;
          });
        }
      },
    );

    if (res.data is Map && res.data['isDeduplicated'] == true && mounted) {
      _showSnack('⚡ Instant Upload: "$name" deduplicated via SHA-256 (0 bytes transferred)!');
    }
  }

  // --- Offline Mode & Offline Registry ---
  Future<File> _getOfflineRegistryFile() async {
    final docsDir = await getApplicationDocumentsDirectory();
    final cacheDir = Directory('${docsDir.path}/noor_offline_cache');
    if (!cacheDir.existsSync()) {
      cacheDir.createSync(recursive: true);
    }
    return File('${cacheDir.path}/registry.json');
  }

  Future<void> _loadOfflineRegistry() async {
    try {
      final regFile = await _getOfflineRegistryFile();
      if (regFile.existsSync()) {
        final content = await regFile.readAsString();
        final Map<String, dynamic> data = jsonDecode(content);
        if (mounted) {
          setState(() {
            _offlineFiles.clear();
            data.forEach((k, v) {
              if (v is Map) {
                _offlineFiles[k] = Map<String, dynamic>.from(v);
              }
            });
          });
        }
      }
    } catch (_) {}
  }

  Future<void> _saveOfflineRegistry() async {
    try {
      final regFile = await _getOfflineRegistryFile();
      await regFile.writeAsString(jsonEncode(_offlineFiles));
    } catch (_) {}
  }

  Future<void> _toggleOfflineFile(dynamic file) async {
    final fileId = file['id'] as String;
    final fileName = file['name'] as String;

    if (_offlineFiles.containsKey(fileId)) {
      final entry = _offlineFiles[fileId];
      final localPath = entry?['localPath'] as String?;
      if (localPath != null) {
        final f = File(localPath);
        if (f.existsSync()) {
          try { f.deleteSync(); } catch (_) {}
        }
      }
      setState(() {
        _offlineFiles.remove(fileId);
        if (_view == 'offline') {
          _files = _offlineFiles.values.toList();
        }
      });
      await _saveOfflineRegistry();
      _showSnack('Removed "$fileName" from Offline Files');
    } else {
      try {
        _showSnack('Downloading "$fileName" for offline access...');
        final docsDir = await getApplicationDocumentsDirectory();
        final cacheDir = Directory('${docsDir.path}/noor_offline_cache');
        if (!cacheDir.existsSync()) {
          cacheDir.createSync(recursive: true);
        }
        final savePath = '${cacheDir.path}/${fileId}_$fileName';

        await apiClient.dio.download(
          '/drive/files/$fileId/download',
          savePath,
          options: Options(responseType: ResponseType.stream),
        );

        final entry = {
          'id': fileId,
          'name': fileName,
          'sizeBytes': file['sizeBytes'],
          'mimeType': file['mimeType'] ?? '',
          'extension': file['extension'] ?? (fileName.contains('.') ? fileName.split('.').last : ''),
          'createdAt': file['createdAt'],
          'localPath': savePath,
          'cachedAt': DateTime.now().toIso8601String(),
        };

        setState(() {
          _offlineFiles[fileId] = entry;
          if (_view == 'offline') {
            _files = _offlineFiles.values.toList();
          }
        });
        await _saveOfflineRegistry();
        _showSnack('✅ "$fileName" is now Available Offline!');
      } catch (e) {
        _showSnack('Failed to cache file offline: $e', isError: true);
      }
    }
  }

  // --- Background Auto-Sync Settings ---
  Future<void> _loadAutoSyncSettings() async {
    try {
      final enabled = await apiClient.storage.read(key: 'noor_auto_sync_enabled');
      final wifiOnly = await apiClient.storage.read(key: 'noor_auto_sync_wifi_only');
      final lastRun = await apiClient.storage.read(key: 'noor_auto_sync_last_run');
      if (mounted) {
        setState(() {
          _autoSyncEnabled = enabled == 'true';
          _autoSyncWifiOnly = wifiOnly != 'false';
          _lastAutoSyncTime = lastRun;
        });
      }
    } catch (_) {}
  }

  Future<void> _saveAutoSyncSettings() async {
    try {
      await apiClient.storage.write(key: 'noor_auto_sync_enabled', value: _autoSyncEnabled ? 'true' : 'false');
      await apiClient.storage.write(key: 'noor_auto_sync_wifi_only', value: _autoSyncWifiOnly ? 'true' : 'false');
      if (_lastAutoSyncTime != null) {
        await apiClient.storage.write(key: 'noor_auto_sync_last_run', value: _lastAutoSyncTime!);
      }
    } catch (_) {}
  }

  Future<String?> _getOrCreateCameraUploadsFolderId() async {
    try {
      final camRes = await apiClient.dio.get('/drive/camera-folder');
      if (camRes.data is Map && camRes.data['id'] != null) {
        return camRes.data['id'] as String;
      }
    } catch (_) {}

    try {
      final rootRes = await apiClient.dio.get('/drive');
      if (rootRes.data is Map && rootRes.data['folders'] is List) {
        for (final f in rootRes.data['folders']) {
          if (f is Map && (f['name'] as String).toLowerCase() == 'camera uploads') {
            return f['id'] as String;
          }
        }
      }
    } catch (_) {}

    try {
      final newFolderRes = await apiClient.dio.post('/drive/folders', data: {
        'name': 'Camera Uploads',
      });
      if (newFolderRes.data is Map && newFolderRes.data['id'] != null) {
        return newFolderRes.data['id'] as String;
      }
    } catch (_) {}

    return null;
  }

  Future<void> _triggerAutoSyncCheck() async {
    if (_uploadingName != null || !_autoSyncEnabled) return;
    try {
      final now = DateTime.now().toIso8601String();
      setState(() => _lastAutoSyncTime = now);
      await _saveAutoSyncSettings();

      // Find or create 'Camera Uploads' folder via canonical singleton
      final cameraUploadsFolderId = await _getOrCreateCameraUploadsFolderId();
      if (cameraUploadsFolderId == null) return;

      // Check camera roll directory for new images
      final List<File> candidateFiles = [];
      final List<String> cameraDirs = [
        '/storage/emulated/0/DCIM/Camera',
        '/storage/emulated/0/DCIM/100ANDRO',
        '/storage/emulated/0/DCIM',
        '/storage/emulated/0/Pictures/Camera',
        '/storage/emulated/0/Pictures',
        '/sdcard/DCIM/Camera',
      ];

      for (final dirPath in cameraDirs) {
        final dir = Directory(dirPath);
        if (await dir.exists()) {
          try {
            final entities = dir.listSync();
            for (final entity in entities) {
              if (entity is File) {
                final ext = entity.path.split('.').last.toLowerCase();
                if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'mp4', 'mov'].contains(ext)) {
                  candidateFiles.add(entity);
                }
              }
            }
          } catch (_) {}
        }
      }

      if (candidateFiles.isNotEmpty) {
        candidateFiles.sort((a, b) => b.lastModifiedSync().compareTo(a.lastModifiedSync()));
        final existingNames = <String>{};
        try {
          final existingRes = await apiClient.dio.get('/drive', queryParameters: {'folderId': cameraUploadsFolderId});
          if (existingRes.data is Map && existingRes.data['files'] is List) {
            for (final ef in existingRes.data['files']) {
              if (ef is Map && ef['name'] != null) {
                existingNames.add(ef['name'].toString().toLowerCase());
              }
            }
          }
        } catch (_) {}

        int autoSyncedCount = 0;
        for (final photoFile in candidateFiles.take(20)) {
          final fileName = photoFile.path.split(Platform.pathSeparator).last;
          if (existingNames.contains(fileName.toLowerCase())) continue;

          try {
            await _uploadSingleFile(photoFile.path, fileName, cameraUploadsFolderId);
            autoSyncedCount++;
            existingNames.add(fileName.toLowerCase());
          } catch (_) {}
        }

        if (autoSyncedCount > 0 && mounted) {
          _showSnack('📸 Auto-synced $autoSyncedCount new camera photo(s) to "Camera Uploads"');
          await _loadDrive(silent: true);
        }
      }
    } catch (_) {}
  }

  void _showAutoSyncDialog() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF2FF),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.sync, color: Color(0xFF4F46E5)),
                    ),
                    const SizedBox(width: 12),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Background Auto-Sync',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                        Text(
                          'Keep Camera Uploads in sync automatically',
                          style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Auto-Sync Gallery Photos', style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: const Text('Automatically detect and sync new photos when app is active or resumed'),
                  value: _autoSyncEnabled,
                  // ignore: deprecated_member_use
                  activeColor: const Color(0xFF4F46E5),
                  onChanged: (val) {
                    setState(() => _autoSyncEnabled = val);
                    setSheetState(() {});
                    _saveAutoSyncSettings();
                  },
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Wi-Fi Only', style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: const Text('Avoid using mobile cellular data for background syncing'),
                  value: _autoSyncWifiOnly,
                  // ignore: deprecated_member_use
                  activeColor: const Color(0xFF4F46E5),
                  onChanged: _autoSyncEnabled
                      ? (val) {
                          setState(() => _autoSyncWifiOnly = val);
                          setSheetState(() {});
                          _saveAutoSyncSettings();
                        }
                      : null,
                ),
                if (_lastAutoSyncTime != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      'Last synced: ${_formatDateTime(_lastAutoSyncTime)}',
                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                    ),
                  ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF4F46E5),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.cloud_upload_outlined),
                    label: const Text('Sync Camera Roll Now', style: TextStyle(fontWeight: FontWeight.bold)),
                    onPressed: () {
                      Navigator.pop(ctx);
                      _backupGalleryPhotos();
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // --- Duplicate Files Cleaner ---
  Future<void> _showDuplicateCleanerDialog() async {
    try {
      _showSnack('Scanning for duplicate files in NOOR DRIVE...');
      final res = await apiClient.dio.get('/drive/storage/duplicates');
      if (!mounted) return;
      final data = res.data is Map ? res.data : null;
      if (data == null) return;

      final totalGroups = data['totalGroups'] as int? ?? 0;
      final totalWastedBytes = data['totalWastedBytes']?.toString() ?? '0';
      final List groups = data['groups'] as List? ?? [];

      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, setSheetState) => DraggableScrollableSheet(
            initialChildSize: 0.7,
            minChildSize: 0.4,
            maxChildSize: 0.95,
            expand: false,
            builder: (_, scrollController) => Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.grey[300],
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Duplicate Files Cleaner',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                          ),
                          Text(
                            totalGroups > 0
                                ? '$totalGroups duplicate sets found (${_formatBytes(totalWastedBytes)} wasted)'
                                : 'No duplicate files found! Your drive is clean.',
                            style: TextStyle(
                              fontSize: 12,
                              color: totalGroups > 0 ? const Color(0xFFE11D48) : const Color(0xFF059669),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const Divider(height: 24),
                  if (groups.isEmpty)
                    const Expanded(
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.check_circle_outline, size: 56, color: Color(0xFF059669)),
                            SizedBox(height: 12),
                            Text(
                              'Everything is optimized!',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                            ),
                            Text(
                              'All files have unique SHA-256 signatures.',
                              style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    Expanded(
                      child: ListView.separated(
                        controller: scrollController,
                        itemCount: groups.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (_, idx) {
                          final group = groups[idx];
                          final List files = group['files'] as List? ?? [];
                          final size = group['sizeBytes'];
                          return Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF8FAFC),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      '${files.length} Copies • ${_formatBytes(size)} each',
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFFFE4E6),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Text(
                                        'Wastes ${_formatBytes(group['wastedBytes'])}',
                                        style: const TextStyle(color: Color(0xFFE11D48), fontSize: 10.5, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                for (int i = 0; i < files.length; i++) ...[
                                  ListTile(
                                    dense: true,
                                    contentPadding: EdgeInsets.zero,
                                    leading: Icon(
                                      i == 0 ? Icons.verified : Icons.copy,
                                      color: i == 0 ? const Color(0xFF059669) : const Color(0xFF64748B),
                                      size: 18,
                                    ),
                                    title: Text(
                                      files[i]['name'] ?? 'File',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                                    ),
                                    subtitle: Text(
                                      'In ${files[i]['folderName'] ?? 'Root'} • ${_formatDateTime(files[i]['createdAt'])}',
                                      style: const TextStyle(fontSize: 10, color: Color(0xFF64748B)),
                                    ),
                                    trailing: i > 0
                                        ? TextButton(
                                            style: TextButton.styleFrom(foregroundColor: const Color(0xFFE11D48)),
                                            onPressed: () async {
                                              try {
                                                await apiClient.dio.patch('/drive/file/${files[i]['id']}/trash');
                                                setSheetState(() {
                                                  files.removeAt(i);
                                                });
                                                _showSnack('Moved duplicate to Trash');
                                                _loadDrive(silent: true);
                                              } catch (e) {
                                                _showSnack('Error: $e', isError: true);
                                              }
                                            },
                                            child: const Text('Trash Copy', style: TextStyle(fontSize: 11)),
                                          )
                                        : const Text('Primary', style: TextStyle(color: Color(0xFF059669), fontSize: 11, fontWeight: FontWeight.bold)),
                                  ),
                                ],
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
    } catch (e) {
      _showSnack('Could not scan for duplicates: $e', isError: true);
    }
  }

  void _showShortcutsAndGesturesDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.75,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (_, scrollController) => ListView(
          controller: scrollController,
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEEF2FF),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.touch_app, color: Color(0xFF4F46E5)),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Shortcuts & Gestures Cheat Sheet',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                      Text(
                        'Tips to navigate NOOR DRIVE faster on mobile',
                        style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            _buildGestureTile(
              icon: Icons.photo_library_outlined,
              title: 'Swipe Photos & Videos',
              desc: 'In full-screen viewer, swipe left or right to seamlessly browse between photos and videos.',
            ),
            _buildGestureTile(
              icon: Icons.pinch,
              title: 'Pinch to Zoom',
              desc: 'Double tap or pinch to zoom up to 5x on images, documents, and code files.',
            ),
            _buildGestureTile(
              icon: Icons.touch_app_outlined,
              title: 'Long Press for Multi-Select',
              desc: 'Hold down on any file or folder to select multiple items for bulk download or delete.',
            ),
            _buildGestureTile(
              icon: Icons.arrow_downward,
              title: 'Pull Down to Refresh',
              desc: 'Pull down on any drive screen to immediately sync recent uploads from other devices.',
            ),
            _buildGestureTile(
              icon: Icons.lock_outline,
              title: 'Auto-Lock Secret Vault',
              desc: 'Secret Vault auto-locks immediately when you switch apps or leave the screen idle.',
            ),
            _buildGestureTile(
              icon: Icons.music_note,
              title: 'Background Audio Playback',
              desc: 'Stream music with continuous playback and playback speed controls.',
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _accentColor,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  padding: const EdgeInsets.symmetric(vertical: 13),
                ),
                child: const Text('Got it!', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGestureTile({required IconData icon, required String title, required String desc}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: const Color(0xFF4F46E5)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                const SizedBox(height: 2),
                Text(desc, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), height: 1.3)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _uploadFiles() async {
    final result = await FilePicker.platform.pickFiles(allowMultiple: true, withData: false);
    if (result == null || result.files.isEmpty) return;

    try {
      final targetFolder = _folderId ?? (_view == 'vault' ? (_breadcrumbs.isNotEmpty ? _breadcrumbs.first['id'] : 'vault') : null);
      for (final f in result.files) {
        await _uploadSingleFile(f.path, f.name, targetFolder, bytes: f.bytes);
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

  Future<void> _uploadEncryptedFiles() async {
    final passphraseController = TextEditingController();
    final passphrase = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.enhanced_encryption, color: Color(0xFF4F46E5)),
            SizedBox(width: 8),
            Text('Zero-Knowledge Encrypt'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Files will be encrypted with AES-256 before uploading to cloud. Passphrase is never sent to the server.',
              style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: passphraseController,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Encryption Passphrase',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.key),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, passphraseController.text.trim()),
            child: const Text('Choose Files & Encrypt'),
          ),
        ],
      ),
    );

    if (passphrase == null || passphrase.isEmpty) return;

    final result = await FilePicker.platform.pickFiles(allowMultiple: true, withData: true);
    if (result == null || result.files.isEmpty) return;

    try {
      final targetFolder = _folderId ?? (_view == 'vault' ? (_breadcrumbs.isNotEmpty ? _breadcrumbs.first['id'] : 'vault') : null);
      for (final f in result.files) {
        Uint8List? rawBytes = f.bytes;
        if (rawBytes == null && f.path != null) {
          rawBytes = await File(f.path!).readAsBytes();
        }
        if (rawBytes == null) continue;
        final encrypted = EncryptionService.encryptBytes(rawBytes, passphrase);
        final encName = '${f.name}.ndenc';
        await _uploadSingleFile(null, encName, targetFolder, bytes: encrypted);
      }
      _showSnack('Zero-Knowledge Encrypted & Uploaded!');
      await _loadDrive(silent: true);
      await _loadUser();
    } catch (e) {
      _showSnack('Encrypted upload failed: $e', isError: true);
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

  bool _isCheckingSharedFiles = false;

  Future<void> _checkIncomingSharedFiles() async {
    if (_isCheckingSharedFiles || !mounted) return;
    _isCheckingSharedFiles = true;
    try {
      final shared = await SharingService.getSharedFiles();
      if (shared.isEmpty) return;

      final count = shared.length;
      final targetFolderId = await _getOrCreateCameraUploadsFolderId();

      if (!mounted) return;
      final proceed = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        builder: (ctx) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: const Color(0xFFEEF2FF),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.share, color: Color(0xFF4F46E5)),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Upload $count Shared Item(s)',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Received from phone Gallery / Files app',
                          style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                constraints: const BoxConstraints(maxHeight: 180),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: ListView.separated(
                  shrinkWrap: true,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  itemCount: shared.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, idx) {
                    final item = shared[idx];
                    return ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        item.mimeType.startsWith('video/')
                            ? Icons.video_file
                            : item.mimeType.startsWith('image/')
                                ? Icons.image
                                : Icons.insert_drive_file,
                        color: const Color(0xFF4F46E5),
                      ),
                      title: Text(item.name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: Text(item.mimeType, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                    );
                  },
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      onPressed: () {
                        SharingService.clearSharedFiles();
                        Navigator.pop(ctx, false);
                      },
                      child: const Text('Dismiss'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4F46E5),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      onPressed: () => Navigator.pop(ctx, true),
                      icon: const Icon(Icons.cloud_upload),
                      label: Text('Upload Now ($count)'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      );

      if (proceed != true) {
        await SharingService.clearSharedFiles();
        return;
      }

      int success = 0;
      for (int i = 0; i < shared.length; i++) {
        final item = shared[i];
        if (!mounted) break;
        setState(() {
          _uploadingName = '[${i + 1}/$count] ${item.name}';
        });
        try {
          await _uploadSingleFile(item.path, item.name, targetFolderId);
          success++;
          try {
            final f = File(item.path);
            if (await f.exists()) await f.delete();
          } catch (_) {}
        } catch (e) {
          debugPrint('Error uploading shared item ${item.name}: $e');
        }
      }

      await SharingService.clearSharedFiles();
      if (mounted && success > 0) {
        _showSnack('🎉 $success of $count shared files uploaded to Camera Uploads!');
        await _loadDrive(silent: true);
        await _loadUser();
      }
    } catch (e) {
      debugPrint('Error in _checkIncomingSharedFiles: $e');
    } finally {
      _isCheckingSharedFiles = false;
      if (mounted) {
        setState(() {
          _uploadingName = null;
          _syncingDrive = false;
          _uploadCancelToken = null;
        });
      }
    }
  }

  Future<void> _backupGalleryPhotos() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.media,
        allowMultiple: true,
        withData: false,
      );
      if (result == null || result.files.isEmpty) return;

      final selectedCount = result.files.length;
      if (!mounted) return;
      final proceed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Backup Gallery Media'),
          content: Text(
            'Found $selectedCount photos/videos selected from your phone. '
            'Do you want to back them up to your "Camera Uploads" folder in NOOR DRIVE?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4F46E5),
                foregroundColor: Colors.white,
              ),
              child: Text('Backup ($selectedCount)'),
            ),
          ],
        ),
      );

      if (proceed != true) return;

      // Find or create "Camera Uploads" folder via canonical singleton
      final cameraUploadsFolderId = await _getOrCreateCameraUploadsFolderId();
      if (cameraUploadsFolderId == null) {
        _showSnack('Could not initialize "Camera Uploads" folder', isError: true);
        return;
      }

      int successCount = 0;
      String? lastError;
      for (int i = 0; i < result.files.length; i++) {
        final f = result.files[i];
        if (!mounted) break;
        setState(() {
          _uploadingName = '[${i + 1}/$selectedCount] ${f.name}';
        });
        try {
          await _uploadSingleFile(f.path, f.name, cameraUploadsFolderId, bytes: f.bytes);
          successCount++;
        } catch (e) {
          lastError = e.toString();
          debugPrint('Upload error for ${f.name}: $e');
        }
      }

      if (mounted) {
        if (successCount > 0) {
          _showSnack('🎉 $successCount of $selectedCount media files backed up to "Camera Uploads"!');
        } else if (lastError != null) {
          _showSnack('Image backup failed: $lastError', isError: true);
        }
        await _loadDrive(silent: true);
        await _loadUser();
      }
    } catch (e) {
      _showSnack('Gallery backup error: $e', isError: true);
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

  void _showUploadMenu() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Add to NOOR DRIVE',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEEF2FF),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.upload_file, color: Color(0xFF4F46E5)),
                ),
                title: const Text('Upload Files', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Select documents, archives or media', style: TextStyle(fontSize: 12)),
                onTap: () {
                  Navigator.pop(ctx);
                  _uploadFiles();
                },
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3E8FF),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.enhanced_encryption, color: Color(0xFF9333EA)),
                ),
                title: const Text('Encrypt & Upload (AES-256)', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Zero-Knowledge encryption before leaving device', style: TextStyle(fontSize: 12)),
                onTap: () {
                  Navigator.pop(ctx);
                  _uploadEncryptedFiles();
                },
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.drive_folder_upload, color: Color(0xFFD97706)),
                ),
                title: const Text('Upload Folder', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Upload an entire folder and its contents', style: TextStyle(fontSize: 12)),
                onTap: () {
                  Navigator.pop(ctx);
                  _uploadFolder();
                },
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFECFDF5),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.photo_library, color: Color(0xFF059669)),
                ),
                title: const Text('Backup Phone Gallery', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Sync photos & videos to Camera Uploads', style: TextStyle(fontSize: 12)),
                onTap: () {
                  Navigator.pop(ctx);
                  _backupGalleryPhotos();
                },
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.create_new_folder, color: Color(0xFF475569)),
                ),
                title: const Text('Create Folder', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Create a new sub-folder here', style: TextStyle(fontSize: 12)),
                onTap: () {
                  Navigator.pop(ctx);
                  _createFolder();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _uploadFolder() async {
    final dirPath = await FilePicker.platform.getDirectoryPath();
    if (dirPath == null) return;

    final rootDir = Directory(dirPath);
    final segments = rootDir.uri.pathSegments.where((s) => s.isNotEmpty).toList();
    final rootName = segments.isNotEmpty ? segments.last : 'Uploaded Folder';

    List<File> filesToUpload = [];
    try {
      final entities = await rootDir.list(recursive: true).toList();
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

      final picked = await FilePicker.platform.pickFiles(allowMultiple: true, withData: false);
      if (picked == null || picked.files.isEmpty) return;

      final effectiveParent = _folderId ?? (_view == 'vault' ? (_breadcrumbs.isNotEmpty ? _breadcrumbs.first['id'] : 'vault') : null);
      try {
        final createdRoot = await apiClient.dio.post('/drive/folders', data: {
          'name': customName,
          if (effectiveParent != null) 'parentId': effectiveParent,
          'view': _view,
        });
        final rootFolderId = createdRoot.data['id'] as String;
        for (final pf in picked.files) {
          await _uploadSingleFile(pf.path, pf.name, rootFolderId, bytes: pf.bytes);
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

    final effectiveParent = _folderId ?? (_view == 'vault' ? (_breadcrumbs.isNotEmpty ? _breadcrumbs.first['id'] : 'vault') : null);
    try {
      final createdRoot = await apiClient.dio.post('/drive/folders', data: {
        'name': rootName,
        if (effectiveParent != null) 'parentId': effectiveParent,
        'view': _view,
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
                'view': _view,
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
      final effectiveParent = _folderId ?? (_view == 'vault' ? (_breadcrumbs.isNotEmpty ? _breadcrumbs.first['id'] : 'vault') : null);
      final res = await apiClient.dio.post('/drive/folders', data: {
        'name': name,
        if (effectiveParent != null) 'parentId': effectiveParent,
        'view': _view,
      });
      if (mounted && res.data is Map) {
        setState(() {
          _folders = [res.data, ..._folders];
        });
      }
      _driveCache.clear();
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
      final imgUrl = '${apiClient.currentBaseUrl}/drive/files/${file['id']}/download?inline=true';
      return SizedBox(
        height: 94,
        width: double.infinity,
        child: Image.network(
          imgUrl,
          headers: _authToken != null ? {'Authorization': 'Bearer $_authToken'} : null,
          cacheWidth: 320,
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
    final fileId = file['id']?.toString() ?? '';
    if (_offlineFiles.containsKey(fileId)) {
      final localPath = _offlineFiles[fileId]?['localPath'] as String?;
      if (localPath != null && File(localPath).existsSync()) {
        try {
          await OpenFilex.open(localPath);
          return;
        } catch (_) {}
      }
    }

    final mime = (file['mimeType'] ?? '') as String;
    final ext = (file['extension'] ?? '').toString().toLowerCase();
    final token = await apiClient.storage.read(key: 'access_token');
    final authHeaders = token != null ? {'Authorization': 'Bearer $token'} : <String, String>{};
    final inlineUrl = '${apiClient.currentBaseUrl}/drive/files/${file['id']}/download?inline=true';

    // 1. In-App Multi-Image Preview & Swipe Gallery
    if (mime.startsWith('image/')) {
      final allImages = _files.where((f) => (f['mimeType'] ?? '').toString().startsWith('image/')).toList();
      final initialIdx = allImages.indexWhere((f) => f['id'] == file['id']);
      final startIdx = initialIdx >= 0 ? initialIdx : 0;

      if (!mounted) return;
      showDialog(
        context: context,
        builder: (_) {
          int currentImageIdx = startIdx;
          bool isZoomed = false;
          final pageController = PageController(initialPage: startIdx);

          return StatefulBuilder(
            builder: (dialogCtx, setDialogState) {
              return Dialog.fullscreen(
                backgroundColor: Colors.black,
                child: Scaffold(
                  backgroundColor: Colors.black,
                  appBar: AppBar(
                    backgroundColor: Colors.black,
                    foregroundColor: Colors.white,
                    title: Text(
                      allImages.length > 1
                          ? '${allImages[currentImageIdx]['name']} (${currentImageIdx + 1}/${allImages.length})'
                          : allImages[currentImageIdx]['name'],
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 15),
                    ),
                    actions: [
                      IconButton(
                        icon: const Icon(Icons.download),
                        tooltip: 'Save to Device',
                        onPressed: () => _saveFileToDevice(allImages[currentImageIdx]),
                      ),
                    ],
                  ),
                  body: Stack(
                    children: [
                      allImages.length > 1
                          ? PageView.builder(
                              controller: pageController,
                              physics: isZoomed ? const NeverScrollableScrollPhysics() : const BouncingScrollPhysics(),
                              itemCount: allImages.length,
                              onPageChanged: (idx) {
                                setDialogState(() {
                                  currentImageIdx = idx;
                                  isZoomed = false;
                                });
                              },
                              itemBuilder: (ctx, idx) {
                                final cur = allImages[idx];
                                final curUrl = '${apiClient.currentBaseUrl}/drive/files/${cur['id']}/download?inline=true';
                                return _MobileZoomableImageViewer(
                                  imageUrl: curUrl,
                                  headers: authHeaders,
                                  onZoomChanged: (zoomed) {
                                    if (isZoomed != zoomed) {
                                      setDialogState(() {
                                        isZoomed = zoomed;
                                      });
                                    }
                                  },
                                );
                              },
                            )
                          : _MobileZoomableImageViewer(
                              imageUrl: '${apiClient.currentBaseUrl}/drive/files/${allImages[0]['id']}/download?inline=true',
                              headers: authHeaders,
                            ),
                      if (allImages.length > 1 && !isZoomed) ...[
                        if (currentImageIdx > 0)
                          Positioned(
                            left: 12,
                            top: 0,
                            bottom: 0,
                            child: Center(
                              child: IconButton(
                                style: IconButton.styleFrom(
                                  backgroundColor: Colors.black54,
                                  foregroundColor: Colors.white,
                                ),
                                icon: const Icon(Icons.chevron_left, size: 30),
                                onPressed: () {
                                  pageController.previousPage(
                                    duration: const Duration(milliseconds: 250),
                                    curve: Curves.easeInOut,
                                  );
                                },
                              ),
                            ),
                          ),
                        if (currentImageIdx < allImages.length - 1)
                          Positioned(
                            right: 12,
                            top: 0,
                            bottom: 0,
                            child: Center(
                              child: IconButton(
                                style: IconButton.styleFrom(
                                  backgroundColor: Colors.black54,
                                  foregroundColor: Colors.white,
                                ),
                                icon: const Icon(Icons.chevron_right, size: 30),
                                onPressed: () {
                                  pageController.nextPage(
                                    duration: const Duration(milliseconds: 250),
                                    curve: Curves.easeInOut,
                                  );
                                },
                              ),
                            ),
                          ),
                      ],
                    ],
                  ),
                ),
              );
            },
          );
        },
      );
      return;
    }

    // 2. In-App Video & Audio Streaming Player
    final isVideo = mime.startsWith('video/') ||
        ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp', 'flv', 'wmv', 'ts'].contains(ext);
    final isAudio = mime.startsWith('audio/') ||
        ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'].contains(ext);

    if (isVideo || isAudio) {
      if (!mounted) return;
      showDialog(
        context: context,
        builder: (_) => _MobileVideoPlayerDialog(
          file: file,
          isAudio: isAudio,
          token: token,
          authHeaders: authHeaders,
          onDownloadAndOpen: () => _downloadAndOpen(file),
        ),
      );
      return;
    }

    // 3. In-App PDF Preview
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
      if (!mounted) return;
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
      if (!mounted) return;
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
    if (mime.startsWith('text/') || ['md', 'txt', 'json', 'csv', 'log', 'py', 'js', 'ts', 'html', 'css', 'sql', 'sh', 'xml', 'yaml', 'yml', 'env', 'dart'].contains(ext)) {
      try {
        final res = await apiClient.dio.get(
          '/drive/files/${file['id']}/download?inline=true',
          options: Options(responseType: ResponseType.plain),
        );
        if (!mounted) return;
        final content = res.data?.toString() ?? '';
        final textController = TextEditingController(text: content);
        bool isEditing = false;
        bool isSaving = false;

        showDialog(
          context: context,
          builder: (_) => StatefulBuilder(
            builder: (dialogCtx, setDialogState) {
              final currentText = textController.text;
              final currentLines = currentText.split('\n').length;
              final hasChanges = currentText != content;

              return Dialog.fullscreen(
                backgroundColor: const Color(0xFF0D1117),
                child: Scaffold(
                  backgroundColor: const Color(0xFF0D1117),
                  appBar: AppBar(
                    backgroundColor: const Color(0xFF161B22),
                    foregroundColor: Colors.white,
                    title: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                file['name'],
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                              ),
                            ),
                            if (hasChanges) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.amber.withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
                                ),
                                child: const Text(
                                  'Unsaved',
                                  style: TextStyle(fontSize: 10, color: Colors.amber, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          ],
                        ),
                        Text(
                          '$currentLines lines • ${ext.toUpperCase()}${isEditing ? ' • Editing' : ''}',
                          style: const TextStyle(fontSize: 11, color: Colors.white54, fontFamily: 'monospace'),
                        ),
                      ],
                    ),
                    actions: [
                      if (isEditing) ...[
                        if (isSaving)
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 16),
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            ),
                          )
                        else
                          TextButton.icon(
                            style: TextButton.styleFrom(foregroundColor: const Color(0xFF60A5FA)),
                            icon: const Icon(Icons.save, size: 18),
                            label: const Text('Save', style: TextStyle(fontWeight: FontWeight.bold)),
                            onPressed: () async {
                              try {
                                setDialogState(() => isSaving = true);
                                await apiClient.dio.put(
                                  '/drive/files/${file['id']}/content',
                                  data: {'content': textController.text},
                                );
                                setDialogState(() {
                                  isSaving = false;
                                  isEditing = false;
                                });
                                _showSnack('Saved changes to NOOR DRIVE! 💾');
                                _loadDrive(silent: true);
                              } catch (e) {
                                setDialogState(() => isSaving = false);
                                _showSnack('Failed to save file: $e', isError: true);
                              }
                            },
                          ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          tooltip: 'Done Editing',
                          onPressed: () {
                            setDialogState(() => isEditing = false);
                          },
                        ),
                      ] else ...[
                        IconButton(
                          icon: const Icon(Icons.edit_note, color: Color(0xFF60A5FA)),
                          tooltip: 'Edit File',
                          onPressed: () {
                            setDialogState(() => isEditing = true);
                          },
                        ),
                        IconButton(
                          icon: const Icon(Icons.copy),
                          tooltip: 'Copy Code',
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: textController.text));
                            _showSnack('Copied to clipboard!');
                          },
                        ),
                        IconButton(
                          icon: const Icon(Icons.download),
                          tooltip: 'Download File',
                          onPressed: () => _downloadAndOpen(file),
                        ),
                      ],
                    ],
                  ),
                  body: isEditing
                      ? Padding(
                          padding: const EdgeInsets.all(16),
                          child: TextField(
                            controller: textController,
                            maxLines: null,
                            expands: true,
                            autofocus: true,
                            keyboardType: TextInputType.multiline,
                            onChanged: (_) => setDialogState(() {}),
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 13,
                              color: Color(0xFFE6EDF3),
                              height: 1.5,
                            ),
                            decoration: const InputDecoration(
                              border: InputBorder.none,
                              hintText: 'Type your notes or code here...',
                              hintStyle: TextStyle(color: Colors.white24),
                            ),
                          ),
                        )
                      : SingleChildScrollView(
                          padding: const EdgeInsets.all(16),
                          child: SelectableText(
                            textController.text,
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 13,
                              color: Color(0xFFE6EDF3),
                              height: 1.5,
                            ),
                          ),
                        ),
                ),
              );
            },
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
      final mime = (file['mimeType'] ?? '').toString();
      await OpenFilex.open(savePath, type: mime.isNotEmpty ? mime : null);
    } catch (e) {
      _showSnack('Download failed: $e', isError: true);
    }
  }

  bool _isPrintableFile(dynamic file) {
    if (file == null) return false;
    final mime = (file['mimeType'] ?? '').toString().toLowerCase();
    final name = (file['name'] ?? '').toString().toLowerCase();
    final ext = (file['extension'] ?? (name.contains('.') ? name.split('.').last : '')).toString().toLowerCase().replaceAll(RegExp(r'^\.'), '');

    // Videos, Audios, and Archives are never printable
    if (mime.startsWith('video/') ||
        mime.startsWith('audio/') ||
        mime.contains('zip') ||
        mime.contains('tar') ||
        mime.contains('compressed') ||
        mime.contains('archive') ||
        ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp', 'flv', 'wmv', 'ts', 'ogv', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus', 'wma', 'zip', 'rar', '7z', 'tar', 'gz', 'iso'].contains(ext)) {
      return false;
    }
    return true;
  }

  Future<void> _printFile(dynamic file) async {
    if (!_isPrintableFile(file)) {
      _showSnack('Printing is not supported for video or media files.', isError: true);
      return;
    }
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

  Future<void> _saveFileToDevice(dynamic file) async {
    try {
      _showSnack('Starting download for "${file['name']}"...');
      Directory? targetDir;
      try {
        targetDir = await getDownloadsDirectory();
      } catch (_) {}
      targetDir ??= await getApplicationDocumentsDirectory();

      final savePath = '${targetDir.path}/${file['name']}';
      final token = await apiClient.storage.read(key: 'access_token');
      await apiClient.dio.download(
        '/drive/files/${file['id']}/download',
        savePath,
        options: Options(
          headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        ),
      );
      _showSnack('Downloaded "${file['name']}"');

      // Open native save/share sheet so user can choose external SSD, SD card, files, or apps
      await Share.shareXFiles(
        [XFile(savePath)],
        subject: file['name'].toString(),
        text: 'Save or transfer ${file['name']}',
      );
    } catch (e) {
      _showSnack('Download failed: $e', isError: true);
    }
  }

  Future<void> _downloadFolderZip(dynamic folder) async {
    try {
      _showSnack('Preparing "${folder['name']}.zip"...');
      final dir = await getTemporaryDirectory();
      final savePath = '${dir.path}/${folder['name']}.zip';
      final token = await apiClient.storage.read(key: 'access_token');
      await apiClient.dio.download(
        '/drive/folders/${folder['id']}/download',
        savePath,
        options: Options(
          headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        ),
      );
      _showSnack('Downloaded "${folder['name']}.zip"');
      await OpenFilex.open(savePath, type: 'application/zip');
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
    if (_view == 'vault') {
      _showSnack('Items inside Secret Vault are strictly private and cannot be shared.', isError: true);
      return;
    }
    String permission = type == 'folder' ? 'EDITOR' : 'VIEWER';
    int expiresHours = 1440; // 2 Months default (60 days)

    final existingRes = await apiClient.dio.get('/shares', queryParameters: {
      'type': type,
      'targetId': id,
    });
    List<dynamic> links = List.from(existingRes.data ?? []);

    Future<String> getOrCreateShareUrl({bool forceNew = false}) async {
      final matching = links.where((l) => l['permission'] == permission).toList();
      if (!forceNew && matching.isNotEmpty) {
        final token = matching[0]['shareToken'];
        final webBase = apiClient.currentBaseUrl.replaceAll('/api', '');
        return '$webBase/share/$token';
      }
      final res = await apiClient.dio.post('/shares', data: {
        'type': type,
        'targetId': id,
        'permission': permission,
        'expiresInHours': expiresHours,
      });
      links.insert(0, res.data);
      final token = res.data['shareToken'];
      final webBase = apiClient.currentBaseUrl.replaceAll('/api', '');
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
                    // ignore: deprecated_member_use
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
                    // ignore: deprecated_member_use
                    value: expiresHours,
                    decoration: const InputDecoration(labelText: 'Expiration'),
                    items: const [
                      DropdownMenuItem(value: 1440, child: Text('2 Months (60 Days - Default)')),
                      DropdownMenuItem(value: 720, child: Text('30 Days (1 Month)')),
                      DropdownMenuItem(value: 168, child: Text('7 Days')),
                      DropdownMenuItem(value: 24, child: Text('24 Hours')),
                      DropdownMenuItem(value: 0, child: Text('Never expires')),
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
                                final webBase = apiClient.currentBaseUrl.replaceAll('/api', '');
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

  Future<void> _showOwnerProfileDialog() async {
    final usedBytes = int.tryParse(_user?['usedStorageBytes']?.toString() ?? '0') ?? 0;
    final rawQuota = int.tryParse(_user?['storageQuotaBytes']?.toString() ?? '0') ?? 0;
    final isUnlimited = rawQuota == 0;
    final quotaBytes = isUnlimited ? (100 * 1024 * 1024 * 1024) : rawQuota;
    final usedRatio = isUnlimited ? 0.05 : (quotaBytes > 0 ? (usedBytes / quotaBytes).clamp(0.0, 1.0) : 0.0);

    if (!mounted) return;
    await showDialog(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 380),
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Owner Portrait with Glowing Gradient Ring & Verified Badge
              Stack(
                alignment: Alignment.bottomRight,
                children: [
                  Container(
                    padding: const EdgeInsets.all(3.5),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [Color(0xFF4F46E5), Color(0xFF0EA5E9), Color(0xFF6366F1)],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF4F46E5).withValues(alpha: 0.35),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                      ),
                      child: const CircleAvatar(
                        radius: 44,
                        backgroundImage: AssetImage('assets/owner.jpg'),
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: const Color(0xFF059669),
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                    child: const Icon(
                      Icons.verified_user_rounded,
                      size: 14,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              const Text(
                'Sheikh Noor Abdullah',
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 3),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEEF2FF),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFC7D2FE)),
                    ),
                    child: const Text(
                      'Vault Owner',
                      style: TextStyle(
                        color: Color(0xFF4F46E5),
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFFECFDF5),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFA7F3D0)),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.lock_outline, size: 11, color: Color(0xFF059669)),
                        SizedBox(width: 3),
                        Text(
                          'Encrypted',
                          style: TextStyle(
                            color: Color(0xFF059669),
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              // Storage Progress Card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Cloud Storage', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF334155))),
                        Text(
                          isUnlimited
                              ? '${_formatBytes(usedBytes)} / Unlimited'
                              : '${_formatBytes(usedBytes)} / ${_formatBytes(quotaBytes)}',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w500),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: isUnlimited ? 0.05 : usedRatio,
                        minHeight: 6,
                        backgroundColor: const Color(0xFFE2E8F0),
                        valueColor: AlwaysStoppedAnimation<Color>(_accentColor),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Domain: ${Uri.tryParse(apiClient.currentBaseUrl)?.host ?? "drive.noor.is-a.dev"}',
                      style: const TextStyle(fontSize: 10.5, color: Color(0xFF94A3B8)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              // Actions
              ListTile(
                dense: true,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                leading: const Icon(Icons.system_update_rounded, color: Color(0xFF2563EB)),
                title: const Text('Check for Updates', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                subtitle: Text('Current: v1.0.${ApiClient.buildNumber}', style: const TextStyle(fontSize: 11)),
                onTap: () {
                  Navigator.pop(ctx);
                  _checkForAppUpdate(silent: false);
                },
              ),
              ListTile(
                dense: true,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                leading: const Icon(Icons.security_rounded, color: Color(0xFF4F46E5)),
                title: const Text('Security & Active Sessions', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                onTap: () {
                  Navigator.pop(ctx);
                  _openSecurityDialog();
                },
              ),
              ListTile(
                dense: true,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                leading: const Icon(Icons.lock_rounded, color: Color(0xFFE11D48)),
                title: const Text('Lock Drive', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFFE11D48))),
                onTap: () {
                  Navigator.pop(ctx);
                  _lockVault();
                },
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Close', style: TextStyle(color: Color(0xFF64748B))),
                ),
              ),
            ],
          ),
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

  Future<bool> _authenticateVault() async {
    if (_vaultUnlocked) return true;
    try {
      final auth = LocalAuthentication();
      final canCheck = await auth.canCheckBiometrics || await auth.isDeviceSupported();
      if (canCheck) {
        final success = await auth.authenticate(
          localizedReason: 'Authenticate to access NOOR DRIVE Secret Vault',
          options: const AuthenticationOptions(stickyAuth: true, biometricOnly: false),
        );
        if (success) {
          setState(() => _vaultUnlocked = true);
          return true;
        }
      } else {
        setState(() => _vaultUnlocked = true);
        return true;
      }
    } catch (_) {
      setState(() => _vaultUnlocked = true);
      return true;
    }
    return false;
  }

  Future<void> _moveToVault(String type, String id) async {
    try {
      await apiClient.dio.post('/drive/vault/move-in', data: {'type': type, 'id': id});
      _showSnack('Moved to Secret Vault 🔒');
      _loadDrive(silent: true);
    } catch (e) {
      _showSnack('Failed to move to vault: $e', isError: true);
    }
  }

  Future<void> _moveFromVault(String type, String id) async {
    try {
      await apiClient.dio.post('/drive/vault/move-out', data: {'type': type, 'id': id});
      _showSnack('Moved to My Drive 🔓');
      _loadDrive(silent: true);
    } catch (e) {
      _showSnack('Failed to move from vault: $e', isError: true);
    }
  }

  Future<void> _showVersionHistory(Map<String, dynamic> file) async {
    try {
      final res = await apiClient.dio.get('/drive/files/${file['id']}/versions');
      final versions = List<dynamic>.from(res.data['versions'] ?? []);
      if (!mounted) return;
      showModalBottomSheet(
        context: context,
        backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (ctx) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: const [
                      Icon(Icons.history, color: Color(0xFF7C3AED)),
                      SizedBox(width: 8),
                      Text(
                        'Version History',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                      ),
                    ],
                  ),
                  IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(ctx)),
                ],
              ),
              Text(
                file['name'] ?? '',
                style: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 16),
              if (versions.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: Text('Current file is at initial Version 1.', style: TextStyle(color: Color(0xFF94A3B8))),
                  ),
                )
              else
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: versions.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (c, idx) {
                      final v = versions[idx];
                      final isCurrent = v['isCurrent'] == true;
                      final sizeStr = _formatBytes(v['sizeBytes']);
                      final dateStr = v['createdAt'] != null
                          ? DateFormat('MMM d, yyyy h:mm a').format(DateTime.parse(v['createdAt']).toLocal())
                          : '';
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(
                          backgroundColor: isCurrent ? const Color(0xFFEDE9FE) : const Color(0xFFF1F5F9),
                          child: Text(
                            'v${v['versionNumber']}',
                            style: TextStyle(
                              color: isCurrent ? const Color(0xFF7C3AED) : const Color(0xFF64748B),
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        title: Row(
                          children: [
                            Text('Version ${v['versionNumber']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                            if (isCurrent) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF7C3AED),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text('Active', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                              ),
                            ],
                          ],
                        ),
                        subtitle: Text('$sizeStr • $dateStr', style: const TextStyle(fontSize: 11)),
                        trailing: isCurrent
                            ? null
                            : OutlinedButton(
                                onPressed: () async {
                                  Navigator.pop(ctx);
                                  try {
                                    await apiClient.dio.post('/drive/files/${file['id']}/versions/${v['versionNumber']}/restore');
                                    _showSnack('Restored to Version ${v['versionNumber']}');
                                    _loadDrive(silent: true);
                                  } catch (e) {
                                    _showSnack('Restore failed: $e', isError: true);
                                  }
                                },
                                style: OutlinedButton.styleFrom(
                                  side: const BorderSide(color: Color(0xFF7C3AED)),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                ),
                                child: const Text('Restore', style: TextStyle(color: Color(0xFF7C3AED), fontSize: 12)),
                              ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      );
    } catch (e) {
      _showSnack('Failed to load version history: $e', isError: true);
    }
  }

  Future<void> _purgeExpiredTrash() async {
    try {
      await apiClient.dio.delete('/drive/trash/purge-expired');
      _showSnack('Purged expired items (>30 days old)');
      _loadDrive(silent: true);
    } catch (e) {
      _showSnack('Purge failed: $e', isError: true);
    }
  }

  Future<void> _batchDownloadSelected() async {
    final fileIds = <String>[];
    final folderIds = <String>[];
    for (final key in _selectedKeys) {
      if (key.startsWith('file:')) fileIds.add(key.substring(5));
      if (key.startsWith('folder:')) folderIds.add(key.substring(7));
    }
    if (fileIds.isEmpty && folderIds.isEmpty) return;

    _showSnack('Starting download of ${fileIds.length + folderIds.length} items as .zip...');
    try {
      final token = await apiClient.storage.read(key: 'access_token');
      final query = {
        if (fileIds.isNotEmpty) 'fileIds': fileIds.join(','),
        if (folderIds.isNotEmpty) 'folderIds': folderIds.join(','),
        if (token != null) 'token': token,
      };
      final uri = Uri.parse('${apiClient.dio.options.baseUrl}/drive/batch/download').replace(queryParameters: query);
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      _showSnack('Failed to start batch download: $e', isError: true);
    }
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

  int _getResponsiveCrossAxisCount(double width) {
    if (width < 450) return 2;
    if (width < 720) return 3;
    if (width < 1050) return 4;
    if (width < 1400) return 5;
    return 6;
  }

  Widget _buildNavigationPanel({
    required bool isDualSide,
    required double usedRatio,
    required bool isUnlimited,
    required int usedBytes,
    required int quotaBytes,
  }) {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              GestureDetector(
                onTap: () {
                  setState(() {
                    _folderId = null;
                    _view = 'my-drive';
                    _searchController.clear();
                  });
                  if (!isDualSide) Navigator.pop(context);
                  _loadDrive();
                },
                child: Container(
                  padding: EdgeInsets.fromLTRB(16, isDualSide ? 20 : 48, 16, 16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [_accentColor, const Color(0xFF1E40AF)],
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white.withValues(alpha: 0.8), width: 1.5),
                            ),
                            child: const CircleAvatar(
                              radius: 24,
                              backgroundImage: AssetImage('assets/owner.jpg'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Sheikh Noor',
                                  style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                                  overflow: TextOverflow.ellipsis,
                                ),
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withValues(alpha: 0.2),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: const Text('Owner', style: TextStyle(color: Colors.white, fontSize: 9.5, fontWeight: FontWeight.bold)),
                                    ),
                                    if (isDualSide) ...[
                                      const SizedBox(width: 4),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF38BDF8).withValues(alpha: 0.3),
                                          borderRadius: BorderRadius.circular(4),
                                        ),
                                        child: const Text('Dual-Side', style: TextStyle(color: Colors.white, fontSize: 9.5, fontWeight: FontWeight.bold)),
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const Row(
                        children: [
                          Icon(Icons.cloud_done_rounded, size: 14, color: Colors.white70),
                          SizedBox(width: 6),
                          Text(
                            'NOOR DRIVE • Root Vault',
                            style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              for (final item in [
                ('my-drive', 'My Drive', Icons.folder_outlined),
                ('vault', 'Secret Vault', Icons.lock_outline),
                ('offline', 'Offline Files', Icons.offline_pin_outlined),
                ('recent', 'Recent', Icons.access_time),
                ('starred', 'Starred', Icons.star_outline),
                ('photos', 'Photos', Icons.image_outlined),
                ('videos', 'Videos', Icons.videocam_outlined),
                ('documents', 'Documents', Icons.description_outlined),
                ('trash', 'Trash', Icons.delete_outline),
              ])
                ListTile(
                  leading: Icon(item.$3, color: _view == item.$1 ? const Color(0xFF2563EB) : null),
                  title: Text(item.$2, style: TextStyle(fontSize: 13, fontWeight: _view == item.$1 ? FontWeight.bold : FontWeight.normal)),
                  selected: _view == item.$1,
                  dense: true,
                  onTap: () async {
                    if (!isDualSide) Navigator.pop(context);
                    if (item.$1 == 'vault') {
                      final ok = await _authenticateVault();
                      if (!ok) return;
                    }
                    setState(() {
                      _view = item.$1;
                      _folderId = null;
                    });
                    _loadDrive();
                  },
                ),
              const Divider(),
              ListTile(
                dense: true,
                leading: const Icon(Icons.photo_library_outlined, color: Color(0xFF4F46E5), size: 20),
                title: const Text('Backup Gallery Photos', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                subtitle: const Text('Sync phone photos to Camera Uploads', style: TextStyle(fontSize: 10)),
                onTap: () {
                  if (!isDualSide) Navigator.pop(context);
                  _backupGalleryPhotos();
                },
              ),
              ListTile(
                dense: true,
                leading: const Icon(Icons.sync, color: Color(0xFF4F46E5), size: 20),
                title: const Text('Background Auto-Sync', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                subtitle: Text(_autoSyncEnabled ? 'Auto-sync active' : 'Disabled • Tap to configure', style: const TextStyle(fontSize: 10)),
                onTap: () {
                  if (!isDualSide) Navigator.pop(context);
                  _showAutoSyncDialog();
                },
              ),
              ListTile(
                dense: true,
                leading: const Icon(Icons.cleaning_services_outlined, color: Color(0xFFD97706), size: 20),
                title: const Text('Storage Cleaner & Duplicates', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                subtitle: const Text('Find SHA-256 duplicate files & free space', style: TextStyle(fontSize: 10)),
                onTap: () {
                  if (!isDualSide) Navigator.pop(context);
                  _showDuplicateCleanerDialog();
                },
              ),
              const Divider(),
              ListTile(
                dense: true,
                leading: Icon(
                  Theme.of(context).brightness == Brightness.dark ? Icons.light_mode_rounded : Icons.dark_mode_rounded,
                  color: Theme.of(context).brightness == Brightness.dark ? const Color(0xFFFBBF24) : const Color(0xFF6366F1),
                  size: 20,
                ),
                title: Text(
                  Theme.of(context).brightness == Brightness.dark ? 'Appearance: Dark Mode' : 'Appearance: Light Mode',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  Theme.of(context).brightness == Brightness.dark ? 'Tap to switch to Light Theme' : 'Tap to switch to Dark Theme',
                  style: const TextStyle(fontSize: 10),
                ),
                onTap: () {
                  ref.read(themeModeProvider.notifier).toggleTheme();
                },
              ),
              ListTile(
                dense: true,
                leading: Icon(Icons.palette_outlined, color: _accentColor, size: 20),
                title: const Text('Customize Theme Color', style: TextStyle(fontSize: 12)),
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
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: c,
                              shape: BoxShape.circle,
                              border: _accentColor == c
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
                dense: true,
                leading: const Icon(Icons.security, color: Color(0xFF059669), size: 20),
                title: const Text('Passcode & Security', style: TextStyle(fontSize: 12)),
                onTap: () {
                  if (!isDualSide) Navigator.pop(context);
                  _openSecurityDialog();
                },
              ),
              ListTile(
                dense: true,
                leading: const Icon(Icons.system_update, color: Color(0xFF2563EB), size: 20),
                title: const Text('Check for App Update', style: TextStyle(fontSize: 12)),
                onTap: () {
                  if (!isDualSide) Navigator.pop(context);
                  _checkForAppUpdate(silent: false);
                },
              ),
              if (DesktopSyncService.isDesktopPlatform) ...[
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.folder_special_rounded, color: Color(0xFF4F46E5), size: 20),
                  title: const Text('Open Local Folder (~/NoorDrive)', style: TextStyle(fontSize: 12)),
                  subtitle: const Text('Open computer sync folder in Files/Explorer', style: TextStyle(fontSize: 10)),
                  onTap: () {
                    if (!isDualSide) Navigator.pop(context);
                    SystemTrayService.openLocalSyncFolder();
                  },
                ),
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.sync_rounded, color: Color(0xFF0EA5E9), size: 20),
                  title: const Text('Sync ~/NoorDrive Now', style: TextStyle(fontSize: 12)),
                  subtitle: Text(DesktopSyncService.instance.statusMessage, style: const TextStyle(fontSize: 10)),
                  onTap: () {
                    DesktopSyncService.instance.triggerSync();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Syncing ~/NoorDrive folder...')),
                    );
                  },
                ),
              ],
              ListTile(
                dense: true,
                leading: const Icon(Icons.tips_and_updates_outlined, color: Color(0xFF6366F1), size: 20),
                title: const Text('Shortcuts & Gestures Guide', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                subtitle: const Text('Touch gestures, secret vault & tricks', style: TextStyle(fontSize: 10)),
                onTap: () {
                  if (!isDualSide) Navigator.pop(context);
                  _showShortcutsAndGesturesDialog();
                },
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('NOOR DRIVE Storage', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                const SizedBox(height: 5),
                LinearProgressIndicator(value: usedRatio, minHeight: 5, borderRadius: BorderRadius.circular(4)),
                const SizedBox(height: 5),
                Text(
                  isUnlimited
                      ? '${_formatBytes(usedBytes)} used (Unlimited)'
                      : '${_formatBytes(usedBytes)} of ${_formatBytes(quotaBytes)}',
                  style: const TextStyle(fontSize: 10, color: Color(0xFF64748B)),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final canGoBack = _folderId != null || _view != 'my-drive';
    final usedBytes = int.tryParse(_user?['usedStorageBytes']?.toString() ?? '0') ?? 0;
    final rawQuota = int.tryParse(_user?['storageQuotaBytes']?.toString() ?? '0') ?? 0;
    final isUnlimited = rawQuota == 0;
    final quotaBytes = isUnlimited ? 1 : rawQuota;
    final usedRatio = isUnlimited ? 0.05 : (usedBytes / quotaBytes).clamp(0.0, 1.0);

    return LayoutBuilder(
      builder: (context, constraints) {
        final screenWidth = constraints.maxWidth;
        final isWide = screenWidth >= 740;
        final effectiveDualSide = isWide && _isDualSide;
        final isDark = Theme.of(context).brightness == Brightness.dark;

        return PopScope(
          canPop: !canGoBack,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop && canGoBack) _goBack();
          },
          child: Scaffold(
            backgroundColor: isDark ? const Color(0xFF070B14) : const Color(0xFFF6F7F9),
            appBar: AppBar(
              backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
              elevation: 0,
              leading: _selectedKeys.isNotEmpty
                  ? IconButton(
                      icon: Icon(Icons.close, color: isDark ? Colors.white : const Color(0xFF0F172A)),
                      onPressed: () => setState(() => _selectedKeys.clear()),
                      tooltip: 'Cancel Selection',
                    )
                  : (canGoBack
                      ? IconButton(
                          icon: Icon(Icons.arrow_back, color: isDark ? Colors.white : const Color(0xFF0F172A)),
                          onPressed: _goBack,
                        )
                      : (effectiveDualSide
                          ? const Padding(
                              padding: EdgeInsets.only(left: 14),
                              child: Icon(Icons.cloud_done_rounded, color: Color(0xFF6366F1)),
                            )
                          : null)),
              title: _selectedKeys.isNotEmpty
                  ? Text(
                      '${_selectedKeys.length} selected',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                        fontSize: 18,
                      ),
                    )
                  : GestureDetector(
                      onTap: () {
                        setState(() {
                          _folderId = null;
                          _view = 'my-drive';
                          _searchController.clear();
                        });
                        _loadDrive();
                      },
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'NOOR DRIVE',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                              fontSize: 18,
                            ),
                          ),
                          if (effectiveDualSide) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(
                                color: isDark ? const Color(0xFF1E1B4B) : const Color(0xFFEEF2FF),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: isDark ? const Color(0xFF312E81) : const Color(0xFFC7D2FE),
                                ),
                              ),
                              child: Text(
                                'DUAL SIDE',
                                style: TextStyle(
                                  color: isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5),
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
              actions: [
                if (_selectedKeys.isNotEmpty) ...[
                  IconButton(
                    icon: Icon(
                      _selectedKeys.length == (_folders.length + _files.length) && (_folders.length + _files.length) > 0
                          ? Icons.check_box
                          : Icons.check_box_outline_blank,
                      color: const Color(0xFF6366F1),
                    ),
                    onPressed: _toggleSelectAll,
                    tooltip: _selectedKeys.length == (_folders.length + _files.length)
                        ? 'Deselect All'
                        : 'Select All',
                  ),
                  if (_view != 'trash')
                    IconButton(
                      icon: const Icon(Icons.download_rounded, color: Color(0xFF2563EB)),
                      onPressed: _batchDownloadSelected,
                      tooltip: 'Download Selected (.zip)',
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
                    icon: Icon(
                      isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded,
                      color: isDark ? const Color(0xFFFBBF24) : const Color(0xFF18181B),
                    ),
                    onPressed: () => ref.read(themeModeProvider.notifier).toggleTheme(),
                    tooltip: isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode',
                  ),
                  if (isWide)
                    IconButton(
                      icon: Icon(
                        _isDualSide ? Icons.view_sidebar_rounded : Icons.view_agenda_rounded,
                        color: isDark ? Colors.white70 : const Color(0xFF18181B),
                      ),
                      onPressed: () {
                        setState(() => _isDualSide = !_isDualSide);
                        _showSnack(_isDualSide ? 'Dual-Side Mode Enabled' : 'Single-Side Mode Enabled');
                      },
                      tooltip: _isDualSide ? 'Switch to Single-Side View' : 'Switch to Dual-Side View',
                    ),
                  IconButton(
                    icon: Icon(
                      _isGrid ? Icons.view_list : Icons.grid_view,
                      color: isDark ? Colors.white70 : const Color(0xFF18181B),
                    ),
                    onPressed: () => setState(() => _isGrid = !_isGrid),
                    tooltip: 'Toggle Grid/List',
                  ),
                  IconButton(
                    icon: Icon(
                      Icons.photo_library_outlined,
                      color: isDark ? Colors.white70 : const Color(0xFF18181B),
                    ),
                    onPressed: _backupGalleryPhotos,
                    tooltip: 'Backup Media (Camera Uploads)',
                  ),
                  PopupMenuButton<String>(
                    icon: Icon(
                      Icons.more_vert,
                      color: isDark ? Colors.white70 : const Color(0xFF18181B),
                    ),
                    color: isDark ? const Color(0xFF0F172A) : Colors.white,
                    onSelected: (val) {
                      if (val == 'toggle_theme') ref.read(themeModeProvider.notifier).toggleTheme();
                      if (val == 'select_all') _selectAll();
                      if (val == 'new_folder') _createFolder();
                      if (val == 'upload_folder') _uploadFolder();
                      if (val == 'toggle_dual_side') {
                        setState(() => _isDualSide = !_isDualSide);
                        _showSnack(_isDualSide ? 'Dual-Side Mode Enabled' : 'Single-Side Mode Enabled');
                      }
                      if (val == 'lock_vault') _lockVault();
                      if (val == 'empty_trash') {
                        _confirmAction(
                          title: 'Empty Trash?',
                          message: 'All trashed items will be permanently deleted.',
                          confirmText: 'Empty Trash',
                          onConfirm: _emptyTrash,
                        );
                      }
                    },
                    itemBuilder: (ctx) => [
                      PopupMenuItem(
                        value: 'toggle_theme',
                        child: Row(
                          children: [
                            Icon(
                              isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded,
                              size: 18,
                              color: isDark ? const Color(0xFFFBBF24) : const Color(0xFF6366F1),
                            ),
                            const SizedBox(width: 10),
                            Text(isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'),
                          ],
                        ),
                      ),
                      if (_files.isNotEmpty || _folders.isNotEmpty)
                        const PopupMenuItem(
                          value: 'select_all',
                          child: Row(
                            children: [
                              Icon(Icons.select_all, size: 18, color: Color(0xFF4F46E5)),
                              SizedBox(width: 10),
                              Text('Select All'),
                            ],
                          ),
                        ),
                      PopupMenuItem(
                        value: 'toggle_dual_side',
                        child: Row(
                          children: [
                            Icon(_isDualSide ? Icons.view_sidebar_rounded : Icons.view_agenda_rounded, size: 18, color: const Color(0xFF4F46E5)),
                            const SizedBox(width: 10),
                            Text(_isDualSide ? 'Single-Side View' : 'Dual-Side View'),
                          ],
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'new_folder',
                        child: Row(
                          children: [
                            Icon(Icons.create_new_folder_outlined, size: 18, color: Color(0xFF18181B)),
                            SizedBox(width: 10),
                            Text('New Folder'),
                          ],
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'upload_folder',
                        child: Row(
                          children: [
                            Icon(Icons.drive_folder_upload_outlined, size: 18, color: Color(0xFF18181B)),
                            SizedBox(width: 10),
                            Text('Upload Folder'),
                          ],
                        ),
                      ),
                      if (_vaultUnlocked)
                        const PopupMenuItem(
                          value: 'lock_vault',
                          child: Row(
                            children: [
                              Icon(Icons.lock_outline, size: 18, color: Color(0xFFE11D48)),
                              SizedBox(width: 10),
                              Text('Lock Vault'),
                            ],
                          ),
                        ),
                      if (_view == 'trash' && (_files.isNotEmpty || _folders.isNotEmpty))
                        const PopupMenuItem(
                          value: 'empty_trash',
                          child: Row(
                            children: [
                              Icon(Icons.delete_sweep, size: 18, color: Color(0xFFE11D48)),
                              SizedBox(width: 10),
                              Text('Empty Trash'),
                            ],
                          ),
                        ),
                    ],
                  ),
                  GestureDetector(
                    onTap: _showOwnerProfileDialog,
                    child: Container(
                      margin: const EdgeInsets.only(left: 6, right: 12),
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(
                          colors: [Color(0xFF4F46E5), Color(0xFF0EA5E9)],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF4F46E5).withValues(alpha: 0.25),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: const CircleAvatar(
                        radius: 16,
                        backgroundImage: AssetImage('assets/owner.jpg'),
                      ),
                    ),
                  ),
                ],
              ],
            ),
            drawer: effectiveDualSide
                ? null
                : Drawer(
                    backgroundColor: Colors.white,
                    child: _buildNavigationPanel(
                      isDualSide: false,
                      usedRatio: usedRatio,
                      isUnlimited: isUnlimited,
                      usedBytes: usedBytes,
                      quotaBytes: quotaBytes,
                    ),
                  ),
            floatingActionButton: FloatingActionButton.extended(
              onPressed: _uploadingName != null ? null : _showUploadMenu,
              backgroundColor: _accentColor,
              foregroundColor: Colors.white,
              icon: _uploadingName != null
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                    )
                  : const Icon(Icons.add),
              label: Text(_uploadingName != null ? 'Uploading...' : 'Upload'),
            ),
            body: effectiveDualSide
                ? Row(
                    children: [
                      SizedBox(
                        width: 270,
                        child: Container(
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF0F172A) : Colors.white,
                            border: Border(
                              right: BorderSide(
                                color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                              ),
                            ),
                          ),
                          child: _buildNavigationPanel(
                            isDualSide: true,
                            usedRatio: usedRatio,
                            isUnlimited: isUnlimited,
                            usedBytes: usedBytes,
                            quotaBytes: quotaBytes,
                          ),
                        ),
                      ),
                      Expanded(
                        child: _buildMainContentArea(screenWidth - 270),
                      ),
                    ],
                  )
                : _buildMainContentArea(screenWidth),
          ),
        );
      },
    );
  }

  Widget _buildMainContentArea(double availableWidth) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardBg = isDark ? const Color(0xFF0F172A) : Colors.white;
    final cardBorder = isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0);
    final cardSelectedBg = isDark ? const Color(0xFF1E1B4B) : const Color(0xFFEEF2FF);
    final textPrimary = isDark ? Colors.white : const Color(0xFF0F172A);
    final textSecondary = isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);

    return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: TextField(
                controller: _searchController,
                style: TextStyle(color: textPrimary),
                decoration: InputDecoration(
                  hintText: 'Search NOOR DRIVE...',
                  hintStyle: TextStyle(color: textSecondary),
                  prefixIcon: Icon(Icons.search, color: isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5)),
                  filled: true,
                  fillColor: isDark ? const Color(0xFF0F172A) : Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(color: cardBorder),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(color: cardBorder),
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
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(left: 12, right: 12, bottom: 6),
              child: Row(
                children: [
                  for (final chip in [
                    ('all', 'All Files'),
                    ('pdf', 'PDFs'),
                    ('image', 'Photos'),
                    ('video', 'Videos'),
                    ('audio', 'Audio'),
                    ('document', 'Docs'),
                    ('archive', 'Archives'),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: FilterChip(
                        selected: _filterType == chip.$1,
                        label: Text(chip.$2),
                        labelStyle: TextStyle(
                          fontSize: 12,
                          fontWeight: _filterType == chip.$1 ? FontWeight.bold : FontWeight.normal,
                          color: _filterType == chip.$1 ? Colors.white : (isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155)),
                        ),
                        selectedColor: _accentColor,
                        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
                        showCheckmark: false,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                          side: BorderSide(
                            color: _filterType == chip.$1 ? _accentColor : cardBorder,
                          ),
                        ),
                        onSelected: (val) {
                          setState(() => _filterType = chip.$1);
                          _loadDrive();
                        },
                      ),
                    ),
                ],
              ),
            ),
            if (_view == 'trash')
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFFDE68A)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, color: Color(0xFFB45309), size: 18),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Items in Trash auto-purge after 30 days.',
                        style: TextStyle(color: Color(0xFF92400E), fontSize: 11, fontWeight: FontWeight.w500),
                      ),
                    ),
                    InkWell(
                      onTap: _purgeExpiredTrash,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFDE68A),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text('Purge Expired', style: TextStyle(color: Color(0xFF92400E), fontSize: 11, fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
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
                  : (_folders.isEmpty && _files.isEmpty)
                      ? RefreshIndicator(
                          onRefresh: () => _loadDrive(silent: true),
                          child: _buildEmptyState(isDark),
                        )
                      : RefreshIndicator(
                          onRefresh: () => _loadDrive(silent: true),
                          child: _isGrid
                              ? GridView.builder(
                              padding: const EdgeInsets.all(12),
                              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: _getResponsiveCrossAxisCount(availableWidth),
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
                                    color: isSelected ? cardSelectedBg : cardBg,
                                    elevation: 0,
                                    clipBehavior: Clip.antiAlias,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      side: BorderSide(
                                        color: isSelected ? const Color(0xFF6366F1) : cardBorder,
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
                                                      maxLines: 2,
                                                      overflow: TextOverflow.ellipsis,
                                                      textAlign: TextAlign.center,
                                                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12, color: textPrimary),
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
                                                  : [
                                                      const PopupMenuItem(value: 'download', child: Text('Download (.zip)')),
                                                      if (_view != 'vault')
                                                        const PopupMenuItem(value: 'share', child: Text('Share')),
                                                      const PopupMenuItem(value: 'rename', child: Text('Rename')),
                                                      const PopupMenuItem(value: 'star', child: Text('Star / Unstar')),
                                                      const PopupMenuItem(value: 'trash', child: Text('Move to Trash')),
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
                                  color: isSelected ? cardSelectedBg : cardBg,
                                  elevation: 0,
                                  clipBehavior: Clip.antiAlias,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    side: BorderSide(
                                      color: isSelected ? const Color(0xFF6366F1) : cardBorder,
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
                                                        style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12, color: textPrimary),
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
                                              if (action == 'version') _showVersionHistory(file);
                                              if (action == 'vault_in') _moveToVault('file', file['id']);
                                              if (action == 'vault_out') _moveFromVault('file', file['id']);
                                              if (action == 'offline') _toggleOfflineFile(file);
                                              if (action == 'download') _downloadAndOpen(file);
                                              if (action == 'save_device') _saveFileToDevice(file);
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
                                                : [
                                                    PopupMenuItem(
                                                      value: 'version',
                                                      child: Row(
                                                        children: const [
                                                          Icon(Icons.history, size: 16, color: Color(0xFF7C3AED)),
                                                          SizedBox(width: 8),
                                                          Text('Version History'),
                                                        ],
                                                      ),
                                                    ),
                                                    if (_view != 'vault')
                                                      PopupMenuItem(
                                                        value: 'vault_in',
                                                        child: Row(
                                                          children: const [
                                                            Icon(Icons.lock_outline, size: 16, color: Color(0xFFD97706)),
                                                            SizedBox(width: 8),
                                                            Text('Move to Secret Vault'),
                                                          ],
                                                        ),
                                                      )
                                                    else
                                                      PopupMenuItem(
                                                        value: 'vault_out',
                                                        child: Row(
                                                          children: const [
                                                            Icon(Icons.lock_open, size: 16, color: Color(0xFF059669)),
                                                            SizedBox(width: 8),
                                                            Text('Move to My Drive'),
                                                          ],
                                                        ),
                                                      ),
                                                    PopupMenuItem(
                                                      value: 'offline',
                                                      child: Row(
                                                        children: [
                                                          Icon(
                                                            _offlineFiles.containsKey(file['id']) ? Icons.offline_pin : Icons.offline_pin_outlined,
                                                            size: 16,
                                                            color: _offlineFiles.containsKey(file['id']) ? const Color(0xFF059669) : const Color(0xFF64748B),
                                                          ),
                                                          const SizedBox(width: 8),
                                                          Text(_offlineFiles.containsKey(file['id']) ? 'Remove Offline' : 'Available Offline'),
                                                        ],
                                                      ),
                                                    ),
                                                    const PopupMenuItem(value: 'download', child: Text('Download & Open')),
                                                    const PopupMenuItem(value: 'save_device', child: Text('Save to Device / SSD')),
                                                    if (_view != 'vault')
                                                      const PopupMenuItem(value: 'share', child: Text('Share')),
                                                    if (_isPrintableFile(file))
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
                                        ? cardSelectedBg
                                        : cardBg,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      side: BorderSide(
                                        color: _selectedKeys.contains('folder:${folder['id']}')
                                            ? const Color(0xFF6366F1)
                                            : cardBorder,
                                        width: _selectedKeys.contains('folder:${folder['id']}') ? 2 : 1,
                                      ),
                                    ),
                                    child: ListTile(
                                      leading: Icon(
                                        _selectedKeys.contains('folder:${folder['id']}')
                                            ? Icons.check_circle
                                            : (_selectedKeys.isNotEmpty ? Icons.radio_button_unchecked : Icons.folder),
                                        color: _selectedKeys.contains('folder:${folder['id']}')
                                            ? const Color(0xFF6366F1)
                                            : (_selectedKeys.isNotEmpty ? const Color(0xFF94A3B8) : const Color(0xFFF59E0B)),
                                      ),
                                      title: Text(folder['name'], style: TextStyle(fontWeight: FontWeight.w600, color: textPrimary)),
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
                                            : [
                                                const PopupMenuItem(value: 'download', child: Text('Download (.zip)')),
                                                if (_view != 'vault')
                                                  const PopupMenuItem(value: 'share', child: Text('Share')),
                                                const PopupMenuItem(value: 'rename', child: Text('Rename')),
                                                const PopupMenuItem(value: 'star', child: Text('Star / Unstar')),
                                                const PopupMenuItem(value: 'trash', child: Text('Move to Trash')),
                                              ],
                                      ),
                                    ),
                                  ),
                                for (final file in _files)
                                  Card(
                                    color: _selectedKeys.contains('file:${file['id']}')
                                        ? cardSelectedBg
                                        : cardBg,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      side: BorderSide(
                                        color: _selectedKeys.contains('file:${file['id']}')
                                            ? const Color(0xFF6366F1)
                                            : cardBorder,
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
                                                    final imgUrl = '${apiClient.currentBaseUrl}/drive/files/${file['id']}/download?inline=true';
                                                    return ClipRRect(
                                                      borderRadius: BorderRadius.circular(8),
                                                      child: SizedBox(
                                                        width: 40,
                                                        height: 40,
                                                        child: Image.network(
                                                          imgUrl,
                                                          headers: _authToken != null ? {'Authorization': 'Bearer $_authToken'} : null,
                                                          cacheWidth: 120,
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
                                      title: Text(file['name'], maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w600, color: textPrimary)),
                                      subtitle: Text(
                                        '${_formatBytes(file['sizeBytes'])}${file['createdAt'] != null ? ' • ${_formatDateTime(file['createdAt'])}' : ''}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(fontSize: 11, color: textSecondary),
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
                                          if (action == 'version') _showVersionHistory(file);
                                          if (action == 'vault_in') _moveToVault('file', file['id']);
                                          if (action == 'vault_out') _moveFromVault('file', file['id']);
                                          if (action == 'offline') _toggleOfflineFile(file);
                                          if (action == 'download') _downloadAndOpen(file);
                                          if (action == 'save_device') _saveFileToDevice(file);
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
                                            : [
                                                PopupMenuItem(
                                                  value: 'version',
                                                  child: Row(
                                                    children: const [
                                                      Icon(Icons.history, size: 16, color: Color(0xFF7C3AED)),
                                                      SizedBox(width: 8),
                                                      Text('Version History'),
                                                    ],
                                                  ),
                                                ),
                                                if (_view != 'vault')
                                                  PopupMenuItem(
                                                    value: 'vault_in',
                                                    child: Row(
                                                      children: const [
                                                        Icon(Icons.lock_outline, size: 16, color: Color(0xFFD97706)),
                                                        SizedBox(width: 8),
                                                        Text('Move to Secret Vault'),
                                                      ],
                                                    ),
                                                  )
                                                else
                                                  PopupMenuItem(
                                                    value: 'vault_out',
                                                    child: Row(
                                                      children: const [
                                                        Icon(Icons.lock_open, size: 16, color: Color(0xFF059669)),
                                                        SizedBox(width: 8),
                                                        Text('Move to My Drive'),
                                                      ],
                                                    ),
                                                  ),
                                                PopupMenuItem(
                                                  value: 'offline',
                                                  child: Row(
                                                    children: [
                                                      Icon(
                                                        _offlineFiles.containsKey(file['id']) ? Icons.offline_pin : Icons.offline_pin_outlined,
                                                        size: 16,
                                                        color: _offlineFiles.containsKey(file['id']) ? const Color(0xFF059669) : const Color(0xFF64748B),
                                                      ),
                                                      const SizedBox(width: 8),
                                                      Text(_offlineFiles.containsKey(file['id']) ? 'Remove Offline' : 'Available Offline'),
                                                    ],
                                                  ),
                                                ),
                                                const PopupMenuItem(value: 'download', child: Text('Download & Open')),
                                                const PopupMenuItem(value: 'save_device', child: Text('Save to Device / SSD')),
                                                if (_view != 'vault')
                                                  const PopupMenuItem(value: 'share', child: Text('Share')),
                                                if (_isPrintableFile(file))
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
        );
  }

  Widget _buildEmptyState(bool isDark) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isDark
                            ? const Color(0xFF6366F1).withValues(alpha: 0.12)
                            : const Color(0xFF4F46E5).withValues(alpha: 0.08),
                        border: Border.all(
                          color: isDark
                              ? const Color(0xFF00F0FF).withValues(alpha: 0.35)
                              : const Color(0xFF6366F1).withValues(alpha: 0.25),
                          width: 1.5,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: isDark
                                ? const Color(0xFF00F0FF).withValues(alpha: 0.15)
                                : const Color(0xFF4F46E5).withValues(alpha: 0.1),
                            blurRadius: 28,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: Center(
                        child: Icon(
                          _view == 'trash'
                              ? Icons.delete_outline_rounded
                              : (_view == 'starred'
                                  ? Icons.star_border_rounded
                                  : (_view == 'vault'
                                      ? Icons.lock_outline_rounded
                                      : Icons.cloud_upload_outlined)),
                          size: 44,
                          color: isDark ? const Color(0xFF00F0FF) : const Color(0xFF4F46E5),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      _view == 'trash'
                          ? 'Trash is Empty'
                          : (_view == 'starred'
                              ? 'No Starred Items'
                              : (_view == 'vault'
                                  ? 'Secret Vault is Empty'
                                  : 'No files in this folder')),
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _view == 'trash'
                          ? 'Items moved to trash will appear here.'
                          : (_view == 'starred'
                              ? 'Star important files for quick instant access.'
                              : (_view == 'vault'
                                  ? 'Store your sensitive documents securely in your encrypted vault.'
                                  : 'Drag and drop files here, or tap below to upload.')),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                        height: 1.4,
                      ),
                    ),
                    if (_view != 'trash' && _view != 'starred') ...[
                      const SizedBox(height: 24),
                      ElevatedButton.icon(
                        onPressed: _showUploadMenu,
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: const Text('Upload Files', style: TextStyle(fontWeight: FontWeight.w600)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF4F46E5),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          elevation: 2,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _MobileZoomableImageViewer extends StatefulWidget {
  final String imageUrl;
  final Map<String, String>? headers;
  final ValueChanged<bool>? onZoomChanged;

  const _MobileZoomableImageViewer({
    required this.imageUrl,
    this.headers,
    this.onZoomChanged,
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
  int _activePointers = 0;

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
      widget.onZoomChanged?.call(scale > 1.05);
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
      duration: const Duration(milliseconds: 250),
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
    if (currentScale > 1.15) {
      _animateTo(Matrix4.identity());
      widget.onZoomChanged?.call(false);
    } else {
      final pos = _doubleTapDetails?.localPosition ?? Offset.zero;
      final target = Matrix4.translationValues(-pos.dx * 1.5, -pos.dy * 1.5, 0.0) *
          Matrix4.diagonal3Values(2.5, 2.5, 1.0);
      _animateTo(target);
      widget.onZoomChanged?.call(true);
    }
  }

  void _zoomIn() {
    final scale = _transformationController.value.getMaxScaleOnAxis();
    final targetScale = (scale * 1.35).clamp(1.0, 5.0);
    final target = Matrix4.diagonal3Values(targetScale, targetScale, 1.0);
    _animateTo(target);
    widget.onZoomChanged?.call(targetScale > 1.05);
  }

  void _zoomOut() {
    final scale = _transformationController.value.getMaxScaleOnAxis();
    final targetScale = (scale / 1.35).clamp(1.0, 5.0);
    final target = targetScale <= 1.05
        ? Matrix4.identity()
        : Matrix4.diagonal3Values(targetScale, targetScale, 1.0);
    _animateTo(target);
    widget.onZoomChanged?.call(targetScale > 1.05);
  }

  void _resetZoom() {
    _animateTo(Matrix4.identity());
    widget.onZoomChanged?.call(false);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Listener(
          onPointerDown: (_) {
            _activePointers++;
            if (_activePointers >= 2) {
              widget.onZoomChanged?.call(true);
            }
          },
          onPointerUp: (_) {
            _activePointers = (_activePointers - 1).clamp(0, 10);
            if (_activePointers < 2 && _currentScale <= 1.05) {
              widget.onZoomChanged?.call(false);
            }
          },
          onPointerCancel: (_) {
            _activePointers = 0;
            if (_currentScale <= 1.05) {
              widget.onZoomChanged?.call(false);
            }
          },
          child: InteractiveViewer(
            transformationController: _transformationController,
            clipBehavior: Clip.hardEdge,
            panEnabled: true,
            scaleEnabled: true,
            minScale: 1.0,
            maxScale: 5.0,
            boundaryMargin: EdgeInsets.zero,
            onInteractionStart: (details) {
              if (details.pointerCount >= 2) {
                widget.onZoomChanged?.call(true);
              }
            },
            onInteractionEnd: (_) {
              final scale = _transformationController.value.getMaxScaleOnAxis();
              if (scale <= 1.05 && _activePointers < 2) {
                widget.onZoomChanged?.call(false);
              } else {
                widget.onZoomChanged?.call(true);
              }
            },
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onDoubleTapDown: (details) => _doubleTapDetails = details,
              onDoubleTap: _handleDoubleTap,
              child: Container(
                width: double.infinity,
                height: double.infinity,
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 16),
                child: Image.network(
                  widget.imageUrl,
                  headers: widget.headers,
                  fit: BoxFit.contain,
                  loadingBuilder: (_, child, progress) => progress == null
                      ? child
                      : const Center(
                          child: CircularProgressIndicator(color: Colors.white),
                        ),
                  errorBuilder: (_, __, ___) => const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.broken_image, color: Colors.white54, size: 48),
                        SizedBox(height: 8),
                        Text('Failed to load image', style: TextStyle(color: Colors.white54)),
                      ],
                    ),
                  ),
                ),
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

class _MobileVideoPlayerDialog extends StatefulWidget {
  final dynamic file;
  final bool isAudio;
  final String? token;
  final Map<String, String>? authHeaders;
  final VoidCallback onDownloadAndOpen;

  const _MobileVideoPlayerDialog({
    required this.file,
    this.isAudio = false,
    this.token,
    this.authHeaders,
    required this.onDownloadAndOpen,
  });

  @override
  State<_MobileVideoPlayerDialog> createState() => _MobileVideoPlayerDialogState();
}

class _MobileVideoPlayerDialogState extends State<_MobileVideoPlayerDialog> {
  late VideoPlayerController _controller;
  bool _isInitialized = false;
  bool _hasError = false;
  String _errorMessage = '';
  bool _showControls = true;
  Timer? _controlsTimer;
  bool _isDraggingSlider = false;
  double _dragValue = 0.0;

  @override
  void initState() {
    super.initState();
    _initPlayer();
  }

  Future<void> _initPlayer() async {
    final fileId = widget.file['id']?.toString() ?? '';
    final tokenParam = widget.token != null ? '&token=${Uri.encodeComponent(widget.token!)}' : '';
    final streamUrl = '${apiClient.currentBaseUrl}/drive/files/$fileId/download?inline=true$tokenParam';

    try {
      _controller = VideoPlayerController.networkUrl(
        Uri.parse(streamUrl),
        httpHeaders: widget.authHeaders ?? const {},
      );

      _controller.addListener(_videoListener);
      await _controller.initialize().timeout(const Duration(seconds: 15));
      if (!mounted) return;
      setState(() {
        _isInitialized = true;
      });
      await _controller.play();
      _startControlsTimer();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _hasError = true;
        _errorMessage = e.toString();
      });
    }
  }

  void _videoListener() {
    if (mounted) {
      setState(() {});
    }
  }

  void _startControlsTimer() {
    _controlsTimer?.cancel();
    if (_controller.value.isPlaying) {
      _controlsTimer = Timer(const Duration(seconds: 4), () {
        if (mounted && _controller.value.isPlaying && !_isDraggingSlider) {
          setState(() {
            _showControls = false;
          });
        }
      });
    }
  }

  void _togglePlayPause() {
    if (_controller.value.isPlaying) {
      _controller.pause();
      setState(() {
        _showControls = true;
      });
      _controlsTimer?.cancel();
    } else {
      _controller.play();
      _startControlsTimer();
    }
  }

  void _seekBy(int seconds) {
    final current = _controller.value.position;
    final total = _controller.value.duration;
    final newPos = (current + Duration(seconds: seconds));
    final clamped = newPos < Duration.zero
        ? Duration.zero
        : (newPos > total ? total : newPos);
    _controller.seekTo(clamped);
    _startControlsTimer();
  }

  String _formatDuration(Duration d) {
    final hours = d.inHours;
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    if (hours > 0) {
      return '$hours:$minutes:$seconds';
    }
    return '$minutes:$seconds';
  }

  @override
  void dispose() {
    _controlsTimer?.cancel();
    _controller.removeListener(_videoListener);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fileName = widget.file['name']?.toString() ?? 'Media';

    return Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black.withValues(alpha: 0.85),
          foregroundColor: Colors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                fileName,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
              ),
              Text(
                widget.isAudio ? 'Audio Player' : 'Video Player',
                style: const TextStyle(fontSize: 11, color: Colors.white54),
              ),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.open_in_new),
              tooltip: 'Open in External App',
              onPressed: () {
                Navigator.of(context).pop();
                widget.onDownloadAndOpen();
              },
            ),
            IconButton(
              icon: const Icon(Icons.download),
              tooltip: 'Download',
              onPressed: widget.onDownloadAndOpen,
            ),
          ],
        ),
        body: _hasError
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, color: Colors.amber, size: 56),
                      const SizedBox(height: 16),
                      const Text(
                        'Direct streaming not supported for this codec',
                        style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'This video can be opened directly with your phone\'s media player (VLC, MX Player, Gallery) or downloaded.',
                        style: TextStyle(color: Colors.white60, fontSize: 13),
                        textAlign: TextAlign.center,
                      ),
                      if (_errorMessage.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          _errorMessage,
                          style: const TextStyle(color: Colors.white38, fontSize: 11),
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 24),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF6366F1),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        icon: const Icon(Icons.play_circle_fill),
                        label: const Text('Open with External Player'),
                        onPressed: () {
                          Navigator.of(context).pop();
                          widget.onDownloadAndOpen();
                        },
                      ),
                    ],
                  ),
                ),
              )
            : !_isInitialized
                ? const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircularProgressIndicator(color: Color(0xFF6366F1)),
                        SizedBox(height: 16),
                        Text('Buffering media stream...', style: TextStyle(color: Colors.white70, fontSize: 13)),
                      ],
                    ),
                  )
                : GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {
                      setState(() {
                        _showControls = !_showControls;
                      });
                      if (_showControls) _startControlsTimer();
                    },
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // Video Surface or Audio Album Art
                        if (widget.isAudio)
                          Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 140,
                                  height: 140,
                                  decoration: BoxDecoration(
                                    gradient: const LinearGradient(
                                      colors: [Color(0xFF6366F1), Color(0xFF38BDF8)],
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                    ),
                                    borderRadius: BorderRadius.circular(32),
                                    boxShadow: [
                                      BoxShadow(
                                        color: const Color(0xFF6366F1).withValues(alpha: 0.4),
                                        blurRadius: 28,
                                        offset: const Offset(0, 10),
                                      ),
                                    ],
                                  ),
                                  child: const Icon(Icons.music_note, color: Colors.white, size: 70),
                                ),
                                const SizedBox(height: 24),
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 32),
                                  child: Text(
                                    fileName,
                                    textAlign: TextAlign.center,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          )
                        else
                          Center(
                            child: AspectRatio(
                              aspectRatio: _controller.value.aspectRatio > 0
                                  ? _controller.value.aspectRatio
                                  : 16 / 9,
                              child: VideoPlayer(_controller),
                            ),
                          ),

                        // Buffering indicator on video
                        if (_controller.value.isBuffering)
                          const Center(
                            child: CircularProgressIndicator(color: Colors.white),
                          ),

                        // Center Controls (Play, Pause, Skip)
                        if (_showControls)
                          Container(
                            color: Colors.black38,
                            child: Center(
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    iconSize: 44,
                                    color: Colors.white,
                                    icon: const Icon(Icons.replay_10),
                                    tooltip: 'Back 10s',
                                    onPressed: () => _seekBy(-10),
                                  ),
                                  const SizedBox(width: 24),
                                  Container(
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF6366F1),
                                      shape: BoxShape.circle,
                                      boxShadow: [
                                        BoxShadow(
                                          color: const Color(0xFF6366F1).withValues(alpha: 0.5),
                                          blurRadius: 18,
                                        ),
                                      ],
                                    ),
                                    child: IconButton(
                                      iconSize: 52,
                                      color: Colors.white,
                                      icon: Icon(
                                        _controller.value.isPlaying
                                            ? Icons.pause
                                            : Icons.play_arrow,
                                      ),
                                      onPressed: _togglePlayPause,
                                    ),
                                  ),
                                  const SizedBox(width: 24),
                                  IconButton(
                                    iconSize: 44,
                                    color: Colors.white,
                                    icon: const Icon(Icons.forward_10),
                                    tooltip: 'Forward 10s',
                                    onPressed: () => _seekBy(10),
                                  ),
                                ],
                              ),
                            ),
                          ),

                        // Bottom Controls Bar (Slider + Duration + Volume)
                        if (_showControls)
                          Positioned(
                            bottom: 0,
                            left: 0,
                            right: 0,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              decoration: const BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [Colors.transparent, Colors.black87, Colors.black],
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                ),
                              ),
                              child: SafeArea(
                                top: false,
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    // Progress Slider
                                    SliderTheme(
                                      data: SliderTheme.of(context).copyWith(
                                        activeTrackColor: const Color(0xFF6366F1),
                                        inactiveTrackColor: Colors.white24,
                                        thumbColor: const Color(0xFF6366F1),
                                        trackHeight: 3.5,
                                        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                                      ),
                                      child: Slider(
                                        value: _isDraggingSlider
                                            ? _dragValue
                                            : _controller.value.position.inMilliseconds
                                                .toDouble()
                                                .clamp(
                                                  0.0,
                                                  _controller.value.duration.inMilliseconds.toDouble() > 0
                                                      ? _controller.value.duration.inMilliseconds.toDouble()
                                                      : 1.0,
                                                ),
                                        min: 0.0,
                                        max: _controller.value.duration.inMilliseconds.toDouble() > 0
                                            ? _controller.value.duration.inMilliseconds.toDouble()
                                            : 1.0,
                                        onChangeStart: (val) {
                                          _isDraggingSlider = true;
                                          _dragValue = val;
                                          _controlsTimer?.cancel();
                                        },
                                        onChanged: (val) {
                                          setState(() {
                                            _dragValue = val;
                                          });
                                        },
                                        onChangeEnd: (val) {
                                          _isDraggingSlider = false;
                                          _controller.seekTo(Duration(milliseconds: val.toInt()));
                                          _startControlsTimer();
                                        },
                                      ),
                                    ),
                                    // Time & Volume Row
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          '${_formatDuration(_controller.value.position)} / ${_formatDuration(_controller.value.duration)}',
                                          style: const TextStyle(color: Colors.white, fontSize: 12, fontFamily: 'monospace'),
                                        ),
                                        Row(
                                          children: [
                                            IconButton(
                                              icon: Icon(
                                                _controller.value.volume > 0
                                                    ? Icons.volume_up
                                                    : Icons.volume_off,
                                                color: Colors.white,
                                                size: 20,
                                              ),
                                              tooltip: 'Toggle Mute',
                                              onPressed: () {
                                                if (_controller.value.volume > 0) {
                                                  _controller.setVolume(0.0);
                                                } else {
                                                  _controller.setVolume(1.0);
                                                }
                                              },
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
      ),
    );
  }
}
