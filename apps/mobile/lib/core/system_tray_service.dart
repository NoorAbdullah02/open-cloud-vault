import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:open_filex/open_filex.dart';
import 'package:url_launcher/url_launcher.dart';
import 'desktop_sync_service.dart';

/// Desktop System Tray and OS Integration Service
/// Handles System Tray quick actions, local folder opening, and OS file manager triggers.
class SystemTrayService {
  static const String webVaultUrl = 'https://drive.noor.is-a.dev';

  /// Open the local ~/NoorDrive folder directly in the native file manager:
  /// - Nautilus / Files on Ubuntu / Linux
  /// - Finder on macOS
  /// - File Explorer on Windows
  static Future<bool> openLocalSyncFolder() async {
    try {
      final syncDir = DesktopSyncService.instance.syncFolder ??
          await DesktopSyncService.getDefaultSyncDirectory();

      if (!await syncDir.exists()) {
        await syncDir.create(recursive: true);
      }

      if (Platform.isLinux) {
        final result = await Process.run('xdg-open', [syncDir.path]);
        return result.exitCode == 0;
      } else if (Platform.isMacOS) {
        final result = await Process.run('open', [syncDir.path]);
        return result.exitCode == 0;
      } else if (Platform.isWindows) {
        final result = await Process.run('explorer.exe', [syncDir.path]);
        return result.exitCode == 0;
      } else {
        final res = await OpenFilex.open(syncDir.path);
        return res.type == ResultType.done;
      }
    } catch (e) {
      debugPrint('Error opening local sync folder: $e');
      return false;
    }
  }

  /// Open the live NOOR DRIVE web cloud in the user's default browser
  static Future<bool> openWebCloud() async {
    try {
      final uri = Uri.parse(webVaultUrl);
      if (await canLaunchUrl(uri)) {
        return await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
      return false;
    } catch (e) {
      debugPrint('Error opening web cloud: $e');
      return false;
    }
  }

  /// Open WebDAV documentation / mount helper in browser
  static Future<bool> openWebDavGuide() async {
    try {
      final uri = Uri.parse('$webVaultUrl/api/shares/app-release');
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }
}
