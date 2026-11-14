/**
 * Pairing landing page. The desktop shows a QR code pointing to
 *   https://<hub-ip>:4546/#/pair?token=XXXX
 * Scanning it with the phone's camera opens PureLab served by the hub and
 * stores the hub URL + token, after which the phone syncs over Wi-Fi.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { updateSettings } from '../lib/settings.js';
import { HubAdapter } from '../sync/hubAdapter.js';
import { syncEngine } from '../sync/engine.js';
import { Icon } from '../components/ui.jsx';

export default function Pair() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ phase: 'checking', message: 'Connecting to the PureLab hub…' });

  useEffect(() => {
    const token = params.get('token');
    const hub = params.get('hub') || window.location.origin;
    if (!token) { setState({ phase: 'error', message: 'This pairing link has no token. Scan the QR code shown in PureLab desktop → Settings → Desktop hub.' }); return; }
    (async () => {
      try {
        const adapter = new HubAdapter(hub, token);
        await adapter.ready();
        await adapter.pull('products', Number.MAX_SAFE_INTEGER); // validates the token
        updateSettings((s) => ({ ...s, sync: { ...s.sync, hubUrl: hub, hubToken: token } }));
        setState({ phase: 'ok', message: 'Paired! Syncing data from the desktop hub…' });
        await syncEngine.syncNow();
        setTimeout(() => navigate('/', { replace: true }), 900);
      } catch (err) {
        setState({ phase: 'error', message: err.message });
      }
    })();
  }, [params, navigate]);

  return (
    <div className="flex min-h-full items-center justify-center bg-brand-950 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <img src="./icon-192.png" alt="" className="mx-auto h-16 w-16 rounded-2xl" />
        <h1 className="mt-3 text-xl font-bold">Pair with PureLab hub</h1>
        <div className={`mt-4 flex items-center justify-center gap-2 text-sm ${state.phase === 'error' ? 'text-rose-600' : 'text-slate-600'}`}>
          <Icon name={state.phase === 'error' ? 'alert' : state.phase === 'ok' ? 'check' : 'refresh'} className={`h-5 w-5 ${state.phase === 'checking' ? 'animate-spin' : ''}`} />
          <span>{state.message}</span>
        </div>
        {state.phase === 'error' && <button type="button" className="btn-secondary mt-5 w-full" onClick={() => navigate('/')}>Continue without pairing</button>}
      </div>
    </div>
  );
}
