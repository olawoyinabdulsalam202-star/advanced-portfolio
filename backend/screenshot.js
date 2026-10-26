import {downloadImage, sniffImage} from './images.js';

export async function captureLivePreview(url, {env = {}, fetchImpl = fetch} = {}) {
  const api = new URL('https://api.microlink.io/');
  api.searchParams.set('url', url);
  api.searchParams.set('screenshot', 'true');
  api.searchParams.set('meta', 'false');
  api.searchParams.set('viewport.width', '1366');
  api.searchParams.set('viewport.height', '860');
  api.searchParams.set('waitForTimeout', '2500');
  const res = await fetchImpl(api, {
    headers: env.MICROLINK_API_KEY ? {'x-api-key': env.MICROLINK_API_KEY} : {},
    signal: AbortSignal.timeout(45000)
  });
  const data = await res.json().catch(() => null);
  const shot = data?.data?.screenshot?.url;
  if (!res.ok || !shot) throw new Error(data?.message || `Preview service returned ${res.status}.`);
  const buffer = await downloadImage(shot, {fetchImpl});
  if (!sniffImage(buffer)) throw new Error('Preview service did not return an image.');
  return buffer;
}
