'use client';

import { useEffect, useRef, useState } from 'react';
import { base64Length, CASES, createFixture, MAX_BYTES, prepareDataUri, type FixtureCase } from './fixture';

type Prepared = { item: FixtureCase; blob: Blob; url: string; filename: string; dataUri?: string };
const button = 'rounded-lg border border-slate-400 px-4 py-2 font-medium disabled:opacity-40';
const number = (value: number) => value.toLocaleString('en-US');

export default function AudioDownloadDiagnostic() {
  const [selected, setSelected] = useState<string>('2-wav');
  const [largeAllowed, setLargeAllowed] = useState(false);
  const [smallPrepared, setSmallPrepared] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('대기 · 먼저 2초 WAV를 생성하세요.');
  const [requests, setRequests] = useState({ blob: 0, data: 0 });
  const owned = useRef<Prepared | null>(null);
  const job = useRef<AbortController | null>(null);

  useEffect(() => () => {
    job.current?.abort();
    job.current = null;
    if (owned.current) URL.revokeObjectURL(owned.current.url);
    owned.current = null;
  }, []);

  function release() {
    job.current?.abort();
    job.current = null;
    if (owned.current) URL.revokeObjectURL(owned.current.url);
    owned.current = null;
    setPrepared(null);
    setBusy(false);
    setRequests({ blob: 0, data: 0 });
  }

  async function generate() {
    if (job.current) return;
    const item = CASES.find(candidate => candidate.id === selected);
    if (!item || (item.seconds > 2 && !largeAllowed)) return;
    release();
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    try {
      const blob = await createFixture(item, controller.signal, text => {
        if (job.current === controller) setStatus(text);
      });
      if (job.current !== controller || controller.signal.aborted) return;
      const next = { item, blob, url: URL.createObjectURL(blob), filename: `synthetic-${item.seconds}s-${item.channels}ch.${item.format}` };
      owned.current = next;
      setPrepared(next);
      if (item.seconds === 2) setSmallPrepared(true);
      setStatus('합성 파일 준비 완료 · 아직 다운로드하지 않았습니다.');
    } catch (error) {
      if (job.current === controller) setStatus(`생성 오류 · ${error instanceof Error ? error.message : '다시 시도하세요'}`);
    } finally {
      if (job.current === controller) { job.current = null; setBusy(false); }
    }
  }

  async function convert() {
    const current = owned.current;
    if (!current || current.dataUri || job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    setStatus('data URI 생성 중 · 다운로드는 별도 클릭이 필요합니다.');
    try {
      const dataUri = await prepareDataUri(current.blob, controller.signal);
      if (job.current !== controller || controller.signal.aborted || owned.current !== current) return;
      const next = { ...current, dataUri };
      owned.current = next;
      setPrepared(next);
      setStatus('두 링크 준비 완료 · 동일한 파일 바이트를 서로 다른 URI로 전달합니다.');
    } catch (error) {
      if (job.current === controller) setStatus(`data URI 오류 · Blob 링크는 유지됩니다. ${error instanceof Error ? error.message : ''}`);
    } finally {
      if (job.current === controller) { job.current = null; setBusy(false); }
    }
  }

  function requested(kind: 'blob' | 'data') {
    setRequests(previous => ({ ...previous, [kind]: previous[kind] + 1 }));
    setStatus(`${kind === 'blob' ? 'Blob URL' : 'data URI'} 다운로드 요청 · 실제 저장 여부는 이 페이지에서 확인할 수 없습니다.`);
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8" data-testid="download-diagnostic">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-amber-700">PREVIEW 진단 전용 · 제품 fallback 아님</p>
        <h1 className="text-2xl font-bold">합성 오디오 다운로드 비교</h1>
        <p>새 테스트 탭에서만 사용하세요. 실제 녹음·파일 입력은 없습니다. 브라우저 안에서 왼쪽 440 Hz / 오른쪽 660 Hz 소리를 합성하며 오디오를 업로드하지 않습니다.</p>
        <p className="text-sm">MP3 생성 시 고정 버전의 공개 FFmpeg 코드만 HTTPS로 받습니다. 파일 생성·변환은 다운로드를 시작하지 않습니다.</p>
      </header>

      <div className="space-y-4 rounded-xl border border-slate-300 p-4">
        <label className="block font-medium" htmlFor="fixture-case">시험 크기 / 형식</label>
        <select id="fixture-case" className="w-full rounded border border-slate-400 bg-transparent p-2" value={selected} disabled={busy}
          onChange={event => { release(); setSelected(event.target.value); setStatus('선택 변경 · 이전 파일과 링크를 정리했습니다.'); }}>
          {CASES.map(item => <option key={item.id} value={item.id} disabled={item.seconds > 2 && !largeAllowed}>{item.label}</option>)}
        </select>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={largeAllowed} disabled={!smallPrepared || busy} onChange={event => {
            setLargeAllowed(event.target.checked);
            if (!event.target.checked) { release(); setSelected('2-wav'); setStatus('작은 파일 단계로 돌아왔습니다.'); }
          }} />
          2초 파일을 실제로 내려받아 확인했고 큰 파일 시험을 진행합니다. (사용자 확인이며 자동 검증 아님)
        </label>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy} onClick={() => void generate()}>합성 파일 생성</button>
          <button className={button} disabled={!busy && !prepared} onClick={() => { release(); setStatus('취소 / 닫기 · 파일과 링크를 정리했습니다.'); }}>취소 / 파일 닫기</button>
        </div>
        <p role="status" className="break-words text-sm" data-testid="diagnostic-status">{status}</p>
      </div>

      {prepared && <div className="space-y-4 rounded-xl border border-slate-300 p-4" data-testid="diagnostic-file">
        <h2 className="break-all text-lg font-semibold">{prepared.filename}</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt>형식</dt><dd>{prepared.blob.type} · {prepared.item.format === 'wav' ? 'PCM 16-bit' : `${prepared.item.bitrate} kbps MP3`}</dd>
          <dt>파일 바이트</dt><dd data-testid="fixture-bytes">{number(prepared.blob.size)}</dd>
          <dt>예상 길이 / 채널</dt><dd>{prepared.item.seconds}초 · 44.1 kHz · {prepared.item.channels === 2 ? 'stereo' : 'mono'}</dd>
          <dt>base64 본문 길이</dt><dd>{number(base64Length(prepared.blob.size))} 문자 (약 4/3배)</dd>
          <dt>data URI 상태</dt><dd>{prepared.dataUri ? '준비됨' : '아직 생성하지 않음'}</dd>
        </dl>
        <div className="flex flex-wrap gap-3">
          <a className={button} href={prepared.url} download={`blob-${prepared.filename}`} onClick={() => requested('blob')}>Blob URL 다운로드 / 재시도</a>
          {prepared.dataUri
            ? <a className={button} href={prepared.dataUri} download={`data-${prepared.filename}`} onClick={() => requested('data')}>data URI 다운로드 / 재시도</a>
            : <button className={button} disabled={busy} onClick={() => void convert()}>data URI 준비 (메모리 추가 사용)</button>}
        </div>
        <p className="text-sm">요청 횟수: Blob {requests.blob} · data {requests.data}. 저장 성공 횟수가 아닙니다. 두 링크는 새 사용자 클릭으로만 동작합니다.</p>
      </div>}

      <aside className="space-y-2 text-sm">
        <h2 className="font-semibold">시험 순서와 메모리 한도</h2>
        <p>2초 WAV → 3분 MP3 / WAV → 4분 MP3 / WAV 순서로 하나씩 시험하세요. 다운로드 이벤트·실제 파일 경로·바이트·디코딩 길이를 확인하기 전에는 성공으로 판정하지 마세요. 이미 실패를 확인한 링크를 반복 클릭할 필요는 없습니다.</p>
        <p>최대 {number(MAX_BYTES)}바이트 (4분·44.1 kHz·스테레오 PCM16 WAV). base64 본문은 최대 {number(base64Length(MAX_BYTES))}문자입니다. 문자열만 약 54~108 MiB이며, Blob·DOM 복사본·인코더 메모리가 추가될 수 있습니다. 이 수치는 브라우저 전체 메모리 상한을 보장하지 않습니다. 메모리 여유가 부족하거나 탭이 느려지면 큰 시험을 중단하세요.</p>
        <p>한 번에 파일 하나, 변환 작업 하나만 유지합니다. 재시도는 같은 URI를 사용합니다. 선택 변경·재생성·취소·닫기·페이지 이탈 시 Blob URL을 폐기하고 문자열 참조와 MP3 worker를 해제합니다. 실제 메모리 반환 시점은 브라우저 GC에 달려 있습니다.</p>
      </aside>
    </section>
  );
}
