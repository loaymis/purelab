/** "Install app" for the web version (PWA). Hidden when already installed / unsupported. */
import React, { useState } from 'react';
import { Icon, Sheet } from './ui.jsx';
import { useT } from '../i18n/index.js';
import { useInstall, promptInstall } from '../lib/install.js';

export default function InstallButton({ variant = 'button', onDone }) {
  const t = useT();
  const state = useInstall();
  const [iosHelp, setIosHelp] = useState(false);
  if (state === 'installed' || state === 'unavailable') return null;

  const click = async () => {
    if (state === 'ios') { setIosHelp(true); return; }
    await promptInstall();
    onDone?.();
  };

  const classes = {
    button: 'btn-secondary',
    link: 'inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline',
    menu: 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm text-ink hover:bg-subtle',
  };

  return (
    <>
      <button type="button" className={classes[variant]} onClick={click}>
        <Icon name="install" className="h-4 w-4" />{t('Install app')}
      </button>
      <Sheet open={iosHelp} size="sm" title={t('Install PureLab')} onClose={() => setIosHelp(false)}>
        <ol className="space-y-3 text-sm text-muted">
          <li className="flex gap-3"><span className="font-bold text-accent">1</span>{t('Tap the Share button in Safari’s toolbar.')}</li>
          <li className="flex gap-3"><span className="font-bold text-accent">2</span>{t('Choose “Add to Home Screen”.')}</li>
          <li className="flex gap-3"><span className="font-bold text-accent">3</span>{t('Open PureLab from your home screen — it runs full-screen and works offline.')}</li>
        </ol>
      </Sheet>
    </>
  );
}
