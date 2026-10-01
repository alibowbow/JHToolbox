/** Save-picker compatibility and cancellation checks for all audio exports. */
import assert from 'node:assert/strict';
import { exportAudio, saveBlobFile } from '../../lib/audio/AudioExporter.ts';

let passed = 0;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

async function check(name, run) {
  const state = { downloads: [], blobs: [], revoked: [], timers: [], removed: 0 };
  const browser = { setTimeout: (callback, delay) => state.timers.push({ callback, delay }) };
  globalThis.window = browser;
  globalThis.document = {
    body: { appendChild: (anchor) => { anchor.attached = true; } },
    createElement: (tag) => {
      assert.equal(tag, 'a');
      const anchor = {
        style: {},
        click() { assert.equal(this.attached, true); state.downloads.push(this); },
        remove() { state.removed += 1; },
      };
      return anchor;
    },
  };
  URL.createObjectURL = (blob) => { state.blobs.push(blob); return `blob:test-${state.blobs.length}`; };
  URL.revokeObjectURL = (url) => state.revoked.push(url);
  try {
    await run(browser, state);
    passed += 1;
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
const blob = new Blob(['test audio'], { type: 'audio/wav' });
const types = [{ description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } }];
const save = () => saveBlobFile({ blob, filename: 'my recording.wav', types });

try {
  await check('unsupported picker uses a single normal download and releases resources later', async (_, state) => {
    assert.equal(await save(), true);
    assert.deepEqual(state.blobs, [blob]);
    assert.equal(state.downloads.length, 1);
    assert.equal(state.downloads[0].download, 'my recording.wav');
    assert.equal(state.downloads[0].href, 'blob:test-1');
    assert.equal(state.removed, 1);
    assert.deepEqual(state.revoked, []);
    assert.equal(state.timers.length, 1);
    assert.equal(state.timers[0].delay, 60_000);
    state.timers[0].callback();
    assert.deepEqual(state.revoked, ['blob:test-1']);
  });

  for (const name of ['SecurityError', 'NotAllowedError', 'NotSupportedError']) {
    for (const synchronous of [false, true]) {
      await check(`${name}, ${synchronous ? 'thrown' : 'rejected'}, uses a download`, async (browser, state) => {
        const error = new DOMException('Picker unavailable in this context', name);
        browser.showSaveFilePicker = synchronous ? () => { throw error; } : () => Promise.reject(error);
        assert.equal(await save(), true);
        assert.equal(state.downloads.length, 1);
        assert.deepEqual(state.blobs, [blob]);
      });
    }
  }

  for (const error of [new DOMException('User cancelled', 'AbortError'), { name: 'AbortError' }]) {
    await check('cancellation never triggers a fallback or reports success', async (browser, state) => {
      browser.showSaveFilePicker = async () => { throw error; };
      assert.equal(await save(), false);
      assert.equal(state.downloads.length, 0);
      assert.equal(state.blobs.length, 0);
    });
  }

  await check('a synchronous cancellation does not download', async (browser, state) => {
    browser.showSaveFilePicker = () => { throw new DOMException('User cancelled', 'AbortError'); };
    assert.equal(await save(), false);
    assert.equal(state.downloads.length, 0);
  });

  await check('picker success writes and closes exactly once', async (browser, state) => {
    const calls = [];
    browser.showSaveFilePicker = async (options) => {
      assert.deepEqual(options, { suggestedName: 'my recording.wav', excludeAcceptAllOption: false, types });
      return { createWritable: async () => ({
        write: async (data) => { assert.equal(data, blob); calls.push('write'); },
        close: async () => { calls.push('close'); },
      }) };
    };
    assert.equal(await save(), true);
    assert.deepEqual(calls, ['write', 'close']);
    assert.equal(state.downloads.length, 0);
  });

  for (const error of [new TypeError('Invalid picker options'), new Error('Unexpected picker failure')]) {
    await check('unexpected picker failures remain visible', async (browser, state) => {
      browser.showSaveFilePicker = async () => { throw error; };
      await assert.rejects(save, (actual) => actual === error);
      assert.equal(state.downloads.length, 0);
    });
  }

  for (const stage of ['createWritable', 'write', 'close']) {
    for (const name of ['NotAllowedError', 'AbortError', 'QuotaExceededError']) {
      await check(`${stage} ${name} does not cause a second file`, async (browser, state) => {
        const error = new DOMException('Could not write file', name);
        browser.showSaveFilePicker = async () => ({ createWritable: async () => {
          if (stage === 'createWritable') throw error;
          return {
            write: async () => { if (stage === 'write') throw error; },
            close: async () => { if (stage === 'close') throw error; },
          };
        } });
        await assert.rejects(save, (actual) => actual === error);
        assert.equal(state.downloads.length, 0);
      });
    }
  }

  await check('a cancelled save can be retried normally', async (browser, state) => {
    let attempts = 0;
    browser.showSaveFilePicker = async () => {
      attempts += 1;
      throw new DOMException('', attempts === 1 ? 'AbortError' : 'SecurityError');
    };
    assert.equal(await save(), false);
    assert.equal(await save(), true);
    assert.equal(state.downloads.length, 1);
  });

  for (const [filename, mime] of [['recording.mp3', 'audio/mpeg'], ['recording.jhaudio', 'application/json']]) {
    await check(`${mime} preserves the exact payload and filename`, async (browser, state) => {
      browser.showSaveFilePicker = async () => { throw new DOMException('', 'SecurityError'); };
      const payload = new Blob(['encoded content'], { type: mime });
      assert.equal(await saveBlobFile({ blob: payload, filename }), true);
      assert.deepEqual(state.blobs, [payload]);
      assert.equal(state.downloads[0].download, filename);
    });
  }

  await check('WAV exporter preserves encoding and a sanitized filename on fallback', async (browser, state) => {
    browser.showSaveFilePicker = async () => { throw new DOMException('', 'NotAllowedError'); };
    const buffer = { numberOfChannels: 1, sampleRate: 44_100, length: 3, getChannelData: () => new Float32Array([0, 0.5, -0.5]) };
    assert.equal(await exportAudio({ buffer, format: 'wav', filename: 'my:take.mp3' }), true);
    assert.equal(state.downloads[0].download, 'my-take.wav');
    assert.equal(state.blobs[0].type, 'audio/wav');
    const bytes = Buffer.from(await state.blobs[0].arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WAVE');
    assert.equal(bytes.length, 50);
  });

  await check('non-browser calls do not claim to have saved', async (_, state) => {
    delete globalThis.window;
    delete globalThis.document;
    assert.equal(await save(), false);
    assert.equal(state.downloads.length, 0);
  });

  await check('download failure still releases the anchor and URL', async (_, state) => {
    const error = new Error('Download failed');
    globalThis.document.body.appendChild = () => { throw error; };
    await assert.rejects(save, (actual) => actual === error);
    assert.equal(state.removed, 1);
    assert.equal(state.timers.length, 1);
    state.timers[0].callback();
    assert.deepEqual(state.revoked, ['blob:test-1']);
  });
} finally {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete globalThis.window;
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else delete globalThis.document;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
}
console.log(`audio-save: ${passed} passed`);
