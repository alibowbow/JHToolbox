import {
  clipAt,
  frameSize,
  gainAt,
  layoutClips,
  musicGainPoints,
  musicStart,
  pictureAlpha,
  placePicture,
  projectDuration,
  textsAt,
  type AssetInfo,
  type Project,
  type TextItem,
} from '@/lib/video-editor/project';

/** An imported file with what playback needs: its element or decoded sound. */
export interface RuntimeAsset {
  info: AssetInfo;
  file: File;
  url: string;
  video?: HTMLVideoElement;
  image?: HTMLImageElement;
  buffer?: AudioBuffer;
  /** Still frames for the timeline: [source time, data URL]. */
  frames?: Array<[number, string]>;
}

type MusicVoice = { source: AudioBufferSourceNode; gain: GainNode };

const clock = () => performance.now() / 1000;

/** Where a text is drawn, for dragging it on the preview. */
export interface TextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Plays a project onto a canvas: the main track's videos and photos one after
 * another, a fade through black at cuts when chosen, texts on top; and mixes
 * the clips' sound with the music. The same playback is recorded for export.
 */
export class EditorEngine {
  canvas: HTMLCanvasElement | null = null;
  project: Project;
  assets: Record<string, RuntimeAsset> = {};
  longSide = 1280;
  playing = false;
  /** Called with the playhead on every drawn frame while playing. */
  onTime?: (time: number) => void;
  onEnded?: () => void;
  textBoxes: TextBox[] = [];
  selectedTextId: string | null = null;

  private time = 0;
  private startTimeline = 0;
  private startClock = 0;
  private frame = 0;
  private audio: AudioContext | null = null;
  private master: GainNode | null = null;
  private monitor: GainNode | null = null;
  private recordDestination: MediaStreamAudioDestinationNode | null = null;
  private videoGains = new Map<string, GainNode>();
  private voices: MusicVoice[] = [];
  private fontFamily = 'sans-serif';

  constructor(project: Project) {
    this.project = project;
    if (typeof document !== 'undefined') {
      this.fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif';
    }
  }

  get duration() {
    return projectDuration(this.project);
  }

  get currentTime() {
    return this.playing ? this.startTimeline + (clock() - this.startClock) : this.time;
  }

  attach(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.resize();
    this.draw(this.currentTime);
  }

  setAssets(assets: Record<string, RuntimeAsset>) {
    this.assets = assets;
    for (const asset of Object.values(assets)) {
      if (asset.video && !asset.video.dataset.editorBound) {
        asset.video.dataset.editorBound = 'true';
        // Draw again once a paused video has the frame we asked for.
        asset.video.addEventListener('seeked', () => {
          if (!this.playing) this.draw(this.time);
        });
        asset.video.addEventListener('loadeddata', () => {
          if (!this.playing) this.draw(this.time);
        });
      }
    }
  }

  setProject(project: Project) {
    const wasPlaying = this.playing;
    const at = this.currentTime;
    this.project = project;
    this.resize();
    if (wasPlaying) {
      // Clips moved under the playhead: pick up from the same moment.
      this.stopMusic();
      this.startTimeline = Math.min(at, this.duration);
      this.startClock = clock();
      this.startMusic(this.startTimeline);
    } else {
      this.time = Math.min(this.time, this.duration);
      this.showFrame(this.time);
    }
  }

  /** The canvas renders at the export size; CSS scales it down for the preview. */
  resize() {
    if (!this.canvas) return;
    const assets = Object.fromEntries(Object.entries(this.assets).map(([id, asset]) => [id, asset.info]));
    const size = frameSize(this.project, assets, this.longSide);
    if (this.canvas.width !== size.width || this.canvas.height !== size.height) {
      this.canvas.width = size.width;
      this.canvas.height = size.height;
    }
  }

  /** Created on the first play (browsers only start sound after a click). */
  ensureAudio() {
    if (this.audio || typeof AudioContext === 'undefined') return this.audio;
    const context = new AudioContext();
    this.audio = context;
    this.master = context.createGain();
    this.monitor = context.createGain();
    this.master.connect(this.monitor).connect(context.destination);
    return context;
  }

