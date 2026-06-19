/**
 * Executable check for lib/cms-detect.ts (CMS fingerprint confidence/evidence).
 *   node --experimental-strip-types scripts/checks/cms-detect.check.mjs
 */
import { detectCms } from '../../lib/cms-detect.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};
const find = (result, name) => result.candidates.find((c) => c.name === name);

// strong WordPress: 3 signals -> high confidence
{
  const r = detectCms('<link href="/wp-content/x.css"><script src="/wp-includes/y.js"></script>/wp-json/');
  const wp = find(r, 'WordPress');
  check('WordPress detected', !!wp);
  check('WordPress high confidence', wp && wp.confidence === 'high');
  check('WordPress evidence >=3', wp && wp.evidence.length >= 3);
  check('status detected', r.status === 'detected');
}

// single weak signal -> low confidence
{
  const r = detectCms('<div class="wp-content-wrapper">');
  const wp = find(r, 'WordPress');
  check('single signal low confidence', wp && wp.confidence === 'low' && wp.evidence.length === 1);
}

// meta generator alone -> low
{
  const r = detectCms('<meta name="generator" content="WordPress 6.4">');
  check('meta generator -> WordPress low', find(r, 'WordPress')?.confidence === 'low');
}

// two signals -> medium
{
  const r = detectCms('<div class="shopify-section"><script>window.Shopify={};</script> cdn.shopify.com');
  const s = find(r, 'Shopify');
  check('Shopify medium (2-3 signals)', s && (s.confidence === 'medium' || s.confidence === 'high'));
}
{
  const r = detectCms('<script id="__NEXT_DATA__"></script><script src="/_next/static/chunk.js"></script>');
  check('Next.js medium', find(r, 'Next.js')?.confidence === 'medium');
}

// inconclusive
{
  const r = detectCms('<html><body><h1>Just a plain page</h1></body></html>');
  check('plain page inconclusive', r.status === 'inconclusive' && r.candidates.length === 0);
}
{
  const r = detectCms('');
  check('empty inconclusive', r.status === 'inconclusive');
}

// sorted by evidence strength
{
  const r = detectCms('/wp-content/ /wp-json/ /wp-includes/ __NUXT__');
  check('strongest candidate first', r.candidates[0]?.name === 'WordPress');
}

console.log(`\ncms-detect: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
