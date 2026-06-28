#!/usr/bin/env node
// ============================================================
// daily-hunter.js — Pandian's SG Job Alert (MCF + LinkedIn)
// Runs daily via Windows Task Scheduler.
// Sends only NEW jobs to Telegram, skips already-seen ones.
// Also refreshes Singapore-Jobs-Dashboard.html.
// ============================================================

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────
const TELEGRAM_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MIN_SALARY       = parseInt(process.env.MIN_SALARY || '8000');
const MAX_DIGEST       = 15;   // max jobs in the daily digest
const HOURS_BACK       = 48;   // only alert jobs posted within this window
const STATE_FILE       = path.join(__dirname, 'state', 'seen-jobs.json');
const DASHBOARD_OUT    = path.join(__dirname, 'public', 'index.html');
const MCF_LIMIT        = 40;
const LI_PAGES         = 2;
const LI_DELAY_MS      = 600;
const LI_GEO           = '102454443';

// ── Searches ─────────────────────────────────────────────────
const SEARCHES = [
  { label: 'TPM',              q: 'technical program manager',                 role: 'TPM',      weight: 12 },
  { label: 'Principal TPM',    q: 'principal technical program manager',        role: 'TPM',      weight: 12 },
  { label: 'Solution Arch',    q: 'solution architect',                        role: 'SA',       weight: 12 },
  { label: 'Presales',         q: 'presales',                                  role: 'PRESALES', weight: 12 },
  { label: 'Pre-Sales Eng',    q: 'pre-sales engineer',                        role: 'PRESALES', weight: 11 },
  { label: 'Network Planning', q: 'network planning manager',                  role: 'NETWORK',  weight: 11 },
  { label: 'Infra BD',         q: 'infrastructure business development',       role: 'INFRA_BD', weight: 11 },
  { label: 'Infra Prog Mgr',   q: 'infrastructure program manager',            role: 'TPM',      weight: 11 },
  { label: 'DC Planning',      q: 'data center planning delivery manager',     role: 'TPM',      weight: 11 },
  { label: 'Interconnect PM',  q: 'interconnection program manager',            role: 'NETWORK',  weight: 11 },
  { label: 'Proj Delivery Mgr',q: 'project delivery manager infrastructure',   role: 'TPM',      weight: 10 },
  { label: 'Tech Project Mgr', q: 'technical project manager',                 role: 'TPM',      weight: 10 },
  { label: 'Security Arch',    q: 'security architect',                        role: 'SA',       weight: 10 },
  { label: 'Mgmt Consultant',  q: 'managing consultant cybersecurity',          role: 'SA',       weight: 10 },
  { label: 'Network Mgr',      q: 'network manager',                           role: 'NETWORK',  weight: 10 },
  { label: 'Infra Mgr',        q: 'infrastructure manager',                    role: 'INFRA',    weight: 10 },
  { label: 'Biz Dev Tech',     q: 'business development manager technology',   role: 'BD',       weight:  9 },
  { label: 'Cloud Arch',       q: 'cloud architect',                           role: 'SA',       weight: 10 },
  { label: 'Telecom BD',       q: 'telecom business development',              role: 'INFRA_BD', weight: 10 },
  { label: 'Network Arch',     q: 'network architect',                         role: 'NETWORK',  weight: 10 },
  { label: 'Prog Mgr Tech',    q: 'program manager technology',                role: 'TPM',      weight:  9 },
];

// ── Scoring config ────────────────────────────────────────────
const TITLE_BOOSTS = [
  { terms: ['technical program manager', 'technical project manager', 'infrastructure program manager', 'infrastructure project manager', 'principal technical program', 'principal program manager', 'tpm'], boost: 8 },
  { terms: ['presales', 'pre-sales', 'pre sales', 'solution engineer', 'sales engineer'], boost: 7 },
  { terms: ['network planning', 'network architect', 'backbone', 'peering', 'interconnect', 'interconnection'], boost: 7 },
  { terms: ['solution architect', 'solutions architect', 'cloud architect', 'security architect'], boost: 7 },
  { terms: ['data center planning', 'data centre planning', 'dc planning', 'project delivery manager', 'delivery manager'], boost: 6 },
  { terms: ['business development', 'business developer'], boost: 6 },
  { terms: ['managing consultant', 'management consultant'], boost: 5 },
  { terms: ['infrastructure', 'infra'], boost: 4 },
  { terms: ['cybersecurity', 'cyber security', 'network security'], boost: 4 },
  { terms: ['telco', 'telecom', 'telecoms'], boost: 4 },
  { terms: ['director', 'senior director', 'principal', 'head of', 'vp ', 'vice president'], boost: 4 },
  { terms: ['apac', 'asia pacific', 'regional'], boost: 2 },
];

const COMPANY_BOOSTS = {
  'google': 6, 'amazon': 6, 'microsoft': 6, 'aws': 6, 'meta': 5,
  'nvidia': 5, 'apple': 5, 'singtel': 5, 'nokia': 4, 'ericsson': 4,
  'cisco': 4, 'cloudflare': 4, 'palo alto': 4, 'servicenow': 4,
  'jpmorgan': 4, 'mastercard': 4, 'dbs': 3, 'grab': 3, 'sea limited': 3,
  'zscaler': 3, 'crowdstrike': 3, 'fortinet': 3, 'akamai': 3,
  'juniper': 3, 'elastic': 3, 'red hat': 3, 'cato networks': 3,
  'govtech': 3, 'st engineering': 3,
};

const DREAM_RULES = [
  { company: 'google',    terms: ['technical program manager', 'technical project manager', 'tpm', 'peering', 'edge', 'network', 'infrastructure', 'interconnection', 'data center', 'project manager', 'project delivery'] },
  { company: 'amazon',    terms: ['technical program manager', 'technical project manager', 'solution architect', 'infrastructure', 'network', 'data center', 'dc planning', 'project delivery', 'project manager'] },
  { company: 'aws',       terms: ['technical program manager', 'technical project manager', 'solution architect', 'infrastructure', 'data center', 'dc planning', 'project delivery', 'project manager'] },
  { company: 'microsoft', terms: ['technical program manager', 'technical project manager', 'solution architect', 'network', 'infrastructure', 'data center', 'project manager', 'project delivery'] },
  { company: 'nvidia',    terms: ['technical program manager', 'technical project manager', 'infrastructure', 'network', 'data center', 'project manager'] },
  { company: 'meta',      terms: ['technical program manager', 'technical project manager', 'infrastructure', 'network', 'data center', 'project manager'] },
  { company: 'singtel',   terms: ['network planning', 'infrastructure', 'business development', 'interconnection'] },
  { company: 'nokia',     terms: ['solution architect', 'business development', 'network', 'project manager'] },
  { company: 'cisco',     terms: ['solution architect', 'presales', 'technical program manager', 'managing consultant', 'cybersecurity'] },
];

