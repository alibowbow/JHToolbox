/// <reference lib="webworker" />

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { sanitizeRowsForSpreadsheet } from '../spreadsheet-safety';
import { clampPositiveInteger } from '../option-schema';
import { findRecords, prepareXmlDocument, recordsToTable } from '../data-shapes';

type WorkerRequest = {
  id: number;
  toolId: string;
  fileName: string;
  text?: string;
  buffer?: ArrayBuffer;
  options?: Record<string, string | number | boolean>;
};

type WorkerFile = {
  name: string;
  mimeType: string;
  data: string | ArrayBuffer;
  encoding: 'text' | 'binary';
};

type WorkerResponse =
  | {
      id: number;
      ok: true;
      files: WorkerFile[];
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

const baseOf = (fileName: string) => fileName.replace(/\.[^/.]+$/, '');

/** CSV with every column any record has; nested fields become "a.b" columns. */
function recordsToCsv(document: unknown): string {
  const table = recordsToTable(findRecords(document));
  return Papa.unparse({ fields: table.columns, data: sanitizeRowsForSpreadsheet(table.rows) });
}

function handle(request: WorkerRequest): WorkerFile[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true });

  if (request.toolId === 'csv-json') {
    const parsed = Papa.parse(request.text ?? '', { header: true, skipEmptyLines: true });
    return [
      {
        name: request.fileName.replace(/\.[^/.]+$/, '') + '.json',
        mimeType: 'application/json',
        data: JSON.stringify(parsed.data, null, 2),
        encoding: 'text',
      },
    ];
  }

  if (request.toolId === 'json-csv') {
    const json = JSON.parse(request.text ?? '[]');
    return [
      {
        name: baseOf(request.fileName) + '.csv',
        mimeType: 'text/csv;charset=utf-8',
        data: recordsToCsv(json),
        encoding: 'text',
      },
    ];
  }

  if (request.toolId === 'excel-csv') {
    // Every sheet becomes a CSV; values are written as Excel displays them
    // (dates as dates, not serial numbers).
    const wb = XLSX.read(request.buffer, { type: 'array', cellDates: true });
    const sheets = wb.SheetNames.filter((sheetName) => wb.Sheets[sheetName]?.['!ref']);
    return (sheets.length > 0 ? sheets : wb.SheetNames.slice(0, 1)).map((sheetName) => {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
        header: 1,
        blankrows: false,
        raw: false,
        defval: '',
      }) as unknown[][];
      return {
        name: sheets.length > 1 ? `${baseOf(request.fileName)}-${sheetName}.csv` : `${baseOf(request.fileName)}.csv`,
        mimeType: 'text/csv;charset=utf-8',
        data: Papa.unparse(sanitizeRowsForSpreadsheet(aoa) as string[][]),
        encoding: 'text' as const,
      };
    });
  }

  if (request.toolId === 'csv-excel') {
    const parsed = Papa.parse(request.text ?? '', { header: true, skipEmptyLines: true });
    const worksheet = XLSX.utils.json_to_sheet(
      sanitizeRowsForSpreadsheet(parsed.data as Record<string, unknown>[]) as any[],
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

    return [
      {
        name: request.fileName.replace(/\.[^/.]+$/, '') + '.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data: out,
        encoding: 'binary',
      },
    ];
  }

  if (request.toolId === 'xml-json') {
    const parsed = parser.parse(request.text ?? '');
    return [
      {
        name: request.fileName.replace(/\.[^/.]+$/, '') + '.json',
        mimeType: 'application/json',
        data: JSON.stringify(parsed, null, 2),
        encoding: 'text',
      },
    ];
  }

  if (request.toolId === 'json-xml') {
    const parsed = JSON.parse(request.text ?? '{}');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(prepareXmlDocument(parsed))}`;
    return [
      {
        name: baseOf(request.fileName) + '.xml',
        mimeType: 'application/xml',
        data: xml,
        encoding: 'text',
      },
    ];
  }

  if (request.toolId === 'xml-csv') {
    return [
      {
        name: baseOf(request.fileName) + '.csv',
        mimeType: 'text/csv;charset=utf-8',
        data: recordsToCsv(parser.parse(request.text ?? '')),
        encoding: 'text',
      },
    ];
  }

  if (request.toolId === 'split-csv') {
    // Guard against NaN (would make the `i += rowsPerFile` loop never terminate)
    // and against absurd values, even if the UI validation was bypassed.
    const rowsPerFile = clampPositiveInteger(request.options?.rowsPerFile, 10, 1_000_000, 1000);
    const parsed = Papa.parse(request.text ?? '', { header: true, skipEmptyLines: true });
    const rows = parsed.data as Record<string, unknown>[];
    const out: WorkerFile[] = [];

    for (let i = 0; i < rows.length; i += rowsPerFile) {
      const chunk = rows.slice(i, i + rowsPerFile);
      const csv = Papa.unparse(sanitizeRowsForSpreadsheet(chunk));
      out.push({
        name: `${request.fileName.replace(/\.[^/.]+$/, '')}-part-${Math.floor(i / rowsPerFile) + 1}.csv`,
        mimeType: 'text/csv;charset=utf-8',
        data: csv,
        encoding: 'text',
      });
    }

    return out;
  }

  throw new Error('Unsupported tool.');
}

const globalScope = self as unknown as DedicatedWorkerGlobalScope;

globalScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    const files = handle(event.data);
    const response: WorkerResponse = { id: event.data.id, ok: true, files };
    const transferables = files
      .filter((file) => file.encoding === 'binary' && file.data instanceof ArrayBuffer)
      .map((file) => file.data as ArrayBuffer);

    globalScope.postMessage(response, transferables);
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : 'The file could not be converted.';
    const response: WorkerResponse = { id: event.data.id, ok: false, error };
    globalScope.postMessage(response);
  }
};

export {};