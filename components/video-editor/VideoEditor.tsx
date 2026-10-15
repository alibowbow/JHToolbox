'use client';

import {
  Clapperboard,
  Download,
  LoaderCircle,
  Music,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Type,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { formatEditorTime } from '@/components/ui/video-editor-utils';
import { cx, downloadBlob } from '@/lib/utils';
import {
  addClip,
  emptyProject,
  frameSize,
  newMusic,
  newText,
  projectDuration,
  removeItem,
  splitItemAt,
  textsAt,
  type ItemRef,
  type Project,
} from '@/lib/video-editor/project';
import { kindOf, loadAsset, loadFrames, releaseAsset } from './assets';
import { VIDEO_EDITOR_COPY } from './copy';
import { EditorEngine, type RuntimeAsset } from './engine';
import { ExportUnsupportedError, exportVideo } from './export';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';

const MAX_HISTORY = 100;
const MIN_ZOOM = 4;
const MAX_ZOOM = 400;

type ExportState =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'done'; blob: Blob; name: string }
  | { status: 'error'; message: string };

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * A CapCut-style editor: videos and photos back to back on a main track,
 * texts and music on their own tracks, a live preview, and export to a video
 * file, all in the browser.
 */
export function VideoEditor() {
  const { locale } = useLocale();
  const copy = VIDEO_EDITOR_COPY[locale];
  const [project, setProject] = useState<Project>(emptyProject);
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [assets, setAssets] = useState<Record<string, RuntimeAsset>>({});
  const [selected, setSelected] = useState<ItemRef | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pxPerSecond, setPxPerSecond] = useState(60);
  const [quality, setQuality] = useState(1280);
  const [importing, setImporting] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' });
  const [ready, setReady] = useState(false);
  const engineRef = useRef<EditorEngine | null>(null);
  const idRef = useRef(0);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const musicInputRef = useRef<HTMLInputElement | null>(null);
  const timelineBoxRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inspectorEditRef = useRef<{ key: string; at: number } | null>(null);
  const textDragRef = useRef<{ id: string; dx: number; dy: number; origin: Project; moved: boolean } | null>(null);

  const nextId = (prefix: string) => {
    idRef.current += 1;
    return `${prefix}${idRef.current}`;
  };

  if (!engineRef.current && typeof window !== 'undefined') {
    engineRef.current = new EditorEngine(emptyProject());
  }
  const engine = engineRef.current;
  const duration = projectDuration(project);
  const infos = useMemo(() => Object.fromEntries(Object.entries(assets).map(([id, asset]) => [id, asset.info])), [assets]);
  const frame = frameSize(project, infos, quality);

  useEffect(() => {
    setReady(true);
    const current = engineRef.current;
    if (!current) return;
    // About 30 updates a second is plenty for the playhead.
    let last = 0;
    current.onTime = (t) => {
      const now = performance.now();
      if (now - last < 33) return;
      last = now;
      setTime(t);
    };
    current.onEnded = () => {
      setPlaying(false);
      setTime(current.duration);
    };
    return () => current.dispose();
  }, []);

  useEffect(() => {
    engine?.setAssets(assets);
    engine?.setProject(project);
  }, [assets, engine, project]);

  useEffect(() => {
    if (!engine) return;
    engine.longSide = quality;
    engine.resize();
    engine.seek(engine.currentTime);
  }, [engine, quality]);

  useEffect(() => {
    if (!engine) return;
    engine.selectedTextId = selected?.kind === 'text' ? selected.id : null;
    if (!engine.playing) engine.draw(engine.currentTime);
  }, [engine, selected, project]);

  // Release files when leaving; warn before throwing an edit away.
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  useEffect(() => () => Object.values(assetsRef.current).forEach(releaseAsset), []);
  useEffect(() => {
    if (!project.clips.length && !project.music.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = copy.leaveWarning;
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [copy.leaveWarning, project.clips.length, project.music.length]);

  const projectRef = useRef(project);
  projectRef.current = project;

  /** One undo step; `origin` is the state undo returns to (default: the current one). */
  const commit = useCallback((next: Project, origin?: Project) => {
    const before = origin ?? projectRef.current;
    if (before !== next) {
      setPast((stack) => [...stack.slice(-MAX_HISTORY + 1), before]);
      setFuture([]);
    }
    setProject(next);
    inspectorEditRef.current = null;
  }, []);

  /** Slider drags in the inspector make one undo step, not one per tick. */
  const commitFromInspector = (next: Project) => {
    const key = selected ? `${selected.kind}:${selected.id}` : 'project';
    const last = inspectorEditRef.current;
    const now = performance.now();
    if (last && last.key === key && now - last.at < 800) {
      setProject(next);
    } else {
      commit(next);
    }
    inspectorEditRef.current = { key, at: now };
  };

  const undo = () => {
    if (!past.length) return;
    setFuture((stack) => [project, ...stack]);
    setProject(past[past.length - 1]);
    setPast((stack) => stack.slice(0, -1));
    inspectorEditRef.current = null;
  };

  const redo = () => {
    if (!future.length) return;
    setPast((stack) => [...stack, project]);
    setProject(future[0]);
    setFuture((stack) => stack.slice(1));
    inspectorEditRef.current = null;
  };

  const fitZoom = (seconds: number) => {
    const width = (timelineBoxRef.current?.clientWidth ?? 800) - 60;
    setPxPerSecond(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, width / Math.max(1, seconds + 2))));
  };

  const importFiles = async (list: FileList | File[], onlyAudio = false) => {
    const files = Array.from(list).filter((file) => {
      const kind = kindOf(file);
      return onlyAudio ? kind === 'audio' : kind !== null;
    });
    if (!files.length) return;
    setNotice(null);
    setImporting((count) => count + files.length);
    const loaded: RuntimeAsset[] = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        loaded.push(await loadAsset(file, nextId('a')));
      } catch {
        failed.push(file.name);
      } finally {
        setImporting((count) => count - 1);
      }
    }
    if (failed.length) setNotice(`${copy.unreadable} ${failed.join(', ')}`);
    if (!loaded.length) return;

    setAssets((current) => ({ ...current, ...Object.fromEntries(loaded.map((asset) => [asset.info.id, asset])) }));
    const wasEmpty = projectDuration(projectRef.current) === 0;
    let next = projectRef.current;
    const playhead = engine?.currentTime ?? 0;
    for (const asset of loaded) {
      if (asset.info.kind === 'audio') next = { ...next, music: [...next.music, newMusic(asset.info, nextId('m'), next.clips.length ? playhead : 0)] };
      else next = addClip(next, asset.info, nextId('c'));
    }
    commit(next);
    if (wasEmpty) fitZoom(projectDuration(next));

    // Thumbnails come in afterwards.
    for (const asset of loaded) {
      if (asset.info.kind !== 'video') continue;
      void loadFrames(asset).then((frames) => {
        setAssets((current) => (current[asset.info.id] ? { ...current, [asset.info.id]: { ...current[asset.info.id], frames } } : current));
      });
    }
  };

  const togglePlay = () => {
    if (!engine || exportState.status === 'running') return;
    if (engine.playing) {
      engine.pause();
      setPlaying(false);
      setTime(engine.currentTime);
    } else if (duration > 0) {
      void engine.play().then(() => setPlaying(engine.playing));
    }
  };

  const seek = (t: number) => {
    if (!engine) return;
    engine.seek(Math.max(0, Math.min(t, duration)));
    setTime(engine.currentTime);
  };

  const split = () => {
    const playhead = engine?.currentTime ?? time;
    const ref = selected && selected.kind !== 'clip' ? selected : { kind: 'clip' as const, id: '' };
    const next = splitItemAt(project, ref, playhead, nextId(ref.kind === 'text' ? 't' : ref.kind === 'music' ? 'm' : 'c'));
    if (next !== project && JSON.stringify(next) !== JSON.stringify(project)) commit(next);
  };

  const remove = () => {
    if (!selected) return;
    commit(removeItem(project, selected));
    setSelected(null);
  };

  const addText = () => {
    const playhead = engine?.currentTime ?? time;
    const start = duration > 0 && playhead >= duration - 0.1 ? Math.max(0, duration - 3) : playhead;
    const length = duration > 0 ? Math.max(0.5, Math.min(3, duration - start)) : 3;
    const item = newText(nextId('t'), start, length, copy.defaultText);
    commit({ ...project, texts: [...project.texts, item] });
    setSelected({ kind: 'text', id: item.id });
  };

  const startExport = async () => {
    if (!engine) return;
    if (!project.clips.length) {
      setNotice(copy.nothingToExport);
      return;
    }
    engine.pause();
    setPlaying(false);
    const controller = new AbortController();
    abortRef.current = controller;
    setExportState({ status: 'running', progress: 0 });
    try {
      const { blob, extension } = await exportVideo(engine, {
        longSide: quality,
        signal: controller.signal,
        onProgress: (progress) => setExportState((state) => (state.status === 'running' ? { status: 'running', progress } : state)),
      });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const name = `video-edit-${stamp}.${extension}`;
      downloadBlob(blob, name);
      setExportState({ status: 'done', blob, name });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') setExportState({ status: 'idle' });
      else setExportState({ status: 'error', message: cause instanceof ExportUnsupportedError ? copy.exportUnsupported : copy.exportFailed });
    } finally {
      abortRef.current = null;
      setTime(0);
    }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || exportState.status === 'running') return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
      } else if (!mod && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        split();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selected) {
          event.preventDefault();
          remove();
        }
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const stepSize = event.shiftKey ? 1 : 1 / 30;
        seek((engine?.currentTime ?? time) + (event.key === 'ArrowLeft' ? -stepSize : stepSize));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Drag a text on the preview to place it.
  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  };
  const onPreviewDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!engine || engine.playing) return;
    const point = canvasPoint(event);
    const hit = [...engine.textBoxes].reverse().find((box) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);
    if (!hit) {
      setSelected(null);
      return;
    }
    const item = project.texts.find((entry) => entry.id === hit.id);
    if (!item) return;
    setSelected({ kind: 'text', id: hit.id });
    event.currentTarget.setPointerCapture(event.pointerId);
    const canvas = event.currentTarget;
    textDragRef.current = { id: hit.id, dx: point.x / canvas.width - item.x, dy: point.y / canvas.height - item.y, origin: project, moved: false };
  };
  const onPreviewMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = textDragRef.current;
    if (!drag) return;
    const point = canvasPoint(event);
    const canvas = event.currentTarget;
    const x = Math.min(0.98, Math.max(0.02, point.x / canvas.width - drag.dx));
    const y = Math.min(0.98, Math.max(0.02, point.y / canvas.height - drag.dy));
    drag.moved = true;
    setProject({ ...drag.origin, texts: drag.origin.texts.map((entry) => (entry.id === drag.id ? { ...entry, x, y } : entry)) });
  };
  const onPreviewUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = textDragRef.current;
    textDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag?.moved) commit(project, drag.origin);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files);
  };

  const empty = !project.clips.length && !project.music.length;
  const selectedVisibleText = selected?.kind === 'text' && textsAt(project, time).some((item) => item.id === selected.id);

  return (
    <div
      className="mx-auto w-full max-w-[96rem] space-y-3"
      data-testid="video-editor"
      data-ready={ready ? 'true' : undefined}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <header className="flex flex-wrap items-center gap-3">
        <span className="category-tile h-11 w-11 shrink-0 bg-rose-500/10 text-rose-600 dark:text-rose-300">
          <Clapperboard size={21} aria-hidden="true" />
        </span>
        <div className="min-w-[12rem] flex-1">
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{copy.title}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">{copy.subtitle}</p>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          <button type="button" onClick={() => mediaInputRef.current?.click()} className="btn-ghost" data-testid="ve-add-media">
            <Plus size={16} aria-hidden="true" />
            {copy.addMedia}
          </button>
          <button type="button" onClick={() => void startExport()} disabled={empty || exportState.status === 'running'} className="btn-primary" data-testid="ve-export">
            <Download size={16} aria-hidden="true" />
            {copy.export}
          </button>
        </div>
      </header>

      <input
        ref={mediaInputRef}
        type="file"
        accept="video/*,image/*,audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.mkv"
        multiple
        className="hidden"
        data-testid="ve-media-input"
        onChange={(event) => {
          if (event.target.files) void importFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={musicInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
        multiple
        className="hidden"
        data-testid="ve-music-input"
        onChange={(event) => {
          if (event.target.files) void importFiles(event.target.files, true);
          event.target.value = '';
        }}
      />

      {notice ? (
        <p role="alert" className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          {notice}
        </p>
      ) : null}

      {empty ? (
        <button
          type="button"
          onClick={() => mediaInputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-base-subtle/60 px-6 py-20 text-center transition hover:border-prime/50 hover:bg-prime/5"
          data-testid="ve-empty"
        >
          {importing > 0 ? <LoaderCircle size={28} className="animate-spin text-prime" /> : <Upload size={28} className="text-prime" aria-hidden="true" />}
          <span className="text-base font-semibold text-ink">{copy.emptyTitle}</span>
          <span className="max-w-md text-sm text-ink-muted">{copy.emptyBody}</span>
        </button>
      ) : (
        // Phones: preview, controls, timeline, then settings. Wide screens: settings beside the preview.
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="order-1 flex items-center justify-center overflow-hidden rounded-2xl bg-black p-2" style={{ height: 'min(56vh, 34rem)' }}>
              <canvas
                ref={(canvas) => engine?.attach(canvas)}
                onPointerDown={onPreviewDown}
                onPointerMove={onPreviewMove}
                onPointerUp={onPreviewUp}
                onPointerCancel={onPreviewUp}
                className={cx('max-h-full max-w-full touch-none', selectedVisibleText ? 'cursor-move' : 'cursor-default')}
                style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
                data-testid="ve-preview"
              />
            </div>
            <aside className="workspace-panel order-4 p-4 lg:order-2">
              <Inspector
                project={project}
                assets={assets}
                selected={selected}
                quality={quality}
                copy={copy}
                onChange={commitFromInspector}
                onQuality={setQuality}
              />
            </aside>

          <div className="order-2 flex flex-wrap items-center gap-1.5 lg:order-3 lg:col-span-2">
            <button type="button" onClick={togglePlay} aria-label={playing ? copy.pause : copy.play} className="btn-primary h-9 w-9 p-0" data-testid="ve-play">
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <span className="mx-1 font-mono text-sm tabular-nums text-ink" data-testid="ve-time">
              {formatEditorTime(time)}
              <span className="text-ink-faint"> / {formatEditorTime(duration)}</span>
            </span>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <button type="button" onClick={split} title={copy.splitTitle} className="btn-ghost h-9 px-2.5 text-xs" data-testid="ve-split">
              <Scissors size={14} aria-hidden="true" />
              {copy.split}
            </button>
            <button type="button" onClick={remove} disabled={!selected} title={copy.removeTitle} className="btn-ghost h-9 px-2.5 text-xs" data-testid="ve-delete">
              <Trash2 size={14} aria-hidden="true" />
              {copy.remove}
            </button>
            <button type="button" onClick={addText} className="btn-ghost h-9 px-2.5 text-xs" data-testid="ve-add-text">
              <Type size={14} aria-hidden="true" />
              {copy.addText}
            </button>
            <button type="button" onClick={() => musicInputRef.current?.click()} className="btn-ghost h-9 px-2.5 text-xs" data-testid="ve-add-music">
              <Music size={14} aria-hidden="true" />
              {copy.addMusic}
            </button>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <button type="button" onClick={undo} disabled={!past.length} aria-label={copy.undo} title={copy.undo} className="btn-ghost h-9 w-9 p-0" data-testid="ve-undo">
              <Undo2 size={15} />
            </button>
            <button type="button" onClick={redo} disabled={!future.length} aria-label={copy.redo} title={copy.redo} className="btn-ghost h-9 w-9 p-0" data-testid="ve-redo">
              <Redo2 size={15} />
            </button>
            <div className="ml-auto flex items-center gap-1">
              {importing > 0 ? <LoaderCircle size={16} className="animate-spin text-prime" aria-hidden="true" /> : null}
              <button type="button" onClick={() => setPxPerSecond((value) => Math.max(MIN_ZOOM, value / 1.5))} aria-label={copy.zoomOut} title={copy.zoomOut} className="btn-ghost h-9 w-9 p-0">
                <ZoomOut size={15} />
              </button>
              <button type="button" onClick={() => setPxPerSecond((value) => Math.min(MAX_ZOOM, value * 1.5))} aria-label={copy.zoomIn} title={copy.zoomIn} className="btn-ghost h-9 w-9 p-0">
                <ZoomIn size={15} />
              </button>
            </div>
          </div>

          <div ref={timelineBoxRef} className="order-3 min-w-0 lg:order-4 lg:col-span-2">
            <Timeline
              project={project}
              assets={assets}
              time={time}
              playing={playing}
              pxPerSecond={pxPerSecond}
              selected={selected}
              copy={copy}
              onSelect={setSelected}
              onSeek={seek}
              onLive={setProject}
              onCommit={(origin, next) => commit(next, origin)}
            />
          </div>
          <p className="order-5 hidden text-xs text-ink-faint sm:block lg:col-span-2">{copy.shortcuts}</p>
        </div>
      )}

      {exportState.status !== 'idle' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" data-testid="ve-export-dialog">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-base-elevated p-6 shadow-xl">
            {exportState.status === 'running' ? (
              <>
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <LoaderCircle size={18} className="animate-spin text-prime" aria-hidden="true" />
                  {copy.exporting} {Math.round(exportState.progress * 100)}%
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-base-subtle">
                  <div className="h-full rounded-full bg-prime" style={{ width: `${exportState.progress * 100}%` }} />
                </div>
                <p className="text-sm text-ink-muted">{copy.exportHint}</p>
                <div className="flex justify-end">
                  <button type="button" onClick={() => abortRef.current?.abort()} className="btn-ghost">
                    {copy.cancel}
                  </button>
                </div>
              </>
            ) : exportState.status === 'done' ? (
              <>
                <p className="font-semibold text-ink" data-testid="ve-export-done">
                  {copy.exportDone} · {exportState.name}
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => downloadBlob(exportState.blob, exportState.name)} className="btn-ghost" data-testid="ve-export-save">
                    <Download size={16} aria-hidden="true" />
                    {copy.exportAgain}
                  </button>
                  <button type="button" onClick={() => setExportState({ status: 'idle' })} className="btn-primary">
                    {copy.close}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-danger">{exportState.message}</p>
                <div className="flex justify-end">
                  <button type="button" onClick={() => setExportState({ status: 'idle' })} className="btn-primary">
                    {copy.close}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
