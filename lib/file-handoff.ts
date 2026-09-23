/**
 * Passes result files to the next tool ("continue with…") during client-side
 * navigation. Memory only: nothing is stored or uploaded, and a reload
 * starts fresh. Reading does not consume the hand-off (React may mount a page
 * twice in development); it simply expires after a few seconds.
 */
type Handoff = { targetToolId: string; files: File[]; createdAt: number };

const HANDOFF_TTL_MS = 8000;
let pending: Handoff | null = null;

export function handOffFiles(files: File[], targetToolId: string) {
  pending = { targetToolId, files, createdAt: Date.now() };
}

export function receiveHandedOffFiles(toolId: string): File[] | null {
  if (!pending || pending.targetToolId !== toolId || Date.now() - pending.createdAt > HANDOFF_TTL_MS) {
    return null;
  }
  return pending.files;
}
