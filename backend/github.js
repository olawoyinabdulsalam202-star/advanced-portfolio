import {sniffImage, MAX_IMAGE_BYTES} from './images.js';

const API = 'https://api.github.com';

const TECH_MAP = [
  ['next', 'Next.js'], ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['vite', 'Vite'],
  ['tailwindcss', 'Tailwind CSS'], ['express', 'Express'], ['fastify', 'Fastify'], ['socket.io', 'Socket.io'],
  ['mongoose', 'MongoDB'], ['prisma', 'Prisma'], ['@prisma/client', 'Prisma'], ['pg', 'PostgreSQL'], ['sequelize', 'Sequelize'],
  ['@supabase/supabase-js', 'Supabase'], ['firebase', 'Firebase'], ['three', 'Three.js'], ['stripe', 'Stripe'],
  ['zustand', 'Zustand'], ['@emailjs/browser', 'EmailJS'], ['emailjs-com', 'EmailJS'], ['cloudinary', 'Cloudinary'],
  ['react-native', 'React Native'], ['expo', 'Expo'], ['openai', 'OpenAI API'], ['groq-sdk', 'Groq'], ['@anthropic-ai/sdk', 'Claude API'],
  ['fastapi', 'FastAPI'], ['flask', 'Flask'], ['django', 'Django'], ['sqlalchemy', 'SQLAlchemy'], ['psycopg2', 'PostgreSQL'],
  ['paystack', 'Paystack'], ['jsonwebtoken', 'JWT auth'], ['workbox-window', 'PWA']
];

const COVER_NAME = /(^|\/)(screenshot|screen|preview|cover|banner|hero|thumbnail|thumb|og|opengraph|social|demo|mockup|showcase)[-_.a-z0-9 ]*\.(png|jpe?g|webp)$/i;
const SOFT_NAME = /(^|\/)(logo|home|landing|dashboard)[-_.a-z0-9 ]*\.(png|jpe?g|webp)$/i;
const RASTER = /\.(png|jpe?g|webp)$/i;
const SKIP_PATH = /(^|\/)(node_modules|vendor|dist|build|\.next|favicon|icons?|sprites?|fonts?|test|tests|__tests__)(\/|$)/i;

