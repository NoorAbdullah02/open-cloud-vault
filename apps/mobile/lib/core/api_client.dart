import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  // Change this to your deployed Render API URL when building for release:
  // e.g. https://noor-drive-api.onrender.com/api
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://noor-cloud.onrender.com/api',
  );

  final Dio dio;
  final FlutterSecureStorage storage;

  ApiClient()
      : storage = const FlutterSecureStorage(),
        dio = Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: const Duration(seconds: 20),
            receiveTimeout: const Duration(minutes: 5),
          ),
        ) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await storage.read(key: 'access_token');
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            final refreshToken = await storage.read(key: 'refresh_token');
            if (refreshToken != null) {
              try {
                final refreshDio = Dio(BaseOptions(baseUrl: baseUrl));
                final res = await refreshDio.post(
                  '/auth/refresh',
                  data: {'refreshToken': refreshToken},
                );
                final newAccess = res.data['accessToken'];
                final newRefresh = res.data['refreshToken'];
                await storage.write(key: 'access_token', value: newAccess);
                await storage.write(key: 'refresh_token', value: newRefresh);

                error.requestOptions.headers['Authorization'] = 'Bearer $newAccess';
                final cloned = await dio.fetch(error.requestOptions);
                return handler.resolve(cloned);
              } catch (_) {
                await storage.deleteAll();
              }
            }
          }
          return handler.next(error);
        },
      ),
    );
  }
}

final apiClient = ApiClient();