const COMPANY_TIERS = {
  hyperscaler: ['google', 'amazon', 'aws', 'microsoft', 'meta', 'apple', 'nvidia', 'oracle cloud', 'alibaba cloud', 'openai'],
  telco:       ['singtel', 'starhub', 'star hub', 'm1 limited', 'nokia', 'ericsson', 'huawei', 'ntt', 'verizon', 'at&t', 'deutsche telekom', 'vodafone', 'telstra', 'kddi', 'softbank'],
  enterprise:  ['jpmorgan', 'jp morgan', 'goldman sachs', 'dbs', 'uob', 'ocbc', 'standard chartered', 'mastercard', 'visa', 'singapore airlines', 'sia', 'grab', 'sea limited', 'gic', 'temasek', 'dyson', 'st engineering', 'govtech', 'prudential', 'great eastern'],
  tech:        ['cisco', 'palo alto', 'crowdstrike', 'zscaler', 'cloudflare', 'fortinet', 'juniper', 'arista', 'akamai', 'elastic', 'red hat', 'servicenow', 'workday', 'sap', 'hashicorp', 'databricks', 'snowflake', 'stripe', 'cato networks'],
};

const EXCLUDE_TITLE = ['intern', 'internship', 'graduate programme', 'junior', 'fresh grad', 'entry level', 'trainee'];

// ── Helpers ───────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escMd(s) {
  return String(s||'').replace(/[*_`[]/g, '\\$&');
}

function detectTier(name) {
  const n = (name||'').toLowerCase();
  for (const [tier, kws] of Object.entries(COMPANY_TIERS))
    if (kws.some(k => n.includes(k))) return tier;
  return 'other';
}

function detectRole(title) {
  const t = (title||'').toLowerCase();
  if (/technical program manager|tpm\b/.test(t)) return 'TPM';
  if (/presales|pre-sales|pre sales|sales engineer|solution engineer/.test(t)) return 'PRESALES';
  if (/business development|business developer/.test(t) && /infra|network|telecom|telco|tech/.test(t)) return 'INFRA_BD';
  if (/business development|business developer/.test(t)) return 'BD';
  if (/network planning/.test(t)) return 'NETWORK';
  if (/network architect|network manager/.test(t)) return 'NETWORK';
  if (/solution architect|solutions architect|cloud architect|security architect/.test(t)) return 'SA';
  if (/infrastructure manager|infra manager/.test(t)) return 'INFRA';
  if (/program manager/.test(t)) return 'TPM';
  return 'OTHER';
}

function isDream(title, company) {
  const t = (title  ||'').toLowerCase();
  const c = (company||'').toLowerCase();
  return DREAM_RULES.some(r => c.includes(r.company) && r.terms.some(term => t.includes(term)));
}

function isRecent(dateStr) {
  if (!dateStr) return true;
  return (Date.now() - new Date(dateStr).getTime()) / 3_600_000 <= HOURS_BACK;
}

function scoreJob(title, company, salMin, salMax, baseWeight) {
  const t = (title  ||'').toLowerCase();
  const c = (company||'').toLowerCase();
  if (EXCLUDE_TITLE.some(e => t.includes(e))) return -1;
  if (salMax > 0 && salMax < MIN_SALARY) return -1;
  let score = baseWeight;
  for (const { terms, boost } of TITLE_BOOSTS)
    if (terms.some(term => t.includes(term))) score += boost;
  for (const [co, boost] of Object.entries(COMPANY_BOOSTS))
    if (c.includes(co)) { score += boost; break; }
  if (salMin >= 20000) score += 6;
  else if (salMin >= 15000) score += 4;
  else if (salMin >= 12000) score += 3;
  else if (salMin >= 8000)  score += 2;
  else if (salMax >= MIN_SALARY) score += 1;
  if (isDream(title, company)) score += 8;
  return score;
}

// ── Fuzzy cross-source dedup ──────────────────────────────────
function normalizeCoKey(name) {
  return (name || '').toLowerCase()
    .replace(/\bpte\.?\s*ltd\.?\b|\bprivate\s+limited\b|\blimited\b|\bltd\.?\b/g, '')
    .replace(/\bincorporated\b|\binc\.?\b|\bcorporation\b|\bcorp\.?\b|\bllc\b/g, '')
    .replace(/\bsingapore\b|\basia\b|\bpacific\b|\bapac\b|\bglobal\b|\bregional\b/g, '')
    .replace(/[^a-z0-9]/g, '').trim();
}

function titleToks(title) {
  const STOP = new Set(['and','or','the','a','an','of','in','for','to','with','at','by','from','into','as','is','are','its','on','be','was']);
  return (title || '').toLowerCase()
    .replace(/pre[\s-]?sales?/g, 'presale')
    .replace(/programmes?/g, 'program')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w))
    .map(w => w.endsWith('s') && w.length > 4 ? w.slice(0, -1) : w);
}

function jaccard(a, b) {
  const sa = new Set(a), sb = new Set(b);
  if (!sa.size || !sb.size) return 0;
  const inter = [...sa].filter(t => sb.has(t)).length;
  return inter / (new Set([...sa, ...sb]).size);
}

function fuzzyDedup(jobs) {
  const byCompany = new Map();
  for (const j of jobs) {
    const ck = normalizeCoKey(j.company);
    if (!byCompany.has(ck)) byCompany.set(ck, []);
    byCompany.get(ck).push(j);
  }
  const out = [];
  for (const group of byCompany.values()) {
    const merged = [];
    for (const job of group) {
      const tok = titleToks(job.title);
      let found = false;
      for (const m of merged) {
        if (jaccard(tok, m.tok) >= 0.6) {
          const mcfJ = job.source === 'MCF'      ? job : (m.job.source === 'MCF'      ? m.job : null);
          const liJ  = job.source === 'LinkedIn' ? job : (m.job.source === 'LinkedIn' ? m.job : null);
          const base = job.score > m.job.score   ? job : m.job;
          m.job = {
            ...base,
            salaryMin: (mcfJ && mcfJ.salaryMin) || base.salaryMin,
            salaryMax: (mcfJ && mcfJ.salaryMax) || base.salaryMax,
            source:    mcfJ && liJ ? 'BOTH' : base.source,
            url:       mcfJ ? mcfJ.url : base.url,
            urlAlt:    mcfJ && liJ ? liJ.url : null,
          };
          found = true; break;
        }
      }
      if (!found) merged.push({ job, tok });
    }
    out.push(...merged.map(m => m.job));
  }
  return out;
}

// ── State ─────────────────────────────────────────────────────
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { seenIds: {}, dreamRoles: [] }; }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  // Purge seen IDs older than 14 days
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0,10);
  for (const [id, date] of Object.entries(state.seenIds))
    if (date < cutoff) delete state.seenIds[id];
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── MCF fetch ─────────────────────────────────────────────────
async function searchMCF(query) {
  const url = new URL('https://api.mycareersfuture.gov.sg/v2/jobs');
  url.searchParams.set('search', query);
  url.searchParams.set('limit', MCF_LIMIT);
  url.searchParams.set('sortBy', 'new_posting_date');
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 JobHunter/2.0', 'Accept': 'application/json' },
  });
  if (!res.ok) return [];
  return ((await res.json()).results || []).map(job => ({
    source:    'MCF',
    id:        'mcf_' + job.uuid,
    title:     job.title || '',
    company:   job.postedCompany?.name || '',
    salaryMin: job.salary?.minimum || 0,
    salaryMax: job.salary?.maximum || 0,
    postedDate: job.metadata?.newPostingDate?.slice(0,10) || null,
    url:       `https://www.mycareersfuture.gov.sg/job/${job.uuid}`,
  }));
}

