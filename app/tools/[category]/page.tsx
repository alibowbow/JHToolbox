import { notFound } from 'next/navigation';
import { CategoryPageContent } from '@/components/category-page-content';
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

  return <CategoryPageContent category={category} items={items} />;
}
