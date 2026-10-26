import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createApp} from '../backend/app.js';
import {planMatches} from '../backend/sync.js';
import {pickCover, stripReadme, detectTech} from '../backend/github.js';
import {memoryDb} from './helpers.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const db = memoryDb();
const env = {
  ADMIN_EMAIL: 'test@example.com',
  ADMIN_PASSWORD: 'test-password-only',
  JWT_SECRET: 'testing-secret-not-a-production-credential',
  SUPABASE_URL: 'https://test.supabase.co',
  GITHUB_TOKEN: 'ghp_test',
  GROQ_API_KEY: 'gsk_test',
  GITHUB_WEBHOOK_SECRET: 'hook-secret'
};

const repos = [
  {id: 11, name: 'kairos-va', full_name: 'me/kairos-va', private: false, fork: false, size: 50, html_url: 'https://github.com/me/kairos-va', homepage: '', default_branch: 'main', pushed_at: '2026-10-20T00:00:00Z', description: 'Voice assistant', topics: [], language: 'JavaScript', owner: {login: 'me'}},
  {id: 12, name: 'medical-clerking-backend', full_name: 'me/medical-clerking-backend', private: true, fork: false, size: 50, html_url: 'https://github.com/me/medical-clerking-backend', homepage: '', default_branch: 'main', pushed_at: '2026-10-19T00:00:00Z', description: '', topics: [], language: 'JavaScript', owner: {login: 'me'}},
  {id: 13, name: 'snap-notes', full_name: 'me/snap-notes', private: true, fork: false, size: 50, html_url: 'https://github.com/me/snap-notes', homepage: 'https://snap-notes.example.com', default_branch: 'main', pushed_at: '2026-10-18T00:00:00Z', description: 'Notes app', topics: [], language: 'JavaScript', owner: {login: 'me'}},
  {id: 14, name: 'forked-thing', full_name: 'me/forked-thing', private: false, fork: true, size: 50, html_url: 'https://github.com/me/forked-thing', default_branch: 'main', pushed_at: '2026-10-17T00:00:00Z', owner: {login: 'me'}},
  {id: 15, name: 'me', full_name: 'me/me', private: false, fork: false, size: 5, html_url: 'https://github.com/me/me', default_branch: 'main', pushed_at: '2026-10-16T00:00:00Z', owner: {login: 'me'}}
];

let groqCalls = 0;
async function fakeFetch(input, init = {}) {
  const url = String(input);
  const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
  if (url.startsWith('https://api.groq.com')) {
    groqCalls++;
    const body = JSON.parse(init.body);
    const content = body.response_format
      ? JSON.stringify({description: 'I built Snap Notes to capture quick notes. It stores them in a private database and syncs across devices.', category: 'Platforms', tech: ['React', 'Supabase']})
      : 'Abdulsalam built KAIROS, a voice assistant.';
    return json({choices: [{message: {content}}]});
  }
  if (url.startsWith('https://api.microlink.io')) return json({status: 'success', data: {screenshot: {url: 'https://cdn.example.com/shot.png'}}});
  if (url === 'https://cdn.example.com/shot.png') return new Response(png, {headers: {'content-type': 'image/png'}});
  if (url.startsWith('https://api.github.com/user/repos')) return json(url.includes('page=1') ? repos : []);
  if (url.endsWith('/readme')) return new Response('# Snap Notes\nA notes app that syncs across devices and keeps everything private.', {status: 200});
  if (url.includes('/git/trees/')) return json({tree: [{path: 'package.json', type: 'blob', size: 300}, {path: 'screenshots/home.png', type: 'blob', size: 20000}, {path: 'src/app.js', type: 'blob', size: 100}]});
  if (url.endsWith('/contents/package.json')) return new Response(JSON.stringify({dependencies: {react: '1', '@supabase/supabase-js': '2'}}), {status: 200});
  if (url.includes('/contents/screenshots/home.png')) return new Response(png, {status: 200});
  if (url.includes('itunes.apple.com')) return json({results: [{trackName: 'Free Fire: Booyah', screenshotUrls: ['https://is1.example.com/a/1920x1080bb.png']}]});
  if (url === 'https://is1.example.com/a/1920x1080bb.png') return new Response(png, {headers: {'content-type': 'image/png'}});
  return json({message: 'not found'}, 404);
}

