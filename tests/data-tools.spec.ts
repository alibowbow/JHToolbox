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
