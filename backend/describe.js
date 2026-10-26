import {groqChat, parseJson} from './groq.js';

export const CATEGORIES = ['Platforms', 'AI & tools', 'Websites', 'Experiments'];

const SYSTEM = `You write project case-study text for the portfolio of Abdulsalam Olawoyin, a freelance full-stack and AI developer from Nigeria.
Rules:
- Use only the material supplied. Never invent features, users, clients, revenue, metrics, awards or deadlines.
- Write in first person ("I built..."), plain and confident, no hype, no buzzwords, no emojis.
- Two short paragraphs, 70 to 130 words in total. Paragraph one: what the product is and who it is for. Paragraph two: how it works and the main technical decisions that the material supports.
- Keep it at product level. Never output secrets, keys, internal URLs, database names or confidential client details, even if they appear in the material.
- If the material is thin, write less rather than guessing.
Return JSON only: {"description": string, "category": one of ${JSON.stringify(CATEGORIES)}, "tech": array of 3 to 6 technology names that the material actually supports}.`;

export function prettyTitle(name) {
  return String(name || '')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])([a-z]*)\b/g, (match, first, rest) => (match.length <= 2 && !/^(ai|ui|ux)$/.test(match) ? match : first.toUpperCase() + rest))
    .replace(/\b(Ai|Ui|Ux|Api|Ngo|Pms|Saas)\b/g, word => word.toUpperCase());
}

function guessCategory({repo, tech}) {
  const blob = `${repo.name} ${repo.description || ''} ${(repo.topics || []).join(' ')} ${tech.join(' ')}`.toLowerCase();
  if (/\b(ai|llm|gpt|groq|openai|assistant|voice|bot|ml)\b/.test(blob)) return 'AI & tools';
  if (/(landing|portfolio|website|site|store|shop|blog|agency)/.test(blob)) return 'Websites';
  if (/(platform|dashboard|saas|system|portal|management|api|backend|app)/.test(blob)) return 'Platforms';
  return 'Experiments';
}

export function fallbackProject({repo, tech, readme}) {
  const firstLine = String(readme || '').split('\n').map(line => line.replace(/^[#>*\-\s]+/, '').trim()).find(line => line.length > 40 && !/^https?:/.test(line));
  const base = repo.description || firstLine || '';
  const stack = tech.length ? `Built with ${tech.slice(0, 5).join(', ')}.` : repo.language ? `Written mainly in ${repo.language}.` : '';
  const description = [base && (/[.!?]$/.test(base) ? base : base + '.'), stack].filter(Boolean).join(' ')
    || `${prettyTitle(repo.name)} is one of my software projects. Ask me for details about how it works.`;
  return {description, category: guessCategory({repo, tech}), tech: tech.length ? tech : repo.language ? [repo.language] : []};
}

export async function writeProject({env, repo, tech = [], readme = '', seed = '', fetchImpl}) {
  const fallback = fallbackProject({repo, tech, readme});
  const material = [
    `Name: ${prettyTitle(repo.name)}`,
    repo.description && `Repo description: ${repo.description}`,
    repo.topics?.length && `Topics: ${repo.topics.join(', ')}`,
    repo.language && `Main language: ${repo.language}`,
    tech.length && `Detected stack: ${tech.join(', ')}`,
    seed && `Current description written by the owner: ${seed}`,
    readme && `README (trimmed):\n${readme.slice(0, 6500)}`
  ].filter(Boolean).join('\n');
  try {
    const {text} = await groqChat(env, {
      json: true,
      maxTokens: 700,
      temperature: 0.4,
      fetchImpl,
      messages: [{role: 'system', content: SYSTEM}, {role: 'user', content: material}]
    });
    const data = parseJson(text);
    const description = String(data?.description || '').trim();
    if (description.length < 40) throw new Error('Groq description too short.');
    const category = CATEGORIES.includes(data.category) ? data.category : fallback.category;
    const list = Array.isArray(data.tech) ? data.tech : String(data.tech || '').split(',');
    const cleanTech = list.map(item => String(item).trim()).filter(Boolean).slice(0, 6);
    return {description: description.slice(0, 2000), category, tech: cleanTech.length ? cleanTech : fallback.tech, ai: true};
  } catch (error) {
    return {...fallback, ai: false, reason: error.message};
  }
}
