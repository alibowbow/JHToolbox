'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PreparedAudioFile } from '@/lib/audio/AudioExporter';

export type DownloadableAudioFile = PreparedAudioFile & { url: string };

/** One retained export. Late encoders cannot restore a closed/replaced project. */
export function usePreparedAudioFile(source: unknown) {
  const [file, setFile] = useState<DownloadableAudioFile | null>(null);
  const [preparing, setPreparing] = useState(false);
  const current = useRef<DownloadableAudioFile | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const mounted = useRef(false);

  const release = useCallback(() => {
    generation.current += 1;
    if (current.current) URL.revokeObjectURL(current.current.url);
    current.current = null;
  }, []);

  const clear = useCallback(() => {
    release();
    setFile(null);
  }, [release]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      release();
    };
  }, [release]);

  // Editing, importing, resetting or restoring a project invalidates its export.
  useEffect(() => { clear(); }, [source, clear]);

  const prepare = async (encode: () => Promise<PreparedAudioFile>) => {
    if (running.current) return;
    running.current = true;
    setPreparing(true);
    const token = ++generation.current;
    try {
      const prepared = await encode();
      if (!mounted.current || token !== generation.current) return;
      const next = { ...prepared, url: URL.createObjectURL(prepared.blob) };
      if (current.current) URL.revokeObjectURL(current.current.url);
      current.current = next;
      setFile(next);
    } catch (error) {
      if (mounted.current && token === generation.current) throw error;
    } finally {
      running.current = false;
      if (mounted.current) setPreparing(false);
    }
  };

  return { file, preparing, prepare, clear };
}
