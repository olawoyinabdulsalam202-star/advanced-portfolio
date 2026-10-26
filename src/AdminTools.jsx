import React, {useEffect, useRef, useState} from 'react';
import {api, safeUrl} from './api.js';

function when(iso) {
  if (!iso) return 'never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

export function GithubPanel({action, busy, refresh, setNotice}) {
  const [status, setStatus] = useState(null);
  const [groq, setGroq] = useState(null);
  const [progress, setProgress] = useState('');

  const load = () => api('/github/status').then(setStatus).catch(() => setStatus({error: true}));
  useEffect(() => {
    load();
  }, []);

  async function syncNow() {
    let created = 0;
    let linked = 0;
    let notes = [];
    for (let round = 1; round <= 12; round++) {
      setProgress(round === 1 ? 'Reading your repositories…' : `Writing project pages (round ${round})…`);
      const result = await api('/github/sync', {method: 'POST', body: {}});
      created += result.created;
      linked += result.linked;
      notes = notes.concat(result.notes || []);
      if (!result.remaining || !result.created) break;
    }
    setProgress('');
    await Promise.all([refresh(), load()]);
    setNotice(`GitHub synced: ${created} new project${created === 1 ? '' : 's'}, ${linked} linked or updated.${notes.length ? ' Notes: ' + notes.slice(0, 3).join(' | ') : ''}`);
  }

  async function fillImages() {
    let filled = 0;
    let skip = [];
    for (let round = 1; round <= 20; round++) {
      setProgress('Capturing project images…');
      const result = await api('/images/fill', {method: 'POST', body: {skip}});
      filled += result.filled;
      skip = skip.concat(result.attempted);
      if (!result.remaining) break;
    }
    setProgress('');
    await refresh();
    setNotice(filled ? `${filled} project image${filled === 1 ? '' : 's'} added.` : 'No new images found. Add a live link or a screenshot file to the repo, or upload one in the editor.');
  }

  async function checkGroq() {
    setGroq({checking: true});
    setGroq(await api('/ai/status'));
  }

  const state = status?.state;
  return (
    <div className="github-panel">
      <h3>GitHub sync</h3>
      {!status && <p className="muted">Checking…</p>}
      {status && !status.configured && (
        <p>Not connected yet. Add <code>GITHUB_TOKEN</code> to your server environment (a fine-grained token with read access to Contents and Metadata for all your repositories), then redeploy.</p>
      )}
      {status?.configured && (
        <>
          <p>
            <i className="status-dot" />
            Connected{status.username ? ` as ${status.username}` : ''}. {status.privateAccess ? 'Private repositories are included and their links stay hidden.' : 'Public repositories only. Add GITHUB_TOKEN to include private ones.'}
          </p>
          <p className="muted">
            Last sync: {when(state?.at)}
            {state ? ` · ${state.total} repositories seen, ${state.created} added, ${state.remaining || 0} waiting` : ''}
          </p>
          <div className="setup-actions">
            <button className="button lime" disabled={busy} onClick={() => action(syncNow)}>{progress || 'Sync GitHub now'} ↻</button>
            <button className="button outline" disabled={busy} onClick={() => action(fillImages)}>Fill missing images</button>
          </div>
          <p className="muted">
            New repositories appear automatically. Turn on instant updates by adding a webhook on GitHub (Settings, Webhooks) pointing to <code>{location.origin}/api/github/webhook</code>, content type JSON, event “Repositories”, with the secret set as <code>GITHUB_WEBHOOK_SECRET</code>{status.webhook ? ' (secret detected)' : ''}.
          </p>
        </>
      )}
      <h3>Groq assistant and descriptions</h3>
      <div className="setup-actions">
        <button className="button outline" disabled={busy || groq?.checking} onClick={() => action(checkGroq)}>{groq?.checking ? 'Testing…' : 'Test Groq connection'}</button>
        {groq && !groq.checking && (
          <span className={groq.ok ? 'ok-text' : 'error-text'}>{groq.ok ? `Working with ${groq.model}` : groq.error}</span>
        )}
      </div>
    </div>
  );
}

export function GamesEditor({profile, setProfile, action, defaults}) {
  const files = useRef([]);
  const games = profile.games || defaults.games;
  const images = profile.game_images || ['', '', '', ''];

  async function upload(index, file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
    const form = new FormData();
    form.append('image', file);
    const result = await api(`/profile/games/${index}/image`, {method: 'POST', body: form});
    setProfile({...profile, game_images: result.game_images});
  }

  async function auto(index) {
    const result = await api(`/profile/games/${index}/auto`, {method: 'POST', body: {name: games[index]}});
    setProfile({...profile, game_images: result.game_images});
  }

  const rename = (index, value) => {
    const next = [...games];
    next[index] = value;
    setProfile({...profile, games: next});
  };

  const clear = index => {
    const next = [...images];
    next[index] = '';
    setProfile({...profile, game_images: next});
  };

  const setImageUrl = (index, value) => {
    const next = [...images];
    next[index] = value;
    setProfile({...profile, game_images: next});
  };

  return (
    <div className="games-editor">
      {games.map((name, i) => (
        <div className="game-slot" key={i}>
          <div className="game-slot-art">{safeUrl(images[i]) ? <img src={safeUrl(images[i])} alt="" /> : <span>No art yet</span>}</div>
          <div className="game-slot-fields">
            <label>
              {`Game ${i + 1}${i === 0 ? ' (favourite)' : ''}`}
              <input value={name} maxLength="60" required onChange={e => rename(i, e.target.value)} />
            </label>
            <label>
              Artwork image URL
              <input type="url" value={images[i] || ''} placeholder="https://…" onChange={e => setImageUrl(i, e.target.value)} />
            </label>
            <div className="row-actions">
              <button type="button" onClick={() => action(() => auto(i))}>Find art automatically</button>
              <button type="button" onClick={() => files.current[i]?.click()}>Upload my own</button>
              {safeUrl(images[i]) && <button type="button" className="danger" onClick={() => clear(i)}>Remove</button>}
              <input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" ref={el => (files.current[i] = el)} onChange={e => { const f = e.target.files[0]; e.target.value = ''; action(() => upload(i, f)); }} />
            </div>
          </div>
        </div>
      ))}
      <p className="muted">Art is copied into your own storage. Removing a picture takes effect when you save the profile.</p>
    </div>
  );
}
