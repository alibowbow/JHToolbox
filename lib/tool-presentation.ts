import { Archive, FileAudio2, FileImage, FileSearch2, FileText, FileVideo2, Globe, LucideIcon } from 'lucide-react';
import { ToolCategory } from '@/types/tool';

export const categoryIcons: Record<ToolCategory, LucideIcon> = {
  pdf: FileText,
  image: FileImage,
  ocr: FileSearch2,
  video: FileVideo2,
  audio: FileAudio2,
  file: Archive,
  web: Globe,
};

export const categoryStyles: Record<
  ToolCategory,
  {
    icon: string;
    iconBg: string;
    dot: string;
    border: string;
    gradient: string;
    badge: string;
  }
> = {
  pdf: {
    icon: 'text-rose-300',
    iconBg: 'bg-rose-500/10',
    dot: 'bg-rose-400',
    border: 'hover:border-rose-400/30',
    gradient: 'from-rose-500/14 via-rose-500/4 to-transparent',
    badge: 'border-rose-400/20 bg-rose-500/10 text-rose-300',
  },
  image: {
    icon: 'text-sky-300',
    iconBg: 'bg-sky-500/10',
    dot: 'bg-sky-400',
    border: 'hover:border-sky-400/30',
    gradient: 'from-sky-500/14 via-sky-500/4 to-transparent',
    badge: 'border-sky-400/20 bg-sky-500/10 text-sky-300',
  },
  ocr: {
    icon: 'text-violet-300',
    iconBg: 'bg-violet-500/10',
    dot: 'bg-violet-400',
    border: 'hover:border-violet-400/30',
    gradient: 'from-violet-500/14 via-violet-500/4 to-transparent',
    badge: 'border-violet-400/20 bg-violet-500/10 text-violet-300',
  },
  video: {
    icon: 'text-orange-300',
    iconBg: 'bg-orange-500/10',
    dot: 'bg-orange-400',
    border: 'hover:border-orange-400/30',
    gradient: 'from-orange-500/14 via-orange-500/4 to-transparent',
    badge: 'border-orange-400/20 bg-orange-500/10 text-orange-300',
  },
  audio: {
    icon: 'text-emerald-300',
    iconBg: 'bg-emerald-500/10',
    dot: 'bg-emerald-400',
    border: 'hover:border-emerald-400/30',
    gradient: 'from-emerald-500/14 via-emerald-500/4 to-transparent',
    badge: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
  },
  file: {
    icon: 'text-amber-300',
    iconBg: 'bg-amber-500/10',
    dot: 'bg-amber-400',
    border: 'hover:border-amber-400/30',
    gradient: 'from-amber-500/14 via-amber-500/4 to-transparent',
    badge: 'border-amber-400/20 bg-amber-500/10 text-amber-300',
  },
  web: {
    icon: 'text-cyan-300',
    iconBg: 'bg-cyan-500/10',
    dot: 'bg-cyan-400',
    border: 'hover:border-cyan-400/30',
    gradient: 'from-cyan-500/14 via-cyan-500/4 to-transparent',
    badge: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300',
  },
};