let server, base, cookie;
async function request(path, {method = 'GET', body, auth = true, headers = {}, raw} = {}) {
  const form = body instanceof FormData;
  const r = await fetch(base + path, {
    method,
    headers: {...(auth && cookie ? {Cookie: cookie} : {}), ...(body && !form && !raw ? {'Content-Type': 'application/json'} : {}), ...headers},
    body: raw ?? (body ? (form ? body : JSON.stringify(body)) : undefined)
  });
  const type = r.headers.get('content-type') || '';
  return {status: r.status, data: type.includes('json') ? await r.json() : await r.text()};
}

before(async () => {
  server = createApp({db, env, fetchImpl: fakeFetch}).listen(0);
  await new Promise(r => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const r = await fetch(base + '/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD})});
  cookie = r.headers.get('set-cookie').split(';')[0];
  db.tables.projects.push(
    {id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', title: 'KAIROS', category: 'AI & tools', description: 'Voice assistant.', tech: '', url: '', github: '', image_url: '', featured: true, created_at: '2026-01-01T00:00:00Z'},
    {id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', title: 'Medical Clerking System', category: 'Platforms', description: 'Clinical records.', tech: '', url: '', github: 'https://github.com/me/medical-clerking-backend', image_url: '', featured: false, created_at: '2026-01-01T00:00:00Z'}
  );
});
after(() => server.close());

test('repo names match existing projects without creating duplicates', () => {
  const projects = [{id: 'p1', title: 'KAIROS'}, {id: 'p2', title: 'Medical Clerking System'}, {id: 'p3', title: 'Adifase'}];
  const found = planMatches([{id: 1, name: 'kairos-va', full_name: 'me/kairos-va', html_url: 'x'}, {id: 2, name: 'medical-clerking-backend', full_name: 'me/m', html_url: 'y'}, {id: 3, name: 'adifase97', full_name: 'me/a', html_url: 'z'}, {id: 4, name: 'unrelated', full_name: 'me/u', html_url: 'w'}], projects);
  assert.equal(found.get(1).id, 'p1');
  assert.equal(found.get(2).id, 'p2');
  assert.equal(found.get(3).id, 'p3');
  assert.equal(found.has(4), false);
});

test('cover, readme and stack helpers', () => {
  assert.equal(pickCover([{path: 'src/index.js', type: 'blob'}, {path: 'screenshots/home.png', type: 'blob', size: 20000}, {path: 'public/favicon.png', type: 'blob', size: 20000}]), 'screenshots/home.png');
  assert.equal(pickCover([{path: 'public/favicon.png', type: 'blob', size: 20000}]), '');
  assert.ok(!stripReadme('![x](a.png)\nHello <img src="b.png"> world').includes('png'));
  assert.deepEqual(detectTech([JSON.stringify({dependencies: {react: '1', express: '4'}}), 'fastapi==0.1\nrequests']), ['React', 'Express', 'FastAPI']);
});

test('GitHub sync links existing work, hides private links and creates the rest', async () => {
  const r = await request('/api/github/sync', {method: 'POST', body: {}});
  assert.equal(r.status, 200);
  assert.equal(r.data.created, 1);
  assert.equal(r.data.linked, 2);
  const rows = db.tables.projects;
  const kairos = rows.find(p => p.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  assert.equal(kairos.github_repo, 'me/kairos-va');
  assert.equal(kairos.github, 'https://github.com/me/kairos-va');
  const medical = rows.find(p => p.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
  assert.equal(medical.github_private, true);
  assert.equal(medical.github, '');
  const added = rows.find(p => p.github_repo === 'me/snap-notes');
  assert.equal(added.title, 'Snap Notes');
  assert.match(added.description, /^I built Snap Notes/);
  assert.equal(added.github, '');
  assert.equal(added.url, 'https://snap-notes.example.com/');
  assert.match(added.image_url, /storage\/v1\/object\/public\/project-images\/projects\//);
  assert.equal(rows.some(p => p.github_repo === 'me/forked-thing' || p.github_repo === 'me/me'), false);
  assert.equal((await request('/api/github/sync', {method: 'POST', body: {}})).data.created, 0);
  assert.equal(rows.length, 3);
});

test('public project list never exposes private repository details', async () => {
  const list = (await request('/api/projects', {auth: false})).data;
  assert.equal(list.length, 3);
  for (const p of list) {
    assert.equal('github_repo' in p, false);
    assert.equal('github_private' in p, false);
  }
  assert.equal(list.find(p => p.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2').github, '');
  assert.equal(list.find(p => p.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1').github, 'https://github.com/me/kairos-va');
});

test('editing a private project cannot reintroduce its repository link; linked projects hide instead of delete', async () => {
  const body = {title: 'Medical Clerking System', category: 'Platforms', description: 'Clinical records.', github: 'https://github.com/me/medical-clerking-backend'};
  const r = await request('/api/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', {method: 'PUT', body});
  assert.equal(r.status, 200);
  assert.equal(r.data.github, '');
  const del = await request('/api/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', {method: 'DELETE'});
  assert.equal(del.data.hidden, true);
  assert.equal((await request('/api/projects', {auth: false})).data.some(p => p.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'), false);
  assert.equal((await request('/api/projects?all=1')).data.some(p => p.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'), true);
  assert.equal((await request('/api/projects?all=1', {auth: false})).status, 401);
  await request('/api/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/visibility', {method: 'POST', body: {hidden: false}});
});

test('webhook requires a valid signature', async () => {
  const payload = JSON.stringify({action: 'created', repository: {full_name: 'me/snap-notes'}});
  const sign = secret => 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  const headers = secret => ({'Content-Type': 'application/json', 'X-GitHub-Event': 'repository', 'X-Hub-Signature-256': sign(secret)});
  assert.equal((await request('/api/github/webhook', {method: 'POST', auth: false, raw: payload, headers: headers('wrong')})).status, 401);
  assert.equal((await request('/api/github/webhook', {method: 'POST', auth: false, raw: payload, headers: headers(env.GITHUB_WEBHOOK_SECRET)})).status, 200);
});

test('live preview capture stores an image for a project with a live link', async () => {
  db.tables.projects.find(p => p.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1').image_url = '';
  db.tables.projects.find(p => p.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1').url = 'https://kairos.example.com';
  const r = await request('/api/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/preview', {method: 'POST', body: {}});
  assert.equal(r.status, 200);
  assert.match(r.data.image_url, /project-images\/projects\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1\//);
});

test('assistant uses Groq with history and reports related projects', async () => {
  const before = groqCalls;
  const r = await request('/api/ai', {method: 'POST', auth: false, body: {message: 'What is KAIROS?', history: [{role: 'user', content: 'hi'}, {role: 'assistant', content: 'hello'}]}});
  assert.equal(r.status, 200);
  assert.equal(groqCalls, before + 1);
  assert.match(r.data.answer, /KAIROS/);
  assert.deepEqual(r.data.related, ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1']);
});

test('game artwork can be uploaded or found automatically', async () => {
  const form = new FormData();
  form.append('image', new Blob([png], {type: 'image/png'}), 'ff.png');
  let r = await request('/api/profile/games/0/image', {method: 'POST', body: form});
  assert.equal(r.status, 200);
  assert.match(r.data.game_images[0], /games\/0\//);
  r = await request('/api/profile/games/1/auto', {method: 'POST', body: {}});
  assert.equal(r.status, 404);
  assert.equal((await request('/api/profile/games/9/image', {method: 'POST', body: form})).status, 400);
  r = await request('/api/profile/games/0/auto', {method: 'POST', body: {}});
  assert.equal(r.status, 200);
  assert.equal(r.data.found, 'App Store screenshot');
  assert.equal((await request('/api/profile', {auth: false})).data.game_images[0], r.data.game_images[0]);
});
