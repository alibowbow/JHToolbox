export interface ProcessProgress {
  percent: number;
  stage: string;
}

export interface ProcessedFile {
  name: string;
  blob: Blob;
  mimeType: string;
  previewUrl?: string;
  textContent?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface ProcessContext {
  toolId: string;
  files: File[];
  options: Record<string, string | number | boolean>;
  onProgress: (progress: ProcessProgress) => void;
}