import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:noor_drive_app/features/drive/drive_screen.dart';

void main() {
  testWidgets('Open Drawer and verify sidebar items in Dark Mode (Mobile)', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;

    await tester.pumpWidget(
      MaterialApp(
        themeMode: ThemeMode.dark,
        darkTheme: ThemeData(
          brightness: Brightness.dark,
          colorScheme: const ColorScheme.dark(
            surface: Color(0xFF0F172A),
            onSurface: Color(0xFFF1F5F9),
          ),
          drawerTheme: const DrawerThemeData(
            backgroundColor: Color(0xFF0F172A),
          ),
        ),
        home: const ProviderScope(
          child: DriveScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));

    // Verify hamburger menu exists on mobile
    final menuBtn = find.byIcon(Icons.menu_rounded);
    expect(menuBtn, findsOneWidget);

    // Tap menu button to open drawer
    await tester.tap(menuBtn);
    await tester.pump(const Duration(milliseconds: 500));

    // Drawer should now be visible!
    final drawer = find.byType(Drawer);
    expect(drawer, findsOneWidget);

    // Verify key sidebar items are present inside Drawer
    expect(find.descendant(of: drawer, matching: find.text('Sheikh Noor')), findsOneWidget);
    expect(find.descendant(of: drawer, matching: find.text('My Drive')), findsOneWidget);
    expect(find.descendant(of: drawer, matching: find.text('Secret Vault')), findsOneWidget);
    expect(find.descendant(of: drawer, matching: find.text('Offline Files')), findsOneWidget);
    expect(find.descendant(of: drawer, matching: find.text('Recent')), findsOneWidget);
    expect(find.descendant(of: drawer, matching: find.text('Starred')), findsOneWidget);
    expect(find.descendant(of: drawer, matching: find.text('Photos')), findsOneWidget);
    expect(find.descendant(of: drawer, matching: find.text('Videos')), findsOneWidget);
    expect(find.descendant(of: drawer, matching: find.text('Documents')), findsOneWidget);
    expect(find.descendant(of: drawer, matching: find.text('Trash')), findsOneWidget);
    expect(find.descendant(of: drawer, matching: find.text('NOOR DRIVE Storage')), findsOneWidget);

    // ignore: avoid_print
    print('SUCCESS: All Drawer sidebar items rendered cleanly with 0 errors in Mobile Dark Mode!');
  });

  testWidgets('Verify Dual-Side Navigation Panel in Dark Mode (Wide / Tablet / Desktop)', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1.0;

    await tester.pumpWidget(
      MaterialApp(
        themeMode: ThemeMode.dark,
        darkTheme: ThemeData(
          brightness: Brightness.dark,
          colorScheme: const ColorScheme.dark(
            surface: Color(0xFF0F172A),
            onSurface: Color(0xFFF1F5F9),
          ),
        ),
        home: const ProviderScope(
          child: DriveScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));

    // On wide screen, dual side panel is embedded in the body
    expect(find.text('DUAL SIDE'), findsOneWidget);
    expect(find.text('Sheikh Noor'), findsOneWidget);
    expect(find.text('My Drive'), findsOneWidget);
    expect(find.text('Secret Vault'), findsOneWidget);
    expect(find.text('NOOR DRIVE Storage'), findsOneWidget);

    // ignore: avoid_print
    print('SUCCESS: Dual-Side persistent panel rendered cleanly with 0 errors in Wide Dark Mode!');
  });
}
