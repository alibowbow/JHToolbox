'use client';

import { useEffect, useRef } from 'react';
import { Mic } from 'lucide-react';

interface LiveAudioWaveformProps {
  stream: MediaStream | null;
  isRecording: boolean;
  title: string;
  description: string;
  statusLabel: string;
}

export function LiveAudioWaveform({
  stream,
  isRecording,
  title,
  description,
  statusLabel,
}: LiveAudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || 640;
      const height = canvas.clientHeight || 192;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
      return { width, height };
    };

    const drawFrame = (samples?: Uint8Array) => {
      const { width, height } = resizeCanvas();
      context.clearRect(0, 0, width, height);
      context.fillStyle = 'rgba(255,255,255,0.03)';
      context.fillRect(0, 0, width, height);

      context.strokeStyle = 'rgba(255,255,255,0.08)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();

      context.strokeStyle = isRecording ? 'rgba(0,229,255,0.95)' : 'rgba(136,136,160,0.65)';
      context.lineWidth = 2;
      context.beginPath();

      if (samples && samples.length > 1) {
        for (let index = 0; index < samples.length; index += 1) {
          const x = (index / (samples.length - 1)) * width;
          const normalized = (samples[index] - 128) / 128;
          const y = height / 2 + normalized * height * 0.36;

          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
      } else {
        const segments = 56;
        for (let index = 0; index <= segments; index += 1) {
          const x = (index / segments) * width;
          const y =
            height / 2 +
            Math.sin(index * 0.42) * height * 0.08 +
            Math.sin(index * 0.17) * height * 0.03;

          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
      }

      context.stroke();
    };

    drawFrame();

    if (!stream || !isRecording) {
      return;
    }

    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) {
      return;
    }

    const audioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);

    const timeData = new Uint8Array(analyser.fftSize);

    const render = () => {
      analyser.getByteTimeDomainData(timeData);
      drawFrame(timeData);
      rafRef.current = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      source.disconnect();
      analyser.disconnect();
      void audioContext.close().catch(() => undefined);
    };
  }, [isRecording, stream]);

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

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-base-subtle/70">
        <canvas ref={canvasRef} data-testid="live-audio-waveform" className="block h-48 w-full" />
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