export function scoreCover(entry) {
  const path = entry.path;
  if (entry.type !== 'blob' || !RASTER.test(path) || SKIP_PATH.test(path)) return 0;
  if (entry.size && (entry.size < 8 * 1024 || entry.size > MAX_IMAGE_BYTES)) return 0;
  let score = 0;
  if (COVER_NAME.test(path)) score += 10;
  else if (SOFT_NAME.test(path)) score += 4;
  else if (/(^|\/)(screenshots?|previews?|docs|assets|images?|media|\.github)\//i.test(path)) score += 2;
  else return 0;
  if (/(^|\/)(screenshots?|previews?)\//i.test(path)) score += 3;
  score -= Math.min(path.split('/').length - 1, 4) * 0.7;
  if (/mobile|phone|icon|avatar|profile/i.test(path)) score -= 3;
  return score;
}

export function pickCover(tree) {
  const ranked = tree.map(entry => ({entry, score: scoreCover(entry)})).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  return ranked[0]?.entry.path || '';
}

export function stripReadme(markdown) {
  return String(markdown || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<\/?(p|div|a|br|picture|source|h\d|center|span)[^>]*>/gi, ' ')
    .replace(/```[\s\S]*?```/g, block => (block.length > 600 ? '' : block))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function readmeImages(markdown) {
  const found = [];
  const text = String(markdown || '');
  for (const match of text.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)) found.push(match[1]);
  for (const match of text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) found.push(match[1]);
  return found.filter(src => RASTER.test(src.split('?')[0]) && !/shields\.io|badge|githubusercontent\.com\/.*\/workflows|travis-ci|codecov/i.test(src));
}

export function detectTech(manifests) {
  const names = new Set();
  for (const text of manifests) {
    let deps = [];
    try {
      const pkg = JSON.parse(text);
      deps = Object.keys({...pkg.dependencies, ...pkg.devDependencies});
    } catch {
      deps = text.split(/\r?\n/).map(line => line.split(/[=<>~\[ ;#]/)[0].trim().toLowerCase()).filter(Boolean);
    }
    for (const dep of deps) {
      const hit = TECH_MAP.find(([key]) => key === dep.toLowerCase());
      if (hit) names.add(hit[1]);
    }
  }
  return [...names];
}

export function createGithub({token = '', fetchImpl = fetch} = {}) {
  async function call(path, {raw = false, binary = false} = {}) {
    const url = path.startsWith('http') ? path : API + path;
    const authed = url.startsWith(API) && token;
    const res = await fetchImpl(url, {
      headers: {
        Accept: raw || binary ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'portfolio-sync',
        ...(authed ? {Authorization: `Bearer ${token}`} : {})
      },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw Object.assign(new Error(`GitHub returned ${res.status} for ${path.split('?')[0]}`), {status: res.status});
    if (binary) return Buffer.from(await res.arrayBuffer());
    return raw ? res.text() : res.json();
  }

  async function listPaged(base) {
    const rows = [];
    for (let page = 1; page <= 6; page++) {
      const batch = await call(`${base}${base.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      rows.push(...batch);
      if (batch.length < 100) break;
    }
    return rows;
  }

  return {
    async whoami() {
      return call('/user');
    },
    async repo(fullName) {
      return call(`/repos/${fullName}`);
    },
    async listRepos({username, orgs = []}) {
      const sources = token
        ? ['/user/repos?affiliation=owner&visibility=all&sort=pushed']
        : [`/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed`];
      for (const org of orgs) sources.push(`/orgs/${encodeURIComponent(org)}/repos?type=all&sort=pushed`);
      const seen = new Map();
      for (const source of sources) for (const repo of await listPaged(source)) if (!seen.has(repo.id)) seen.set(repo.id, repo);
      return [...seen.values()];
    },
    async readme(fullName) {
      try {
        return await call(`/repos/${fullName}/readme`, {raw: true});
      } catch (error) {
        if (error.status === 404) return '';
        throw error;
      }
    },
    async tree(fullName, branch) {
      try {
        const data = await call(`/repos/${fullName}/git/trees/${encodeURIComponent(branch || 'HEAD')}?recursive=1`);
        return data.tree || [];
      } catch (error) {
        if (error.status === 404 || error.status === 409) return [];
        throw error;
      }
    },
    async file(fullName, path, {binary = false} = {}) {
      return call(`/repos/${fullName}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {raw: !binary, binary});
    },
    async manifests(fullName, tree) {
      const wanted = tree
        .filter(entry => entry.type === 'blob' && /^((frontend|backend|client|server|web|api|app)\/)?(package\.json|requirements\.txt)$/i.test(entry.path))
        .slice(0, 4);
      const out = [];
      for (const entry of wanted) {
        try {
          out.push(await this.file(fullName, entry.path));
        } catch {}
      }
      return out;
    },
    async coverFile(fullName, tree) {
      const path = pickCover(tree);
      if (!path) return null;
      try {
        const buffer = await this.file(fullName, path, {binary: true});
        return sniffImage(buffer) && buffer.length <= MAX_IMAGE_BYTES ? buffer : null;
      } catch {
        return null;
      }
    },
    async readmeImage(fullName, readme) {
      for (const src of readmeImages(readme).slice(0, 3)) {
        try {
          let buffer;
          if (/^https?:\/\//i.test(src)) {
            const res = await fetchImpl(src, {signal: AbortSignal.timeout(15000)});
            if (!res.ok) continue;
            buffer = Buffer.from(await res.arrayBuffer());
          } else {
            buffer = await this.file(fullName, src.split('?')[0].replace(/^\.?\//, ''), {binary: true});
          }
          if (sniffImage(buffer) && buffer.length >= 8 * 1024 && buffer.length <= MAX_IMAGE_BYTES) return buffer;
        } catch {}
      }
      return null;
    }
  };
}
