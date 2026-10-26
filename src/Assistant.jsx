import React, {useEffect, useRef, useState} from 'react';
import {api, safeUrl} from './api.js';

const Icon = ({name}) => {
  const paths = {
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    reset: <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" />,
    send: <path d="M12 19V5M6 11l6-6 6 6" />,
    arrow: <path d="M7 17L17 7M9 7h8v8" />
  };
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
};

function inline(text, keyBase) {
  const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={keyBase + i}>{part.slice(2, -2)}</strong>;
    if (/^https?:\/\//.test(part)) {
      const href = safeUrl(part.replace(/[.,;]+$/, ''));
      return href ? <a key={keyBase + i} href={href} target="_blank" rel="noreferrer">{part.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a> : part;
    }
    return part;
  });
}

function RichText({text}) {
  const blocks = [];
  let list = [];
  text.split('\n').forEach((line, i) => {
    const item = line.match(/^\s*[-*•]\s+(.*)/);
    if (item) {
      list.push(<li key={i}>{inline(item[1], `l${i}`)}</li>);
      return;
    }
    if (list.length) {
      blocks.push(<ul key={`u${i}`}>{list}</ul>);
      list = [];
    }
    if (line.trim()) blocks.push(<p key={i}>{inline(line, `p${i}`)}</p>);
  });
  if (list.length) blocks.push(<ul key="end">{list}</ul>);
  return <>{blocks}</>;
}

function BotMessage({message, projects, onOpenProject, onTick}) {
  const instant = message.instant || document.documentElement.dataset.motion === 'off';
  const [shown, setShown] = useState(instant ? message.text.length : 0);
  useEffect(() => {
    if (shown >= message.text.length) return;
    const id = setTimeout(() => setShown(s => Math.min(message.text.length, s + 4)), 14);
    return () => clearTimeout(id);
  }, [shown, message.text]);
  useEffect(() => {
    onTick();
  }, [shown]);
  const done = shown >= message.text.length;
  const related = (message.related || []).map(id => projects.find(p => p.id === id)).filter(Boolean);
  return (
    <div className={'ai-row bot' + (message.error ? ' error' : '')}>
      <span className="ai-avatar small" aria-hidden="true"><Icon name="spark" /></span>
      <div className="ai-bubble">
        <RichText text={message.text.slice(0, shown)} />
        {done && related.length > 0 && (
          <div className="ai-related">
            {related.map(p => (
              <button key={p.id} onClick={() => onOpenProject(p)}>
                {p.title} <Icon name="arrow" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Assistant({open, setOpen, profile, projects, onOpenProject}) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const body = useRef(null);
  const input = useRef(null);
  const launcher = useRef(null);
  const wasOpen = useRef(false);

  const first = profile.name.split(' ')[0];
  const suggestions = [
    `What has ${first} built?`,
    'Which projects use AI?',
    `What is ${first}'s tech stack?`,
    'Is he open to work right now?'
  ];

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => input.current?.focus(), 120);
      return () => clearTimeout(id);
    }
    if (wasOpen.current) launcher.current?.focus();
  }, [open]);
  useEffect(() => {
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  const scrollDown = () => {
    body.current?.scrollTo({top: body.current.scrollHeight});
  };
  useEffect(() => {
    scrollDown();
  }, [messages, busy]);

  async function send(question) {
    const text = question.trim();
    if (!text || busy) return;
    const history = messages.filter(m => !m.error).map(m => ({role: m.role === 'user' ? 'user' : 'assistant', content: m.text}));
    setMessages(m => [...m, {role: 'user', text}]);
    setDraft('');
    setBusy(true);
    try {
      const data = await api('/ai', {method: 'POST', body: {message: text, history}});
      setMessages(m => [...m, {role: 'bot', text: data.answer, related: data.related}]);
    } catch {
      setMessages(m => [...m, {role: 'bot', error: true, text: `I could not reach the server just now. Try again in a moment, or email ${profile.email}.`}]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button ref={launcher} className="ai-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Ask about ${first}`}>
          <span className="ai-avatar"><Icon name="spark" /></span>
          <span className="ai-launcher-text">
            <strong>Ask about me</strong>
            <small><i className="ai-live" />Instant answers</small>
          </span>
        </button>
      )}
      {open && (
        <section className="ai-panel" role="dialog" aria-label="Portfolio assistant">
          <header className="ai-head">
            <span className="ai-avatar" aria-hidden="true">{profile.brand.slice(0, 2)}</span>
            <div>
              <strong>{first}'s assistant</strong>
              <small><i className="ai-live" />Answers from this portfolio</small>
            </div>
            <div className="ai-tools">
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} aria-label="Start a new conversation" title="New conversation"><Icon name="reset" /></button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close assistant" title="Close"><Icon name="close" /></button>
            </div>
          </header>
          <div className="ai-body" ref={body} role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="ai-intro">
                <p className="ai-hello">Hey, I know this portfolio inside out.</p>
                <p className="ai-sub">Ask about the projects, the stack, or how to work with {first}.</p>
                <div className="ai-suggest">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => send(s)} disabled={busy}>
                      <span>{s}</span>
                      <Icon name="arrow" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div className="ai-row user" key={i}><div className="ai-bubble">{m.text}</div></div>
              ) : (
                <BotMessage key={i} message={{...m, instant: i < messages.length - 1}} projects={projects} onOpenProject={p => { setOpen(false); onOpenProject(p); }} onTick={scrollDown} />
              )
            )}
            {busy && (
              <div className="ai-row bot">
                <span className="ai-avatar small" aria-hidden="true"><Icon name="spark" /></span>
                <div className="ai-bubble typing" aria-label="Thinking"><i /><i /><i /></div>
              </div>
            )}
          </div>
          <form className="ai-compose" onSubmit={e => { e.preventDefault(); send(draft); }}>
            <label className="sr-only" htmlFor="ai-question">Your question</label>
            <input id="ai-question" ref={input} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask anything about the work" maxLength="500" autoComplete="off" />
            <button disabled={busy || !draft.trim()} aria-label="Send question"><Icon name="send" /></button>
          </form>
        </section>
      )}
    </>
  );
}
