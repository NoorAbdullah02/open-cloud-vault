import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// In-memory cached secure storage wrapper to prevent DBus IPC lockups on Linux
/// and eliminate redundant disk/keyring queries on desktop and mobile.
class CachedSecureStorage {
  final FlutterSecureStorage _storage;
  final Map<String, String?> _cache = {};

  CachedSecureStorage([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  Future<String?> read({required String key}) async {
    if (_cache.containsKey(key)) {
      return _cache[key];
    }
    try {
      final val = await _storage.read(key: key);
      _cache[key] = val;
      return val;
    } catch (_) {
      return null;
    }
  }

  Future<void> write({required String key, required String? value}) async {
    _cache[key] = value;
    try {
      await _storage.write(key: key, value: value);
    } catch (_) {}
  }

  Future<void> delete({required String key}) async {
    _cache.remove(key);
    try {
      await _storage.delete(key: key);
    } catch (_) {}
  }

  Future<void> deleteAll() async {
    _cache.clear();
    try {
      await _storage.deleteAll();
    } catch (_) {}
  }
}

class ApiClient {
  // Change this to your deployed Render API URL when building for release:
  // e.g. https://noor-drive-api.onrender.com/api
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://drive.noor.is-a.dev/api',
  );
  static const int buildNumber = int.fromEnvironment('APP_BUILD_NUMBER', defaultValue: 72);

  final Dio dio;
  final CachedSecureStorage storage;
  Completer<bool>? _refreshCompleter;

  ApiClient()
      : storage = CachedSecureStorage(const FlutterSecureStorage()),
        dio = Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: const Duration(seconds: 60),
            sendTimeout: const Duration(minutes: 60),
            receiveTimeout: const Duration(minutes: 60),
          ),
        ) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await storage.read(key: 'access_token');
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401 &&
              !error.requestOptions.path.contains('/auth/refresh')) {
            final refreshed = await _refreshTokensOnce();
            if (refreshed) {
              final newAccess = await storage.read(key: 'access_token');
              if (newAccess != null && newAccess.isNotEmpty) {
                error.requestOptions.headers['Authorization'] = 'Bearer $newAccess';
                try {
                  final cloned = await dio.fetch(error.requestOptions);
                  return handler.resolve(cloned);
                } catch (retryErr) {
                  return handler.next(retryErr is DioException ? retryErr : error);
                }
              }
            }
          }
          return handler.next(error);
        },
      ),
    );
  }

  Future<bool> _refreshTokensOnce() async {
    if (_refreshCompleter != null) {
      return _refreshCompleter!.future;
    }
    final completer = Completer<bool>();
    _refreshCompleter = completer;

    try {
      final refreshToken = await storage.read(key: 'refresh_token');
      if (refreshToken == null || refreshToken.isEmpty) {
        completer.complete(false);
        return false;
      }

      final refreshDio = Dio(BaseOptions(baseUrl: dio.options.baseUrl));
      final res = await refreshDio.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final newAccess = res.data['accessToken']?.toString();
      final newRefresh = res.data['refreshToken']?.toString();
      if (newAccess == null || newRefresh == null) {
        completer.complete(false);
        return false;
      }
      await storage.write(key: 'access_token', value: newAccess);
      await storage.write(key: 'refresh_token', value: newRefresh);
      completer.complete(true);
      return true;
    } catch (_) {
      await storage.delete(key: 'access_token');
      await storage.delete(key: 'refresh_token');
      completer.complete(false);
      return false;
    } finally {
      _refreshCompleter = null;
    }
  }

  String get currentBaseUrl => dio.options.baseUrl;

  Future<void> initCustomUrl() async {
    try {
      final saved = await storage.read(key: 'custom_api_url');
      if (saved != null && saved.trim().isNotEmpty) {
        dio.options.baseUrl = saved.trim();
      }
    } catch (_) {}
  }

  Future<void> setBaseUrl(String newUrl) async {
    final clean = newUrl.trim();
    dio.options.baseUrl = clean;
    await storage.write(key: 'custom_api_url', value: clean);
  }
}

final apiClient = ApiClient();
