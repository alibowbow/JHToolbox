/**
 * Recording over a clip ("punch-in"), on plain sample arrays so it can be
 * checked in Node. Positions are frames on the project timeline.
 */

export interface PunchInResult {
  channels: Float32Array<ArrayBuffer>[];
  /** Where the resulting clip starts, in frames. */
  startFrame: number;
}

/**
 * The take replaces the clip's audio from where it starts. The clip grows
 * when the take starts before it or runs past its end (so recording at the
 * clip's end continues it), and a gap between them stays silent. Where the
 * take meets audio that stays, `fadeFrames` of crossfade avoid a click.
 * Mono and stereo mix: a mono side is used for both channels.
 */
export function punchIn(
  clip: Float32Array[] | null,
  clipStartFrame: number,
  take: Float32Array[],
  takeStartFrame: number,
  fadeFrames = 0,
): PunchInResult {
  const clipLength = clip?.[0]?.length ?? 0;
  const takeLength = take[0]?.length ?? 0;
  if (!clip || clip.length === 0 || clipLength === 0) {
    return { channels: take.map((channel) => new Float32Array(channel)), startFrame: takeStartFrame };
  }

  const startFrame = Math.min(clipStartFrame, takeStartFrame);
  const clipOffset = clipStartFrame - startFrame;
  const takeOffset = takeStartFrame - startFrame;
  const clipEnd = clipOffset + clipLength;
  const takeEnd = takeOffset + takeLength;
  const length = Math.max(clipEnd, takeEnd);
  const channelCount = Math.max(clip.length, take.length, 1);
  // Joins only need a crossfade where the clip's audio continues past them.
  const fadeIn = fadeFrames > 0 && takeOffset > clipOffset && takeOffset < clipEnd;
  const fadeOut = fadeFrames > 0 && takeEnd > clipOffset && takeEnd < clipEnd;

  const channels = Array.from({ length: channelCount }, (_, channelIndex) => {
    const out = new Float32Array(length);
    const clipData = clip[Math.min(channelIndex, clip.length - 1)];
    const takeData = take[Math.min(channelIndex, take.length - 1)] ?? new Float32Array(0);
    out.set(clipData, clipOffset);

    for (let index = 0; index < takeLength; index += 1) {
      const position = takeOffset + index;
      let weight = 1;
      if (fadeIn && index < fadeFrames) {
        weight = index / fadeFrames;
      }
      if (fadeOut && index >= takeLength - fadeFrames) {
        weight = Math.min(weight, (takeLength - index) / fadeFrames);
      }
      const under = position >= clipOffset && position < clipEnd ? clipData[position - clipOffset] : 0;
      out[position] = weight === 1 ? takeData[index] : takeData[index] * weight + under * (1 - weight);
    }
    return out;
  });

  return { channels, startFrame };
}
