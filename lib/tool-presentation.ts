import { Archive, FileAudio2, FileImage, FileSearch2, FileText, FileVideo2, Globe, LucideIcon, Monitor } from 'lucide-react';
import { AppDictionary } from '@/lib/i18n';
import { ToolCategory } from '@/types/tool';
import { ToolBrowseGroup } from '@/types/tool';

export const categoryIcons: Record<ToolCategory, LucideIcon> = {
  pdf: FileText,
  image: FileImage,
  ocr: FileSearch2,
  video: FileVideo2,
  audio: FileAudio2,
  file: Archive,
  web: Globe,
  screen: Monitor,
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
    border: 'hover:border-border-bright',
    gradient: 'from-rose-500/14 via-rose-500/4 to-transparent',
    badge: 'border-rose-400/20 bg-rose-500/10 text-rose-300',
  },
  image: {
    icon: 'text-sky-300',
    iconBg: 'bg-sky-500/10',
    dot: 'bg-sky-400',
    border: 'hover:border-border-bright',
    gradient: 'from-sky-500/14 via-sky-500/4 to-transparent',
    badge: 'border-sky-400/20 bg-sky-500/10 text-sky-300',
  },
  ocr: {
    icon: 'text-violet-300',
    iconBg: 'bg-violet-500/10',
    dot: 'bg-violet-400',
    border: 'hover:border-border-bright',
    gradient: 'from-violet-500/14 via-violet-500/4 to-transparent',
    badge: 'border-violet-400/20 bg-violet-500/10 text-violet-300',
  },
  video: {
    icon: 'text-orange-300',
    iconBg: 'bg-orange-500/10',
    dot: 'bg-orange-400',
    border: 'hover:border-border-bright',
    gradient: 'from-orange-500/14 via-orange-500/4 to-transparent',
    badge: 'border-orange-400/20 bg-orange-500/10 text-orange-300',
  },
  audio: {
    icon: 'text-emerald-300',
    iconBg: 'bg-emerald-500/10',
    dot: 'bg-emerald-400',
    border: 'hover:border-border-bright',
    gradient: 'from-emerald-500/14 via-emerald-500/4 to-transparent',
    badge: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
  },
  file: {
    icon: 'text-amber-300',
    iconBg: 'bg-amber-500/10',
    dot: 'bg-amber-400',
    border: 'hover:border-border-bright',
    gradient: 'from-amber-500/14 via-amber-500/4 to-transparent',
    badge: 'border-amber-400/20 bg-amber-500/10 text-amber-300',
  },
  web: {
    icon: 'text-cyan-300',
    iconBg: 'bg-cyan-500/10',
    dot: 'bg-cyan-400',
    border: 'hover:border-border-bright',
    gradient: 'from-cyan-500/14 via-cyan-500/4 to-transparent',
    badge: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300',
  },
  screen: {
    icon: 'text-fuchsia-300',
    iconBg: 'bg-fuchsia-500/10',
    dot: 'bg-fuchsia-400',
    border: 'hover:border-border-bright',
    gradient: 'from-fuchsia-500/14 via-fuchsia-500/4 to-transparent',
    badge: 'border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-300',
  },
};

export const browseGroupOrder: ToolBrowseGroup[] = ['popular', 'new', 'editor-enabled', 'convert', 'trim', 'compress', 'merge', 'capture'];

export function getBrowseGroupSections(directoryCopy: AppDictionary['directory']) {
  return browseGroupOrder.map((id) => {
    const copy = {
      popular: {
        label: directoryCopy.popularTitle,
        description: directoryCopy.popularDescription,
      },
      new: {
        label: directoryCopy.newTitle,
        description: directoryCopy.newDescription,
      },
      'editor-enabled': {
        label: directoryCopy.editorEnabledTitle,
        description: directoryCopy.editorEnabledDescription,
      },
      convert: {
        label: directoryCopy.convertTitle,
        description: directoryCopy.convertDescription,
      },
      trim: {
        label: directoryCopy.trimTitle,
        description: directoryCopy.trimDescription,
      },
      compress: {
        label: directoryCopy.compressTitle,
        description: directoryCopy.compressDescription,
      },
      merge: {
        label: directoryCopy.mergeTitle,
        description: directoryCopy.mergeDescription,
      },
      capture: {
        label: directoryCopy.captureTitle,
        description: directoryCopy.captureDescription,
      },
    }[id];

    return {
      id,
      label: copy.label,
      description: copy.description,
    };
  });
}
