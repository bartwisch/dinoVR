export function getFlag(name: string, fallback = false): boolean {
  try {
    const url = new URL(window.location.href);
    const v = url.searchParams.get(name);
    if (v === null) return fallback;
    if (v === '' || v.toLowerCase() === 'true' || v === '1') return true;
    if (v.toLowerCase() === 'false' || v === '0') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

