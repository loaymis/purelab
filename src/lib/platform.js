/** Bridge to Electron's preload API (null in a normal browser). */
export const desktop = typeof window !== 'undefined' && window.purelab?.isDesktop ? window.purelab : null;
export const isDesktop = !!desktop;

/** Camera APIs exist only on secure origins (https, localhost, Electron). */
export const cameraSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
