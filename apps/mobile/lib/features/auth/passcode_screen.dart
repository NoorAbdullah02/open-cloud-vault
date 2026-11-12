import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';
import '../../core/api_client.dart';

class PasscodeScreen extends StatefulWidget {
  const PasscodeScreen({super.key});

  @override
  State<PasscodeScreen> createState() => _PasscodeScreenState();
}

class _PasscodeScreenState extends State<PasscodeScreen> {
  final _passcodeController = TextEditingController();
  final _totpController = TextEditingController();
  final _localAuth = LocalAuthentication();
  bool _requires2fa = false;
  bool _loading = false;
  bool _canUseBiometrics = false;
  bool _hasSavedCredentials = false;
  bool _rememberForBiometrics = true;
  String? _error;

  @override
  void initState() {
    super.initState();
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
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 380),
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: const Color(0xFFE2E8F0)),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF0F172A).withOpacity(0.06),
                  blurRadius: 30,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: [Color(0xFF4F46E5), Color(0xFF0EA5E9)],
                    ),
                  ),
                  child: const CircleAvatar(
                    radius: 40,
                    backgroundImage: AssetImage('assets/app_icon.png'),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'NOOR DRIVE',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Enter your passcode to unlock NOOR DRIVE',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                ),
                const SizedBox(height: 24),
                if (_error != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF1F2),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFFECDD3)),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Color(0xFFE11D48), fontSize: 13),
                    ),
                  ),
                TextField(
                  controller: _requires2fa ? _totpController : _passcodeController,
                  obscureText: !_requires2fa,
                  textAlign: TextAlign.center,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(
                    fontSize: 20,
                    letterSpacing: 6,
                    fontWeight: FontWeight.w600,
                  ),
                  decoration: InputDecoration(
                    hintText: _requires2fa ? '000000' : '•••••',
                    filled: true,
                    fillColor: const Color(0xFFF8FAFC),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                    ),
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
                        onChanged: (v) => setState(() => _rememberForBiometrics = v ?? true),
                      ),
                      const Text(
                        'Save for Fingerprint Unlock',
                        style: TextStyle(fontSize: 13, color: Color(0xFF475569)),
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
                      backgroundColor: const Color(0xFF4F46E5),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                          )
                        : Text(
                            _requires2fa ? 'Verify & Unlock' : 'Unlock Drive',
                            style: const TextStyle(fontWeight: FontWeight.w600),
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
                      icon: const Icon(Icons.fingerprint, color: Color(0xFF4F46E5)),
                      label: const Text(
                        'Unlock with Fingerprint',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF4F46E5),
                        ),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Color(0xFFC7D2FE)),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

