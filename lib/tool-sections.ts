import { ToolCategory } from '@/types/tool';

/**
 * Optional sub-sections for a category page, so a large category (e.g. PDF's
 * ~29 tools) is presented as a few labelled groups instead of one flat grid.
 *
 * Tools in a category that are not listed in any section are still shown, under
 * a trailing "More" group, so nothing is ever dropped. The registry-invariants
 * check verifies that every section tool id exists and that sections do not
 * duplicate a tool.
 */
export interface CategorySection {
  id: string;
  title: { en: string; ko: string };
  toolIds: string[];
}

export const categorySections: Partial<Record<ToolCategory, CategorySection[]>> = {
  pdf: [
    {
      id: 'pages',
      title: { en: 'Organize pages', ko: '페이지 정리' },
      toolIds: ['pdf-merge', 'pdf-split', 'pdf-rearrange', 'pdf-rotate', 'pdf-delete-page'],
    },
    {
      id: 'edit',
      title: { en: 'Edit & annotate', ko: '편집 · 주석' },
      toolIds: ['edit-pdf', 'pdf-add-page-numbers', 'pdf-watermark', 'pdf-sign', 'pdf-redact'],
    },
    {
      id: 'create',
      title: { en: 'Create PDF (convert to PDF)', ko: 'PDF로 변환' },
      toolIds: ['word-to-pdf', 'powerpoint-to-pdf', 'excel-to-pdf', 'image-to-pdf', 'html-to-pdf', 'url-pdf', 'hwpx-to-pdf'],
    },
    {
      id: 'convert',
      title: { en: 'Convert from PDF', ko: 'PDF에서 변환' },
      toolIds: ['pdf-to-png', 'pdf-to-jpg', 'pdf-to-webp', 'pdf-extract-images', 'pdf-to-word', 'pdf-to-excel', 'pdf-to-hwpx', 'pdf-to-pdfa'],
    },
    {
      id: 'optimize',
      title: { en: 'Compress & optimize', ko: '압축 · 최적화' },
      toolIds: ['pdf-reduce-size', 'pdf-compress'],
    },
    {
      id: 'utilities',
      title: { en: 'Utilities', ko: '유틸리티' },
      toolIds: ['pdf-repair', 'pdf-compare'],
    },
  ],
};

export const moreSectionTitle = { en: 'More', ko: '기타' };

export function getCategorySections(categoryId: ToolCategory): CategorySection[] | null {
  return categorySections[categoryId] ?? null;
}