// ── LinkedIn fetch ────────────────────────────────────────────
const LI_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://www.linkedin.com/jobs/search/',
};

function parseLinkedIn(html) {
  const idRx      = /data-entity-urn="urn:li:jobPosting:(\d+)"/g;
  const titleRx   = /<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>\s*([^<]+?)\s*<\/h3>/g;
  const companyRx = /<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>[\s\S]*?<a[^>]*>\s*([^<]+?)\s*<\/a>/g;
  const dateRx    = /datetime="([^"]+)"/g;
  const ids       = [...html.matchAll(idRx)].map(m => m[1]);
  const titles    = [...html.matchAll(titleRx)].map(m => m[1].trim());
  const companies = [...html.matchAll(companyRx)].map(m => m[1].trim());
  const dates     = [...html.matchAll(dateRx)].map(m => m[1].slice(0,10));
  return ids.map((id, i) => ({
    source:    'LinkedIn',
    id:        'li_' + id,
    title:     titles[i]    || '',
    company:   companies[i] || '',
    salaryMin: 0,
    salaryMax: 0,
    postedDate: dates[i]   || null,
    url:       `https://www.linkedin.com/jobs/view/${id}`,
  }));
}

async function searchLinkedIn(query) {
  const jobs = [];
  for (let page = 0; page < LI_PAGES; page++) {
    const url = new URL('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search');
    url.searchParams.set('keywords', query);
    url.searchParams.set('location', 'Singapore');
    url.searchParams.set('geoId', LI_GEO);
    url.searchParams.set('start', page * 25);
    url.searchParams.set('count', 25);
    try {
      if (page > 0) await sleep(LI_DELAY_MS);
      const res = await fetch(url.toString(), { headers: LI_HEADERS });
      if (!res.ok) break;
      const html = await res.text();
      if (html.length < 100) break;
      const parsed = parseLinkedIn(html);
      if (!parsed.length) break;
      jobs.push(...parsed);
    } catch { break; }
  }
  return jobs;
}

