import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { ToolWorkbench } from '@/components/tool-ui/tool-workbench';
import { categories, getCategoryById, getToolById, isToolInCategory } from '@/lib/tool-registry';

const legacyToolRedirects: Partial<Record<string, string>> = {
  'mp4-webm': '/tools/video/video-convert?outputFormat=webm',
  'mp4-mov': '/tools/video/video-convert?outputFormat=mov',
  'mov-mp4': '/tools/video/video-convert?outputFormat=mp4',
  'avi-mp4': '/tools/video/video-convert?outputFormat=mp4',
  'video-to-gif': '/tools/video/video-convert?outputFormat=gif',
  'video-to-webp': '/tools/video/video-convert?outputFormat=webp',
  'gif-to-video': '/tools/video/video-convert?outputFormat=mp4',
};

export function generateStaticParams() {
  return categories.flatMap((category) =>
    category.tools.map((toolId) => ({
      category: category.id,
      tool: toolId,
    }))
  );
}

export default function ToolPage({ params }: { params: { category: string; tool: string } }) {
  const legacyRedirect = legacyToolRedirects[params.tool];
  if (legacyRedirect) {
    redirect(legacyRedirect);
  }

  const category = getCategoryById(params.category);
  const tool = getToolById(params.tool);
  if (!category || !tool || !isToolInCategory(category.id, tool.id)) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <ToolWorkbench tool={tool} categoryId={category.id} />
    </Suspense>
  );
}
