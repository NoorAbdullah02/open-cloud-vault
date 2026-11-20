'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Sparkles,
  Cloud,
  Moon,
  Sun,
  Eye,
  EyeOff,
} from 'lucide-react';
import * as THREE from 'three';
import gsap from 'gsap';
import { apiFetch, setStoredTokens } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const [passcode, setPasscode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [requires2fa, setRequires2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  // Initialize theme from document or localStorage
  useEffect(() => {
    const isDarkMode =
      document.documentElement.classList.contains('dark') ||
      localStorage.getItem('noor_dark_mode') === 'true' ||
      (!('noor_dark_mode' in localStorage) &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    setIsDark(isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('noor_dark_mode', String(next));
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Interactive 3D Three.js Particle Cloud & Constellation System
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.z = 90;

    // Create Cosmic Particle Cloud
    const particleCount = 280;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colorA = new THREE.Color(isDark ? 0x00f0ff : 0x2563eb); // Cyan / Blue
    const colorB = new THREE.Color(isDark ? 0x8b5cf6 : 0x4f46e5); // Purple / Indigo
    const colorC = new THREE.Color(isDark ? 0x38bdf8 : 0x06b6d4); // Sky / Cyan

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      // Spherical distribution
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 85;

      positions[idx] = r * Math.sin(phi) * Math.cos(theta);
      positions[idx + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[idx + 2] = r * Math.cos(phi);

      velocities[idx] = (Math.random() - 0.5) * 0.12;
      velocities[idx + 1] = (Math.random() - 0.5) * 0.12;
      velocities[idx + 2] = (Math.random() - 0.5) * 0.12;

      // Color blending
      const mixedColor = colorA.clone().lerp(colorB, Math.random()).lerp(colorC, Math.random() * 0.5);
      colors[idx] = mixedColor.r;
      colors[idx + 1] = mixedColor.g;
      colors[idx + 2] = mixedColor.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Circle texture for soft glowing points
    const canvasTexture = document.createElement('canvas');
    canvasTexture.width = 32;
    canvasTexture.height = 32;
    const ctx = canvasTexture.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.3, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.7, 'rgba(255,255,255,0.2)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
    }
    const pointTexture = new THREE.CanvasTexture(canvasTexture);

    const material = new THREE.PointsMaterial({
      size: 4.5,
      vertexColors: true,
      map: pointTexture,
      transparent: true,
      opacity: isDark ? 0.85 : 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Dynamic Connections (Constellation lines)
    const lineMaterial = new THREE.LineBasicMaterial({
      color: isDark ? 0x6366f1 : 0x3b82f6,
      transparent: true,
      opacity: isDark ? 0.22 : 0.12,
      blending: THREE.AdditiveBlending,
    });

    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(particleCount * particleCount * 3);
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    // Mouse Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const onMouseMove = (e: MouseEvent) => {
      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      mouseX = (e.clientX - halfW) / halfW;
      mouseY = (e.clientY - halfH) / halfH;
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', onResize);

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // Smooth camera interpolation
      targetX += (mouseX * 15 - targetX) * 0.05;
      targetY += (-mouseY * 15 - targetY) * 0.05;
      camera.position.x = targetX;
      camera.position.y = targetY;
      camera.lookAt(0, 0, 0);

      // Rotate particles
      particles.rotation.y += delta * 0.08;
      particles.rotation.x += delta * 0.04;
      lines.rotation.y = particles.rotation.y;
      lines.rotation.x = particles.rotation.x;

      // Update positions
      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      const posArr = posAttr.array as Float32Array;

      let lineIdx = 0;
      const maxConnectDist = 28;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        posArr[i3] += velocities[i3];
        posArr[i3 + 1] += velocities[i3 + 1];
        posArr[i3 + 2] += velocities[i3 + 2];

        // Bounds bounce
        const rBound = 90;
        if (Math.abs(posArr[i3]) > rBound) velocities[i3] *= -1;
        if (Math.abs(posArr[i3 + 1]) > rBound) velocities[i3 + 1] *= -1;
        if (Math.abs(posArr[i3 + 2]) > rBound) velocities[i3 + 2] *= -1;

        // Form constellation links
        for (let j = i + 1; j < particleCount; j++) {
          const j3 = j * 3;
          const dx = posArr[i3] - posArr[j3];
          const dy = posArr[i3 + 1] - posArr[j3 + 1];
          const dz = posArr[i3 + 2] - posArr[j3 + 2];
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq < maxConnectDist * maxConnectDist && lineIdx < 3000) {
            linePositions[lineIdx++] = posArr[i3];
            linePositions[lineIdx++] = posArr[i3 + 1];
            linePositions[lineIdx++] = posArr[i3 + 2];
            linePositions[lineIdx++] = posArr[j3];
            linePositions[lineIdx++] = posArr[j3 + 1];
            linePositions[lineIdx++] = posArr[j3 + 2];
          }
        }
      }

      posAttr.needsUpdate = true;
      lineGeometry.setDrawRange(0, lineIdx / 3);
      (lineGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      pointTexture.dispose();
      renderer.dispose();
    };
  }, [isDark]);

  // GSAP Smooth Entrance and Interactive Error Animation
  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 35, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 1.1, ease: 'power3.out' },
      );
    }
  }, []);

  useEffect(() => {
    if (error && cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { x: -12 },
        {
          x: 12,
          duration: 0.08,
          repeat: 5,
          yoyo: true,
          ease: 'power1.inOut',
          onComplete: () => {
            gsap.set(cardRef.current, { x: 0 });
          },
        },
      );
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch('/auth/passcode', {
        method: 'POST',
        body: JSON.stringify({
          passcode,
          totpCode: requires2fa ? totpCode : undefined,
          deviceName: typeof navigator !== 'undefined' ? navigator.platform : 'Web',
          platform: 'web',
        }),
      });

      if (res.requiresTwoFactor) {
        setRequires2fa(true);
        setLoading(false);
        return;
      }

      setStoredTokens(res.accessToken, res.refreshToken);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Incorrect passcode');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-[100dvh] flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-500 ${
        isDark ? 'bg-[#090D16] text-white' : 'bg-[#F4F6FB] text-slate-900'
      }`}
    >
      {/* Three.js 3D Background Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* Radiant Cosmic Aurora Glows */}
      <div
        className={`absolute -top-48 -left-48 w-96 h-96 rounded-full blur-[130px] pointer-events-none transition-opacity duration-700 ${
          isDark
            ? 'bg-gradient-to-br from-cyan-500/25 to-blue-600/20 opacity-80'
            : 'bg-gradient-to-br from-blue-300/40 to-indigo-300/30 opacity-70'
        }`}
      />
      <div
        className={`absolute -bottom-48 -right-48 w-96 h-96 rounded-full blur-[130px] pointer-events-none transition-opacity duration-700 ${
          isDark
            ? 'bg-gradient-to-tl from-purple-600/25 to-indigo-600/20 opacity-80'
            : 'bg-gradient-to-tl from-indigo-300/40 to-cyan-200/30 opacity-70'
        }`}
      />

      {/* Floating Theme Toggle (Top Right) */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        <button
          onClick={toggleTheme}
          type="button"
          aria-label="Toggle Dark Mode"
          className={`p-2.5 rounded-2xl border transition-all duration-300 backdrop-blur-xl shadow-lg active:scale-95 ${
            isDark
              ? 'bg-slate-900/80 border-slate-700/80 text-amber-400 hover:bg-slate-800'
              : 'bg-white/80 border-slate-200 text-slate-700 hover:bg-white'
          }`}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Glassmorphic Vault Login Card */}
      <div
        ref={cardRef}
        className={`w-full max-w-[420px] relative z-10 rounded-[36px] p-8 sm:p-10 transition-all duration-500 backdrop-blur-3xl border shadow-2xl ${
          isDark
            ? 'bg-slate-950/70 border-white/10 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/5'
            : 'bg-white/85 border-white/80 shadow-[0_32px_80px_-20px_rgba(15,23,42,0.12)] ring-1 ring-black/5'
        }`}
      >
        {/* Brand Bar */}
        <div className="flex items-center justify-between mb-8">
          <a
            href="/"
            className="flex items-center gap-3 cursor-pointer group"
            title="Go to NOOR DRIVE Root (/)"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-400 flex items-center justify-center shadow-md shadow-indigo-500/25 group-hover:scale-105 transition-transform">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight block">
                NOOR DRIVE
              </span>
              <span className="text-[10px] text-indigo-400 font-semibold tracking-wider uppercase block -mt-0.5">
                Cloud Vault
              </span>
            </div>
          </a>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors ${
              isDark
                ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/60'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" /> Private
          </span>
        </div>

        {/* Owner Avatar & Identity */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4 group">
            {/* Pulsing Gradient Aura */}
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-600 opacity-75 blur-md group-hover:opacity-100 transition-opacity animate-tilt" />

            <div
              className={`relative p-1 rounded-full border-2 ${
                isDark ? 'border-slate-800 bg-slate-900' : 'border-white bg-white'
              }`}
            >
              <img
                src="/owner.jpg"
                alt="Sheikh Noor Abdullah"
                className="w-20 h-20 rounded-full object-cover object-top shadow-xl ring-2 ring-indigo-500/30"
              />
            </div>
            <div
              className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-md ${
                isDark
                  ? 'bg-gradient-to-tr from-indigo-600 to-cyan-500 border-slate-950 text-white'
                  : 'bg-gradient-to-tr from-slate-900 to-indigo-700 border-white text-white'
              }`}
              title="Verified Security Shield"
            >
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
            Welcome back, Noor
          </h1>
          <p
            className={`text-xs sm:text-sm mt-1.5 max-w-[280px] leading-relaxed ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Enter your personal passcode to access your cloud ecosystem
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 text-xs font-semibold flex items-center gap-2.5 animate-shake">
            <Lock className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!requires2fa ? (
            <div>
              <div className="relative">
                <KeyRound
                  className={`w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                />
                <input
                  type={showPasscode ? 'text' : 'password'}
                  required
                  autoFocus
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="•••••"
                  className={`w-full pl-11 pr-12 py-3.5 rounded-2xl text-center text-lg font-mono font-bold tracking-[0.45em] border transition-all duration-200 outline-none ${
                    isDark
                      ? 'bg-slate-900/80 border-slate-800 text-white placeholder-slate-600 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/15'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/15'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode(!showPasscode)}
                  className={`absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${
                    isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'
                  }`}
                  tabIndex={-1}
                >
                  {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label
                className={`block text-[11px] font-bold uppercase tracking-wider mb-2 text-center ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Two-Factor Code (6 Digits)
              </label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  maxLength={6}
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="000000"
                  className={`w-full pl-11 pr-4 py-3.5 rounded-2xl text-center text-lg font-mono font-bold tracking-widest border transition-all duration-200 outline-none ${
                    isDark
                      ? 'bg-slate-900/80 border-slate-800 text-white placeholder-slate-600 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/15'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/15'
                  }`}
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:via-indigo-500 hover:to-cyan-400 shadow-[0_12px_30px_-8px_rgba(79,70,229,0.5)] flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{requires2fa ? 'Verify & Unlock' : 'Unlock Noor Cloud'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Meta */}
        <div
          className={`mt-7 pt-5 border-t text-center text-[11px] font-medium flex items-center justify-center gap-1.5 ${
            isDark ? 'border-slate-800/80 text-slate-500' : 'border-slate-100 text-slate-400'
          }`}
        >
          <Lock className="w-3 h-3 text-cyan-500" />
          <span>Sheikh Noor Abdullah • End-to-End Encrypted Cloud</span>
        </div>
      </div>
    </div>
  );
}
