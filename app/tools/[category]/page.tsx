import { notFound } from 'next/navigation';
import { ToolCard } from '@/components/tool-card';
import { categories, getToolsByCategory } from '@/lib/tool-registry';

export function generateStaticParams() {
  return categories.map((category) => ({ category: category.id }));
}

export default function CategoryPage({ params }: { params: { category: string } }) {
  const category = categories.find((item) => item.id === params.category);
  if (!category) {
    notFound();
  }

  const items = getToolsByCategory(category.id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{category.label}</h1>
      <p className="text-sm text-muted">{category.description}</p>
      <div className="tool-grid">
        {items.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}