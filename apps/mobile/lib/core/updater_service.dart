import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api_client.dart';

/// Release platform asset information model
class ReleaseInfo {
  final String version;
  final int buildNumber;
  final String releaseNotes;
  final String downloadUrl;
  final Map<String, String> platformAssets;

  ReleaseInfo({
    required this.version,
    required this.buildNumber,
    required this.releaseNotes,
    required this.downloadUrl,
    required this.platformAssets,
  });

  String getAssetUrlForCurrentPlatform() {
    if (kIsWeb) return downloadUrl;
    if (Platform.isWindows) return platformAssets['windows'] ?? downloadUrl;
    if (Platform.isMacOS) return platformAssets['mac'] ?? downloadUrl;
    if (Platform.isLinux) return platformAssets['linux'] ?? platformAssets['linuxTar'] ?? downloadUrl;
    if (Platform.isAndroid) return platformAssets['apk'] ?? downloadUrl;
    return downloadUrl;
  }
}

/// In-App Multi-Platform Auto-Updater Service
class UpdaterService {
  static const String fallbackReleaseUrl =
      'https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest';

  /// Check whether a newer version is available on GitHub / API
  static Future<ReleaseInfo?> checkUpdate() async {
    try {
      String tag = '';
      String defaultDownload = '$fallbackReleaseUrl/download/noor-drive.apk';
      String notes = 'Latest performance improvements and bug fixes.';
      Map<String, String> platforms = {};

      try {
        final res = await Dio(
          BaseOptions(connectTimeout: const Duration(seconds: 15)),
        ).get('${apiClient.currentBaseUrl}/shares/app-release');

        tag = (res.data['version'] ?? '') as String;
        if (res.data['downloadUrl'] != null) {
          defaultDownload = res.data['downloadUrl'].toString();
        }
        if (res.data['releaseNotes'] != null) {
          notes = res.data['releaseNotes'].toString();
        }
        if (res.data['platforms'] is Map) {
          platforms = (res.data['platforms'] as Map).map(
            (k, v) => MapEntry(k.toString(), v.toString()),
          );
        }
      } catch (_) {
        // Fallback to GitHub Releases API
        final ghRes = await Dio(
          BaseOptions(connectTimeout: const Duration(seconds: 15)),
        ).get('https://api.github.com/repos/NoorAbdullah02/open-cloud-vault/releases/latest');

        tag = (ghRes.data['tag_name'] ?? '') as String;
        notes = (ghRes.data['body'] ?? notes) as String;

        final assets = (ghRes.data['assets'] as List?) ?? [];
        for (final a in assets) {
          final name = (a['name'] ?? '').toString().toLowerCase();
          final url = (a['browser_download_url'] ?? '').toString();
          if (name.endsWith('.apk')) platforms['apk'] = url;
          if (name.endsWith('.exe')) platforms['windows'] = url;
          if (name.endsWith('.dmg')) platforms['mac'] = url;
          if (name.endsWith('.deb')) platforms['linux'] = url;
          if (name.endsWith('.tar.gz')) platforms['linuxTar'] = url;
        }
      }

      final match = RegExp(r'v1\.0\.(\d+)').firstMatch(tag);
      final remoteBuild = match != null ? int.tryParse(match.group(1)!) ?? 0 : 0;

      if (remoteBuild > ApiClient.buildNumber) {
        return ReleaseInfo(
          version: tag.isNotEmpty ? tag : 'v1.0.$remoteBuild',
          buildNumber: remoteBuild,
          releaseNotes: notes,
          downloadUrl: defaultDownload,
          platformAssets: platforms,
        );
      }
      return null;
    } catch (e) {
      debugPrint('Update check error: $e');
      return null;
    }
  }

  /// Shows the update dialog with direct 1-click update for Desktop or Mobile
  static Future<void> showUpdateDialog(BuildContext context, ReleaseInfo info) async {
    final assetUrl = info.getAssetUrlForCurrentPlatform();
    final platformName = Platform.isWindows
        ? 'Windows (.exe)'
        : Platform.isMacOS
            ? 'macOS (.dmg)'
            : Platform.isLinux
                ? 'Ubuntu / Linux (.deb)'
                : 'Android (.apk)';

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        bool downloading = false;
        double progress = 0;

        return StatefulBuilder(
          builder: (ctx, setModalState) => AlertDialog(
            title: Row(
              children: [
                const Icon(Icons.system_update_rounded, color: Color(0xFF4F46E5)),
                const SizedBox(width: 8),
                Text('Update to ${info.version}'),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'A new version of NOOR DRIVE is available for $platformName.',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                Text(
                  info.releaseNotes,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                ),
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
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Later'),
                ),
              ElevatedButton.icon(
                icon: const Icon(Icons.download_rounded),
                label: Text(downloading ? 'Downloading...' : 'Update Now'),
                onPressed: downloading
                    ? null
                    : () async {
                        if (Platform.isLinux || Platform.isMacOS || Platform.isWindows) {
                          // Desktop: Launch direct download URL in default browser / download manager
                          final uri = Uri.parse(assetUrl);
                          await launchUrl(uri, mode: LaunchMode.externalApplication);
                          if (ctx.mounted) Navigator.pop(ctx);
                        } else {
                          // Android / Mobile: Download and trigger install
                          setModalState(() => downloading = true);
                          try {
                            final dir = (await getExternalStorageDirectory()) ??
                                (await getApplicationDocumentsDirectory());
                            final apkPath = '${dir.path}/noor-drive-${info.version}.apk';

                            await Dio().download(
                              assetUrl,
                              apkPath,
                              onReceiveProgress: (rec, total) {
                                if (total > 0) {
                                  setModalState(() => progress = rec / total);
                                }
                              },
                            );

                            await launchUrl(
                              Uri.parse('content://$apkPath'),
                              mode: LaunchMode.externalApplication,
                            );
                            if (ctx.mounted) Navigator.pop(ctx);
                          } catch (e) {
                            setModalState(() => downloading = false);
                            if (ctx.mounted) {
                              ScaffoldMessenger.of(ctx).showSnackBar(
                                SnackBar(content: Text('Update download failed: $e')),
                              );
                            }
                          }
                        }
                      },
              ),
            ],
          ),
        );
      },
    );
  }
}