  /** A live stream of the mix, for recording. */
  recordingStream() {
    const context = this.ensureAudio();
    if (!context || !this.master) return null;
    if (!this.recordDestination) {
      this.recordDestination = context.createMediaStreamDestination();
      this.master.connect(this.recordDestination);
    }
    return this.recordDestination.stream;
  }

  /** Silences the speakers (the recording still gets the sound). */
  setMonitorMuted(muted: boolean) {
    if (this.monitor) this.monitor.gain.value = muted ? 0 : 1;
  }

  private gainFor(asset: RuntimeAsset) {
    const context = this.audio;
    if (!context || !this.master || !asset.video) return null;
    let gain = this.videoGains.get(asset.info.id);
    if (!gain) {
      gain = context.createGain();
      try {
        context.createMediaElementSource(asset.video).connect(gain);
      } catch {
        // Already routed (a fresh engine on the same element): play it as it is.
      }
      gain.connect(this.master);
      this.videoGains.set(asset.info.id, gain);
    }
    return gain;
  }

  async play() {
    if (this.playing || this.duration <= 0) return;
    const context = this.ensureAudio();
    if (context && context.state !== 'running') {
      await context.resume().catch(() => undefined);
    }
    if (this.time >= this.duration - 0.02) this.time = 0;
    this.startTimeline = this.time;
    this.startClock = clock();
    this.playing = true;
    this.startMusic(this.time);
    const loop = () => {
      if (!this.playing) return;
      this.tick();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  pause() {
    if (!this.playing) return;
    this.time = Math.min(this.currentTime, this.duration);
    this.playing = false;
    cancelAnimationFrame(this.frame);
    this.stopMusic();
    for (const asset of Object.values(this.assets)) asset.video?.pause();
    this.showFrame(this.time);
  }

  seek(time: number) {
    const t = Math.max(0, Math.min(time, this.duration));
    if (this.playing) {
      this.stopMusic();
      this.startTimeline = t;
      this.startClock = clock();
      this.startMusic(t);
      return;
    }
    this.time = t;
    this.showFrame(t);
  }

  private tick() {
    const t = this.currentTime;
    if (t >= this.duration) {
      this.time = this.duration;
      this.playing = false;
      cancelAnimationFrame(this.frame);
      this.stopMusic();
      for (const asset of Object.values(this.assets)) asset.video?.pause();
      this.draw(this.duration - 0.001);
      this.onTime?.(this.duration);
      this.onEnded?.();
      return;
    }
    this.syncVideos(t, true);
    this.draw(t);
    this.onTime?.(t);
  }

  /** Paused: put the right video at the right frame, and draw. */
  private showFrame(t: number) {
    this.syncVideos(t, false);
    this.draw(t);
  }

  private syncVideos(t: number, playing: boolean) {
    const hit = clipAt(this.project, Math.min(t, Math.max(0, this.duration - 0.001)));
    const active = hit ? this.assets[hit.clip.assetId] : undefined;
    for (const asset of Object.values(this.assets)) {
      if (asset.video && asset !== active && !asset.video.paused) asset.video.pause();
    }
    if (!hit || !active?.video) {
      this.prepareNext(t);
      return;
    }
    const video = active.video;
    const gain = this.gainFor(active);
    if (gain) gain.gain.value = hit.clip.volume;
    else video.volume = Math.min(1, Math.max(0, hit.clip.volume));
    video.playbackRate = hit.clip.speed;
    const target = hit.sourceTime;
    if (playing) {
      if (video.paused) {
        if (Math.abs(video.currentTime - target) > 0.05) video.currentTime = target;
        void video.play().catch(() => undefined);
      } else if (Math.abs(video.currentTime - target) > 0.25 * Math.max(1, hit.clip.speed)) {
        video.currentTime = target;
      }
      this.prepareNext(t);
    } else {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - target) > 0.02) video.currentTime = target;
    }
  }

  /** Near the end of a clip, line the next clip's video up at its start. */
  private prepareNext(t: number) {
    const placed = layoutClips(this.project);
    const next = placed.find((entry) => entry.start > t && entry.start - t < 0.6);
    if (!next) return;
    const current = clipAt(this.project, t);
    const asset = this.assets[next.clip.assetId];
    if (!asset?.video || current?.clip.assetId === next.clip.assetId) return;
    if (asset.video.paused && Math.abs(asset.video.currentTime - next.clip.in) > 0.05) {
      asset.video.currentTime = next.clip.in;
    }
  }

