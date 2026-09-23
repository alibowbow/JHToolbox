'use client';

import { useEffect, useState } from 'react';

type Options = Record<string, string | number | boolean>;
type Size = { width: number; height: number; scale: number };

const EDIT_DEFAULT_COLOR = '#111827';
const HIGHLIGHT_COLOR = '#fde047';

/** An object URL for a file, revoked when the file changes. */
export function useObjectUrl(file: File | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function TextStamp({
  lines,
  size,
  fontSize,
  color,
  italic = false,
  background,
  border,
  opacity = 1,
}: {
  lines: string[];
  size: Size;
  fontSize: number;
  color: string;
  italic?: boolean;
  background?: string;
  border?: string;
  opacity?: number;
}) {
  const fontPx = Math.max(6, fontSize * size.scale);
  return (
    <div
      className="flex h-full w-full flex-col justify-center overflow-hidden"
      style={{
        color,
        fontSize: fontPx,
        lineHeight: 1.3,
        fontStyle: italic ? 'italic' : undefined,
        fontWeight: 600,
        padding: Math.max(3, fontPx * 0.35),
        background,
        border: border ? `1px solid ${border}` : undefined,
        opacity,
        overflowWrap: 'anywhere',
      }}
    >
      {lines.map((line, index) => (
        <span key={index} className="block">
          {line}
        </span>
      ))}
    </div>
  );
}

/** What the signature will look like, drawn inside the placement box. */
export function SignStampPreview({ options, imageUrl, size }: { options: Options; imageUrl: string | null; size: Size }) {
  if (String(options.signatureType ?? 'text') === 'image') {
    return imageUrl ? <img src={imageUrl} alt="" draggable={false} className="h-full w-full object-contain" /> : null;
  }
  const name = String(options.signerName ?? '').trim() || 'Signed with JH Toolbox';
  const lines = options.includeDate === false ? [name] : [name, new Date().toLocaleDateString()];
  return <TextStamp lines={lines} size={size} fontSize={Number(options.fontSize ?? 22)} color={String(options.color ?? '#0f172a')} italic border="#94a3b8" />;
}

/** What the edit (text, note, box, highlight or picture) will look like. */
export function EditStampPreview({ options, imageUrl, size }: { options: Options; imageUrl: string | null; size: Size }) {
  const editType = String(options.editType ?? 'text');
  const color = String(options.color ?? EDIT_DEFAULT_COLOR);
  const opacity = Math.min(1, Math.max(0.05, Number(options.opacity ?? 0.9)));

  if (editType === 'image') {
    return imageUrl ? <img src={imageUrl} alt="" draggable={false} className="h-full w-full object-fill" style={{ opacity }} /> : null;
  }
  if (editType === 'highlight') {
    const fill = color.toLowerCase() === EDIT_DEFAULT_COLOR ? HIGHLIGHT_COLOR : color;
    return <div className="h-full w-full mix-blend-multiply" style={{ background: fill, opacity: Math.min(0.65, Math.max(0.1, opacity)) }} />;
  }
  if (editType === 'rectangle') {
    return <div className="h-full w-full" style={{ background: color, border: `1px solid ${color}`, opacity }} />;
  }
  const text = String(options.text ?? '').trim() || 'Edited with JH Toolbox';
  return (
    <TextStamp
      lines={text.split('\n')}
      size={size}
      fontSize={Number(options.fontSize ?? 18)}
      color={color}
      opacity={opacity}
      background={editType === 'comment' ? '#FEF3C7' : undefined}
      border={editType === 'comment' ? '#F59E0B' : undefined}
    />
  );
}

/** The watermark as it will appear on the page (position, angle, opacity, size). */
export function WatermarkPreview({
  options,
  imageUrl,
  page,
}: {
  options: Options;
  imageUrl: string | null;
  page: { width: number; height: number; scale: number };
}) {
  const isImage = String(options.watermarkType ?? 'text') === 'image';
  const position = String(options.position ?? 'center');
  const opacity = Math.min(1, Math.max(0.05, Number(options.opacity ?? 0.2)));
  const rotation = Number(options.rotation ?? -24);
  const text = String(options.text ?? '').trim() || 'JH Toolbox';
  const fontPx = Math.max(6, Number(options.fontSize ?? 32) * page.scale);
  const imageWidth = Math.max(24, Math.min(1, Math.max(0.05, Number(options.scale ?? 0.24))) * page.width);

  if (isImage && !imageUrl) {
    return null;
  }

  const stamp = isImage ? (
    <img src={imageUrl!} alt="" draggable={false} style={{ width: imageWidth }} />
  ) : (
    <span className="whitespace-nowrap font-bold text-[#1f2937]" style={{ fontSize: fontPx }}>
      {text}
    </span>
  );
  const at = (left: number, top: number, key: string | number) => (
    <div
      key={key}
      className="absolute"
      style={{ left, top, opacity, transform: `translate(-50%, -50%) rotate(${-rotation}deg)` }}
    >
      {stamp}
    </div>
  );

  if (position === 'tile') {
    // Same spacing rule as the processor, in screen pixels.
    const stampWidth = isImage ? imageWidth : text.length * fontPx * 0.6;
    const stampHeight = isImage ? imageWidth * 0.5 : fontPx * 1.3;
    const stepX = Math.max(stampWidth * 1.4, 120 * page.scale);
    const stepY = Math.max(stampHeight * 3, 120 * page.scale);
    const copies = [];
    for (let row = 0, y = stepY / 2; y < page.height + stepY / 2; row += 1, y += stepY) {
      for (let x = row % 2 === 0 ? stepX / 2 : stepX; x < page.width + stepX / 2; x += stepX) {
        copies.push(at(x, page.height - y, `${row}-${x}`));
      }
    }
    return <>{copies}</>;
  }
  if (position === 'bottom-right') {
    const offset = 24 * page.scale;
    const approxWidth = isImage ? imageWidth : text.length * fontPx * 0.6;
    const approxHeight = isImage ? imageWidth * 0.5 : fontPx * 1.3;
    return at(page.width - approxWidth / 2 - offset, page.height - approxHeight / 2 - offset, 'corner');
  }
  return at(page.width / 2, page.height / 2, 'center');
}
