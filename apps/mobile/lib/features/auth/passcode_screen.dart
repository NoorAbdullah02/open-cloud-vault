import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';
import '../../core/api_client.dart';
import '../../main.dart';

class PasscodeScreen extends ConsumerStatefulWidget {
  const PasscodeScreen({super.key});

  @override
  ConsumerState<PasscodeScreen> createState() => _PasscodeScreenState();
}

class _PasscodeScreenState extends ConsumerState<PasscodeScreen> {
  final _passcodeController = TextEditingController();
  final _totpController = TextEditingController();
  final _localAuth = LocalAuthentication();
  bool _requires2fa = false;
  bool _loading = false;
  bool _canUseBiometrics = false;
  bool _hasSavedCredentials = false;
  bool _rememberForBiometrics = true;
  bool _obscurePasscode = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    apiClient.initCustomUrl().then((_) {
      if (mounted) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initBiometrics();
    });
  }

  Future<void> _initBiometrics() async {
    try {
      final supported = await _localAuth.isDeviceSupported();
      final canCheck = await _localAuth.canCheckBiometrics;
      final savedPasscode = await apiClient.storage.read(key: 'saved_passcode');
      final bioEnabled = await apiClient.storage.read(key: 'biometric_enabled');

      if (!mounted) return;
      final available = supported || canCheck;
      final hasSaved = savedPasscode != null && savedPasscode.isNotEmpty;
      setState(() {
        _canUseBiometrics = available;
        _hasSavedCredentials = hasSaved;
      });

      if (available && hasSaved && bioEnabled != 'false') {
        await _unlockWithBiometrics();
      }
    } catch (_) {}
  }

  Future<void> _unlockWithBiometrics() async {
    try {
      final authenticated = await _localAuth.authenticate(
        localizedReason: 'Unlock NOOR DRIVE with your fingerprint',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
      if (!authenticated || !mounted) return;

      setState(() {
        _loading = true;
        _error = null;
      });

      final token = await apiClient.storage.read(key: 'access_token');
      if (token != null && token.isNotEmpty) {
        try {
          await apiClient.dio.get('/auth/me');
          if (mounted) context.go('/drive');
          return;
        } catch (_) {}
      }

      final savedPasscode = await apiClient.storage.read(key: 'saved_passcode');
      if (savedPasscode != null && savedPasscode.isNotEmpty) {
        await _unlock(overridePasscode: savedPasscode);
      } else {
        setState(() {
          _loading = false;
          _error = 'Please enter your passcode once to enable fingerprint unlock.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _unlock({String? overridePasscode}) async {
    final passcode = (overridePasscode ?? _passcodeController.text).trim();
    if (passcode.isEmpty) return;

    setState(() {
      _error = null;
      _loading = true;
    });

    try {
      final res = await apiClient.dio.post(
        '/auth/passcode',
        data: {
          'passcode': passcode,
          if (_requires2fa) 'totpCode': _totpController.text.trim(),
          'deviceName': Platform.operatingSystem,
          'platform': Platform.operatingSystem,
        },
      );

      if (res.data['requiresTwoFactor'] == true) {
        setState(() {
          _requires2fa = true;
          _loading = false;
        });
        return;
      }

      await apiClient.storage.write(
        key: 'access_token',
        value: res.data['accessToken'],
      );
      await apiClient.storage.write(
        key: 'refresh_token',
        value: res.data['refreshToken'],
      );

      if (_rememberForBiometrics) {
        await apiClient.storage.write(key: 'saved_passcode', value: passcode);
        await apiClient.storage.write(key: 'biometric_enabled', value: 'true');
      } else {
        await apiClient.storage.delete(key: 'saved_passcode');
        await apiClient.storage.write(key: 'biometric_enabled', value: 'false');
      }

      if (mounted) context.go('/drive');
    } catch (e) {
      setState(() {
        _error = 'Incorrect passcode or connection error';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF070B14) : const Color(0xFFF8FAFC),
      body: Stack(
        children: [
          // Top theme switch button
          Positioned(
            top: 24,
            right: 24,
            child: SafeArea(
              child: IconButton(
                onPressed: () => ref.read(themeModeProvider.notifier).toggleTheme(),
                tooltip: isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode',
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF0F172A) : Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.05),
                        blurRadius: 10,
                      ),
                    ],
                  ),
                  child: Icon(
                    isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded,
                    color: isDark ? const Color(0xFFFBBF24) : const Color(0xFF4F46E5),
                    size: 20,
                  ),
                ),
              ),
            ),
          ),
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 390),
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 34),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF0F172A).withValues(alpha: 0.95) : Colors.white,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(
                    color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: isDark
                          ? Colors.black.withValues(alpha: 0.5)
                          : const Color(0xFF0F172A).withValues(alpha: 0.06),
                      blurRadius: 36,
                      offset: const Offset(0, 16),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Top Private Badge
                    Container(
                      margin: const EdgeInsets.only(bottom: 18),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF064E3B).withValues(alpha: 0.4) : const Color(0xFFECFDF5),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: isDark ? const Color(0xFF047857) : const Color(0xFFA7F3D0),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.shield_rounded,
                            size: 13,
                            color: isDark ? const Color(0xFF34D399) : const Color(0xFF059669),
                          ),
                          const SizedBox(width: 5),
                          Text(
                            'PRIVATE CLOUD VAULT',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                              color: isDark ? const Color(0xFF6EE7B7) : const Color(0xFF047857),
                            ),
                          ),
                        ],
                      ),
                    ),
                    // Glowing Owner Avatar with Badge
                    Stack(
                      alignment: Alignment.bottomRight,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(3.5),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: const LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [Color(0xFF4F46E5), Color(0xFF0EA5E9), Color(0xFF6366F1)],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF4F46E5).withValues(alpha: 0.4),
                                blurRadius: 22,
                                offset: const Offset(0, 8),
                              ),
                            ],
                          ),
                          child: Container(
                            padding: const EdgeInsets.all(2.5),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isDark ? const Color(0xFF0F172A) : Colors.white,
                            ),
                            child: const CircleAvatar(
                              radius: 44,
                              backgroundColor: Color(0xFFEEF2FF),
                              backgroundImage: AssetImage('assets/owner.jpg'),
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0F172A),
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: isDark ? const Color(0xFF38BDF8) : Colors.white,
                              width: 2,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.25),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.cloud_done_rounded,
                            size: 14,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Welcome back, Noor',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        letterSpacing: -0.3,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Sheikh Noor Abdullah • Personal Cloud',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Enter your passcode to unlock NOOR DRIVE',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12.5,
                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (_error != null)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF881337).withValues(alpha: 0.35) : const Color(0xFFFFF1F2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isDark ? const Color(0xFFBE123C) : const Color(0xFFFECDD3),
                          ),
                        ),
                        child: Text(
                          _error!,
                          style: TextStyle(
                            color: isDark ? const Color(0xFFFDA4AF) : const Color(0xFFE11D48),
                            fontSize: 13,
                          ),
                        ),
                      ),
                    TextField(
                      controller: _requires2fa ? _totpController : _passcodeController,
                      obscureText: _requires2fa ? false : _obscurePasscode,
                      textAlign: TextAlign.center,
                      keyboardType: TextInputType.number,
                      style: TextStyle(
                        fontSize: 20,
                        letterSpacing: 6,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                      decoration: InputDecoration(
                        hintText: _requires2fa ? '000000' : '•••••',
                        hintStyle: TextStyle(
                          color: isDark ? const Color(0xFF475569) : const Color(0xFF94A3B8),
                        ),
                        filled: true,
                        fillColor: isDark ? const Color(0xFF131B2E) : const Color(0xFFF8FAFC),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: BorderSide(
                            color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: BorderSide(
                            color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                          ),
                        ),
                        focusedBorder: const OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(16)),
                          borderSide: BorderSide(color: Color(0xFF6366F1), width: 2),
                        ),
                        suffixIcon: !_requires2fa
                            ? IconButton(
                                icon: Icon(
                                  _obscurePasscode ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                                  color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                                  size: 20,
                                ),
                                onPressed: () => setState(() => _obscurePasscode = !_obscurePasscode),
                              )
                            : null,
                      ),
                      onSubmitted: (_) => _unlock(),
                    ),
                    if (_canUseBiometrics && !_requires2fa) ...[
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Checkbox(
                            value: _rememberForBiometrics,
                            activeColor: const Color(0xFF6366F1),
                            onChanged: (v) => setState(() => _rememberForBiometrics = v ?? true),
                          ),
                          Text(
                            'Save for Fingerprint Unlock',
                            style: TextStyle(
                              fontSize: 13,
                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        onPressed: _loading ? null : () => _unlock(),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF6366F1),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          elevation: 2,
                        ),
                        child: _loading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              )
                            : Text(
                                _requires2fa ? 'Verify & Unlock' : 'Unlock Drive',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                              ),
                      ),
                    ),
                    if (_canUseBiometrics && _hasSavedCredentials && !_requires2fa) ...[
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: OutlinedButton.icon(
                          onPressed: _loading ? null : _unlockWithBiometrics,
                          icon: const Icon(Icons.fingerprint, color: Color(0xFF6366F1)),
                          label: Text(
                            'Unlock with Fingerprint',
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5),
                            ),
                          ),
                          style: OutlinedButton.styleFrom(
                            side: BorderSide(
                              color: isDark ? const Color(0xFF312E81) : const Color(0xFFC7D2FE),
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    TextButton.icon(
                      onPressed: _showServerUrlDialog,
                      icon: Icon(
                        Icons.dns_outlined,
                        size: 14,
                        color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                      ),
                      label: Text(
                        'Server: ${Uri.tryParse(apiClient.currentBaseUrl)?.host ?? "Render Live"}',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showServerUrlDialog() async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final controller = TextEditingController(text: apiClient.currentBaseUrl);
    final newUrl = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(
            color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
          ),
        ),
        title: Text(
          'Server Configuration',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Select or enter backend API URL:',
              style: TextStyle(
                fontSize: 12,
                color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              decoration: InputDecoration(
                hintText: 'https://drive.noor.is-a.dev/api',
                filled: true,
                fillColor: isDark ? const Color(0xFF131B2E) : const Color(0xFFF8FAFC),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                    color: isDark ? const Color(0xFF1E293B) : const Color(0xFFCBD5E1),
                  ),
                ),
                isDense: true,
              ),
              style: TextStyle(
                fontSize: 13,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              children: [
                ActionChip(
                  backgroundColor: isDark ? const Color(0xFF1E1B4B) : const Color(0xFFEEF2FF),
                  label: Text(
                    'is-a.dev',
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5),
                    ),
                  ),
                  onPressed: () => controller.text = 'https://drive.noor.is-a.dev/api',
                ),
                ActionChip(
                  backgroundColor: isDark ? const Color(0xFF1E1B4B) : const Color(0xFFEEF2FF),
                  label: Text(
                    'Render',
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5),
                    ),
                  ),
                  onPressed: () => controller.text = 'https://noor-cloud-vault.onrender.com/api',
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(
              'Cancel',
              style: TextStyle(color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
            ),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6366F1),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (newUrl != null && newUrl.isNotEmpty) {
      await apiClient.setBaseUrl(newUrl);
      if (mounted) setState(() {});
    }
  }
}
