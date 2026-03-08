'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';

interface LiveAudioWaveformProps {
  peaks: number[];
  isRecording: boolean;
  title: string;
  description: string;
  statusLabel: string;
}

const BAR_WIDTH = 4;
const BAR_GAP = 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function LiveAudioWaveform({
  peaks,
  isRecording,
  title,
  description,
  statusLabel,
}: LiveAudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [baseWidth, setBaseWidth] = useState(640);
  const canvasWidth = Math.max(baseWidth, peaks.length * (BAR_WIDTH + BAR_GAP));

  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 640;
      setBaseWidth(Math.max(320, Math.floor(nextWidth)));
    });

    observer.observe(scrollArea);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const height = 192;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);
    context.clearRect(0, 0, canvasWidth, height);
    context.fillStyle = 'rgba(255,255,255,0.03)';
    context.fillRect(0, 0, canvasWidth, height);

    context.strokeStyle = 'rgba(255,255,255,0.08)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(canvasWidth, height / 2);
    context.stroke();

    if (!peaks.length) {
      const segments = Math.max(12, Math.floor(canvasWidth / 48));
      context.strokeStyle = 'rgba(136,136,160,0.4)';
      context.lineWidth = 2;
      context.beginPath();

      for (let index = 0; index <= segments; index += 1) {
        const x = (index / segments) * canvasWidth;
        const y =
          height / 2 +
          Math.sin(index * 0.46) * height * 0.06 +
          Math.sin(index * 0.18) * height * 0.02;

        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      context.stroke();
      return;
    }

    const color = isRecording ? 'rgba(0,229,255,0.95)' : 'rgba(136,136,160,0.85)';
    for (let index = 0; index < peaks.length; index += 1) {
      const peak = clamp(peaks[index], 0.02, 1);
      const barHeight = Math.max(10, peak * height * 0.82);
      const x = index * (BAR_WIDTH + BAR_GAP);
      const y = height / 2 - barHeight / 2;
      context.fillStyle = color;
      context.fillRect(x, y, BAR_WIDTH, barHeight);
    }
  }, [canvasWidth, isRecording, peaks]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const scrollArea = scrollRef.current;
    if (!scrollArea) {
      return;
    }

    scrollArea.scrollTo({
      left: Math.max(scrollArea.scrollWidth - scrollArea.clientWidth, 0),
      behavior: 'smooth',
    });
  }, [canvasWidth, isRecording, peaks.length]);

  return (
    <div className="rounded-xl border border-border bg-base-elevated p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-base-subtle text-accent">
          <Mic size={20} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-ink-muted">{description}</p>
        </div>
      </div>

      <div ref={scrollRef} className="mt-4 overflow-x-auto rounded-xl border border-border bg-base-subtle/70">
        <canvas ref={canvasRef} data-testid="live-audio-waveform" className="block h-48 min-w-full" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span
          className={`badge border ${
            isRecording ? 'border-prime/30 bg-prime/10 text-prime' : 'border-border bg-base-subtle text-ink-muted'
          }`}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
