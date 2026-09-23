import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function downloadFirstResult(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).first().click();
  const download = await downloadPromise;
  return { name: download.suggestedFilename(), bytes: readFileSync((await download.path())!) };
}

test('csv-json reads a CP949 CSV saved by Korean Excel', async ({ page }) => {
  // "이름,도시\n홍길동,서울\n똠방각하,뷁\n" in CP949, including the extension
  // syllables 똠/뷁 that strict EUC-KR cannot encode.
  const cp949 = Buffer.from('c0ccb8a72cb5b5bdc30ac8abb1e6b5bf2cbcadbfef0a8c63b9e6b0a2c7cf2c94ee0a', 'hex');

  await page.goto('/tools/file/csv-json');
  await page.locator('input[type="file"]').setInputFiles({ name: 'members.csv', mimeType: 'text/csv', buffer: cp949 });
  await page.getByRole('button', { name: 'Run tool' }).click();

  const result = await downloadFirstResult(page);
  expect(result.name).toBe('members.json');
  expect(JSON.parse(result.bytes.toString('utf8'))).toEqual([
    { 이름: '홍길동', 도시: '서울' },
    { 이름: '똠방각하', 도시: '뷁' },
  ]);
});

test('json-csv output starts with a UTF-8 BOM so Excel shows Korean correctly', async ({ page }) => {
  const json = Buffer.from(JSON.stringify([{ 이름: '김철수', 도시: '부산' }]), 'utf8');

  await page.goto('/tools/file/json-csv');
  await page.locator('input[type="file"]').setInputFiles({ name: 'members.json', mimeType: 'application/json', buffer: json });
  await page.getByRole('button', { name: 'Run tool' }).click();

  const result = await downloadFirstResult(page);
  expect(result.name).toBe('members.csv');
  expect([...result.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(result.bytes.subarray(3).toString('utf8').trim()).toBe('이름,도시\r\n김철수,부산');
});

test('xml-csv finds records inside wrapper elements and flattens nested fields', async ({ page }) => {
  const xml = Buffer.from(
    '<?xml version="1.0"?><export><members>' +
      '<member id="1"><name>홍길동</name><address><city>서울</city></address></member>' +
      '<member id="2"><name>김영희</name><address><city>부산</city></address></member>' +
      '</members></export>',
    'utf8',
  );

  await page.goto('/tools/file/xml-csv');
  await page.locator('input[type="file"]').setInputFiles({ name: 'members.xml', mimeType: 'application/xml', buffer: xml });
  await page.getByRole('button', { name: 'Run tool' }).click();

  const result = await downloadFirstResult(page);
  expect(result.bytes.subarray(3).toString('utf8').trim().split('\r\n')).toEqual([
    'id,name,address.city',
    '1,홍길동,서울',
    '2,김영희,부산',
  ]);
});

test('json-xml wraps an array in a single root element', async ({ page }) => {
  const json = Buffer.from(JSON.stringify([{ 이름: '홍길동' }, { 이름: '김영희' }]), 'utf8');

  await page.goto('/tools/file/json-xml');
  await page.locator('input[type="file"]').setInputFiles({ name: 'members.json', mimeType: 'application/json', buffer: json });
  await page.getByRole('button', { name: 'Run tool' }).click();

  const result = await downloadFirstResult(page);
  const xml = result.bytes.toString('utf8');
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(xml).toContain('<root>');
  expect(xml.match(/<item>/g)?.length).toBe(2);
});

test('data converters accept several files at once', async ({ page }) => {
  await page.goto('/tools/file/json-csv');
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from('[{"x":1}]') },
    { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from('{"data":[{"y":2}]}') },
  ]);
  await page.getByRole('button', { name: 'Run tool' }).click();
  await expect(page.getByText('a.csv')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('b.csv')).toBeVisible();
});

test('data files are previewed as a table before converting', async ({ page }) => {
  await page.goto('/tools/file/csv-excel');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'scores.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('이름,점수\n홍길동,90\n김영희,85\n', 'utf8'),
  });
  const preview = page.getByTestId('data-preview');
  await expect(preview).toContainText('2 rows × 2 columns', { timeout: 30_000 });
  await expect(preview.getByRole('columnheader', { name: '이름' })).toBeVisible();
  await expect(preview.getByRole('cell', { name: '김영희' })).toBeVisible();
});

test('broken JSON is reported as soon as it is added', async ({ page }) => {
  await page.goto('/tools/file/json-csv');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('[{"a": 1,}]', 'utf8'),
  });
  await expect(page.getByTestId('data-preview-error')).toBeVisible({ timeout: 30_000 });
});
