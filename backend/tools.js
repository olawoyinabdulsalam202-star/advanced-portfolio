import multer from 'multer';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {createGithub, stripReadme, detectTech} from './github.js';
import {githubSettings, syncGithub, loadState, attachImage} from './sync.js';
import {writeProject} from './describe.js';
import {groqStatus} from './groq.js';
import {captureLivePreview} from './screenshot.js';
import {findGameArt} from './gameart.js';
import {sniffImage, storeImage, removeStored, MAX_IMAGE_BYTES} from './images.js';

const REPO_FORMAT = /^[\w.-]+\/[\w.-]+$/;
const LAZY_SYNC_MS = 6 * 60 * 60 * 1000;

export function createTools({db, env, bucket, fetchImpl, defaults, fail, check}) {
  let running = null;
  let lastLazyCheck = 0;

  async function loadProfile() {
    if (!db) return defaults;
    const result = await db.from('portfolio_profile').select('data').eq('id', 'main').maybeSingle();
    return {...defaults, ...(result.data?.data || {})};
  }

  function runSync(options = {}) {
    if (running) return running;
    return (running = (async () => {
      try {
        return await syncGithub({db, env, bucket, fetchImpl, profile: await loadProfile(), ...options});
      } finally {
        running = null;
      }
    })());
  }

  async function lazySync() {
    const now = Date.now();
    if (!db || running || now - lastLazyCheck < 10 * 60 * 1000) return;
    lastLazyCheck = now;
    try {
      const settings = githubSettings(env, await loadProfile());
      if (!settings.configured) return;
      const state = await loadState(db);
      if (state?.at && now - new Date(state.at).getTime() < LAZY_SYNC_MS && !state.remaining) return;
      runSync().catch(() => {});
    } catch {}
  }

  async function linkRepo(value, existing) {
    const repo = String(value ?? '').trim();
    if (repo === (existing.github_repo || '')) return null;
    if (!repo) return {github_repo: null, github_id: null, github_private: false};
    if (!REPO_FORMAT.test(repo)) fail('Repository must look like owner/name.');
    const settings = githubSettings(env, await loadProfile());
    if (!settings.configured) return {github_repo: repo};
    try {
      const found = await createGithub({token: settings.token, fetchImpl}).repo(repo);
      return {github_repo: found.full_name, github_id: found.id, github_private: Boolean(found.private)};
    } catch {
      fail('Could not open that repository with your GitHub token. Check the name and the token permissions.');
    }
  }

  return {loadProfile, runSync, lazySync, linkRepo, check};
}

