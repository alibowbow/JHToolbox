'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { FileAudio2, FileCode2, FileImage, FileSearch2, FileText, FileVideo2, Globe, Wrench } from 'lucide-react';
import { ToolDefinition } from '@/types/tool';

function iconOf(category: ToolDefinition['category']) {
  if (category === 'pdf') return FileText;
  if (category === 'image') return FileImage;
  if (category === 'ocr') return FileSearch2;
  if (category === 'video') return FileVideo2;
  if (category === 'audio') return FileAudio2;
  if (category === 'file') return FileCode2;
  if (category === 'web') return Globe;
  return Wrench;
}

export function ToolCard({ tool }: { tool: ToolDefinition }) {
  const Icon = iconOf(tool.category);

  return (
    <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
      <Link href={`/tools/${tool.category}/${tool.id}`} className="panel block h-full p-4 transition hover:border-accent">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-accent/10 p-2 text-accent">
            <Icon size={18} />
          </span>
          <p className="font-semibold">{tool.name}</p>
        </div>
        <p className="mt-3 text-sm text-muted">{tool.description}</p>
      </Link>
    </motion.div>
  );
}