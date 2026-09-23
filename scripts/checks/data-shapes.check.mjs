/**
 * Executable check for lib/data-shapes.ts (record discovery, flattening, XML roots).
 *   node --experimental-strip-types scripts/checks/data-shapes.check.mjs
 */
import { findRecords, flattenRecord, prepareXmlDocument, recordsToTable, xmlElementName } from '../../lib/data-shapes.ts';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name, detail);
  }
};
const json = (value) => JSON.stringify(value);

// XML parsed by fast-xml-parser: records sit inside wrapper elements.
{
  const parsed = { '?xml': { '@_version': '1.0' }, rows: { row: [{ a: 1 }, { a: 2 }] } };
  check('records found under wrappers', json(findRecords(parsed)) === json([{ a: 1 }, { a: 2 }]), json(findRecords(parsed)));
  const single = { rows: { row: { a: 1, b: 2 } } };
  check('single record under wrappers', json(findRecords(single)) === json([{ a: 1, b: 2 }]), json(findRecords(single)));
  const attributes = { catalog: { '@_lang': 'ko', book: [{ '@_id': 'b1', title: 'x' }] } };
  check('wrapper attributes do not stop the search', findRecords(attributes).length === 1);
}

// JSON APIs wrap arrays too.
check('json data wrapper', findRecords({ data: [{ id: 1 }, { id: 2 }] }).length === 2);
check('plain array', findRecords([{ id: 1 }]).length === 1);
check('array of scalars', json(findRecords([1, 2])) === json([{ value: 1 }, { value: 2 }]));
check('single object is one record', findRecords({ id: 1, name: 'x' }).length === 1);

// Flattening
{
  const flat = flattenRecord({ name: '홍길동', address: { city: '서울', zip: '04524' }, tags: ['a', 'b'], '@_id': '7', items: [{ q: 1 }] });
  check('nested object columns', flat['address.city'] === '서울' && flat['address.zip'] === '04524');
  check('scalar list joined', flat.tags === 'a; b');
  check('attribute prefix removed', flat.id === '7');
  check('object list kept as JSON', flat.items === '[{"q":1}]');
}

// Table columns are the union of all rows, in order of first appearance.
{
  const table = recordsToTable([{ a: 1 }, { b: 2, a: 3 }]);
  check('union of columns', json(table.columns) === json(['a', 'b']));
  check('missing cells empty', json(table.rows) === json([[1, ''], [3, 2]]));
}

// XML output always has one root and valid names.
check('array gets a root', json(prepareXmlDocument([{ a: 1 }])) === json({ root: { item: [{ a: 1 }] } }));
check('several keys get a root', Object.keys(prepareXmlDocument({ a: 1, b: 2 })).join() === 'root');
check('one key stays the root', Object.keys(prepareXmlDocument({ library: { book: 'x' } })).join() === 'library');
check('number-leading key fixed', xmlElementName('2024 sales') === '_2024_sales');
check('Korean key allowed', xmlElementName('이름') === '이름');
check('xml prefix reserved', xmlElementName('xmlData') === '_xmlData');

console.log(`\ndata-shapes: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
