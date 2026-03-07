export type ToolCategory = 'pdf' | 'image' | 'ocr' | 'video' | 'audio' | 'file' | 'web';

export type ToolOptionType = 'number' | 'text' | 'select' | 'checkbox' | 'range' | 'color';

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
}

export interface ToolCategoryDefinition {
  id: ToolCategory;
  label: string;
  description: string;
  tools: string[];
}