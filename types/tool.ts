export type ToolCategory = 'pdf' | 'image' | 'ocr' | 'video' | 'audio' | 'file' | 'web';

export type ToolOptionType = 'number' | 'text' | 'select' | 'checkbox' | 'range' | 'color';
export type ToolBrowseGroup = 'popular' | 'new' | 'editor-enabled' | 'convert' | 'trim' | 'compress' | 'merge' | 'capture';
export type ToolInputMode = 'file' | 'url';
export type ToolPreviewKind = 'none' | 'image' | 'audio' | 'video' | 'pdf-merge' | 'audio-editor';

export interface ToolOption {
  key: string;
  label: string;
  type: ToolOptionType;
  defaultValue: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  options?: Array<{ label: string; value: string | number }>;
}

export interface ToolDefinition {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  accept: string;
  multiple?: boolean;
  tags: string[];
  options?: ToolOption[];
  hiddenFromBrowse?: boolean;
  browseGroups?: ToolBrowseGroup[];
  inputMode?: ToolInputMode;
  previewKind?: ToolPreviewKind;
}

export interface ToolCategoryDefinition {
  id: ToolCategory;
  label: string;
  description: string;
  tools: string[];
}
