import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class SharedFileItem {
  final String path;
  final String name;
  final String mimeType;

  SharedFileItem({
    required this.path,
    required this.name,
    required this.mimeType,
  });

  factory SharedFileItem.fromMap(Map<dynamic, dynamic> map) {
    return SharedFileItem(
      path: (map['path'] ?? '').toString(),
      name: (map['name'] ?? '').toString(),
      mimeType: (map['mimeType'] ?? 'application/octet-stream').toString(),
    );
  }
}

class SharingService {
  static const MethodChannel _channel = MethodChannel('com.noordrive.app/sharing');

  static Future<List<SharedFileItem>> getSharedFiles() async {
    try {
      final List? list = await _channel.invokeMethod<List>('getSharedFiles');
      if (list == null || list.isEmpty) return [];
      return list.map((item) => SharedFileItem.fromMap(item as Map)).toList();
    } catch (e) {
      debugPrint('Error getting shared files from native: $e');
      return [];
    }
  }

  static Future<void> clearSharedFiles() async {
    try {
      await _channel.invokeMethod('clearSharedFiles');
    } catch (_) {}
  }
}

