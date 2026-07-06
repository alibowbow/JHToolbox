/**
 * Executable check for the pipeline engine, compatibility, and storage
 * validation. Injects fake tools so the whole chaining/conversion/progress/
 * error path is exercised without a browser.
 *   npm run check:pipeline
 */
import { runPipeline } from '../../lib/pipeline/engine.ts';
import { describeAcceptMismatch, matchesAccept } from '../../lib/pipeline/compatibility.ts';
import { sanitizePipeline } from '../../lib/pipeline/storage.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

// Fake tool runner that records what each step received.
const makeRunner = () => {
  const calls = [];
  const runStep = async (ctx) => {
    calls.push({
      toolId: ctx.toolId,
      names: ctx.files.map((f) => f.name),
      types: ctx.files.map((f) => f.type),
      options: ctx.options,
    });
    ctx.onProgress({ percent: 50, stage: 'working' });
    if (ctx.toolId === 'fail') throw new Error('boom');
    if (ctx.toolId === 'empty') return [];
    if (ctx.toolId === 'to-pdf') return [{ name: 'out.pdf', blob: new Blob(['%PDF-1.4']), mimeType: 'application/pdf' }];
    if (ctx.toolId === 'echo-2')
      return [
        { name: 'a.png', blob: new Blob(['aaa']), mimeType: 'image/png' },
        { name: 'b.png', blob: new Blob(['bbb']), mimeType: 'image/png' },
      ];
    return [{ name: 'x.txt', blob: new Blob(['x']), mimeType: 'text/plain' }];
  };
  return { calls, runStep };
};

const src = [new File(['seed'], 'seed.jpg', { type: 'image/jpeg' })];

// --- 1. Two-step chain: step 2 receives step 1's converted outputs ----------
{
  const { calls, runStep } = makeRunner();
  const result = await runPipeline({
    steps: [{ toolId: 'echo-2', options: {} }, { toolId: 'to-pdf', options: { q: 1 } }],
    files: src,
    runStep,
  });
  check('chain: ok', result.ok === true && result.failedStepIndex === null);
  check('chain: final files are the last step output', result.finalFiles.length === 1 && result.finalFiles[0].name === 'out.pdf');
  check('chain: final files are ProcessedFile (blob+mime)', result.finalFiles[0].mimeType === 'application/pdf' && result.finalFiles[0].blob instanceof Blob);
  check('chain: step 1 got the uploaded file', calls[0].names[0] === 'seed.jpg');
  check('chain: step 2 got step 1 outputs converted to Files', JSON.stringify(calls[1].names) === JSON.stringify(['a.png', 'b.png']));
  check('chain: conversion preserved mime type', JSON.stringify(calls[1].types) === JSON.stringify(['image/png', 'image/png']));
  check('chain: options passed through', calls[1].options.q === 1);
  check('chain: two successful step results', result.steps.length === 2 && result.steps.every((s) => s.ok));
}

// --- 2. Converted File content round-trips ----------------------------------
{
  let received = null;
  const runStep = async (ctx) => {
    received = ctx.files[0];
    return [{ name: 'done', blob: new Blob(['end']), mimeType: 'text/plain' }];
  };
  await runPipeline({
    steps: [{ toolId: 'a', options: {} }, { toolId: 'b', options: {} }],
    files: src,
    runStep: async (ctx) =>
      ctx.toolId === 'a'
        ? [{ name: 'mid.bin', blob: new Blob(['hello-bytes']), mimeType: 'application/octet-stream' }]
        : runStep(ctx),
  });
  check('conversion: next step File keeps name + content', received?.name === 'mid.bin' && (await received.text()) === 'hello-bytes');
}

// --- 3. Progress is monotonic and ends at 100 -------------------------------
{
  const { runStep } = makeRunner();
  const overall = [];
  const result = await runPipeline({
    steps: [{ toolId: 'echo-2', options: {} }, { toolId: 'to-pdf', options: {} }],
    files: src,
    runStep,
    onProgress: (p) => overall.push(p.overallPercent),
  });
  check('progress: reported', overall.length > 0);
  check('progress: non-decreasing', overall.every((v, i) => i === 0 || v >= overall[i - 1]));
  check('progress: ends at 100', overall[overall.length - 1] === 100 && result.ok);
  check('progress: mid-run below 100', overall[0] < 100);
}

// --- 4. Empty pipeline throws -----------------------------------------------
{
  let threw = false;
  try {
    await runPipeline({ steps: [], files: src, runStep: async () => [] });
  } catch {
    threw = true;
  }
  check('empty pipeline throws', threw === true);
}

