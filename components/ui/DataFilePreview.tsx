'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { findRecords, recordsToTable } from '@/lib/data-shapes';
import { localizeErrorMessage } from '@/lib/error-messages';
import { decodeTextBytes } from '@/lib/text-encoding';

const PREVIEW_ROWS = 20;
const PREVIEW_COLUMNS = 12;

type Preview = { columns: string[]; rows: unknown[][]; totalRows: number; note?: string };

const COPY = {
  en: {
    loading: 'Reading the file…',
    size: (rows: number, columns: number) => `${rows.toLocaleString()} rows × ${columns} columns`,
    firstRows: (count: number) => `first ${count} shown`,
    korean: 'Korean Excel encoding (CP949) detected',
    sheets: (count: number) => `${count} sheets — every sheet becomes a CSV`,
    moreColumns: (count: number) => `+${count} more columns`,
  },
  ko: {
    loading: '파일 읽는 중…',
    size: (rows: number, columns: number) => `${rows.toLocaleString()}행 × ${columns}열`,
    firstRows: (count: number) => `처음 ${count}행 표시`,
    korean: '한국어 엑셀 인코딩(CP949) 파일로 읽었어요',
    sheets: (count: number) => `시트 ${count}개 — 시트마다 CSV로 나뉩니다`,
    moreColumns: (count: number) => `열 ${count}개 더 있음`,
  },
} as const;

async function readPreview(file: File, locale: 'en' | 'ko'): Promise<Preview> {
  const name = file.name.toLowerCase();
  const copy = COPY[locale];

  if (/\.(xlsx|xls)$/.test(name)) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: false, defval: '' }) as unknown[][];
    const [header = [], ...body] = rows;
    return {
      columns: header.map(String),
      rows: body.slice(0, PREVIEW_ROWS),
      totalRows: body.length,
      note: workbook.SheetNames.length > 1 ? copy.sheets(workbook.SheetNames.length) : undefined,
    };
  }

  const decoded = decodeTextBytes(new Uint8Array(await file.arrayBuffer()));
  const note = decoded.encoding === 'euc-kr' ? copy.korean : undefined;

  if (name.endsWith('.csv')) {
    const Papa = (await import('papaparse')).default;
    const parsed = Papa.parse<string[]>(decoded.text, { skipEmptyLines: true });
    const [header = [], ...body] = parsed.data;
    return { columns: header, rows: body.slice(0, PREVIEW_ROWS), totalRows: body.length, note };
  }

  let document: unknown;
  if (name.endsWith('.json')) {
    document = JSON.parse(decoded.text);
  } else {
    const { XMLParser } = await import('fast-xml-parser');
    document = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(decoded.text);
  }
  const records = findRecords(document);
  const table = recordsToTable(records.slice(0, PREVIEW_ROWS));
  return { columns: table.columns, rows: table.rows, totalRows: records.length, note };
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * The first rows of a CSV, Excel, JSON or XML file as a table, so the input
 * can be checked (and parse errors seen) before converting.
 */
export function DataFilePreview({ file }: { file: File }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError(null);
    readPreview(file, locale)
      .then((next) => {
        if (!cancelled) setPreview(next);
      })
      .catch((cause) => {
        if (!cancelled) setError(localizeErrorMessage(cause, locale));
      });
    return () => {
      cancelled = true;
    };
  }, [file, locale]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-danger" data-testid="data-preview-error">
        {error}
      </p>
    );
  }
  if (!preview) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
        {copy.loading}
      </p>
    );
  }

  const columns = preview.columns.slice(0, PREVIEW_COLUMNS);
  const hiddenColumns = preview.columns.length - columns.length;

  return (
    <div className="space-y-2" data-testid="data-preview">
      <p className="flex flex-wrap gap-x-2 text-xs text-ink-muted">
        <span className="font-medium text-ink">{copy.size(preview.totalRows, preview.columns.length)}</span>
        {preview.totalRows > PREVIEW_ROWS ? <span>· {copy.firstRows(PREVIEW_ROWS)}</span> : null}
        {hiddenColumns > 0 ? <span>· {copy.moreColumns(hiddenColumns)}</span> : null}
        {preview.note ? <span>· {preview.note}</span> : null}
      </p>
      <div className="max-h-72 overflow-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-base-subtle">
            <tr>
              {columns.map((column, index) => (
                <th key={`${column}-${index}`} className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold text-ink">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="odd:bg-base-elevated even:bg-base-subtle/40">
                {columns.map((_, columnIndex) => (
                  <td key={columnIndex} className="max-w-[16rem] truncate border-b border-border px-3 py-1.5 tabular-nums text-ink-muted">
                    {cellText(row[columnIndex])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
