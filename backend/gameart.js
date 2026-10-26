import {downloadImage, sniffImage} from './images.js';

const squash = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function dimensions(url) {
  const match = url.match(/\/(\d{3,4})x(\d{3,4})[a-z]*\.(?:jpg|jpeg|png|webp)$/i);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

async function fromAppStore(name, fetchImpl) {
  const api = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&limit=6`;
  const res = await fetchImpl(api, {signal: AbortSignal.timeout(12000)});
  if (!res.ok) return null;
  const {results = []} = await res.json();
  const wanted = squash(name);
  const app = results.find(r => squash(r.trackName).startsWith(wanted)) || results.find(r => squash(r.trackName).includes(wanted));
  if (!app) return null;
  const shots = [...(app.screenshotUrls || []), ...(app.ipadScreenshotUrls || [])]
    .map(url => ({url, size: dimensions(url)}))
    .filter(({size: [w, h]}) => w > h && w >= 800)
    .sort((a, b) => b.size[0] - a.size[0]);
  if (shots[0]) return {url: shots[0].url, source: 'App Store screenshot'};
  const icon = app.artworkUrl512 || app.artworkUrl100;
  return icon ? {url: icon.replace(/\d+x\d+bb/, '1024x1024bb'), source: 'App Store icon'} : null;
}

async function fromWikipedia(name, fetchImpl) {
  const api = new URL('https://en.wikipedia.org/w/api.php');
  api.search = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${name} video game`, gsrlimit: '1',
    prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '1200', format: 'json', origin: '*'
  });
  const res = await fetchImpl(api, {signal: AbortSignal.timeout(12000)});
  if (!res.ok) return null;
  const data = await res.json();
  const page = Object.values(data?.query?.pages || {})[0];
  return page?.thumbnail?.source ? {url: page.thumbnail.source, source: 'Wikipedia'} : null;
}

export async function findGameArt(name, fetchImpl = fetch) {
  for (const finder of [fromAppStore, fromWikipedia]) {
    try {
      const found = await finder(name, fetchImpl);
      if (!found) continue;
      const buffer = await downloadImage(found.url, {fetchImpl});
      if (sniffImage(buffer)) return {buffer, source: found.source};
    } catch {}
  }
  return null;
}
