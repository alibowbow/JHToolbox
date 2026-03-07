/// <reference lib="webworker" />

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

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

function rowsFromXml(obj: unknown): Record<string, unknown>[] {
  if (Array.isArray(obj)) {
    return obj.filter((item) => typeof item === 'object' && item !== null) as Record<string, unknown>[];
  }

  if (obj && typeof obj === 'object') {
    const values = Object.values(obj as Record<string, unknown>);
    const rowArray = values.find((value) => Array.isArray(value));
    if (Array.isArray(rowArray)) {
      return rowArray.filter((item) => typeof item === 'object' && item !== null) as Record<string, unknown>[];
    }
    return [obj as Record<string, unknown>];
  }

  return [{ value: obj as string }];
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
    const rows = Array.isArray(json) ? json : [json];
    const csv = Papa.unparse(rows);
    return [
      {
        name: request.fileName.replace(/\.[^/.]+$/, '') + '.csv',
        mimeType: 'text/csv;charset=utf-8',
        data: csv,
        encoding: 'text',
      },
    ];
  }

  if (request.toolId === 'excel-csv') {
    const wb = XLSX.read(request.buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
    return [
      {
        name: request.fileName.replace(/\.[^/.]+$/, '') + '.csv',
        mimeType: 'text/csv;charset=utf-8',
        data: csv,
        encoding: 'text',
      },
    ];
  }

  if (request.toolId === 'csv-excel') {
    const parsed = Papa.parse(request.text ?? '', { header: true, skipEmptyLines: true });
    const worksheet = XLSX.utils.json_to_sheet(parsed.data as any[]);
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
    const xml = builder.build(parsed);
    return [
      {
        name: request.fileName.replace(/\.[^/.]+$/, '') + '.xml',
        mimeType: 'application/xml',
        data: xml,
        encoding: 'text',
      },
    ];
  }

  if (request.toolId === 'xml-csv') {
    const parsed = parser.parse(request.text ?? '');
    const rows = rowsFromXml(parsed);
    const csv = Papa.unparse(rows);

    return [
      {
        name: request.fileName.replace(/\.[^/.]+$/, '') + '.csv',
        mimeType: 'text/csv;charset=utf-8',
        data: csv,
        encoding: 'text',
      },
    ];
  }

  if (request.toolId === 'split-csv') {
    const rowsPerFile = Math.max(10, Number(request.options?.rowsPerFile ?? 1000));
    const parsed = Papa.parse(request.text ?? '', { header: true, skipEmptyLines: true });
    const rows = parsed.data as Record<string, unknown>[];
    const out: WorkerFile[] = [];

    for (let i = 0; i < rows.length; i += rowsPerFile) {
      const chunk = rows.slice(i, i + rowsPerFile);
      const csv = Papa.unparse(chunk);
      out.push({
        name: `${request.fileName.replace(/\.[^/.]+$/, '')}-part-${Math.floor(i / rowsPerFile) + 1}.csv`,
        mimeType: 'text/csv;charset=utf-8',
        data: csv,
        encoding: 'text',
      });
    }

    return out;
  }

  throw new Error('지원하지 않는 데이터 도구입니다.');
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
    const error = cause instanceof Error ? cause.message : '데이터 처리 실패';
    const response: WorkerResponse = { id: event.data.id, ok: false, error };
    globalScope.postMessage(response);
  }
};

export {};