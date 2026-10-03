/** Prepared exports never imply a download or a completed disk write. */
import assert from 'node:assert/strict';
import { exportAudio, saveBlobFile } from '../../lib/audio/AudioExporter.ts';

let passed = 0;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalCreateObjectURL = URL.createObjectURL;
const blob = new Blob(['test audio'], { type: 'audio/wav' });
const types = [{ description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } }];
const save = () => saveBlobFile({ blob, filename: 'my recording.wav', types });
async function check(name, run) {
  const browser = {};
  globalThis.window = browser;
  globalThis.document = { createElement() { assert.fail('Must not create hidden download links'); } };
  URL.createObjectURL = () => { assert.fail('The UI owns export URLs'); };
  try { await run(browser); passed += 1; }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
try {
  await check('unsupported picker is explicitly unavailable', async () => {
    assert.equal(await save(), 'unavailable');
  });
  for (const name of ['SecurityError', 'NotAllowedError', 'NotSupportedError']) {
    for (const sync of [false, true]) {
      await check(`${name} returns unavailable without downloading`, async (browser) => {
        const error = new DOMException('Unavailable', name);
        browser.showSaveFilePicker = sync ? () => { throw error; } : () => Promise.reject(error);
        assert.equal(await save(), 'unavailable');
      });
    }
  }
  for (const error of [new DOMException('', 'AbortError'), { name: 'AbortError' }]) {
    await check('cancel is distinct from saved', async (browser) => {
      browser.showSaveFilePicker = async () => { throw error; };
      assert.equal(await save(), 'cancelled');
    });
  }
  await check('picker starts synchronously; saved only after close resolves', async (browser) => {
    let picked = false;
    let finishClose;
    const closed = new Promise(resolve => { finishClose = resolve; });
    const calls = [];
    browser.showSaveFilePicker = (options) => {
      picked = true;
      assert.deepEqual(options, { suggestedName: 'my recording.wav', excludeAcceptAllOption: false, types });
      return Promise.resolve({ createWritable: async () => ({
        write: async (data) => { assert.equal(data, blob); calls.push('write'); },
        close: async () => { calls.push('close'); await closed; },
      }) });
    };
    let result;
    const saving = save().then(value => { result = value; });
    assert.equal(picked, true);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(calls, ['write', 'close']);
    assert.equal(result, undefined);
    finishClose();
    await saving;
    assert.equal(result, 'saved');
  });
  for (const stage of ['createWritable', 'write', 'close']) {
    for (const name of ['NotAllowedError', 'AbortError', 'QuotaExceededError']) {
      await check(`${stage} ${name} remains a failure and aborts the stream`, async (browser) => {
        const error = new DOMException('Could not write file', name);
        let aborted = 0;
        browser.showSaveFilePicker = async () => ({ createWritable: async () => {
          if (stage === 'createWritable') throw error;
          return {
            write: async () => { if (stage === 'write') throw error; },
            close: async () => { if (stage === 'close') throw error; },
            abort: async () => { aborted += 1; throw new Error('Abort also failed'); },
          };
        } });
        await assert.rejects(save, actual => actual === error);
        assert.equal(aborted, stage === 'createWritable' ? 0 : 1);
      });
    }
  }
  await check('unexpected picker errors propagate', async browser => {
    browser.showSaveFilePicker = async () => { throw new TypeError('Invalid options'); };
    await assert.rejects(save, /Invalid options/);
  });
  await check('cancel then retry writes the same Blob', async browser => {
    browser.showSaveFilePicker = async () => { throw { name: 'AbortError' }; };
    assert.equal(await save(), 'cancelled');
    browser.showSaveFilePicker = async () => ({ createWritable: async () => ({
      write: async data => assert.equal(data, blob), close: async () => {},
    }) });
    assert.equal(await save(), 'saved');
  });
  await check('WAV encoding retains exact payload and sanitized name without saving', async browser => {
    browser.showSaveFilePicker = () => assert.fail('Encoding must not open a picker');
    const buffer = { numberOfChannels: 1, sampleRate: 44_100, length: 3, getChannelData: () => new Float32Array([0, 0.5, -0.5]) };
    const file = await exportAudio({ buffer, format: 'wav', filename: 'my:take.mp3' });
    assert.equal(file.filename, 'my-take.wav');
    assert.equal(file.blob.type, 'audio/wav');
    const bytes = Buffer.from(await file.blob.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WAVE');
    assert.equal(bytes.length, 50);
    assert.equal(bytes.readInt16LE(46), 16384);
  });
  await check('non-browser never claims saved', async () => {
    delete globalThis.window;
    assert.equal(await save(), 'unavailable');
  });
} finally {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete globalThis.window;
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else delete globalThis.document;
  URL.createObjectURL = originalCreateObjectURL;
}
console.log(`audio-save: ${passed} passed`);
