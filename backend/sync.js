import {createGithub, stripReadme, detectTech} from './github.js';
import {writeProject, prettyTitle} from './describe.js';
import {storeImage} from './images.js';
import {captureLivePreview} from './screenshot.js';

const STOP = new Set(['backend', 'frontend', 'api', 'app', 'system', 'web', 'site', 'website', 'project', 'platform', 'server', 'client', 'main', 'v1', 'v2', 'v3', 'demo', 'the', 'my']);

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(t => t.replace(/\d+$/, ''))
    .filter(t => t && !STOP.has(t));
}

const squash = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const sameUrl = (a, b) => a && b && a.replace(/\/$/, '').toLowerCase() === b.replace(/\/$/, '').toLowerCase();

export function githubSettings(env, profile = {}) {
  const token = (env.GITHUB_TOKEN || '').trim();
  const fromProfile = String(profile.github || '').match(/github\.com\/([^/?#]+)/i)?.[1] || '';
  const username = (env.GITHUB_USERNAME || fromProfile).trim();
  const list = value => String(value || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  return {
    token,
    username,
    orgs: String(env.GITHUB_ORGS || '').split(',').map(v => v.trim()).filter(Boolean),
    exclude: list(env.GITHUB_EXCLUDE),
    includeForks: env.GITHUB_INCLUDE_FORKS === '1',
    batch: Math.max(1, Math.min(Number(env.GITHUB_SYNC_BATCH) || 4, 12)),
    configured: Boolean(token || env.GITHUB_USERNAME)
  };
}

export function eligible(repo, settings) {
  const name = repo.name.toLowerCase();
  const full = repo.full_name.toLowerCase();
  if (repo.fork && !settings.includeForks) return false;
  if (name === '.github' || name === repo.owner?.login?.toLowerCase()) return false;
  if (settings.exclude.includes(name) || settings.exclude.includes(full)) return false;
  if ((repo.topics || []).includes('no-portfolio')) return false;
  if (repo.size === 0) return false;
  return true;
}

export function planMatches(repos, projects) {
  const claimed = new Set();
  const matches = new Map();
  const claim = (repo, project) => {
    matches.set(repo.id, project);
    claimed.add(project.id);
  };
  const free = () => projects.filter(p => !claimed.has(p.id));
  const steps = [
    (repo, p) => p.github_id && Number(p.github_id) === repo.id,
    (repo, p) => p.github_repo && p.github_repo.toLowerCase() === repo.full_name.toLowerCase(),
    (repo, p) => sameUrl(p.github, repo.html_url),
    (repo, p) => !p.github_repo && squash(p.title) === squash(repo.name),
    (repo, p) => {
      if (p.github_repo) return false;
      const a = tokens(p.title);
      const b = tokens(repo.name);
      if (!a.length || !b.length) return false;
      const contains = (big, small) => small.every(t => big.includes(t));
      return contains(b, a) || contains(a, b);
    }
  ];
  for (const step of steps) {
    for (const repo of repos) {
      if (matches.has(repo.id)) continue;
      const hit = free().find(p => step(repo, p));
      if (hit) claim(repo, hit);
    }
  }
  return matches;
}

function validHomepage(value) {
  try {
    const u = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : '';
  } catch {
    return '';
  }
}

export async function loadState(db) {
  try {
    const {data} = await db.from('site_state').select('data').eq('id', 'github_sync').maybeSingle();
    return data?.data || null;
  } catch {
    return null;
  }
}

async function saveState(db, data) {
  try {
    await db.from('site_state').upsert({id: 'github_sync', data, updated_at: new Date().toISOString()});
  } catch {}
}

export async function attachImage({db, env, bucket, project, gh, tree, readme, fetchImpl}) {
  let buffer = null;
  if (gh && project.github_repo) {
    const branchTree = tree || (await gh.tree(project.github_repo, 'HEAD'));
    buffer = await gh.coverFile(project.github_repo, branchTree);
  }
  const live = validHomepage(project.url);
  if (!buffer && live) {
    try {
      buffer = await captureLivePreview(live, {env, fetchImpl});
    } catch {}
  }
  if (!buffer && gh && project.github_repo) {
    const text = readme ?? (await gh.readme(project.github_repo).catch(() => ''));
    buffer = await gh.readmeImage(project.github_repo, text);
  }
  if (!buffer) return '';
  const {url} = await storeImage({db, bucket, folder: `projects/${project.id}`, buffer});
  return url;
}

export async function syncGithub({db, env, profile, bucket, fetchImpl = fetch, only = '', batch}) {
  const settings = githubSettings(env, profile);
  if (!settings.configured) throw Object.assign(new Error('Set GITHUB_TOKEN (and optionally GITHUB_USERNAME) on the server first.'), {status: 503});
  const gh = createGithub({token: settings.token, fetchImpl});
  const limit = batch || settings.batch;

  let repos = only ? [await gh.repo(only)] : await gh.listRepos({username: settings.username, orgs: settings.orgs});
  repos = repos.filter(repo => eligible(repo, settings)).sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

  const {data: projects, error} = await db.from('projects').select('*');
  if (error) throw Object.assign(new Error('Could not read projects. Run supabase/schema.sql first.'), {status: 503});

  const matches = planMatches(repos, projects);
  const summary = {total: repos.length, linked: 0, created: 0, remaining: 0, aiUsed: 0, notes: []};

  for (const repo of repos) {
    const project = matches.get(repo.id);
    if (!project) continue;
    const publicLink = repo.private ? '' : project.github || repo.html_url;
    const patch = {};
    if (Number(project.github_id) !== repo.id) patch.github_id = repo.id;
    if (project.github_repo !== repo.full_name) patch.github_repo = repo.full_name;
    if (Boolean(project.github_private) !== Boolean(repo.private)) patch.github_private = Boolean(repo.private);
    if ((project.github || '') !== publicLink) patch.github = publicLink;
    if (Object.keys(patch).length) {
      const {error: updateError} = await db.from('projects').update(patch).eq('id', project.id);
      if (updateError) throw Object.assign(new Error('Could not link a project. Run supabase/schema.sql first.'), {status: 503});
      summary.linked++;
    }
  }

  const fresh = repos.filter(repo => !matches.has(repo.id));
  for (const repo of fresh.slice(0, limit)) {
    try {
      const [readmeRaw, tree] = await Promise.all([gh.readme(repo.full_name), gh.tree(repo.full_name, repo.default_branch)]);
      const manifests = await gh.manifests(repo.full_name, tree);
      const tech = detectTech(manifests);
      const written = await writeProject({env, repo, tech, readme: stripReadme(readmeRaw), fetchImpl});
      if (written.ai) summary.aiUsed++;
      else if (written.reason) summary.notes.push(`${repo.name}: ${written.reason}`);
      const live = validHomepage(repo.homepage);
      const row = {
        title: prettyTitle(repo.name).slice(0, 160),
        category: written.category,
        description: written.description,
        tech: written.tech.join(', ').slice(0, 500),
        url: live,
        github: repo.private ? '' : repo.html_url,
        image_url: '',
        featured: false,
        github_repo: repo.full_name,
        github_id: repo.id,
        github_private: Boolean(repo.private),
        source: 'github'
      };
      const {data: inserted, error: insertError} = await db.from('projects').insert(row).select().single();
      if (insertError) throw Object.assign(new Error('Could not save a new project. Run supabase/schema.sql first.'), {status: 503});
      summary.created++;
      try {
        const image = await attachImage({db, env, bucket, project: inserted, gh, tree, readme: readmeRaw, fetchImpl});
        if (image) await db.from('projects').update({image_url: image}).eq('id', inserted.id);
      } catch (imageError) {
        summary.notes.push(`${repo.name}: image skipped (${imageError.message})`);
      }
    } catch (repoError) {
      if (repoError.status === 503) throw repoError;
      summary.notes.push(`${repo.name}: ${repoError.message}`);
    }
  }
  summary.remaining = Math.max(0, fresh.length - limit);
  if (!only) await saveState(db, {at: new Date().toISOString(), ...summary, notes: summary.notes.slice(0, 8)});
  return summary;
}
