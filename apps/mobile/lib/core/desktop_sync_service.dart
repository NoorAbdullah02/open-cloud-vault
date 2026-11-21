import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'api_client.dart';

/// Event info emitted during desktop synchronization
class SyncStatusEvent {
  final bool isSyncing;
  final String message;
  final int totalFiles;
  final int syncedFiles;
  final DateTime? lastSyncTime;

  const SyncStatusEvent({
    required this.isSyncing,
    required this.message,
    this.totalFiles = 0,
    this.syncedFiles = 0,
    this.lastSyncTime,
  });
}

/// Desktop Local Folder Auto-Sync Service
/// Manages ~/NoorDrive folder watch, auto-upload to cloud, and bi-directional status.
class DesktopSyncService extends ChangeNotifier {
  static final DesktopSyncService instance = DesktopSyncService._();
  DesktopSyncService._();

  bool _isInitialized = false;
  bool _isRunning = false;
  bool _isSyncing = false;
  String _statusMessage = 'Idle';
  int _totalFiles = 0;
  int _syncedFiles = 0;
  DateTime? _lastSyncTime;
  Timer? _pollTimer;
  Directory? _syncFolder;

  // Track file modification timestamps to prevent redundant re-uploads
  final Map<String, int> _knownFileModified = {};

  bool get isRunning => _isRunning;
  bool get isSyncing => _isSyncing;
  String get statusMessage => _statusMessage;
  int get totalFiles => _totalFiles;
  int get syncedFiles => _syncedFiles;
  DateTime? get lastSyncTime => _lastSyncTime;
  Directory? get syncFolder => _syncFolder;

  /// Check if the current platform is a Desktop environment (Linux, Windows, macOS)
  static bool get isDesktopPlatform {
    if (kIsWeb) return false;
    return Platform.isLinux || Platform.isWindows || Platform.isMacOS;
  }

  /// Returns the standard default sync folder for the host OS:
  /// - Ubuntu/Linux: ~/NoorDrive
  /// - macOS: ~/NoorDrive
  /// - Windows: C:\Users\<Username>\NoorDrive
  static Future<Directory> getDefaultSyncDirectory() async {
    if (Platform.isWindows) {
      final userProfile = Platform.environment['USERPROFILE'];
      if (userProfile != null && userProfile.isNotEmpty) {
        return Directory('$userProfile\\NoorDrive');
      }
    } else {
      final home = Platform.environment['HOME'];
      if (home != null && home.isNotEmpty) {
        return Directory('$home/NoorDrive');
      }
    }
    final docs = await getApplicationDocumentsDirectory();
    return Directory('${docs.path}/NoorDrive');
  }

  /// Initialize sync folder, ensuring it exists on disk
  Future<void> initialize({Directory? customDir}) async {
    if (_isInitialized) return;
    try {
      _syncFolder = customDir ?? await getDefaultSyncDirectory();
      if (!await _syncFolder!.exists()) {
        await _syncFolder!.create(recursive: true);
      }
      _isInitialized = true;
      _statusMessage = 'Ready (${_syncFolder!.path})';
      notifyListeners();
    } catch (e) {
      _statusMessage = 'Failed to init sync folder: $e';
      notifyListeners();
    }
  }

  /// Start background sync loop (polls local folder every 10 seconds)
  void start() {
    if (_isRunning) return;
    _isRunning = true;
    _statusMessage = 'Sync active';
    notifyListeners();

    // Perform immediate sync once, then start loop
    triggerSync();

    _pollTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_isRunning && !_isSyncing) {
        triggerSync();
      }
    });
  }

  /// Stop background sync loop
  void stop() {
    _isRunning = false;
    _pollTimer?.cancel();
    _pollTimer = null;
    _statusMessage = 'Sync paused';
    notifyListeners();
  }

  /// Manually triggers a scan of the local sync folder and syncs with cloud
  Future<void> triggerSync() async {
    if (_isSyncing) return;
    if (_syncFolder == null || !await _syncFolder!.exists()) {
      await initialize();
    }

    final token = await apiClient.storage.read(key: 'access_token');
    if (token == null || token.isEmpty) {
      _statusMessage = 'Sign in required to sync';
      notifyListeners();
      return;
    }

    _isSyncing = true;
    _statusMessage = 'Scanning ~/NoorDrive...';
    notifyListeners();

    try {
      final entities = await _syncFolder!.list(recursive: true, followLinks: false).toList();
      final localFiles = entities.whereType<File>().toList();
      _totalFiles = localFiles.length;
      _syncedFiles = 0;

      for (final file in localFiles) {
        final relPath = file.path.replaceFirst('${_syncFolder!.path}/', '');
        final stat = await file.stat();
        final lastMod = stat.modified.millisecondsSinceEpoch;

        // Skip hidden/system files (e.g. .DS_Store, .git)
        if (file.path.split(Platform.pathSeparator).any((s) => s.startsWith('.'))) {
          continue;
        }

        // Check if file was already synced with identical mtime
        if (_knownFileModified[file.path] == lastMod) {
          _syncedFiles++;
          continue;
        }

        // Upload newly added / modified file
        _statusMessage = 'Uploading ${file.uri.pathSegments.last}...';
        notifyListeners();

        try {
          final fileName = file.uri.pathSegments.last;
          final formData = FormData.fromMap({
            'file': await MultipartFile.fromFile(file.path, filename: fileName),
          });

          await apiClient.dio.post(
            '/drive/upload',
            data: formData,
            options: Options(
              headers: {'Authorization': 'Bearer $token'},
            ),
          );

          _knownFileModified[file.path] = lastMod;
          _syncedFiles++;
        } catch (uploadError) {
          debugPrint('Sync upload error for $relPath: $uploadError');
        }
      }

      _lastSyncTime = DateTime.now();
      _statusMessage = 'All files up to date';
    } catch (e) {
      _statusMessage = 'Sync error: $e';
    } finally {
      _isSyncing = false;
      notifyListeners();
    }
  }
}