// --- 5. A throwing step stops the run, reports which failed -----------------
{
  const { calls, runStep } = makeRunner();
  const result = await runPipeline({
    steps: [{ toolId: 'echo-2', options: {} }, { toolId: 'fail', options: {} }, { toolId: 'to-pdf', options: {} }],
    files: src,
    runStep,
  });
  check('throw: ok false', result.ok === false);
  check('throw: failedStepIndex = 1', result.failedStepIndex === 1);
  check('throw: error captured', result.steps[1].error === 'boom');
  check('throw: no final files', result.finalFiles.length === 0);
  check('throw: later step never ran', !calls.some((c) => c.toolId === 'to-pdf'));
}

// --- 6. A step producing no files stops the run -----------------------------
{
  const { runStep } = makeRunner();
  const result = await runPipeline({
    steps: [{ toolId: 'empty', options: {} }, { toolId: 'to-pdf', options: {} }],
    files: src,
    runStep,
  });
  check('empty output: ok false', result.ok === false && result.failedStepIndex === 0);
  check('empty output: explains no files', /no output files/.test(result.steps[0].error ?? ''));
}

// --- 7. Accept mismatch warns but still runs --------------------------------
{
  const { runStep } = makeRunner();
  const result = await runPipeline({
    steps: [{ toolId: 'to-pdf', options: {} }, { toolId: 'img-tool', options: {} }],
    files: src,
    runStep,
    acceptForTool: (id) => (id === 'img-tool' ? 'image/*' : undefined),
  });
  check('warn: pipeline still succeeds', result.ok === true);
  check('warn: step 2 carries a warning', Boolean(result.steps[1].warning));
  check('warn: step 1 has no warning', !result.steps[0].warning);
}
{
  const { runStep } = makeRunner();
  const result = await runPipeline({
    steps: [{ toolId: 'echo-2', options: {} }, { toolId: 'img-tool', options: {} }],
    files: src,
    runStep,
    acceptForTool: (id) => (id === 'img-tool' ? 'image/*' : undefined),
  });
  check('warn: matching input produces no warning', result.ok && !result.steps[1].warning);
}

// --- 8. Cancellation ---------------------------------------------------------
{
  const { calls, runStep } = makeRunner();
  const result = await runPipeline({
    steps: [{ toolId: 'echo-2', options: {} }],
    files: src,
    runStep,
    signal: { aborted: true },
  });
  check('cancel: ok false at step 0', result.ok === false && result.failedStepIndex === 0);
  check('cancel: nothing ran', calls.length === 0);
}

// --- 9. Max steps guard ------------------------------------------------------
{
  let threw = false;
  try {
    await runPipeline({ steps: Array.from({ length: 21 }, () => ({ toolId: 'x', options: {} })), files: src, runStep: async () => [{ name: 'a', blob: new Blob(['a']), mimeType: 'text/plain' }] });
  } catch {
    threw = true;
  }
  check('max steps throws', threw === true);
}

// --- 10. matchesAccept -------------------------------------------------------
check('accept: wildcard', matchesAccept('*', 'a.pdf', 'application/pdf') && matchesAccept(undefined, 'a', 'x'));
check('accept: extension', matchesAccept('.pdf', 'report.PDF', '') && !matchesAccept('.pdf', 'a.png', 'image/png'));
check('accept: wildcard mime', matchesAccept('image/*', 'a.png', 'image/png') && !matchesAccept('image/*', 'a.pdf', 'application/pdf'));
check('accept: exact mime', matchesAccept('application/pdf', 'a', 'application/pdf'));
check('accept: comma list', matchesAccept('.png,.jpg,image/*', 'a.webp', 'image/webp'));
check('accept: describeAcceptMismatch none when matching', describeAcceptMismatch('image/*', [{ name: 'a.png', type: 'image/png' }]) === undefined);
check('accept: describeAcceptMismatch warns when not', typeof describeAcceptMismatch('.pdf', [{ name: 'a.png', type: 'image/png' }]) === 'string');

// --- 11. sanitizePipeline ----------------------------------------------------
check('sanitize: valid pipeline kept', (() => {
  const p = sanitizePipeline({ id: 'p1', name: '  My recipe ', steps: [{ toolId: 'pdf-merge', options: { a: 1, bad: {} } }] });
  return p?.id === 'p1' && p.name === 'My recipe' && p.steps.length === 1 && p.steps[0].options.a === 1 && !('bad' in p.steps[0].options);
})());
check('sanitize: bad steps dropped', sanitizePipeline({ id: 'p', name: 'x', steps: [{ toolId: 'ok', options: {} }, { nope: true }, 42] })?.steps.length === 1);
check('sanitize: rejects non-object / missing id', sanitizePipeline(null) === null && sanitizePipeline({ name: 'x' }) === null);
check('sanitize: default name', sanitizePipeline({ id: 'p', steps: [] })?.name === 'Untitled recipe');

console.log(`\npipeline: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