// ── Telegram send (chunked for long messages) ─────────────────
async function sendTelegram(text) {
  const apiUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const chunks = [];
  let rem = text;
  while (rem.length > 4000) {
    let cut = rem.lastIndexOf('\n', 4000);
    if (cut < 1) cut = 4000;
    chunks.push(rem.slice(0, cut));
    rem = rem.slice(cut).trimStart();
  }
  if (rem.trim()) chunks.push(rem);
  for (const chunk of chunks) {
    const res = await fetch(apiUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:                  TELEGRAM_CHAT_ID,
        text:                     chunk,
        parse_mode:               'Markdown',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram: ${err}`);
    }
  }
}

// ── Telegram message formatting ───────────────────────────────
const NUMS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','1️⃣1️⃣','1️⃣2️⃣','1️⃣3️⃣','1️⃣4️⃣','1️⃣5️⃣'];
const SEP  = '━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const ROLE_EMOJI = { TPM: '⚙️', SA: '🏗', PRESALES: '🤝', NETWORK: '🌐', INFRA_BD: '📡', INFRA: '🖥', BD: '💼', OTHER: '🔷' };
const TIER_LABEL = { hyperscaler: '⚡ Hyperscaler', telco: '📡 Telco', enterprise: '🏢 Enterprise', tech: '🛡 Tech', other: '' };

function fmtJobTelegram(j, rank) {
  const sal = j.salaryMin
    ? `$${j.salaryMin.toLocaleString()} – $${j.salaryMax?.toLocaleString() || '?'}/mo`
    : '_Salary not stated_';
  const srcTag  = j.source === 'LinkedIn' ? '`in`' : '`MCF`';
  const tierTag = TIER_LABEL[j.tier] ? ` · ${TIER_LABEL[j.tier]}` : '';
  const roleTag = ROLE_EMOJI[j.role] || '🔷';
  const num     = NUMS[rank] || `${rank + 1}.`;
  let msg = '';
  msg += `${num} ${roleTag} *${escMd(j.title)}*\n`;
  msg += `🏢 ${escMd(j.company)}${tierTag}\n`;
  msg += `💰 ${sal}\n`;
  if (j.postedDate) msg += `📅 ${j.postedDate} · ${srcTag}\n`;
  else              msg += `📌 ${srcTag}\n`;
  msg += `🔗 [View & Apply](${j.url})`;
  return msg;
}

function fmtDreamTelegram(j, dayNum) {
  const sal = j.salaryMin
    ? `$${j.salaryMin.toLocaleString()} – $${j.salaryMax?.toLocaleString() || '?'}/mo`
    : 'Salary TBD';
  const srcTag = j.source === 'LinkedIn' ? '`LinkedIn`' : '`MCF`';
  const border = dayNum === 1
    ? '🔥═══════════════════🔥'
    : '🆘═══════════════════🆘';
  const day    = dayNum === 1 ? '🔴 DAY 1 — Act Today!' : '🆘 DAY 2 — Last Chance!';
  const note   = dayNum === 1 ? 'Fresh posting. Apply before the rush.' : 'Final reminder. Do not miss this.';
  return (
    `╔${border}╗\n` +
    `        🎯 *DREAM ROLE ALERT*\n` +
    `╚${border}╝\n\n` +
    `⭐ *${escMd(j.title)}*\n` +
    `🏢 *${escMd(j.company)}*\n` +
    `💰 ${sal}\n` +
    `📅 ${j.postedDate || '?'} · ${srcTag}\n\n` +
    `${day}\n` +
    `_${note}_\n\n` +
    `${SEP}\n` +
    `🚀 *[APPLY NOW](${j.url})*\n` +
    `${SEP}`
  );
}

// ── HTML dashboard builder ──────────────────────────────────────
const ROLE_META = {
  TPM:      { label: 'TPM',            color: '#4338ca', bg: '#ede9fe' },
  SA:       { label: 'Solution Arch',  color: '#1d4ed8', bg: '#dbeafe' },
  PRESALES: { label: 'PreSales',       color: '#065f46', bg: '#d1fae5' },
  NETWORK:  { label: 'Network',        color: '#b45309', bg: '#fef3c7' },
  INFRA_BD: { label: 'Infra BD',       color: '#be185d', bg: '#fce7f3' },
  INFRA:    { label: 'Infrastructure', color: '#7c3aed', bg: '#f3e8ff' },
  BD:       { label: 'Biz Dev',        color: '#c2410c', bg: '#ffedd5' },
  OTHER:    { label: 'Other',          color: '#64748b', bg: '#f1f5f9' },
};
const TIER_META = {
  hyperscaler: { label: '⚡ Hyperscaler', color: '#d97706' },
  telco:       { label: '📡 Telco',       color: '#059669' },
  enterprise:  { label: '🏢 Enterprise',  color: '#1d4ed8' },
  tech:        { label: '🛡 Tech Co',     color: '#7c3aed' },
  other:       { label: '🔷 Other',       color: '#64748b' },
};

function fmtSalary(min, max) {
  if (min && max) return `$${min.toLocaleString()} – $${max.toLocaleString()}/mo`;
  if (min)        return `$${min.toLocaleString()}+/mo`;
  return null;
}
function salCls(min) {
  if (!min)          return 'sal-unknown';
  if (min >= 18000)  return 'sal-premium';
  if (min >= 12000)  return 'sal-high';
  if (min >= 8000)   return 'sal-mid';
  return 'sal-low';
}
function daysAgo(d) {
  if (!d) return null;
  const diff = Math.floor((Date.now() - new Date(d)) / 86400000);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Yesterday';
  if (diff < 7)   return `${diff}d ago`; if (diff < 30) return `${Math.floor(diff/7)}w ago`;
  return `${Math.floor(diff/30)}mo ago`;
}

function buildHtml(allJobs, generated) {
  const genStr = new Date(generated).toLocaleString('en-GB', {
    weekday:'short',day:'2-digit',month:'short',year:'numeric',
    hour:'2-digit',minute:'2-digit',timeZone:'Asia/Singapore',
  }) + ' SGT';
  const cardData = allJobs.map((j, i) => ({
    title:   j.title,   company: j.company, role:    j.role,
    tier:    j.tier,    src:     j.source,  salmin:  j.salaryMin || 0,
    salCls:  salCls(j.salaryMin),
    salText: fmtSalary(j.salaryMin, j.salaryMax) || (j.source !== 'MCF' ? 'See on LinkedIn' : 'Not stated'),
    posted:  daysAgo(j.postedDate) || '',
    isDream: j.isDream || false,  score: j.score,  rank: i + 1,
    salmax:  j.salaryMax || 0,
    liUrl:   j.source === 'LinkedIn' ? j.url : (j.source === 'BOTH' ? (j.urlAlt || j.url) : null),
    mcfUrl:  j.source === 'MCF'      ? j.url : (j.source === 'BOTH' ? j.url             : null),
  }));
  const safeJson = JSON.stringify(cardData).replace(/<\/script>/gi, '<\\/script>');
  const roleCounts = ['TPM','SA','PRESALES','NETWORK','INFRA_BD','INFRA','BD']
    .map(r => ({ r, n: allJobs.filter(j => j.role === r).length }))
    .filter(x => x.n > 0);
  const dreamCount = allJobs.filter(j => j.isDream).length;
  const tickerItems = [
    ...roleCounts.map(x => `<span class="tick-item"><span>${x.r.replace('_',' ')}</span><span class="tick-num">${x.n}</span></span>`),
    `<span class="tick-item"><span>DREAM</span><span class="tick-num" style="color:#d97706">${dreamCount}</span></span>`,
    `<span class="tick-item"><span>TOTAL</span><span class="tick-num">${allJobs.length}</span></span>`,
    `<span class="tick-item"><span>UPDATED</span><span class="tick-num" style="font-size:9px">${genStr.split(',')[0]}</span></span>`,
  ].join('');
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Curated Singapore tech, telco &amp; infrastructure jobs for TPMs, Solution Architects, Presales and Network professionals. Updated daily from MyCareersFuture and LinkedIn.">
<meta name="robots" content="index, follow">
<meta property="og:title" content="Veralevel Jobs — Singapore Tech &amp; Telco Roles">
<meta property="og:description" content="Curated daily job alerts for TPM, Solution Architect, Presales and Network roles in Singapore.">
<meta property="og:type" content="website">
<link rel="canonical" href="https://veralevel-job-alerts.vercel.app/">
<title>Veralevel Jobs — ${genStr}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--pri:#001835;--sec:#005eb5;--bg:#f4f7fb;--surf:#fff;--bdr:rgba(226,232,240,0.6);--bdr-s:#e2e8f0;--txt:#0d1117;--txt2:#6b7280;--out:#9ca3af;--grn:#059669;--gold:#d97706;--sb-w:270px;--hdr-h:60px;--tk-h:40px}
html{scroll-behavior:smooth}
body{background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--txt);min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:hidden}
input[type=range]{accent-color:rgba(255,255,255,0.8);cursor:pointer;width:100%}
::-webkit-scrollbar{height:4px;width:4px}::-webkit-scrollbar-thumb{background:rgba(0,24,53,0.18);border-radius:99px}
.msym{font-family:'Material Symbols Outlined';font-variation-settings:'FILL' 0,'wght' 300,'GRAD' 0,'opsz' 24;font-size:18px;line-height:1;vertical-align:middle;display:inline-block;flex-shrink:0}
.msym.filled{font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20}
#scroll-bar{position:fixed;top:0;left:0;width:0%;height:3px;background:var(--pri);z-index:9999;transition:width .08s linear;pointer-events:none}
header{position:sticky;top:0;z-index:200;background:rgba(255,255,255,0.9);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);height:var(--hdr-h);border-bottom:1px solid var(--bdr-s);box-shadow:0 1px 16px rgba(0,24,53,0.06);display:flex;align-items:center}
.hdr{width:100%;padding:0 20px;display:flex;align-items:center;gap:14px}
.logo{font-family:'Outfit',sans-serif;font-size:19px;font-weight:800;letter-spacing:-.4px;flex-shrink:0;text-decoration:none;line-height:1;display:flex;align-items:baseline;gap:3px}
.logo-v{color:var(--pri)}.logo-j{font-weight:400;font-style:italic;color:var(--txt2);font-size:17px}
.srch{flex:1;position:relative;min-width:0}
.srch .msym{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--out);pointer-events:none;font-size:18px}
#searchBox{width:100%;background:#eef1f6;border:1.5px solid transparent;border-radius:5px;padding:8px 12px 8px 38px;color:var(--txt);font-size:13px;font-family:'Inter',sans-serif;outline:none;transition:border-color .15s,background .15s}
#searchBox:focus{border-color:var(--sec);background:var(--surf)}
#searchBox::placeholder{color:var(--out)}
#filter-btn{display:none;align-items:center;gap:6px;background:var(--pri);color:#fff;border:none;border-radius:5px;padding:8px 14px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Outfit',sans-serif;text-transform:uppercase;letter-spacing:.08em;flex-shrink:0;position:relative}
.fdot{display:none;background:#ef4444;color:#fff;border-radius:99px;padding:1px 5px;font-size:10px;font-weight:700;margin-left:2px}
.fdot.on{display:inline}
@media(max-width:1023px){#filter-btn{display:flex}}
#sb-backdrop{display:none;position:fixed;inset:0;top:var(--hdr-h);background:rgba(0,24,53,0.55);backdrop-filter:blur(3px);z-index:149}
#sb-backdrop.show{display:block}
#sidebar{position:fixed;left:0;top:var(--hdr-h);width:var(--sb-w);height:calc(100vh - var(--hdr-h));overflow-y:auto;background:var(--pri);border-right:1px solid rgba(255,255,255,0.06);padding:24px 18px 32px;z-index:150;display:flex;flex-direction:column}
@media(max-width:1023px){#sidebar{transform:translateX(-100%);transition:transform .28s cubic-bezier(0.22,1,0.36,1);box-shadow:8px 0 40px rgba(0,0,0,0.3)}}
@media(max-width:1023px){#sidebar.open{transform:translateX(0)}}
.sb-brand{font-family:'Outfit',sans-serif;font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.22em;margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.07)}
.sb-sec{margin-bottom:22px}
.sb-lbl{display:flex;align-items:center;gap:6px;font-size:9px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.15em;margin-bottom:9px}
.sb-lbl .msym{font-size:13px;color:rgba(255,255,255,0.3)}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:'Outfit',sans-serif;text-transform:uppercase;letter-spacing:.04em;line-height:1.4;transition:all .12s}
.chip.active{background:rgba(255,255,255,0.18);color:#fff;border-color:rgba(255,255,255,0.35);font-weight:700}
.chip:hover:not(.active){background:rgba(255,255,255,0.1);color:#fff;border-color:rgba(255,255,255,0.2)}
.ccount{opacity:.45;font-size:10px;margin-left:2px}
.sb-sval{font-size:12px;font-weight:500;color:rgba(255,255,255,0.65);margin-top:7px;font-family:'JetBrains Mono',monospace}
.btn-clear{width:100%;padding:9px;background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:rgba(255,255,255,0.45);font-size:10px;font-weight:700;cursor:pointer;font-family:'Outfit',sans-serif;text-transform:uppercase;letter-spacing:.12em;margin-top:auto;transition:all .12s}
.btn-clear:hover{border-color:rgba(255,255,255,0.4);color:rgba(255,255,255,0.9)}
#main{margin-left:var(--sb-w);min-height:calc(100vh - var(--hdr-h));display:flex;flex-direction:column}
@media(max-width:1023px){#main{margin-left:0}}
#ticker-strip{background:var(--surf);border-bottom:1px solid var(--bdr-s);height:var(--tk-h);overflow:hidden;display:flex;align-items:center}
.ticker-move{display:flex;white-space:nowrap;animation:ticker 70s linear infinite;gap:0}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.tick-live{display:inline-flex;align-items:center;gap:6px;padding:0 16px;border-right:1px solid var(--bdr-s);height:var(--tk-h);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:var(--txt2);font-family:'Outfit',sans-serif;flex-shrink:0}
.ldot{width:6px;height:6px;border-radius:99px;background:var(--grn);flex-shrink:0;animation:blink 2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.tick-item{display:inline-flex;align-items:center;gap:7px;padding:0 18px;border-right:1px solid var(--bdr-s);height:var(--tk-h);font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--txt2);flex-shrink:0}
.tick-num{color:var(--pri);font-weight:700;font-size:11px}
#page-hdr{padding:20px 24px 4px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px}
.ph-left{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.ph-cnt{font-family:'Outfit',sans-serif;font-size:24px;font-weight:800;color:var(--pri);letter-spacing:-.5px}
.ph-tot{font-size:13px;color:var(--txt2)}
.ph-date{font-size:10px;color:var(--out);display:flex;align-items:center;gap:5px;font-family:'JetBrains Mono',monospace}
.ph-date .msym{font-size:13px}
#stats-bar{padding:8px 24px 14px;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.schips{display:flex;gap:4px;flex-wrap:wrap}
.sch{display:inline-flex;align-items:center;gap:4px;border-radius:3px;padding:3px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;white-space:nowrap;font-family:'Outfit',sans-serif}
#grid{padding:4px 24px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
@media(max-width:599px){#grid{grid-template-columns:1fr;padding:4px 14px 20px}}
.card{background:var(--surf);border-radius:6px;box-shadow:0 2px 12px -2px rgba(0,24,53,0.07);border:1px solid var(--bdr-s);border-left:3px solid transparent;padding:16px;display:flex;flex-direction:column;gap:10px;transition:transform .3s cubic-bezier(0.22,1,0.36,1),box-shadow .3s cubic-bezier(0.22,1,0.36,1),border-left-color .15s,opacity .5s ease,translate .5s ease;opacity:0;translate:0 18px}
.card.visible{opacity:1;translate:0 0}
.card:hover{transform:translateY(-4px);box-shadow:0 14px 36px -6px rgba(0,24,53,0.15);border-left-color:var(--sec)}
.card.dream{background:linear-gradient(135deg,#fffdf0 0%,#fff8dc 100%);border-left-color:var(--gold)}
.card.dream:hover{border-left-color:var(--gold);box-shadow:0 14px 36px -6px rgba(217,119,6,0.15)}
.card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.card-title{font-family:'Outfit',sans-serif;font-size:14px;font-weight:700;color:var(--pri);line-height:1.35;flex:1;letter-spacing:-.01em}
.card-rank{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:var(--out);flex-shrink:0;background:#f0f4f9;border-radius:3px;padding:2px 6px;white-space:nowrap}
.dream-star{color:var(--gold);font-size:18px}
.card-co{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--txt2);flex-wrap:wrap}
.card-co .msym{font-size:14px;color:var(--out)}
.src-li{background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:2px 7px;font-size:9px;font-weight:700;flex-shrink:0;text-transform:uppercase;letter-spacing:.05em;font-family:'Outfit',sans-serif}
.src-mcf{background:#dcfce7;color:#15803d;border-radius:3px;padding:2px 7px;font-size:9px;font-weight:700;flex-shrink:0;text-transform:uppercase;letter-spacing:.05em;font-family:'Outfit',sans-serif}
.src-both{background:#f3e8ff;color:#7c3aed;border-radius:3px;padding:2px 7px;font-size:9px;font-weight:700;flex-shrink:0;text-transform:uppercase;letter-spacing:.05em;font-family:'Outfit',sans-serif}
.card-tags{display:flex;gap:6px;flex-wrap:wrap}
.tag-role{display:inline-flex;align-items:center;gap:4px;border-radius:3px;padding:4px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-family:'Outfit',sans-serif}
.tag-score{display:inline-flex;align-items:center;gap:4px;border-radius:3px;padding:4px 8px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;background:#f0f4f9;color:var(--txt2)}
.card-sal{display:flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;color:var(--pri);background:rgba(0,94,181,0.05);border-radius:4px;padding:6px 10px;border:1px solid rgba(0,94,181,0.12)}
.card-sal .msym{font-size:14px;color:var(--sec)}
.card-sal.dim{color:var(--out);font-weight:400;background:transparent;border-color:var(--bdr-s)}
.card-sal.dim .msym{color:var(--out)}
.card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:4px}
.card-posted{font-size:10px;color:var(--out);font-family:'JetBrains Mono',monospace}
.card-btns{display:flex;gap:5px}
.btn-li,.btn-mcf{display:inline-flex;align-items:center;justify-content:center;border-radius:4px;padding:5px 11px;font-size:10px;font-weight:700;text-decoration:none;font-family:'Outfit',sans-serif;text-transform:uppercase;letter-spacing:.07em;white-space:nowrap;transition:opacity .1s}
.btn-li{background:var(--pri);color:#fff}.btn-mcf{background:#059669;color:#fff}
.btn-li:hover,.btn-mcf:hover{opacity:.82}
#no-results{display:none;text-align:center;padding:60px 20px}
#no-results.show{display:block}
.nr-icon{font-size:36px;margin-bottom:10px}.nr-title{font-family:'Outfit',sans-serif;font-size:16px;font-weight:700;color:#475569;margin-bottom:6px;letter-spacing:-.02em}.nr-sub{font-size:13px;color:#94a3b8}
footer{background:var(--pri);padding:24px;margin-top:auto}
.ft-inner{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px}
.ft-brand{font-family:'DM Sans',sans-serif;font-weight:700;color:var(--pri);font-size:14px}
.ft-copy{font-size:11px;color:var(--out);margin-top:3px}
.ft-links{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.ft-links a{color:var(--txt2);text-decoration:none;transition:color .1s}
.ft-links a:hover{color:var(--sec)}
.ft-right{text-align:right}
.ft-right div{font-size:10px;color:rgba(255,255,255,0.3);font-family:'JetBrains Mono',monospace;margin-top:2px}
</style></head><body>
<div id="scroll-bar"></div>
<header>
  <div class="hdr">
    <a class="logo" href="/"><span class="logo-v">Veralevel</span><span class="logo-j">Jobs</span></a>
    <div class="srch"><span class="msym">search</span><input type="search" id="searchBox" placeholder="Search title or company…" autocomplete="off"></div>
    <button id="filter-btn" onclick="toggleSidebar()"><span class="msym">tune</span> Filters<span class="fdot" id="fdot"></span></button>
  </div>
</header>
<div id="sb-backdrop" onclick="toggleSidebar()"></div>
<aside id="sidebar">
  <div class="sb-brand">Veralevel Jobs · Filters</div>
  <div class="sb-sec">
    <div class="sb-lbl"><span class="msym">work</span> Role</div>
    <div class="chips" id="role-chips"></div>
  </div>
  <div class="sb-sec">
    <div class="sb-lbl"><span class="msym">military_tech</span> Tier</div>
    <div class="chips" id="tier-chips"></div>
  </div>
  <div class="sb-sec">
    <div class="sb-lbl"><span class="msym">source</span> Source</div>
    <div class="chips" id="src-chips"></div>
  </div>
  <div class="sb-sec">
    <div class="sb-lbl"><span class="msym">payments</span> Salary (max ≥)</div>
    <input type="range" id="salSlider" min="0" max="25000" step="1000" value="0">
    <div class="sb-sval" id="salVal">Any salary</div>
  </div>
  <div class="sb-sec">
    <div class="sb-lbl"><span class="msym">trending_up</span> Score</div>
    <input type="range" id="scoreSlider" min="0" max="40" step="5" value="0">
    <div class="sb-sval" id="scoreVal">Any score</div>
  </div>
  <button class="btn-clear" onclick="clearFilters()">Clear All Filters</button>
</aside>
<div id="main">
  <div id="ticker-strip">
    <div class="ticker-move">
      <span class="tick-live"><span class="ldot"></span>Live</span>
      ${tickerItems}${tickerItems}
    </div>
  </div>
  <div id="page-hdr">
    <div class="ph-left">
      <span class="ph-cnt"><span id="sc">${allJobs.length}</span></span>
      <span class="ph-tot" id="sof">of ${allJobs.length} roles</span>
    </div>
    <div class="ph-date"><span class="msym">calendar_today</span> ${genStr}</div>
  </div>
  <div id="stats-bar"><div class="schips" id="schips"></div></div>
  <div id="grid"></div>
  <div id="no-results"><div class="nr-icon">&#x1F50D;</div><div class="nr-title">No matching roles</div><div class="nr-sub">Try adjusting your filters or search term</div></div>
  <footer>
    <div class="ft-inner">
      <div><div class="ft-brand">Veralevel Jobs</div><div class="ft-copy">&copy; 2026 Veralevel &mdash; Curated by Pandian</div></div>
      <div class="ft-links"><a href="https://t.me/pandiangk" target="_blank">Telegram</a><a href="https://veralevel-job-alerts.vercel.app/" target="_blank">Portal</a></div>
      <div class="ft-right"><div>MCF + LinkedIn · Daily</div><div>Singapore Tech &amp; Telco</div></div>
    </div>
  </footer>
</div>
<script>
var JOBS=${safeJson};
var TOTAL=JOBS.length;
var RM={TPM:{l:'TPM',c:'#4338ca',b:'#ede9fe'},SA:{l:'Sol. Arch',c:'#1d4ed8',b:'#dbeafe'},PRESALES:{l:'PreSales',c:'#065f46',b:'#d1fae5'},NETWORK:{l:'Network',c:'#b45309',b:'#fef3c7'},INFRA_BD:{l:'Infra BD',c:'#be185d',b:'#fce7f3'},INFRA:{l:'Infrastructure',c:'#7c3aed',b:'#f3e8ff'},BD:{l:'Biz Dev',c:'#c2410c',b:'#ffedd5'},OTHER:{l:'Other',c:'#64748b',b:'#f1f5f9'}};
var ROLES=[{v:'all',l:'All'},{v:'TPM',l:'TPM'},{v:'SA',l:'Sol. Arch'},{v:'NETWORK',l:'Network'},{v:'PRESALES',l:'PreSales'},{v:'BD',l:'Biz Dev'},{v:'INFRA_BD',l:'Infra BD'},{v:'INFRA',l:'Infrastructure'}];
var TIERS=[{v:'all',l:'All'},{v:'hyperscaler',l:'Hyperscaler'},{v:'telco',l:'Telco'},{v:'enterprise',l:'Enterprise'},{v:'tech',l:'Tech Co'},{v:'other',l:'Other'}];
var SRCS=[{v:'all',l:'All Sources',f:'src'},{v:'LinkedIn',l:'LinkedIn',f:'src'},{v:'MCF',l:'MCF',f:'src'},{v:'BOTH',l:'LI + MCF',f:'src'},{v:'dream',l:'Dream',f:'dream'}];
var STATS=[{l:'TPM',r:'TPM',c:'#4338ca',b:'#ede9fe'},{l:'Sol.Arch',r:'SA',c:'#1d4ed8',b:'#dbeafe'},{l:'PreSales',r:'PRESALES',c:'#065f46',b:'#d1fae5'},{l:'Network',r:'NETWORK',c:'#b45309',b:'#fef3c7'},{l:'Infra BD',r:'INFRA_BD',c:'#be185d',b:'#fce7f3'},{l:'Infra',r:'INFRA',c:'#7c3aed',b:'#f3e8ff'},{l:'Biz Dev',r:'BD',c:'#c2410c',b:'#ffedd5'}];
var F={role:'all',tier:'all',src:'all',dream:false},minSal=0,minScore=0,srch='';
var observer=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target);}});},{threshold:0.08});
function eh(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function card(j){
  var rm=RM[j.role]||RM.OTHER;
  var rkEl=j.isDream?'<span class="msym filled dream-star">star</span>':'<span class="card-rank">#'+j.rank+'</span>';
  var sb='';
  if(j.src==='BOTH')sb='<span class="src-both">LI+MCF</span>';
  else if(j.src==='LinkedIn')sb='<span class="src-li">LinkedIn</span>';
  else if(j.src==='MCF')sb='<span class="src-mcf">MCF</span>';
  var sal='';
  if(j.salText&&j.salText!=='Not stated'&&j.salText!=='See on LinkedIn')sal='<div class="card-sal"><span class="msym">payments</span>'+eh(j.salText)+'</div>';
  else if(j.salText)sal='<div class="card-sal dim"><span class="msym">payments</span>'+eh(j.salText)+'</div>';
  var btns='';
  if(j.liUrl)btns+='<a class="btn-li" href="'+eh(j.liUrl)+'" target="_blank" rel="noopener">LinkedIn ↗</a>';
  if(j.mcfUrl)btns+='<a class="btn-mcf" href="'+eh(j.mcfUrl)+'" target="_blank" rel="noopener">MCF ↗</a>';
  return '<div class="card'+(j.isDream?' dream':'')+'" data-role="'+j.role+'" data-tier="'+j.tier+'" data-src="'+j.src+'" data-salmin="'+j.salmin+'" data-salmax="'+j.salmax+'" data-score="'+j.score+'">'
    +'<div class="card-top"><div class="card-title">'+eh(j.title)+'</div>'+rkEl+'</div>'
    +'<div class="card-co"><span class="msym">business</span><span>'+eh(j.company)+'</span>'+sb+'</div>'
    +'<div class="card-tags">'
      +'<span class="tag-role" style="background:'+rm.b+';color:'+rm.c+'">'+rm.l+'</span>'
      +'<span class="tag-score">&#9650; '+j.score+'</span>'
    +'</div>'
    +sal
    +'<div class="card-foot"><span class="card-posted">'+(j.posted?eh(j.posted):'')+' </span><div class="card-btns">'+btns+'</div></div>'
    +'</div>';
}
function render(){
  var q=srch,filtered=JOBS.filter(function(j){
    var srcOk=F.src==='all'||(F.src==='BOTH'?j.src==='BOTH':(j.src===F.src||j.src==='BOTH'));
    return srcOk&&(F.role==='all'||j.role===F.role)&&(F.tier==='all'||j.tier===F.tier)&&(!F.dream||j.isDream)&&(minSal===0||j.salmax>=minSal)&&(minScore===0||j.score>=minScore)&&(!q||j.title.toLowerCase().includes(q)||j.company.toLowerCase().includes(q));
  });
  document.getElementById('grid').innerHTML=filtered.map(card).join('');
  document.querySelectorAll('.card').forEach(function(c){observer.observe(c);});
  document.getElementById('sc').textContent=filtered.length;
  document.getElementById('sof').textContent='of '+TOTAL+' roles';
  document.getElementById('no-results').className=filtered.length===0?'show':'';
  document.getElementById('schips').innerHTML=STATS.map(function(s){var n=filtered.filter(function(j){return j.role===s.r;}).length;return n?'<span class="sch" style="background:'+s.b+';color:'+s.c+'">'+s.l+' <strong>'+n+'</strong></span>':'';}).join('');
  var ac=(F.role!=='all'?1:0)+(F.tier!=='all'?1:0)+(F.src!=='all'?1:0)+(F.dream?1:0)+(minSal>0?1:0)+(minScore>0?1:0);
  var fd=document.getElementById('fdot');fd.textContent=ac;fd.className='fdot'+(ac?' on':'');
}
function chips(){
  document.getElementById('role-chips').innerHTML=ROLES.map(function(c){return '<button class="chip'+(F.role===c.v?' active':'')+'" data-f="role" data-v="'+c.v+'">'+c.l+(c.v==='all'?'':' <span class="ccount">'+JOBS.filter(function(j){return j.role===c.v;}).length+'</span>')+'</button>';}).join('');
  document.getElementById('tier-chips').innerHTML=TIERS.map(function(c){return '<button class="chip'+(F.tier===c.v?' active':'')+'" data-f="tier" data-v="'+c.v+'">'+c.l+(c.v==='all'?'':' <span class="ccount">'+JOBS.filter(function(j){return j.tier===c.v;}).length+'</span>')+'</button>';}).join('');
  document.getElementById('src-chips').innerHTML=SRCS.map(function(c){var a=c.f==='dream'?F.dream:F.src===c.v;return '<button class="chip'+(a?' active':'')+'" data-f="'+c.f+'" data-v="'+c.v+'">'+c.l+'</button>';}).join('');
  document.querySelectorAll('.chip').forEach(function(e){e.addEventListener('click',function(){var f=e.dataset.f,v=e.dataset.v;if(f==='dream'){F.dream=!F.dream;}else{F[f]=v;}chips();render();});});
}
function toggleSidebar(){var sb=document.getElementById('sidebar'),bd=document.getElementById('sb-backdrop');sb.classList.toggle('open');bd.classList.toggle('show');}
function clearFilters(){F={role:'all',tier:'all',src:'all',dream:false};minSal=0;minScore=0;document.getElementById('salSlider').value=0;document.getElementById('scoreSlider').value=0;document.getElementById('salVal').textContent='Any salary';document.getElementById('scoreVal').textContent='Any score';chips();render();}
document.getElementById('salSlider').addEventListener('input',function(){minSal=parseInt(this.value)||0;document.getElementById('salVal').textContent=minSal?'Max ≥ $'+minSal.toLocaleString()+'/mo':'Any salary';render();});
document.getElementById('scoreSlider').addEventListener('input',function(){minScore=parseInt(this.value)||0;document.getElementById('scoreVal').textContent=minScore?minScore+'+':'Any score';render();});
document.getElementById('searchBox').addEventListener('input',function(){srch=this.value.toLowerCase().trim();render();});
window.addEventListener('scroll',function(){var p=window.scrollY/(document.documentElement.scrollHeight-window.innerHeight);document.getElementById('scroll-bar').style.width=(p*100)+'%';});
chips();render();
</script></body></html>`;
}

// ── Main ──────────────────────────────────────────────────────
async function run() {
  const now     = new Date();
  const today   = now.toISOString().slice(0, 10);
  const prettyDate = now.toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore',
  });
  const prettyTime = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore',
  });

  console.log(`\n[${now.toISOString()}] Daily Hunter started`);

  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env'); process.exit(1);
  }

  const state = loadState();

  // ── 1. Dream role day-2 reminders ─────────────────────────────
  const dayTwoReminders = (state.dreamRoles || []).filter(r => r.firstSeenDate !== today);
  for (const r of dayTwoReminders) {
    try {
      await sendTelegram(fmtDreamTelegram(r, 2));
      console.log(`Day-2 dream reminder sent: ${r.title}`);
    } catch (e) { console.error('Day-2 Telegram error:', e.message); }
  }

  // ── 2. Fetch from MCF ─────────────────────────────────────────
  process.stdout.write('  Fetching MCF');
  const mcfResults = await Promise.all(
    SEARCHES.map(s =>
      searchMCF(s.q).then(jobs=>{process.stdout.write('.');return{...s,jobs};}).catch(()=>{process.stdout.write('!');return{...s,jobs:[]};})
    )
  );
  console.log(` done (${mcfResults.reduce((n,r)=>n+r.jobs.length,0)} raw)`);

  // ── 3. Fetch from LinkedIn ─────────────────────────────────────
  process.stdout.write('  Fetching LinkedIn');
  const liResults = [];
  for (const s of SEARCHES) {
    try {
      const jobs = await searchLinkedIn(s.q);
      process.stdout.write('.');
      liResults.push({ ...s, jobs });
      await sleep(LI_DELAY_MS);
    } catch { process.stdout.write('!'); liResults.push({ ...s, jobs: [] }); }
  }
  console.log(` done (${liResults.reduce((n,r)=>n+r.jobs.length,0)} raw)\n`);

  // ── 4. Deduplicate + score ALL jobs (for HTML dashboard) ────────
  const seenId   = new Set();
  const allScored = [];
  for (const { jobs, weight, role } of [...mcfResults, ...liResults]) {
    for (const job of jobs) {
      if (seenId.has(job.id)) continue;
      seenId.add(job.id);
      const score = scoreJob(job.title, job.company, job.salaryMin, job.salaryMax, weight);
      if (score < 0) continue;
      const detectedRole = detectRole(job.title);
      allScored.push({
        ...job, score,
        role:    detectedRole !== 'OTHER' ? detectedRole : role,
        tier:    detectTier(job.company),
        isDream: isDream(job.title, job.company),
      });
    }
  }
  const allJobs = fuzzyDedup(allScored).sort((a,b) => b.score - a.score);
  // Dashboard sorted newest-first; score sort above is kept for the Telegram digest
  const allJobsByDate = [...allJobs].sort((a, b) => {
    if (!a.postedDate && !b.postedDate) return b.score - a.score;
    if (!a.postedDate) return 1;
    if (!b.postedDate) return -1;
    const diff = new Date(b.postedDate) - new Date(a.postedDate);
    return diff !== 0 ? diff : b.score - a.score;
  });

  // ── 5. Filter to NEW jobs only (for Telegram) ──────────────────
  const newJobs = allJobs.filter(j =>
    isRecent(j.postedDate) &&
    !state.seenIds[j.id]
  );

  console.log(`  Total unique: ${allJobs.length} · New (last ${HOURS_BACK}h, unseen): ${newJobs.length}`);

  // Telegram filter: all MCF/BOTH jobs + LinkedIn only from hyperscalers
  const alertJobs = newJobs.filter(j =>
    j.source !== 'LinkedIn' || j.tier === 'hyperscaler'
  );
  console.log(`  Telegram-eligible: ${alertJobs.length} (MCF/Both + LinkedIn hyperscalers)`);

  // ── 6. Send Telegram digest ────────────────────────────────────
  const dreamNew   = alertJobs.filter(j => j.isDream);
  const regularNew = alertJobs.filter(j => !j.isDream).slice(0, MAX_DIGEST - dreamNew.length);
  const digestJobs = [...dreamNew, ...regularNew].slice(0, MAX_DIGEST);

  if (alertJobs.length === 0) {
    await sendTelegram(
      `🔍 *Job Alert — ${prettyDate}*\n\n` +
      `_No new roles to alert (MCF: 0, LinkedIn hyperscalers: 0)._\n\n` +
      `📊 Dashboard refreshed with ${allJobs.length} total roles.`
    );
    console.log('No alert-eligible jobs — sent quiet update');
  } else {
    const mcfNew  = alertJobs.filter(j => j.source === 'MCF'  || j.source === 'BOTH').length;
    const liNew   = alertJobs.filter(j => j.source === 'LinkedIn').length;
    const bothNew = alertJobs.filter(j => j.source === 'BOTH').length;

    let msg = `🔍 *${alertJobs.length} new roles — last ${HOURS_BACK}h*\n`;
    msg += `📅 ${prettyDate} · ${prettyTime} SGT\n`;
    msg += `📊 MCF: ${mcfNew} · LinkedIn⚡: ${liNew}${bothNew ? ` · Both: ${bothNew}` : ''}\n`;
    msg += `${SEP}\n\n`;

    if (dreamNew.length) {
      msg += `🌟 *DREAM ROLES (${dreamNew.length} new)*\n`;
      msg += `${SEP}\n\n`;
      msg += dreamNew.map((j, i) => fmtJobTelegram(j, i)).join(`\n\n${SEP}\n\n`);
      msg += `\n\n${SEP}\n\n`;
    }

    if (regularNew.length) {
      msg += `✅ *TOP ROLES*\n`;
      msg += `${SEP}\n\n`;
      msg += regularNew.map((j, i) => fmtJobTelegram(j, i + dreamNew.length)).join(`\n\n${SEP}\n\n`);
    }

    msg += `\n\n${SEP}\n_MCF + LinkedIn · $${MIN_SALARY.toLocaleString()}+/mo · new since last run_`;

    await sendTelegram(msg);
    console.log(`Telegram: sent digest (${digestJobs.length} jobs)`);

    // ── 7. Day-1 dream alerts (separate messages) ──────────────
    const knownDreamIds = new Set((state.dreamRoles || []).map(r => r.id));
    const newDreams = dreamNew.filter(j => !knownDreamIds.has(j.id));
    for (const j of newDreams) {
      await sendTelegram(fmtDreamTelegram(j, 1));
      console.log(`Day-1 dream alert: ${j.title} @ ${j.company}`);
    }

    // ── 8. Update state ────────────────────────────────────────
    for (const j of newJobs) state.seenIds[j.id] = today;
    state.dreamRoles = [
      ...(state.dreamRoles || []).filter(r => r.firstSeenDate === today),
      ...newDreams.map(j => ({
        id: j.id, firstSeenDate: today,
        title: j.title, company: j.company,
        salaryMin: j.salaryMin, salaryMax: j.salaryMax,
        postedDate: j.postedDate, url: j.url, source: j.source,
      })),
    ];
  }

  saveState(state);

  // ── 9. Refresh HTML dashboard ──────────────────────────────────
  const html = buildHtml(allJobsByDate, now.toISOString());
  fs.writeFileSync(DASHBOARD_OUT, html, 'utf8');
  console.log(`Dashboard refreshed → ${DASHBOARD_OUT}`);

  // ── 10. Export jobs.json for social auto-poster ────────────────
  const JOBS_JSON_OUT = path.join(__dirname, 'public', 'jobs.json');
  const topJobsForSocial = allJobs.slice(0, 50).map(j => ({
    title:     j.title,
    company:   j.company,
    role:      j.role,
    tier:      j.tier,
    source:    j.source,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    score:     j.score,
    isDream:   j.isDream,
    postedDate: j.postedDate,
    url:       j.url,
  }));
  fs.writeFileSync(JOBS_JSON_OUT, JSON.stringify(topJobsForSocial, null, 2), 'utf8');
  console.log(`Jobs JSON → ${JOBS_JSON_OUT}`);

  console.log(`[${new Date().toISOString()}] Done.\n`);
}

run().catch(async err => {
  console.error(`[${new Date().toISOString()}] FATAL:`, err.message);
  try { await sendTelegram(`🚨 *Job Hunter Error*\n\`${err.message}\``); } catch {}
  process.exit(1);
});
