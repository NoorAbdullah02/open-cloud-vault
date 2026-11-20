import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
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
          final raw = res.data['platforms'] as Map;
          raw.forEach((k, v) {
            if (v is String) {
              platforms[k.toString()] = v;
            } else if (v is Map && v['url'] != null) {
              platforms[k.toString()] = v['url'].toString();
            }
          });
        }
      } catch (_) {
        // Fallback to GitHub Releases API with multi-release scanning
        final ghRes = await Dio(
          BaseOptions(connectTimeout: const Duration(seconds: 15)),
        ).get('https://api.github.com/repos/NoorAbdullah02/open-cloud-vault/releases?per_page=5');

        final releases = (ghRes.data as List?) ?? [];
        if (releases.isNotEmpty) {
          final first = releases[0];
          tag = (first['tag_name'] ?? '') as String;
          notes = (first['body'] ?? notes) as String;

          for (final rel in releases) {
            final assets = (rel['assets'] as List?) ?? [];
            for (final a in assets) {
              final name = (a['name'] ?? '').toString().toLowerCase();
              final url = (a['browser_download_url'] ?? '').toString();
              if (name.endsWith('.apk') && !platforms.containsKey('apk')) platforms['apk'] = url;
              if (name.endsWith('.exe') && !platforms.containsKey('windows')) platforms['windows'] = url;
              if (name.endsWith('.dmg') && !platforms.containsKey('mac')) platforms['mac'] = url;
              if (name.endsWith('.deb') && !platforms.containsKey('linux')) platforms['linux'] = url;
              if (name.endsWith('.tar.gz') && !platforms.containsKey('linuxTar')) platforms['linuxTar'] = url;
            }
          }
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
        String statusText = 'Ready to download update';

        return StatefulBuilder(
          builder: (ctx, setModalState) => AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEEF2FF),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.system_update_rounded, color: Color(0xFF4F46E5), size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Update to ${info.version}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                      Text(platformName, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w500)),
                    ],
                  ),
                ),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'A new official version of NOOR DRIVE is available for your device.',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF1E293B)),
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Text(
                    info.releaseNotes,
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.5, color: Color(0xFF475569)),
                  ),
                ),
                if (downloading) ...[
                  const SizedBox(height: 16),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: progress > 0 ? progress : null,
                      minHeight: 8,
                      backgroundColor: const Color(0xFFE2E8F0),
                      valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF4F46E5)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(statusText, style: const TextStyle(fontSize: 11.5, color: Color(0xFF4F46E5), fontWeight: FontWeight.w600)),
                      Text('${(progress * 100).round()}%', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                    ],
                  ),
                ],
              ],
            ),
            actions: [
              if (!downloading) ...[
                TextButton(
                  onPressed: () async {
                    await apiClient.storage.write(key: 'dismissed_update_version', value: info.version);
                    if (ctx.mounted) Navigator.pop(ctx);
                  },
                  child: const Text('Later', style: TextStyle(color: Color(0xFF64748B))),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.open_in_browser, size: 16),
                  label: const Text('Web Download', style: TextStyle(fontSize: 12)),
                  onPressed: () async {
                    final uri = Uri.parse(assetUrl);
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                    if (ctx.mounted) Navigator.pop(ctx);
                  },
                ),
              ],
              ElevatedButton.icon(
                icon: const Icon(Icons.download_rounded, size: 18),
                label: Text(downloading ? 'Downloading...' : 'Update Now'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4F46E5),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: downloading
                    ? null
                    : () async {
                        setModalState(() {
                          downloading = true;
                          progress = 0.05;
                          statusText = 'Starting download...';
                        });

                        try {
                          final downloadDio = Dio(
                            BaseOptions(
                              connectTimeout: const Duration(seconds: 30),
                              receiveTimeout: const Duration(minutes: 10),
                              followRedirects: true,
                              maxRedirects: 10,
                            ),
                          );

                          if (Platform.isAndroid) {
                            final dir = await getTemporaryDirectory();
                            final apkPath = '${dir.path}/noor-drive-${info.version}.apk';
                            final existing = File(apkPath);
                            if (await existing.exists()) {
                              try { await existing.delete(); } catch (_) {}
                            }

                            await downloadDio.download(
                              assetUrl,
                              apkPath,
                              onReceiveProgress: (rec, total) {
                                if (ctx.mounted) {
                                  setModalState(() {
                                    if (total > 0) {
                                      progress = rec / total;
                                      statusText = 'Downloading APK (${(rec / (1024 * 1024)).toStringAsFixed(1)} MB / ${(total / (1024 * 1024)).toStringAsFixed(1)} MB)';
                                    } else {
                                      progress = -1;
                                      statusText = 'Downloading APK (${(rec / (1024 * 1024)).toStringAsFixed(1)} MB)...';
                                    }
                                  });
                                }
                              },
                            );

                            setModalState(() => statusText = 'Launching Installer...');
                            final openRes = await OpenFilex.open(
                              apkPath,
                              type: 'application/vnd.android.package-archive',
                            );

                            if (openRes.type != ResultType.done) {
                              // If internal package installer couldn't launch, fallback to system browser
                              await launchUrl(Uri.parse(assetUrl), mode: LaunchMode.externalApplication);
                            }
                            if (ctx.mounted) Navigator.pop(ctx);
                          } else {
                            // Desktop: Linux, Windows, macOS
                            Directory? targetDir;
                            try {
                              targetDir = await getDownloadsDirectory();
                            } catch (_) {}
                            targetDir ??= await getApplicationDocumentsDirectory();

                            final ext = Platform.isWindows ? 'exe' : (Platform.isLinux ? 'deb' : 'dmg');
                            final installerPath = '${targetDir.path}/noor-drive-${info.version}.$ext';
                            final existing = File(installerPath);
                            if (await existing.exists()) {
                              try { await existing.delete(); } catch (_) {}
                            }

                            await downloadDio.download(
                              assetUrl,
                              installerPath,
                              onReceiveProgress: (rec, total) {
                                if (ctx.mounted) {
                                  setModalState(() {
                                    if (total > 0) {
                                      progress = rec / total;
                                      statusText = 'Downloading Installer (${(rec / (1024 * 1024)).toStringAsFixed(1)} MB / ${(total / (1024 * 1024)).toStringAsFixed(1)} MB)...';
                                    } else {
                                      progress = -1;
                                      statusText = 'Downloading Installer (${(rec / (1024 * 1024)).toStringAsFixed(1)} MB)...';
                                    }
                                  });
                                }
                              },
                            );

                            setModalState(() => statusText = 'Opening package installer...');
                            final openRes = await OpenFilex.open(installerPath);
                            if (openRes.type != ResultType.done) {
                              await launchUrl(Uri.parse(assetUrl), mode: LaunchMode.externalApplication);
                            }
                            if (ctx.mounted) Navigator.pop(ctx);
                          }
                        } catch (e) {
                          setModalState(() {
                            downloading = false;
                            statusText = 'Download failed. Use Web Download button.';
                          });
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(
                                content: Text('Download failed: $e. You can use Web Download.'),
                                action: SnackBarAction(
                                  label: 'Open Browser',
                                  onPressed: () => launchUrl(Uri.parse(assetUrl), mode: LaunchMode.externalApplication),
                                ),
                              ),
                            );
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
