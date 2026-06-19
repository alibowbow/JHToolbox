/**
 * CSV / spreadsheet formula-injection defense (no runtime dependencies, so it is
 * unit testable in Node).
 *
 * A cell whose text begins with `=`, `+`, `-`, `@`, or a tab/CR/LF can be
 * executed as a formula when the exported file is opened in Excel / Google
 * Sheets / LibreOffice. We neutralize such cells by prefixing a single quote,
 * which spreadsheets treat as "force text" and which is trivially reversible.
 *
 * To avoid corrupting legitimate numeric data, leading `+`/`-` are only escaped
 * when the value is NOT a plain number; `=`/`@`/control characters are always
 * escaped because they never begin real data.
 */

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?%?$/;

export function escapeSpreadsheetCell(value: unknown): unknown {
  // Leave non-strings (numbers, booleans, null) untouched so numeric columns
  // stay numeric in the output.
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }

  const first = value[0];
  const code = first.charCodeAt(0);
  const isControl = code === 0x09 || code === 0x0d || code === 0x0a;
  const isFormulaStart = first === '=' || first === '@';
  const isSignStart = first === '+' || first === '-';

  if (isControl || isFormulaStart) {
    return `'${value}`;
  }
  if (isSignStart && !NUMERIC.test(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Escape every cell of a row collection before it is written to CSV/XLSX. Rows
 * may be arrays (header:1 / AoA) or objects (keyed by column); the shape is
 * preserved.
 */
export function sanitizeRowsForSpreadsheet<T>(rows: T[]): T[] {
  return rows.map((row) => {
    if (Array.isArray(row)) {
      return row.map((cell) => escapeSpreadsheetCell(cell)) as unknown as T;
    }
    if (row && typeof row === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(row as Record<string, unknown>)) {
        out[key] = escapeSpreadsheetCell((row as Record<string, unknown>)[key]);
      }
      return out as unknown as T;
    }
    return escapeSpreadsheetCell(row) as unknown as T;
  });
}
