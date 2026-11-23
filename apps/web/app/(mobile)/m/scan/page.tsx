'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@cafm/ui';
import { matchScan, type MobilePackJob, type ScanMatch } from '@cafm/shared';
import { enqueue, readJobs } from '@/lib/mobile-store';
import { flushOutbox } from '@/lib/mobile-sync-client';

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorClass = new (options: { formats: string[] }) => Detector;

/** Opens the camera and calls `onCode` once with the first QR code or barcode it reads. Not every browser can. */
function useCamera(on: boolean, onCode: (code: string) => void) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'idle' | 'running' | 'unsupported' | 'denied'>('idle');
  useEffect(() => {
    if (!on) return;
    const Detector = (globalThis as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }
    let stop = false;
    let stream: MediaStream | undefined;
    const detector = new Detector({ formats: ['qr_code', 'code_128', 'ean_13'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s;
        if (stop || !video.current) return s.getTracks().forEach((t) => t.stop());
        video.current.srcObject = s;
        await video.current.play();
        setState('running');
        while (!stop) {
          const found = await detector.detect(video.current).catch(() => []);
          if (found[0]?.rawValue) return onCode(found[0].rawValue);
          await new Promise((r) => setTimeout(r, 300));
        }
      })
      .catch(() => setState('denied'));
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, onCode]);
  return { video, state };
}

function ReadingForm({ match, onSaved }: { match: Extract<ScanMatch, { kind: 'asset' }>; onSaved: () => void }) {
  const [meterId, setMeterId] = useState(match.meters[0]?.id ?? '');
  const [value, setValue] = useState('');
  const [rolledOver, setRolledOver] = useState(false);
  const [error, setError] = useState('');
  const meter = match.meters.find((m) => m.id === meterId);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{1,12}(\.\d{1,6})?$/.test(value.trim())) {
      setError('Enter the reading as a number, for example 1204.5.');
      return;
    }
    // The change is kept on the phone first. It rides on one of the asset's jobs so it syncs with that job.
    const id = crypto.randomUUID();
    await enqueue(
      match.jobs[0]!.id,
      {
        type: 'mutation',
        item: {
          key: id,
          kind: 'meter_reading',
          assetId: match.asset.id,
          meterId,
          payload: {
            value: value.trim(),
            rolledOver,
            submission: crypto.randomUUID(),
            recordedAt: new Date().toISOString(),
          },
        },
      },
      {},
      id,
    );
    if (navigator.onLine) void flushOutbox();
    onSaved();
  }

  if (match.meters.length === 0) {
    return <div className="sm faint">This asset has no meters, or you cannot record readings.</div>;
  }
  return (
    <form onSubmit={save} className="stack g2" noValidate>
      <label className="medium sm" htmlFor="reading-meter">
        Meter
      </label>
      <div className="input lg">
        <select id="reading-meter" value={meterId} onChange={(e) => setMeterId(e.target.value)}>
          {match.meters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.unit})
            </option>
          ))}
        </select>
      </div>
      <label className="medium sm" htmlFor="reading-value">
        Reading{meter ? ' (' + meter.unit + ')' : ''}
      </label>
      <div className="input lg">
        <input
          id="reading-value"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <label className="row sm" style={{ gap: 8, minHeight: 44 }}>
        <input type="checkbox" checked={rolledOver} onChange={(e) => setRolledOver(e.target.checked)} />
        The meter went past its limit and started again
      </label>
      {error && (
        <div className="sm" role="alert" style={{ color: 'var(--danger-text)' }}>
          {error}
        </div>
      )}
      <button type="submit" className="m-btn primary">
        Save reading
      </button>
    </form>
  );
}

export default function ScanPage() {
  const [jobs, setJobs] = useState<MobilePackJob[]>([]);
  const [code, setCode] = useState('');
  const [scanned, setScanned] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [reading, setReading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void readJobs().then(setJobs);
  }, []);

  const onCode = useCallback((raw: string) => {
    setScanned(raw);
    setCamera(false);
    setReading(false);
    setSaved(false);
  }, []);
  const { video, state } = useCamera(camera, onCode);
  const match = useMemo(() => (scanned === null ? null : matchScan(scanned, jobs)), [scanned, jobs]);

  return (
    <>
      <div className="m-head">
        <h1 className="m-title" style={{ margin: 0 }}>
          Scan
        </h1>
        <div className="xs faint">Scan an asset label or a job number. Works without signal.</div>
      </div>
      <div className="m-body" style={{ overflow: 'visible' }}>
        <div className="m-card">
          {camera && (
            <video ref={video} muted playsInline aria-label="Camera view" style={{ width: '100%', borderRadius: 12 }} />
          )}
          {state === 'unsupported' && (
            <div className="sm" role="status">
              This browser cannot scan. Type the asset or job number instead.
            </div>
          )}
          {state === 'denied' && (
            <div className="sm" role="alert">
              The camera is not available. Allow it in the browser, or type the number instead.
            </div>
          )}
          <button type="button" className="m-btn secondary" onClick={() => setCamera((on) => !on)}>
            <Icon name="scan" size={18} />
            {camera ? 'Stop camera' : 'Scan with camera'}
          </button>
          <form
            className="stack g2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) onCode(code);
            }}
          >
            <label className="medium sm" htmlFor="scan-code">
              Asset or job number
            </label>
            <div className="input lg">
              <input
                id="scan-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>
            <button type="submit" className="m-btn secondary">
              Look up
            </button>
          </form>
        </div>
        {match?.kind === 'none' && (
          <div className="m-card" role="status">
            <div className="medium">Nothing on this phone matches</div>
            <div className="sm faint">
              Only assets and jobs from your saved jobs can be found offline. Sync, then try again.
            </div>
          </div>
        )}
        {match?.kind === 'job' && (
          <a href={'/m/job?id=' + match.job.id} className="m-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="medium">
              {match.job.number} · {match.job.title}
            </div>
            <div className="sm faint">{match.job.location.name} · Open job</div>
          </a>
        )}
        {match?.kind === 'asset' && (
          <div className="m-card" aria-live="polite">
            <div className="row" style={{ gap: 10 }}>
              <Icon name="asset" size={18} />
              <div>
                <div className="medium">
                  {match.asset.name} · {match.asset.number}
                </div>
                <div className="sm faint">
                  {match.location} · {match.jobs.length} open {match.jobs.length === 1 ? 'job' : 'jobs'}
                </div>
              </div>
            </div>
            {match.jobs.map((job) => (
              <a
                key={job.id}
                href={'/m/job?id=' + job.id}
                className="m-btn secondary"
                style={{ textDecoration: 'none' }}
              >
                Open {job.number}
              </a>
            ))}
            {saved ? (
              <div className="sm" role="status">
                Reading saved on this phone. It sends when you have signal.
              </div>
            ) : reading ? (
              <ReadingForm
                match={match}
                onSaved={() => {
                  setSaved(true);
                  setReading(false);
                }}
              />
            ) : (
              <button type="button" className="m-btn secondary" onClick={() => setReading(true)}>
                <Icon name="meter" size={18} />
                Record a reading
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
