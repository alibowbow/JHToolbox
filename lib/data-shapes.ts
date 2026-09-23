/**
 * Shape helpers for the data converters (no DOM → unit testable, and usable
 * inside the data worker). Real files are rarely a flat array of flat
 * objects: XML wraps records in container elements, JSON APIs wrap them in
 * `{ "data": [...] }`, and records contain nested objects and lists.
 */

export type DataRecord = Record<string, unknown>;
export type TableShape = { columns: string[]; rows: unknown[][] };

function isPlainObject(value: unknown): value is DataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The list of records inside a parsed document: the first array found by
 * walking down single-child wrappers (`<rows><row/>…</rows>`, `{ data: [...] }`).
 * An object that is not a wrapper is itself the only record.
 */
export function findRecords(document: unknown, depth = 0): DataRecord[] {
  if (Array.isArray(document)) {
    return document.map((item) => (isPlainObject(item) ? item : { value: item }));
  }
  if (!isPlainObject(document)) {
    return document === undefined || document === null || document === '' ? [] : [{ value: document }];
  }
  if (depth > 12) {
    return [document];
  }

  const children = Object.entries(document).filter(([key]) => key !== '?xml');
  const arrayChild = children.find(([, value]) => Array.isArray(value) && value.length > 0);
  if (arrayChild) {
    return findRecords(arrayChild[1], depth + 1);
  }

  const objectChildren = children.filter(([, value]) => isPlainObject(value));
  const otherChildren = children.filter(([key, value]) => !isPlainObject(value) && !key.startsWith('@_'));
  if (objectChildren.length === 1 && otherChildren.length === 0) {
    return findRecords(objectChildren[0][1], depth + 1);
  }
  return [document];
}

function columnName(key: string): string {
  if (key.startsWith('@_')) return key.slice(2);
  if (key === '#text') return 'value';
  return key;
}

/**
 * `{ name, address: { city } , tags: ['a', 'b'] }` →
 * `{ name, 'address.city': …, tags: 'a; b' }`. Lists of objects stay JSON.
 */
export function flattenRecord(record: DataRecord, prefix = '', out: DataRecord = {}): DataRecord {
  // XML attributes (ids and the like) come first, as they do in the source.
  const entries = Object.entries(record).sort(([left], [right]) => Number(!left.startsWith('@_')) - Number(!right.startsWith('@_')));
  for (const [key, value] of entries) {
    const path = prefix ? `${prefix}.${columnName(key)}` : columnName(key);
    if (isPlainObject(value)) {
      flattenRecord(value, path, out);
    } else if (Array.isArray(value)) {
      out[path] = value.every((item) => !isPlainObject(item) && !Array.isArray(item)) ? value.join('; ') : JSON.stringify(value);
    } else {
      out[path] = value ?? '';
    }
  }
  return out;
}

/** Rows as a table with every column any row has, in order of first appearance. */
export function recordsToTable(records: DataRecord[]): TableShape {
  const flat = records.map((record) => flattenRecord(record));
  const columns: string[] = [];
  const seen = new Set<string>();
  flat.forEach((row) =>
    Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }),
  );
  return { columns, rows: flat.map((row) => columns.map((column) => row[column] ?? '')) };
}

/** A valid XML element name for an arbitrary JSON key. */
export function xmlElementName(key: string): string {
  if (key.startsWith('@_') || key === '#text') {
    return key;
  }
  let name = key.replace(/[^\p{L}\p{N}_.-]+/gu, '_');
  if (!/^[\p{L}_]/u.test(name)) {
    name = `_${name}`;
  }
  return /^xml/i.test(name) ? `_${name}` : name;
}

function sanitizeXmlKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeXmlKeys);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [xmlElementName(key), sanitizeXmlKeys(child)]));
  }
  return value;
}

/**
 * JSON ready for an XML builder: exactly one root element (arrays become
 * `<root><item/>…</root>`, several top-level keys get a `<root>`), and keys
 * that are not valid element names are rewritten.
 */
export function prepareXmlDocument(json: unknown): DataRecord {
  if (Array.isArray(json)) {
    return { root: { item: sanitizeXmlKeys(json) } };
  }
  if (isPlainObject(json)) {
    const keys = Object.keys(json);
    const single = keys.length === 1 && !Array.isArray(json[keys[0]]);
    return (single ? sanitizeXmlKeys(json) : { root: sanitizeXmlKeys(json) }) as DataRecord;
  }
  return { root: { value: json } };
}
