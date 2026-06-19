/**
 * Schema-based normalization for tool option values (no runtime dependencies →
 * unit testable). Every option value — whether it comes from defaults, a stored
 * preset, the last run, or a URL parameter — is coerced and validated against
 * its option definition so the UI and processors never see `Boolean("false") ===
 * true`, `NaN`/`Infinity`, out-of-range numbers, or non-existent select choices.
 */

/** Structural subset of ToolOption (avoids importing the type so this stays Node-runnable). */
export interface NormalizableOption {
  key: string;
  type: 'number' | 'text' | 'select' | 'checkbox' | 'range' | 'color';
  defaultValue: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string | number }>;
}

/**
 * Coerce a value to an integer within [min, max], falling back when it is not a
 * finite number. Guards loops like `i += rowsPerFile` against NaN (which would
 * never terminate) and against absurdly large/small inputs.
 */
export function clampPositiveInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function normalizeOptionValue(option: NormalizableOption, rawValue: unknown): string | number | boolean {
  const fallback = option.defaultValue;
  if (rawValue === undefined || rawValue === null) {
    return fallback;
  }

  switch (option.type) {
    case 'number':
    case 'range': {
      if (rawValue === '') {
        return fallback;
      }
      const parsed = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      let value = parsed;
      if (typeof option.min === 'number') value = Math.max(option.min, value);
      if (typeof option.max === 'number') value = Math.min(option.max, value);
      if (typeof option.step === 'number' && option.step > 0 && typeof option.min === 'number') {
        const steps = Math.round((value - option.min) / option.step);
        value = option.min + steps * option.step;
        if (typeof option.max === 'number') value = Math.min(option.max, value);
        value = Math.max(option.min, value);
        value = Number(value.toFixed(6));
      }
      return value;
    }

    case 'checkbox': {
      if (typeof rawValue === 'boolean') return rawValue;
      if (rawValue === 'true') return true;
      if (rawValue === 'false') return false;
      return fallback;
    }

    case 'select': {
      const choices = (option.options ?? []).map((choice) => choice.value);
      const match = choices.find((choice) => String(choice) === String(rawValue));
      return match !== undefined ? match : fallback;
    }

    case 'color':
    case 'text':
    default: {
      if (typeof rawValue === 'string') return rawValue;
      if (typeof rawValue === 'number' || typeof rawValue === 'boolean') return String(rawValue);
      return fallback;
    }
  }
}

/**
 * Normalize a full option bag. Declared options are validated against their
 * schema; any extra primitive keys (e.g. editor-driven values like trim points
 * that are not declared as options) are preserved as-is.
 */
export function normalizeToolOptions(
  options: NormalizableOption[],
  rawValues: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(rawValues ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  for (const option of options) {
    out[option.key] = normalizeOptionValue(option, rawValues?.[option.key]);
  }

  return out;
}
