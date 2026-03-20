import { Suspense } from 'react';
import { ToolWorkbench } from '@/components/tool-ui/tool-workbench';
import { getToolById } from '@/lib/tool-registry';

const batchTool = getToolById('audio-convert');

export default function AudioBatchPage() {
  if (!batchTool) {
    throw new Error('Audio converter tool was not found.');
  }

  return (
    <Suspense fallback={null}>
      <ToolWorkbench tool={batchTool} categoryId="audio" />
    </Suspense>
  );
}
