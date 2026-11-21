'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeConstellationBackgroundProps {
  isDark: boolean;
  opacity?: number;
}

export default function ThreeConstellationBackground({
  isDark,
  opacity = 0.35,
}: ThreeConstellationBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    } catch {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / (canvas.clientHeight || 1),
      0.1,
      1000,
    );
    camera.position.z = 240;

    const count = 90;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const colorA = new THREE.Color(isDark ? 0x00f0ff : 0x4f46e5);
    const colorB = new THREE.Color(isDark ? 0xa855f7 : 0x0ea5e9);
    const colorC = new THREE.Color(isDark ? 0x38bdf8 : 0x7c3aed);
    const palette = [colorA, colorB, colorC];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 320;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 260;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 220;

      velocities[i * 3] = (Math.random() - 0.5) * 0.35;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.35;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.35;

      const c = palette[i % palette.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle texture
    const canvasTexture = document.createElement('canvas');
    canvasTexture.width = 32;
    canvasTexture.height = 32;
    const ctx = canvasTexture.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.3, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
    }
    const pointTexture = new THREE.CanvasTexture(canvasTexture);

    const material = new THREE.PointsMaterial({
      size: isDark ? 6.5 : 5.5,
      map: pointTexture,
      transparent: true,
      vertexColors: true,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    const pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);

    // Network Lines
    const maxLineConnections = 250;
    const linePositions = new Float32Array(maxLineConnections * 6);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(linePositions, 3),
    );

    const lineMaterial = new THREE.LineBasicMaterial({
      color: isDark ? 0x00f0ff : 0x4f46e5,
      transparent: true,
      opacity: isDark ? 0.3 : 0.18,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const onMouseMove = (e: MouseEvent) => {
      targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    const handleResize = () => {
      if (!canvas || !renderer) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      pointCloud.rotation.y += 0.05 * delta;
      pointCloud.rotation.x = mouseY * 0.2;
      pointCloud.rotation.y += mouseX * 0.2;

      lines.rotation.copy(pointCloud.rotation);

      const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
      const posArr = pos.array as Float32Array;

      for (let i = 0; i < count; i++) {
        posArr[i * 3] += velocities[i * 3];
        posArr[i * 3 + 1] += velocities[i * 3 + 1];
        posArr[i * 3 + 2] += velocities[i * 3 + 2];

        if (Math.abs(posArr[i * 3]) > 170) velocities[i * 3] *= -1;
        if (Math.abs(posArr[i * 3 + 1]) > 140) velocities[i * 3 + 1] *= -1;
        if (Math.abs(posArr[i * 3 + 2]) > 120) velocities[i * 3 + 2] *= -1;
      }
      pos.needsUpdate = true;

      // Update Constellation Links
      let lineIndex = 0;
      const maxDist = 58;
      const maxDistSq = maxDist * maxDist;

      for (let i = 0; i < count && lineIndex < maxLineConnections; i++) {
        const x1 = posArr[i * 3];
        const y1 = posArr[i * 3 + 1];
        const z1 = posArr[i * 3 + 2];

        for (let j = i + 1; j < count && lineIndex < maxLineConnections; j++) {
          const dx = x1 - posArr[j * 3];
          const dy = y1 - posArr[j * 3 + 1];
          const dz = z1 - posArr[j * 3 + 2];
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq < maxDistSq) {
            linePositions[lineIndex * 6] = x1;
            linePositions[lineIndex * 6 + 1] = y1;
            linePositions[lineIndex * 6 + 2] = z1;
            linePositions[lineIndex * 6 + 3] = posArr[j * 3];
            linePositions[lineIndex * 6 + 4] = posArr[j * 3 + 1];
            linePositions[lineIndex * 6 + 5] = posArr[j * 3 + 2];
            lineIndex++;
          }
        }
      }

      for (let k = lineIndex * 6; k < maxLineConnections * 6; k++) {
        linePositions[k] = 0;
      }
      (lineGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', handleResize);
      geometry.dispose();
      material.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      pointTexture.dispose();
      renderer?.dispose();
    };
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      style={{ opacity }}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}
