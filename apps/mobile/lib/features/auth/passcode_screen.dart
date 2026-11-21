import 'dart:io';
import 'dart:math';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';
import '../../core/api_client.dart';
import '../../main.dart';

class _Particle3D {
  double x, y, z;
  double vx, vy, vz;
  double radius;
  Color color;

  _Particle3D({
    required this.x,
    required this.y,
    required this.z,
    required this.vx,
    required this.vy,
    required this.vz,
    required this.radius,
    required this.color,
  });
}

class PasscodeScreen extends ConsumerStatefulWidget {
  const PasscodeScreen({super.key});

  @override
  ConsumerState<PasscodeScreen> createState() => _PasscodeScreenState();
}

class _PasscodeScreenState extends ConsumerState<PasscodeScreen>
    with TickerProviderStateMixin {
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

  // 3D Constellation & GSAP Animation Controllers
  late AnimationController _particleController;
  late AnimationController _entranceController;
  late Animation<double> _entranceAnimation;
  late AnimationController _shakeController;
  late AnimationController _pulseController;

  // Mouse / Pointer Parallax Tracking
  Offset _currentMouse = Offset.zero;
  Offset _targetMouse = Offset.zero;

  // 3D Particles
  final List<_Particle3D> _particles = [];
  final Random _rand = Random();

  @override
  void initState() {
    super.initState();
    _initParticles();

    // 1. Continuous 3D Particle movement (60/120fpsSkia hardware accelerated)
    _particleController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 20),
    )..addListener(() {
        _tickParticles();
      })..repeat();

    // 2. GSAP-style power3.out smooth card entrance animation
    _entranceController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
    _entranceAnimation = CurvedAnimation(
      parent: _entranceController,
      curve: Curves.easeOutCubic,
    );
    _entranceController.forward();

    // 3. GSAP-style spring error shake controller
    _shakeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 450),
    );

    // 4. Floating glowing aura breathing pulse
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat(reverse: true);

    apiClient.initCustomUrl().then((_) {
      if (mounted) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initBiometrics();
    });
  }

  void _initParticles() {
    _particles.clear();
    const count = 130;
    final darkColors = [
      const Color(0xFF00F0FF), // Neon Cyan
      const Color(0xFF8B5CF6), // Neon Purple
      const Color(0xFF38BDF8), // Sky Blue
      const Color(0xFF6366F1), // Electric Indigo
    ];

    for (int i = 0; i < count; i++) {
      final u = _rand.nextDouble();
      final v = _rand.nextDouble();
      final theta = u * 2.0 * pi;
      final phi = acos(2.0 * v - 1.0);
      final r = pow(_rand.nextDouble(), 1 / 3) * 140.0;

      _particles.add(
        _Particle3D(
          x: r * sin(phi) * cos(theta),
          y: r * sin(phi) * sin(theta),
          z: r * cos(phi),
          vx: (_rand.nextDouble() - 0.5) * 0.35,
          vy: (_rand.nextDouble() - 0.5) * 0.35,
          vz: (_rand.nextDouble() - 0.5) * 0.35,
          radius: _rand.nextDouble() * 2.2 + 1.2,
          color: darkColors[_rand.nextInt(darkColors.length)],
        ),
      );
    }
  }

  void _tickParticles() {
    for (final p in _particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;

      // Soft spherical bounce
      const bound = 145.0;
      if (p.x.abs() > bound) p.vx *= -1;
      if (p.y.abs() > bound) p.vy *= -1;
      if (p.z.abs() > bound) p.vz *= -1;
    }

    // Smooth lerp mouse parallax
    _currentMouse = Offset.lerp(_currentMouse, _targetMouse, 0.05) ?? _targetMouse;
  }

  @override
  void dispose() {
    _particleController.dispose();
    _entranceController.dispose();
    _shakeController.dispose();
    _pulseController.dispose();
    _passcodeController.dispose();
    _totpController.dispose();
    super.dispose();
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
        _shakeController.forward(from: 0.0);
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
      // GSAP-like spring error shake
      _shakeController.forward(from: 0.0);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF070B14) : const Color(0xFFF3F5FA),
      body: MouseRegion(
        onHover: (event) {
          _targetMouse = event.position;
        },
        child: Listener(
          onPointerMove: (event) {
            _targetMouse = event.position;
          },
          child: Stack(
            children: [
              // 1. Cosmic Aurora Radial Nebula Glows (Three.js Style)
              Positioned(
                top: -120,
                left: -120,
                child: AnimatedBuilder(
                  animation: _pulseController,
                  builder: (context, _) {
                    final scale = 1.0 + _pulseController.value * 0.15;
                    return Transform.scale(
                      scale: scale,
                      child: Container(
                        width: 360,
                        height: 360,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            colors: isDark
                                ? [
                                    const Color(0xFF00F0FF).withValues(alpha: 0.22),
                                    const Color(0xFF2563EB).withValues(alpha: 0.12),
                                    Colors.transparent,
                                  ]
                                : [
                                    const Color(0xFF38BDF8).withValues(alpha: 0.35),
                                    const Color(0xFF818CF8).withValues(alpha: 0.15),
                                    Colors.transparent,
                                  ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              Positioned(
                bottom: -120,
                right: -120,
                child: AnimatedBuilder(
                  animation: _pulseController,
                  builder: (context, _) {
                    final scale = 1.0 + (1.0 - _pulseController.value) * 0.15;
                    return Transform.scale(
                      scale: scale,
                      child: Container(
                        width: 380,
                        height: 380,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            colors: isDark
                                ? [
                                    const Color(0xFF8B5CF6).withValues(alpha: 0.22),
                                    const Color(0xFF4F46E5).withValues(alpha: 0.12),
                                    Colors.transparent,
                                  ]
                                : [
                                    const Color(0xFF818CF8).withValues(alpha: 0.35),
                                    const Color(0xFF06B6D4).withValues(alpha: 0.12),
                                    Colors.transparent,
                                  ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),

              // 2. Interactive 3D Three.js WebGL Constellation Canvas
              Positioned.fill(
                child: AnimatedBuilder(
                  animation: _particleController,
                  builder: (context, child) {
                    return CustomPaint(
                      painter: _Constellation3DPainter(
                        particles: _particles,
                        rotation: _particleController.value * 2.0 * pi,
                        mouseOffset: _currentMouse,
                        screenSize: size,
                        isDark: isDark,
                      ),
                    );
                  },
                ),
              ),

              // 3. Top theme toggle (Sun / Moon)
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
                        color: isDark ? const Color(0xFF0F172A).withValues(alpha: 0.8) : Colors.white.withValues(alpha: 0.8),
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

              // 4. Main Glassmorphic Vault Login Card with GSAP-like Physics
              Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: AnimatedBuilder(
                    animation: Listenable.merge([_entranceAnimation, _shakeController]),
                    builder: (context, child) {
                      // GSAP Power3.out entrance (scale + translation + fade)
                      final entranceVal = _entranceAnimation.value;
                      final translateY = (1.0 - entranceVal) * 35.0;
                      final scale = 0.94 + entranceVal * 0.06;

                      // GSAP spring error shake (damped sine wave)
                      final shakeVal = _shakeController.value;
                      final shakeOffset = shakeVal > 0
                          ? sin(shakeVal * pi * 8) * (1.0 - shakeVal) * 14.0
                          : 0.0;

                      return Transform.translate(
                        offset: Offset(shakeOffset, translateY),
                        child: Transform.scale(
                          scale: scale,
                          child: Opacity(
                            opacity: entranceVal.clamp(0.0, 1.0),
                            child: child,
                          ),
                        ),
                      );
                    },
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(32),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                        child: Container(
                          constraints: const BoxConstraints(maxWidth: 400),
                          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 36),
                          decoration: BoxDecoration(
                            color: isDark
                                ? const Color(0xFF0F172A).withValues(alpha: 0.82)
                                : Colors.white.withValues(alpha: 0.86),
                            borderRadius: BorderRadius.circular(32),
                            border: Border.all(
                              color: isDark
                                  ? const Color(0xFF1E293B).withValues(alpha: 0.8)
                                  : Colors.white.withValues(alpha: 0.9),
                              width: 1.5,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: isDark
                                    ? Colors.black.withValues(alpha: 0.6)
                                    : const Color(0xFF4F46E5).withValues(alpha: 0.1),
                                blurRadius: 40,
                                offset: const Offset(0, 20),
                              ),
                            ],
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Top Private Cloud Vault Badge
                              Container(
                                margin: const EdgeInsets.only(bottom: 20),
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                                decoration: BoxDecoration(
                                  color: isDark
                                      ? const Color(0xFF064E3B).withValues(alpha: 0.45)
                                      : const Color(0xFFECFDF5),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(
                                    color: isDark ? const Color(0xFF059669) : const Color(0xFFA7F3D0),
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
                                    const SizedBox(width: 6),
                                    Text(
                                      'PRIVATE CLOUD VAULT',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 0.9,
                                        color: isDark ? const Color(0xFF6EE7B7) : const Color(0xFF047857),
                                      ),
                                    ),
                                  ],
                                ),
                              ),

                              // Floating Breathing Aura around Sheikh Noor Abdullah Owner Portrait
                              AnimatedBuilder(
                                animation: _pulseController,
                                builder: (context, child) {
                                  final pulse = _pulseController.value;
                                  return Stack(
                                    alignment: Alignment.bottomRight,
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.all(3.5),
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          gradient: SweepGradient(
                                            transform: GradientRotation(pulse * 2.0 * pi),
                                            colors: isDark
                                                ? const [
                                                    Color(0xFF00F0FF),
                                                    Color(0xFF8B5CF6),
                                                    Color(0xFF6366F1),
                                                    Color(0xFF00F0FF),
                                                  ]
                                                : const [
                                                    Color(0xFF2563EB),
                                                    Color(0xFF0EA5E9),
                                                    Color(0xFF8B5CF6),
                                                    Color(0xFF2563EB),
                                                  ],
                                          ),
                                          boxShadow: [
                                            BoxShadow(
                                              color: (isDark
                                                      ? const Color(0xFF00F0FF)
                                                      : const Color(0xFF4F46E5))
                                                  .withValues(alpha: 0.35 + pulse * 0.15),
                                              blurRadius: 24,
                                              spreadRadius: 2,
                                            ),
                                          ],
                                        ),
                                        child: Container(
                                          padding: const EdgeInsets.all(3),
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: isDark ? const Color(0xFF0F172A) : Colors.white,
                                          ),
                                          child: const CircleAvatar(
                                            radius: 46,
                                            backgroundColor: Color(0xFFEEF2FF),
                                            backgroundImage: AssetImage('assets/owner.jpg'),
                                          ),
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.all(6),
                                        decoration: BoxDecoration(
                                          color: isDark ? const Color(0xFF0F172A) : const Color(0xFF1E293B),
                                          shape: BoxShape.circle,
                                          border: Border.all(
                                            color: isDark ? const Color(0xFF00F0FF) : Colors.white,
                                            width: 2,
                                          ),
                                          boxShadow: [
                                            BoxShadow(
                                              color: Colors.black.withValues(alpha: 0.3),
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
                                  );
                                },
                              ),

                              const SizedBox(height: 18),
                              Text(
                                'Welcome back, Noor',
                                style: TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: -0.3,
                                  color: isDark ? Colors.white : const Color(0xFF0F172A),
                                ),
                              ),
                              const SizedBox(height: 5),
                              Text(
                                'Sheikh Noor Abdullah • Personal Cloud',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? const Color(0xFF38BDF8) : const Color(0xFF4F46E5),
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
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                  margin: const EdgeInsets.only(bottom: 16),
                                  decoration: BoxDecoration(
                                    color: isDark
                                        ? const Color(0xFF881337).withValues(alpha: 0.4)
                                        : const Color(0xFFFFF1F2),
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                      color: isDark ? const Color(0xFFBE123C) : const Color(0xFFFECDD3),
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.error_outline_rounded, size: 16, color: Color(0xFFF43F5E)),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          _error!,
                                          style: TextStyle(
                                            color: isDark ? const Color(0xFFFDA4AF) : const Color(0xFFE11D48),
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),

                              // Passcode Input Field
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
                                  fillColor: isDark
                                      ? const Color(0xFF131B2E).withValues(alpha: 0.9)
                                      : const Color(0xFFF8FAFC),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(18),
                                    borderSide: BorderSide(
                                      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                                    ),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(18),
                                    borderSide: BorderSide(
                                      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                                    ),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(18),
                                    borderSide: BorderSide(
                                      color: isDark ? const Color(0xFF00F0FF) : const Color(0xFF6366F1),
                                      width: 2,
                                    ),
                                  ),
                                  suffixIcon: !_requires2fa
                                      ? IconButton(
                                          icon: Icon(
                                            _obscurePasscode
                                                ? Icons.visibility_off_rounded
                                                : Icons.visibility_rounded,
                                            color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                                            size: 20,
                                          ),
                                          onPressed: () =>
                                              setState(() => _obscurePasscode = !_obscurePasscode),
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
                                      activeColor: isDark ? const Color(0xFF00F0FF) : const Color(0xFF6366F1),
                                      onChanged: (v) =>
                                          setState(() => _rememberForBiometrics = v ?? true),
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

                              const SizedBox(height: 18),
                              // Glowing Gradient Unlock Button
                              Container(
                                width: double.infinity,
                                height: 50,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(16),
                                  gradient: LinearGradient(
                                    colors: isDark
                                        ? const [Color(0xFF2563EB), Color(0xFF4F46E5), Color(0xFF06B6D4)]
                                        : const [Color(0xFF4F46E5), Color(0xFF6366F1), Color(0xFF38BDF8)],
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFF4F46E5).withValues(alpha: 0.35),
                                      blurRadius: 18,
                                      offset: const Offset(0, 6),
                                    ),
                                  ],
                                ),
                                child: ElevatedButton(
                                  onPressed: _loading ? null : () => _unlock(),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.transparent,
                                    shadowColor: Colors.transparent,
                                    foregroundColor: Colors.white,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                  child: _loading
                                      ? const SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(
                                            color: Colors.white,
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : Text(
                                          _requires2fa ? 'Verify & Unlock' : 'Unlock Drive',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 15,
                                            letterSpacing: 0.3,
                                          ),
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
                                    icon: Icon(
                                      Icons.fingerprint_rounded,
                                      color: isDark ? const Color(0xFF00F0FF) : const Color(0xFF4F46E5),
                                    ),
                                    label: Text(
                                      'Unlock with Fingerprint',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        color: isDark ? const Color(0xFF38BDF8) : const Color(0xFF4F46E5),
                                      ),
                                    ),
                                    style: OutlinedButton.styleFrom(
                                      side: BorderSide(
                                        color: isDark
                                            ? const Color(0xFF00F0FF).withValues(alpha: 0.4)
                                            : const Color(0xFFC7D2FE),
                                      ),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(16),
                                      ),
                                    ),
                                  ),
                                ),
                              ],

                              const SizedBox(height: 18),
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
                  ),
                ),
              ),
            ],
          ),
        ),
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

/// Native Skia 3D Constellation & Celestial Star System (Three.js WebGL Equivalent)
class _Constellation3DPainter extends CustomPainter {
  final List<_Particle3D> particles;
  final double rotation;
  final Offset mouseOffset;
  final Size screenSize;
  final bool isDark;

  _Constellation3DPainter({
    required this.particles,
    required this.rotation,
    required this.mouseOffset,
    required this.screenSize,
    required this.isDark,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (size.width == 0 || size.height == 0) return;

    final center = Offset(size.width / 2, size.height / 2);

    // Mouse parallax rotation angles
    final mouseNormX = (mouseOffset.dx / (size.width > 0 ? size.width : 1) - 0.5).clamp(-0.5, 0.5);
    final mouseNormY = (mouseOffset.dy / (size.height > 0 ? size.height : 1) - 0.5).clamp(-0.5, 0.5);

    final thetaY = rotation * 0.4 + mouseNormX * 0.8;
    final thetaX = mouseNormY * 0.8;

    final cosY = cos(thetaY);
    final sinY = sin(thetaY);
    final cosX = cos(thetaX);
    final sinX = sin(thetaX);

    final projected = <Offset>[];
    final scales = <double>[];
    const fov = 340.0;
    final maxSpread = min(size.width, size.height) * 0.48;

    // 1. Calculate 3D perspective projection for every particle
    for (int i = 0; i < particles.length; i++) {
      final p = particles[i];

      // Y-axis rotation
      final x1 = p.x * cosY - p.z * sinY;
      final z1 = p.x * sinY + p.z * cosY;

      // X-axis rotation
      final y2 = p.y * cosX - z1 * sinX;
      final z2 = p.y * sinX + z1 * cosX;

      final scale = fov / (fov + z2 + 180.0);
      scales.add(scale);

      final screenX = center.dx + (x1 / 140.0) * maxSpread * scale * 1.5;
      final screenY = center.dy + (y2 / 140.0) * maxSpread * scale * 1.5;

      projected.add(Offset(screenX, screenY));
    }

    // 2. Draw Constellation Network Links between nearby nodes
    final linePaint = Paint()
      ..strokeWidth = 0.9
      ..isAntiAlias = true;

    const maxLinkDist = 80.0;
    const maxLinkDistSq = maxLinkDist * maxLinkDist;

    for (int i = 0; i < projected.length; i++) {
      final p1 = projected[i];
      for (int j = i + 1; j < projected.length; j++) {
        final p2 = projected[j];
        final dx = p1.dx - p2.dx;
        final dy = p1.dy - p2.dy;
        final distSq = dx * dx + dy * dy;

        if (distSq < maxLinkDistSq) {
          final dist = sqrt(distSq);
          final alpha = (1.0 - dist / maxLinkDist) * (isDark ? 0.32 : 0.22);
          final lineColor = isDark ? const Color(0xFF00F0FF) : const Color(0xFF4F46E5);

          linePaint.color = lineColor.withValues(alpha: alpha.clamp(0.0, 1.0));
          canvas.drawLine(p1, p2, linePaint);
        }
      }
    }

    // 3. Draw Celestial Star Nodes with Radial Halo Glow
    final corePaint = Paint()..isAntiAlias = true;
    final haloPaint = Paint()..isAntiAlias = true;

    for (int i = 0; i < projected.length; i++) {
      final proj = projected[i];
      final p = particles[i];
      final scale = scales[i];
      final radius = p.radius * scale;

      // Outer ethereal glow
      haloPaint.color = p.color.withValues(alpha: isDark ? 0.35 : 0.2);
      canvas.drawCircle(proj, radius * 2.5, haloPaint);

      // Core particle
      corePaint.color = isDark ? Colors.white : p.color;
      canvas.drawCircle(proj, radius, corePaint);
    }
  }

  @override
  bool shouldRepaint(covariant _Constellation3DPainter oldDelegate) {
    return true; // Continuously animated at native display refresh rate
  }
}
