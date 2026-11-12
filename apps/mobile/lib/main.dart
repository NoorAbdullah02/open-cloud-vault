import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'features/auth/passcode_screen.dart';
import 'features/drive/drive_screen.dart';

final _router = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(
      path: '/login',
      builder: (context, state) => const PasscodeScreen(),
    ),
    GoRoute(
      path: '/drive',
      builder: (context, state) => const DriveScreen(),
    ),
  ],
);

void main() {
  runApp(const ProviderScope(child: NoorDriveApp()));
}

class NoorDriveApp extends StatelessWidget {
  const NoorDriveApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'NOOR DRIVE',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF4F46E5),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      ),
      routerConfig: _router,
    );
  }
}

