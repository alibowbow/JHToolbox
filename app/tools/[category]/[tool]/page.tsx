import { notFound } from 'next/navigation';
import { ToolWorkbench } from '@/components/tool-ui/tool-workbench';
import { categories, getToolById } from '@/lib/tool-registry';

export function generateStaticParams() {
  return categories.flatMap((category) =>
    category.tools.map((toolId) => ({
      category: category.id,
      tool: toolId,
    }))
  );
}

export default function ToolPage({ params }: { params: { category: string; tool: string } }) {
  const tool = getToolById(params.tool);
  if (!tool || tool.category !== params.category) {
    notFound();
  }

  return <ToolWorkbench tool={tool} />;
}