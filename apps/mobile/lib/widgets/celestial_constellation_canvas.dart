import 'dart:math';
import 'package:flutter/material.dart';

/// 3D Particle Model for Skia Hardware Accelerated Graphics
class Particle3D {
  double x;
  double y;
  double z;
  double vx;
  double vy;
  double vz;
  double radius;
  Color color;

  Particle3D({
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

/// Shared Native 3D Interactive Constellation & Celestial Canvas
/// Works across Web, Linux, macOS, Windows, Android, and iOS.
class CelestialConstellationCanvas extends StatefulWidget {
  final bool isDark;
  final double opacity;
  final int particleCount;
  final bool interactive;

  const CelestialConstellationCanvas({
    super.key,
    required this.isDark,
    this.opacity = 0.45,
    this.particleCount = 65,
    this.interactive = true,
  });

  @override
  State<CelestialConstellationCanvas> createState() => _CelestialConstellationCanvasState();
}

class _CelestialConstellationCanvasState extends State<CelestialConstellationCanvas>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  final List<Particle3D> _particles = [];
  Offset _currentMouse = Offset.zero;
  Offset _targetMouse = Offset.zero;

  @override
  void initState() {
    super.initState();
    _initParticles();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 24),
    )..addListener(() {
        _tick();
      })..repeat();
  }

  @override
  void didUpdateWidget(covariant CelestialConstellationCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isDark != widget.isDark) {
      _initParticles();
    }
  }

  void _initParticles() {
    _particles.clear();
    final rng = Random();

    final darkColors = [
      const Color(0xFF00F0FF), // Neon Cyan
      const Color(0xFF8B5CF6), // Neon Purple
      const Color(0xFF38BDF8), // Sky Blue
      const Color(0xFF6366F1), // Electric Indigo
    ];

    final lightColors = [
      const Color(0xFF4F46E5), // Indigo
      const Color(0xFF0284C7), // Sky Blue
      const Color(0xFF7C3AED), // Violet
      const Color(0xFF2563EB), // Royal Blue
    ];

    final palette = widget.isDark ? darkColors : lightColors;

    for (int i = 0; i < widget.particleCount; i++) {
      _particles.add(
        Particle3D(
          x: (rng.nextDouble() - 0.5) * 280.0,
          y: (rng.nextDouble() - 0.5) * 280.0,
          z: (rng.nextDouble() - 0.5) * 280.0,
          vx: (rng.nextDouble() - 0.5) * 0.45,
          vy: (rng.nextDouble() - 0.5) * 0.45,
          vz: (rng.nextDouble() - 0.5) * 0.45,
          radius: 1.5 + rng.nextDouble() * 2.2,
          color: palette[rng.nextInt(palette.length)],
        ),
      );
    }
  }

  void _tick() {
    if (!mounted) return;

    // Smooth mouse parallax easing
    if (widget.interactive) {
      _currentMouse = Offset(
        _currentMouse.dx + (_targetMouse.dx - _currentMouse.dx) * 0.05,
        _currentMouse.dy + (_targetMouse.dy - _currentMouse.dy) * 0.05,
      );
    }

    for (final p in _particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;

      // Soft bounding sphere bounce
      if (p.x.abs() > 140) p.vx *= -1;
      if (p.y.abs() > 140) p.vy *= -1;
      if (p.z.abs() > 140) p.vz *= -1;
    }
    setState(() {});
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    Widget child = Opacity(
      opacity: widget.opacity.clamp(0.0, 1.0),
      child: CustomPaint(
        size: Size.infinite,
        painter: _Constellation3DPainter(
          particles: _particles,
          rotation: _controller.value * 2.0 * pi,
          mouseOffset: _currentMouse,
          screenSize: size,
          isDark: widget.isDark,
        ),
      ),
    );

    if (widget.interactive) {
      child = MouseRegion(
        onHover: (event) => _targetMouse = event.position,
        child: Listener(
          onPointerMove: (event) => _targetMouse = event.position,
          child: child,
        ),
      );
    }

    return IgnorePointer(child: child);
  }
}

class _Constellation3DPainter extends CustomPainter {
  final List<Particle3D> particles;
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

    // 1. Calculate 3D perspective projection
    for (int i = 0; i < particles.length; i++) {
      final p = particles[i];

      final x1 = p.x * cosY - p.z * sinY;
      final z1 = p.x * sinY + p.z * cosY;

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

      haloPaint.color = p.color.withValues(alpha: isDark ? 0.35 : 0.2);
      canvas.drawCircle(proj, radius * 2.5, haloPaint);

      corePaint.color = isDark ? Colors.white : p.color;
      canvas.drawCircle(proj, radius, corePaint);
    }
  }

  @override
  bool shouldRepaint(covariant _Constellation3DPainter oldDelegate) {
    return true;
  }
}
