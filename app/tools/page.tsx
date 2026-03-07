import Link from 'next/link';
import { categories } from '@/lib/tool-registry';

export default function ToolsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">All Tool Categories</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/tools/${category.id}`}
            className="panel p-4 transition hover:-translate-y-0.5 hover:border-accent"
          >
            <p className="text-base font-semibold">{category.label}</p>
            <p className="mt-1 text-sm text-muted">{category.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}