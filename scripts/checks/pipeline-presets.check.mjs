/**
 * Executable check for lib/pipeline/presets.ts against the real registry:
 * every preset uses existing tools with option values those tools offer, and
 * each step's output is an accepted input of the next step.
 *   node --experimental-strip-types --import ./scripts/checks/register-hooks.mjs scripts/checks/pipeline-presets.check.mjs
 */
import { PIPELINE_PRESETS, getPipelinePreset } from '../../lib/pipeline/presets.ts';
import { matchesAccept } from '../../lib/pipeline/compatibility.ts';
import { MAX_PIPELINE_STEPS } from '../../lib/pipeline/types.ts';
import { getBrowsableTools, getToolById } from '../../lib/tool-registry.ts';
import { normalizeToolOptions } from '../../lib/option-schema.ts';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name, detail);
  }
};

// What each tool used in a preset hands to the next step (name + type).
// A preset using a tool missing here fails, so a new preset states its chain.
const OUTPUT = {
  'pdf-merge': ['merged.pdf', 'application/pdf'],
  'pdf-reduce-size': ['report-reduced.pdf', 'application/pdf'],
  'pdf-add-page-numbers': ['report-numbered.pdf', 'application/pdf'],
  'pdf-watermark': ['report-watermarked.pdf', 'application/pdf'],
  'image-to-pdf': ['images.pdf', 'application/pdf'],
  'image-resize': ['photo-1600x1200.jpg', 'image/jpeg'],
  'image-compress': ['photo-compressed.jpg', 'image/jpeg'],
  'image-auto-enhance': ['photo-enhanced.jpg', 'image/jpeg'],
  'extract-audio': ['lecture.mp3', 'audio/mpeg'],
  'audio-merge': ['merged.wav', 'audio/wav'],
  'audio-convert': ['voice.mp3', 'audio/mpeg'],
};

const browsable = new Set(getBrowsableTools().map((tool) => tool.id));
const ids = new Set();

check('there are presets', PIPELINE_PRESETS.length >= 6);
for (const preset of PIPELINE_PRESETS) {
  const label = preset.id;
  check(`${label}: unique id`, !ids.has(preset.id));
  ids.add(preset.id);
  check(`${label}: lookup`, getPipelinePreset(preset.id) === preset);
  for (const locale of ['en', 'ko']) {
    check(`${label}: ${locale} name`, Boolean(preset.name[locale]?.trim()));
    check(`${label}: ${locale} description`, Boolean(preset.description[locale]?.trim()));
    check(`${label}: ${locale} input`, Boolean(preset.input[locale]?.trim()));
  }
  check(`${label}: ko copy is Korean`, /[가-힣]/.test(preset.name.ko + preset.description.ko));

  for (const locale of ['en', 'ko']) {
    const steps = preset.steps(locale);
    check(`${label}: 2+ steps`, steps.length >= 2 && steps.length <= MAX_PIPELINE_STEPS);
    // Bundling into a ZIP is what "download all" already does.
    check(`${label}: does not end in a ZIP`, steps.at(-1)?.toolId !== 'create-zip');

    for (const keyOption of preset.keyOptions ?? []) {
      const owner = steps[keyOption.step];
      const tool = owner ? getToolById(owner.toolId) : undefined;
      const keys = new Set((tool?.options ?? []).map((option) => option.key));
      check(`${label}: key option ${keyOption.key} is on step ${keyOption.step + 1}`, keys.has(keyOption.key));
      for (const other of keyOption.alsoSet ?? []) {
        check(`${label}: ${other} set with ${keyOption.key}`, keys.has(other) && owner.options[other] === owner.options[keyOption.key]);
      }
      for (const lang of ['en', 'ko']) {
        check(`${label}: key option ${keyOption.key} ${lang} label`, !keyOption.label || Boolean(keyOption.label[lang]?.trim()));
      }
    }

    steps.forEach((step, index) => {
      const tool = getToolById(step.toolId);
      check(`${label} step ${index + 1}: tool ${step.toolId} exists`, Boolean(tool));
      if (!tool) return;
      check(`${label} step ${index + 1}: ${step.toolId} is browsable`, browsable.has(step.toolId));
      check(`${label} step ${index + 1}: ${step.toolId} runs without a live capture`, tool.inputMode !== 'capture');

      const schema = tool.options ?? [];
      const normalized = normalizeToolOptions(schema, step.options);
      for (const [key, value] of Object.entries(step.options)) {
        const option = schema.find((entry) => entry.key === key);
        check(`${label} step ${index + 1}: ${step.toolId} has option ${key}`, Boolean(option));
        if (!option) continue;
        if (option.type === 'select') {
          const choices = (option.options ?? []).map((choice) => String(choice.value));
          check(`${label} step ${index + 1}: ${key}=${value} is a choice`, choices.includes(String(value)), choices.join('|'));
        }
        if (typeof option.min === 'number') {
          check(`${label} step ${index + 1}: ${key} ≥ min`, Number(value) >= option.min);
        }
        if (typeof option.max === 'number') {
          check(`${label} step ${index + 1}: ${key} ≤ max`, Number(value) <= option.max);
        }
        check(`${label} step ${index + 1}: ${key} survives normalization`, String(normalized[key]) === String(value), String(normalized[key]));
      }

      if (index > 0) {
        const previous = steps[index - 1].toolId;
        const output = OUTPUT[previous];
        check(`${label}: output of ${previous} is known`, Boolean(output));
        if (output) {
          check(
            `${label}: ${previous} → ${step.toolId} fits`,
            matchesAccept(tool.accept, output[0], output[1]),
            `${output[0]} vs ${tool.accept}`,
          );
        }
      }
    });
  }
}

console.log(`\npipeline-presets: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
