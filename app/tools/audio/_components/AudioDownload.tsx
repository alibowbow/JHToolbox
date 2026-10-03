'use client';

import { useEffect, useRef, useState } from 'react';
import { saveBlobFile } from '@/lib/audio/AudioExporter';
import type { DownloadableAudioFile } from './usePreparedAudioFile';

export function AudioDownload({ file, locale, onClose }: {
  file: DownloadableAudioFile;
  locale: 'en' | 'ko';
  onClose: () => void;
}) {
  const ko = locale === 'ko';
  const [status, setStatus] = useState<'ready' | 'requested' | 'saving' | 'saved' | 'cancelled' | 'unavailable' | 'error'>('ready');
  const [error, setError] = useState('');
  const [hasPicker, setHasPicker] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setHasPicker('showSaveFilePicker' in window && typeof window.showSaveFilePicker === 'function');
    return () => { mounted.current = false; };
  }, []);

  const save = async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus('saving');
    setError('');
    try {
      // No encoding or other await before the picker: this is a fresh gesture.
      const result = await saveBlobFile(file);
      if (mounted.current) setStatus(result);
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    } finally {
      busy.current = false;
    }
  };

  const messages = ko ? {
    ready: '파일 준비 완료. 아래 다운로드를 눌러 저장하세요.',
    requested: '브라우저에 다운로드를 요청했습니다. 다운로드 목록을 확인하세요. 저장되지 않았다면 다시 누르세요.',
    saving: '선택한 파일에 쓰는 중입니다...',
    saved: '선택한 파일에 쓰기를 완료했습니다.',
    cancelled: '저장을 취소했습니다. 준비된 파일과 원본 오디오는 그대로 유지됩니다.',
    unavailable: '이 환경에서는 저장 창을 열 수 없습니다. 다운로드 링크를 사용하세요.',
    error: '파일 쓰기에 실패했습니다. 다운로드하거나 저장 창으로 다시 시도하세요.',
  } : {
    ready: 'File ready. Click Download file to save it.',
    requested: 'Download requested. Check your browser downloads. Click again if no file was saved.',
    saving: 'Writing to the selected file...',
    saved: 'Finished writing the selected file.',
    cancelled: 'Save cancelled. Your prepared file and original audio are still available.',
    unavailable: 'The save dialog is unavailable here. Use the download link.',
    error: 'Could not write the file. Download it or retry the save dialog.',
  };

  return (
    <section aria-label={ko ? '내보낸 파일' : 'Exported file'} className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3" data-testid="audio-download">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm font-semibold">{file.filename}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            {file.filename.split('.').pop()?.toUpperCase()} · {file.blob.size.toLocaleString(ko ? 'ko-KR' : 'en-US')} {ko ? '바이트' : 'bytes'}
          </p>
        </div>
        <button type="button" className="audio-focus-ring rounded px-2 py-1" onClick={onClose} aria-label={ko ? '내보낸 파일 닫기' : 'Close exported file'}>✕</button>
      </div>
      <p role={status === 'error' ? 'alert' : 'status'} className="my-2 text-sm">{messages[status]}{error ? ` ${error}` : ''}</p>
      <div className="flex flex-wrap gap-2">
        <a href={file.url} download={file.filename} aria-disabled={status === 'saving'}
          className="audio-button-primary audio-focus-ring min-h-9 px-3"
          onClick={(event) => {
            if (busy.current) { event.preventDefault(); return; }
            setError('');
            setStatus('requested');
          }}>
          {ko ? '파일 다운로드 / 다시 받기' : 'Download file / retry'}
        </a>
        {hasPicker ? <button type="button" disabled={status === 'saving'} onClick={() => void save()} className="audio-button-ghost audio-focus-ring min-h-9 px-3">
          {ko ? '저장 위치 선택' : 'Choose save location'}
        </button> : null}
      </div>
      <p className="mt-2 text-xs text-[var(--text-tertiary)]">{ko ? '편집·파일 교체·닫기 전까지 다시 받을 수 있습니다. 원본 오디오는 유지됩니다.' : 'Available until you edit, replace or close this export. Original audio is preserved.'}</p>
    </section>
  );
}
