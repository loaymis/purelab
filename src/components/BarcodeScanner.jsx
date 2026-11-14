/**
 * Live camera barcode scanner (html5-qrcode, using the native BarcodeDetector
 * API when the browser/Electron supports it for speed).
 *
 * Supports retail (EAN-13/8, UPC-A/E), logistics (Code 128/39, ITF) and the
 * pharmaceutical GS1 DataMatrix printed on medicine packs.
 * In `continuous` mode the camera stays open so a cashier can scan item after
 * item; duplicate reads of the same code within 1.8 s are ignored.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode';
import { Icon } from './ui.jsx';
import { cameraSupported } from '../lib/platform.js';

const FORMATS = [
  F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF,
  F.CODABAR, F.QR_CODE, F.DATA_MATRIX,
];
const CAMERA_KEY = 'purelab.scanner.camera';
const DUP_WINDOW_MS = 1800;

let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1760;
    gain.gain.value = 0.06;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch { /* audio not available */ }
  if (navigator.vibrate) navigator.vibrate(60);
}

function describeError(err) {
  const msg = String(err?.message || err || '');
  if (/NotAllowed|Permission/i.test(msg)) return 'Camera permission was denied. Allow camera access in your browser/OS settings and try again.';
  if (/NotFound|Requested device not found|no camera/i.test(msg)) return 'No camera was found on this device.';
  if (/NotReadable|in use/i.test(msg)) return 'The camera is being used by another application.';
  return msg || 'Unable to start the camera.';
}

export default function BarcodeScanner({ onDetected, continuous = true, lastResult }) {
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState(() => {
    try { return localStorage.getItem(CAMERA_KEY) || ''; } catch { return ''; }
  });
  const [error, setError] = useState(cameraSupported() ? null
    : 'Camera access needs a secure connection (HTTPS). Open PureLab via the https:// hub link or the desktop app — or type the code below.');
  const [running, setRunning] = useState(false);
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [manual, setManual] = useState('');

  const scannerRef = useRef(null);
  const queue = useRef(Promise.resolve()); // serialises start/stop calls
  const onDetectedRef = useRef(onDetected);
  const lastRef = useRef({ code: '', at: 0 });
  const stoppedRef = useRef(false);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!cameraSupported()) return undefined;
    let cancelled = false;
    stoppedRef.current = false;
    const scanner = new Html5Qrcode('purelab-scanner', {
      formatsToSupport: FORMATS,
      verbose: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    });
    scannerRef.current = scanner;

    const handleScan = (text) => {
      const now = Date.now();
      if (stoppedRef.current) return;
      if (text === lastRef.current.code && now - lastRef.current.at < DUP_WINDOW_MS) return;
      lastRef.current = { code: text, at: now };
      beep();
      if (!continuous) stoppedRef.current = true;
      onDetectedRef.current?.(text);
    };

    const qrbox = (vw, vh) => {
      const width = Math.max(120, Math.floor(Math.min(vw * 0.85, 380)));
      const height = Math.max(80, Math.floor(Math.min(vh * 0.6, width * 0.62)));
      return { width, height };
    };

    queue.current = queue.current.then(async () => {
      if (cancelled) return;
      setError(null);
      try {
        await scanner.start(
          cameraId || { facingMode: 'environment' },
          { fps: 12, qrbox, aspectRatio: 1.3333 },
          handleScan,
          () => {}, // per-frame "not found" — ignore
        );
        if (cancelled) return;
        setRunning(true);
        try {
          const caps = scanner.getRunningTrackCameraCapabilities();
          setTorch({ supported: !!caps.torchFeature().isSupported(), on: false });
        } catch { setTorch({ supported: false, on: false }); }
        Html5Qrcode.getCameras().then((list) => !cancelled && setCameras(list || [])).catch(() => {});
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      }
    });

    return () => {
      cancelled = true;
      setRunning(false);
      queue.current = queue.current.then(async () => {
        try {
          if (scanner.isScanning) await scanner.stop();
          scanner.clear();
        } catch { /* element may already be gone */ }
      });
    };
  }, [cameraId, continuous]);

  const switchCamera = (id) => {
    setCameraId(id);
    try { localStorage.setItem(CAMERA_KEY, id); } catch { /* ignore */ }
  };

  const toggleTorch = async () => {
    try {
      const feature = scannerRef.current.getRunningTrackCameraCapabilities().torchFeature();
      await feature.apply(!torch.on);
      setTorch((t) => ({ ...t, on: !t.on }));
    } catch { setTorch({ supported: false, on: false }); }
  };

  const submitManual = (e) => {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    onDetectedRef.current?.(code);
    setManual('');
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-900">
        <div id="purelab-scanner" className="h-full w-full" />
        {!running && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
            <Icon name="camera" className="h-8 w-8 animate-pulse" />
            <span className="text-sm">Starting camera…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-200">
            <Icon name="alert" className="h-8 w-8 text-amber-400" />
            {error}
          </div>
        )}
        {running && torch.supported && (
          <button type="button" onClick={toggleTorch}
            className={`absolute right-3 top-3 rounded-full p-2.5 ${torch.on ? 'bg-amber-400 text-slate-900' : 'bg-black/50 text-white'}`}
            aria-label="Toggle flashlight">
            <Icon name="flash" />
          </button>
        )}
        {lastResult && (
          <div className={`absolute inset-x-3 bottom-3 rounded-lg px-3 py-2 text-sm font-medium shadow ${
            lastResult.ok ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
            {lastResult.message}
          </div>
        )}
      </div>

      {cameras.length > 1 && (
        <select className="input" value={cameraId} onChange={(e) => switchCamera(e.target.value)} aria-label="Camera">
          <option value="">Default (rear) camera</option>
          {cameras.map((c) => <option key={c.id} value={c.id}>{c.label || c.id}</option>)}
        </select>
      )}

      <form onSubmit={submitManual} className="flex gap-2">
        <input className="input" value={manual} onChange={(e) => setManual(e.target.value)}
          placeholder="Or type barcode / SKU and press Enter" inputMode="text" autoComplete="off" />
        <button type="submit" className="btn-secondary shrink-0">Add</button>
      </form>
    </div>
  );
}