  private startMusic(from: number) {
    const context = this.audio;
    if (!context || !this.master) return;
    const end = this.duration;
    for (const item of this.project.music) {
      const buffer = this.assets[item.assetId]?.buffer;
      const plan = musicStart(item, from, end);
      if (!buffer || !plan) continue;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      const now = context.currentTime;
      // Timeline time t happens at context time now + (t - from).
      const points = musicGainPoints(item);
      gain.gain.setValueAtTime(gainAt(points, from), now);
      for (const [time, value] of points) {
        if (time > from) gain.gain.linearRampToValueAtTime(value, now + (time - from));
      }
      source.connect(gain).connect(this.master);
      source.start(now + plan.delay, plan.source, plan.duration);
      this.voices.push({ source, gain });
    }
  }

  private stopMusic() {
    for (const voice of this.voices) {
      try {
        voice.source.stop();
      } catch {
        // Not started yet or already over.
      }
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    this.voices = [];
  }

  draw(t: number) {
    const canvas = this.canvas;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const frame = { width: canvas.width, height: canvas.height };
    context.fillStyle = '#000';
    context.fillRect(0, 0, frame.width, frame.height);

    const hit = clipAt(this.project, Math.min(t, Math.max(0, this.duration - 0.001)));
    const asset = hit ? this.assets[hit.clip.assetId] : undefined;
    const source: (CanvasImageSource & { width?: number }) | null =
      asset?.video && asset.video.readyState >= 2 ? asset.video : asset?.image?.complete ? asset.image : null;
    if (asset && source) {
      const size = asset.video
        ? { width: asset.video.videoWidth, height: asset.video.videoHeight }
        : { width: asset.image?.naturalWidth ?? 0, height: asset.image?.naturalHeight ?? 0 };
      const place = placePicture(size, frame, this.project.fit);
      context.drawImage(source, place.x, place.y, place.width, place.height);
    }
    const alpha = pictureAlpha(this.project, t);
    if (alpha < 1) {
      context.fillStyle = `rgba(0,0,0,${1 - alpha})`;
      context.fillRect(0, 0, frame.width, frame.height);
    }

    this.textBoxes = [];
    for (const item of textsAt(this.project, t)) this.drawText(context, frame, item);
  }

  private drawText(context: CanvasRenderingContext2D, frame: { width: number; height: number }, item: TextItem) {
    const lines = item.text.split('\n');
    const fontSize = Math.max(8, item.size * frame.height);
    context.font = `700 ${fontSize}px ${this.fontFamily}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const lineHeight = fontSize * 1.25;
    const width = Math.max(...lines.map((line) => context.measureText(line).width), fontSize);
    const height = lineHeight * lines.length;
    const cx = item.x * frame.width;
    const cy = item.y * frame.height;
    const padX = fontSize * 0.45;
    const padY = fontSize * 0.2;
    const box = { id: item.id, x: cx - width / 2 - padX, y: cy - height / 2 - padY, width: width + padX * 2, height: height + padY * 2 };
    this.textBoxes.push(box);
    if (item.box) {
      context.fillStyle = 'rgba(0,0,0,0.55)';
      const r = fontSize * 0.25;
      context.beginPath();
      context.roundRect(box.x, box.y, box.width, box.height, r);
      context.fill();
    } else {
      context.lineWidth = Math.max(2, fontSize * 0.12);
      context.strokeStyle = 'rgba(0,0,0,0.7)';
      lines.forEach((line, index) => context.strokeText(line, cx, cy - height / 2 + lineHeight * (index + 0.5)));
    }
    context.fillStyle = item.color;
    lines.forEach((line, index) => context.fillText(line, cx, cy - height / 2 + lineHeight * (index + 0.5)));
    if (this.selectedTextId === item.id && !this.recording) {
      context.strokeStyle = '#818cf8';
      context.lineWidth = Math.max(2, frame.height / 360);
      context.setLineDash([8, 6]);
      context.strokeRect(box.x, box.y, box.width, box.height);
      context.setLineDash([]);
    }
  }

  /** While recording, the selection outline is not drawn. */
  recording = false;

  dispose() {
    this.pause();
    this.stopMusic();
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
  }
}