function verifySignature(secret, raw, header) {
  if (!secret || !raw || !header) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
  const given = Buffer.from(String(header));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function registerToolRoutes(app, {db, env, bucket, fetchImpl, auth, needDb, tools, check, fail, text, normalized, limiter}) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: MAX_IMAGE_BYTES, files: 1},
    fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype))
  });

  async function setProjectImage(id, buffer, previous) {
    const {url} = await storeImage({db, bucket, folder: `projects/${id}`, buffer});
    const result = await db.from('projects').update({image_url: url, updated_at: new Date().toISOString()}).eq('id', id).select().single();
    if (result.error) {
      await removeStored({db, env, bucket, url});
      check(result);
    }
    await removeStored({db, env, bucket, url: previous});
    return result.data;
  }

  app.get('/api/github/status', auth, needDb, async (req, res) => {
    const settings = githubSettings(env, await tools.loadProfile());
    const state = await loadState(db);
    res.json({
      configured: settings.configured,
      privateAccess: Boolean(settings.token),
      username: settings.username,
      orgs: settings.orgs,
      webhook: Boolean(env.GITHUB_WEBHOOK_SECRET),
      state
    });
  });

  app.post('/api/github/sync', auth, needDb, async (req, res) => {
    const summary = await tools.runSync({batch: Number(req.body?.batch) || undefined});
    res.json(summary);
  });

  app.get('/api/github/cron', needDb, async (req, res, next) => {
    const secret = env.CRON_SECRET;
    const bearer = (req.get('authorization') || '').replace(/^Bearer /i, '');
    if (!secret || bearer !== secret) return auth(req, res, () => next());
    next();
  }, async (req, res) => {
    res.json(await tools.runSync({batch: 8}));
  });

  app.post('/api/github/webhook', needDb, async (req, res) => {
    if (!verifySignature(env.GITHUB_WEBHOOK_SECRET, req.rawBody, req.get('x-hub-signature-256'))) return res.status(401).json({error: 'Invalid webhook signature.'});
    const event = req.get('x-github-event');
    if (event === 'ping') return res.json({ok: true});
    const action = req.body?.action;
    const relevant = event === 'repository' && ['created', 'publicized', 'privatized', 'renamed', 'transferred', 'unarchived', 'edited'].includes(action);
    if (!relevant) return res.json({ok: true, ignored: event});
    const full = req.body?.repository?.full_name;
    const work = tools.runSync(full ? {only: full} : {}).catch(() => null);
    await Promise.race([work, new Promise(resolve => setTimeout(resolve, 8000))]);
    res.json({ok: true});
  });

  app.get('/api/ai/status', auth, async (req, res) => res.json(await groqStatus(env, fetchImpl)));

  app.post('/api/projects/:id/visibility', auth, needDb, async (req, res) => {
    if (typeof req.body?.hidden !== 'boolean') fail('Invalid update.');
    res.json(normalized(check(await db.from('projects').update({hidden: req.body.hidden}).eq('id', req.params.id).select().single())));
  });

  app.post('/api/projects/:id/preview', auth, needDb, async (req, res) => {
    const project = check(await db.from('projects').select('*').eq('id', req.params.id).single());
    if (!project.url) fail('Add a live project link first, then capture its preview.');
    let buffer;
    try {
      buffer = await captureLivePreview(project.url, {env, fetchImpl});
    } catch (error) {
      fail(`Could not capture the live site: ${error.message}`, 502);
    }
    res.json(normalized(await setProjectImage(project.id, buffer, project.image_url)));
  });

  app.post('/api/projects/:id/describe', auth, needDb, async (req, res) => {
    const project = check(await db.from('projects').select('*').eq('id', req.params.id).single());
    const settings = githubSettings(env, await tools.loadProfile());
    let readme = '';
    let tech = [];
    const repo = {name: project.github_repo ? project.github_repo.split('/')[1] : project.title, description: '', topics: [], language: ''};
    if (project.github_repo && settings.configured) {
      const gh = createGithub({token: settings.token, fetchImpl});
      try {
        const meta = await gh.repo(project.github_repo);
        Object.assign(repo, {description: meta.description || '', topics: meta.topics || [], language: meta.language || ''});
        readme = stripReadme(await gh.readme(project.github_repo));
        tech = detectTech(await gh.manifests(project.github_repo, await gh.tree(project.github_repo, meta.default_branch)));
      } catch {}
    }
    const written = await writeProject({env, repo, tech, readme, seed: text(req.body?.seed ?? project.description, 1500), fetchImpl});
    res.json(written);
  });

  app.post('/api/images/fill', auth, needDb, async (req, res) => {
    const settings = githubSettings(env, await tools.loadProfile());
    const gh = settings.configured ? createGithub({token: settings.token, fetchImpl}) : null;
    const rows = check(await db.from('projects').select('*'));
    const missing = rows.filter(p => !p.image_url && !p.hidden && (p.url || (gh && p.github_repo)));
    const tried = new Set(Array.isArray(req.body?.skip) ? req.body.skip : []);
    const queue = missing.filter(p => !tried.has(p.id));
    let filled = 0;
    const attempted = [];
    for (const project of queue.slice(0, 3)) {
      attempted.push(project.id);
      try {
        const url = await attachImage({db, env, bucket, project, gh, fetchImpl});
        if (url) {
          await db.from('projects').update({image_url: url}).eq('id', project.id);
          filled++;
        }
      } catch {}
    }
    res.json({filled, attempted, remaining: Math.max(0, queue.length - attempted.length)});
  });

  async function updateGameImage(index, url) {
    const profile = await tools.loadProfile();
    const images = Array.from({length: 4}, (_, i) => profile.game_images?.[i] || '');
    const old = images[index];
    images[index] = url;
    const data = {...profile, game_images: images};
    check(await db.from('portfolio_profile').upsert({id: 'main', data, updated_at: new Date().toISOString()}).select().single());
    if (old && old !== url) await removeStored({db, env, bucket, url: old});
    return data;
  }

  const gameIndex = (req, res, next) => {
    const i = Number(req.params.index);
    if (!Number.isInteger(i) || i < 0 || i > 3) return res.status(400).json({error: 'Game slot must be 1 to 4.'});
    req.gameIndex = i;
    next();
  };

  app.post('/api/profile/games/:index/image', auth, needDb, gameIndex, upload.single('image'), async (req, res) => {
    if (!req.file || !sniffImage(req.file.buffer)) fail('Choose a PNG, JPEG, WebP or GIF image.');
    const {url} = await storeImage({db, bucket, folder: `games/${req.gameIndex}`, buffer: req.file.buffer});
    res.json(await updateGameImage(req.gameIndex, url));
  });

  app.post('/api/profile/games/:index/auto', auth, needDb, gameIndex, limiter(20, 60 * 1000), async (req, res) => {
    const profile = await tools.loadProfile();
    const name = text(req.body?.name, 60) || profile.games?.[req.gameIndex];
    if (!name) fail('Add the game name first.');
    const found = await findGameArt(name, fetchImpl);
    if (!found) fail(`Could not find artwork for ${name}. Upload your own screenshot instead.`, 404);
    const {url} = await storeImage({db, bucket, folder: `games/${req.gameIndex}`, buffer: found.buffer});
    res.json({...(await updateGameImage(req.gameIndex, url)), found: found.source});
  });
}
