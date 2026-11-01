export const APP_PUBLIC_URL = 'https://hesge.github.io/Cascado/';
export const APP_QR_ASSET = './assets/share/cascado-qr.png';

export function createAppSharePayload() {
  return {
    title: 'Cascado',
    text: 'Un duel de roues et de jetons sur un téléphone.',
    url: APP_PUBLIC_URL,
  };
}

export async function copyAppLink(navigatorLike = globalThis.navigator) {
  try {
    const clipboard = navigatorLike?.clipboard;
    if (typeof clipboard?.writeText !== 'function') return 'manual';
    await clipboard.writeText(APP_PUBLIC_URL);
    return 'copied';
  } catch {
    return 'manual';
  }
}

export async function shareAppLink(navigatorLike = globalThis.navigator) {
  try {
    if (typeof navigatorLike?.share === 'function') {
      // Keep the native sheet inside the button's user activation.
      await navigatorLike.share(createAppSharePayload());
      return 'shared';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
  }
  return copyAppLink(navigatorLike);
}
