/**
 * Heuristic CMS fingerprinting from page HTML (no runtime dependencies → unit
 * testable). Replaces a flat "detected: string[]" verdict with per-candidate
 * evidence and a confidence level, plus an explicit "inconclusive" status, so
 * the tool does not overstate certainty.
 */

export type CmsConfidence = 'high' | 'medium' | 'low';

export interface CmsCandidate {
  name: string;
  /** Signal ids that matched (the evidence). */
  evidence: string[];
  confidence: CmsConfidence;
}

export interface CmsDetectionResult {
  candidates: CmsCandidate[];
  status: 'detected' | 'inconclusive';
}

interface CmsDefinition {
  name: string;
  signals: Array<{ id: string; pattern: RegExp }>;
}

const CMS_DEFINITIONS: CmsDefinition[] = [
  {
    name: 'WordPress',
    signals: [
      { id: 'wp-content', pattern: /wp-content/i },
      { id: 'wp-json', pattern: /wp-json/i },
      { id: 'wp-includes', pattern: /wp-includes/i },
      { id: 'meta-generator', pattern: /<meta[^>]+generator[^>]+wordpress/i },
    ],
  },
  {
    name: 'Shopify',
    signals: [
      { id: 'cdn-shopify', pattern: /cdn\.shopify/i },
      { id: 'shopify-section', pattern: /shopify-section/i },
      { id: 'shopify-features', pattern: /shopify\.features|window\.Shopify/i },
    ],
  },
  {
    name: 'Wix',
    signals: [
      { id: 'wix-static', pattern: /static\.wix(static)?\.com/i },
      { id: 'wix-meta', pattern: /<meta[^>]+generator[^>]+wix/i },
      { id: 'wix-warmup', pattern: /wix-warmup-data|wixBiSession/i },
    ],
  },
  {
    name: 'Squarespace',
    signals: [
      { id: 'static-squarespace', pattern: /static\.squarespace\.com/i },
      { id: 'squarespace-context', pattern: /Squarespace\.Context|squarespace-headers/i },
    ],
  },
  {
    name: 'Drupal',
    signals: [
      { id: 'drupal-settings', pattern: /drupal-settings-json/i },
      { id: 'sites-default', pattern: /sites\/(default|all)\/(modules|themes)/i },
      { id: 'meta-generator', pattern: /<meta[^>]+generator[^>]+drupal/i },
    ],
  },
  {
    name: 'Joomla',
    signals: [
      { id: 'com-content', pattern: /com_content|option=com_/i },
      { id: 'meta-generator', pattern: /<meta[^>]+generator[^>]+joomla/i },
      { id: 'media-jui', pattern: /\/media\/jui\//i },
    ],
  },
  {
    name: 'Ghost',
    signals: [
      { id: 'ghost-api', pattern: /ghost-content-api|content\/ghost/i },
      { id: 'meta-generator', pattern: /<meta[^>]+generator[^>]+ghost/i },
    ],
  },
  {
    name: 'Next.js',
    signals: [
      { id: 'next-data', pattern: /__NEXT_DATA__/i },
      { id: 'next-static', pattern: /\/_next\/static\//i },
    ],
  },
  {
    name: 'Nuxt',
    signals: [
      { id: 'nuxt-data', pattern: /__NUXT__/i },
      { id: 'nuxt-static', pattern: /\/_nuxt\//i },
    ],
  },
];

function confidenceFor(matchCount: number): CmsConfidence {
  if (matchCount >= 3) return 'high';
  if (matchCount === 2) return 'medium';
  return 'low';
}

export function detectCms(html: string): CmsDetectionResult {
  const source = typeof html === 'string' ? html : '';
  const candidates: CmsCandidate[] = [];

  for (const cms of CMS_DEFINITIONS) {
    const evidence = cms.signals.filter((signal) => signal.pattern.test(source)).map((signal) => signal.id);
    if (evidence.length > 0) {
      candidates.push({ name: cms.name, evidence, confidence: confidenceFor(evidence.length) });
    }
  }

  candidates.sort((a, b) => b.evidence.length - a.evidence.length);
  return { candidates, status: candidates.length > 0 ? 'detected' : 'inconclusive' };
}
