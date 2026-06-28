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
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Veralevel Jobs — ${genStr}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#eef2f7;font-family:'DM Sans',system-ui,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;min-height:100vh;padding-bottom:60px}
input[type=range]{accent-color:#0f2d5c;cursor:pointer}
::-webkit-scrollbar{height:3px;width:3px}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:99px}
header{position:sticky;top:0;z-index:200;background:#0f2d5c;box-shadow:0 2px 20px rgba(0,0,0,.28)}
.hdr{max-width:1440px;margin:0 auto;padding:11px 16px;display:flex;align-items:center;gap:12px}
.logo-title{font-size:17px;font-weight:800;color:#fff;letter-spacing:-.4px;flex-shrink:0}
.logo-title span{color:#7dd3fc}
.logo-sub{font-size:10px;color:#93c5fd;font-weight:500;margin-top:1px;display:none}
.srch{flex:1;position:relative;min-width:0}
.srch svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.4}
#searchBox{width:100%;background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.18);border-radius:8px;padding:8px 12px 8px 32px;color:#fff;font-size:14px;font-family:inherit;outline:none;transition:border-color .15s}
#searchBox:focus{border-color:rgba(255,255,255,.5)}
#searchBox::placeholder{color:rgba(255,255,255,.4)}
#filter-btn{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.1);color:#fff;border:1.5px solid rgba(255,255,255,.25);border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;flex-shrink:0;white-space:nowrap}
#filter-btn.open{background:rgba(255,255,255,.2)}
.fdot{background:#ef4444;color:#fff;border-radius:99px;padding:1px 5px;font-size:10px;font-weight:700;display:none;margin-left:2px}
.fdot.on{display:inline}
@media(min-width:700px){#filter-panel{display:block!important}#filter-btn{display:none!important}.logo-sub{display:block!important}}
#filter-panel{background:#fff;border-bottom:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,.04);display:none}
#filter-panel.open{display:block}
.fp{max-width:1440px;margin:0 auto;padding:10px 16px 14px;display:flex;flex-direction:column;gap:9px}
.frow{display:flex;align-items:center;gap:8px}
.flbl{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;min-width:32px;flex-shrink:0}
.chips{display:flex;gap:5px;flex-wrap:wrap;flex:1;min-width:0}
@media(max-width:699px){.chips{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:4px}}
@media(max-width:699px){.chips::-webkit-scrollbar{display:none}}
.chip{background:#fff;color:#334155;border:1.5px solid #dde4ef;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;font-family:inherit;line-height:1.4;transition:all .1s}
.chip.active{background:#0f2d5c;color:#fff;border-color:#0f2d5c;font-weight:700}
.chip:hover:not(.active){border-color:#94a3b8}
.ccount{opacity:.6;font-size:10px;margin-left:2px}
.sal-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#salSlider{width:130px;flex-shrink:0}
#salVal{font-size:13px;font-weight:700;color:#0f2d5c;min-width:80px}
#stats-bar{max-width:1440px;margin:10px auto 0;padding:0 16px}
.si{background:#fff;border:1px solid #dde4ef;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sc{font-size:22px;font-weight:800;color:#0f2d5c;line-height:1;flex-shrink:0}
.sof{font-size:12px;color:#64748b;flex-shrink:0;margin-right:4px}
.ssep{width:1px;height:18px;background:#e2e8f0;flex-shrink:0}
.schips{display:flex;gap:5px;flex-wrap:wrap}
.sch{display:inline-flex;align-items:center;gap:4px;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;white-space:nowrap}
#grid{max-width:1440px;margin:10px auto 0;padding:0 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;transition:box-shadow .15s,border-color .15s}
.card:hover{box-shadow:0 4px 16px rgba(0,0,0,.08);border-color:#c7d2e0}
.card.dream{background:linear-gradient(135deg,#fff 0%,#fffbeb 100%);border:1px solid #fcd34d;border-left:3px solid #d97706}
.card.hidden{display:none!important}
.chdr{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.brole{border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0}
.btier{font-size:11px;font-weight:600;white-space:nowrap;flex-shrink:0}
.bsrc{border-radius:999px;padding:2px 7px;font-size:10px;font-weight:700;flex-shrink:0}
.src-li{background:#dbeafe;color:#1d4ed8}
.src-mcf{background:#dcfce7;color:#15803d}
.src-both{background:#f3e8ff;color:#7c3aed}
.score-txt{margin-left:auto;font-size:10px;color:#cbd5e1;flex-shrink:0;font-weight:500}
.ctitle{font-size:14px;font-weight:700;color:#0f172a;line-height:1.4;margin-bottom:3px}
.cco{font-size:12px;color:#64748b;font-weight:500;margin-bottom:10px}
.cfooter{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;margin-bottom:11px}
.salary{font-size:13px}
.sal-premium{color:#16a34a;font-weight:700}
.sal-high{color:#059669;font-weight:700}
.sal-mid{color:#2563eb;font-weight:700}
.sal-low,.sal-unknown{color:#94a3b8;font-weight:400}
.cmeta{font-size:11px;color:#94a3b8;white-space:nowrap;flex-shrink:0}
.cbtns{display:flex;gap:6px;flex-wrap:wrap}
.btn-li,.btn-mcf{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;text-decoration:none;flex:1;font-family:inherit;white-space:nowrap;min-width:0;transition:opacity .1s}
.btn-li{background:#0a66c2;color:#fff}
.btn-mcf{background:#0f6b3c;color:#fff}
.btn-li:hover,.btn-mcf:hover{opacity:.85}
#no-results{display:none;text-align:center;padding:60px 20px;max-width:1440px;margin:0 auto}
#no-results.show{display:block}
.nr-icon{font-size:36px;margin-bottom:10px}
.nr-title{font-size:16px;font-weight:700;color:#475569;margin-bottom:6px}
.nr-sub{font-size:13px;color:#94a3b8}
footer{max-width:1440px;margin:24px auto 0;padding:0 16px;font-size:11px;color:#94a3b8}
</style></head><body>
<header><div class="hdr">
  <div style="flex-shrink:0">
    <div class="logo-title">Veralevel <span>Jobs</span></div>
    <div class="logo-sub">${allJobs.length} roles &middot; ${genStr}</div>
  </div>
  <div class="srch">
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="5.5" stroke="white" stroke-width="2"/><path d="M13.5 13.5l3 3" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
    <input type="search" id="searchBox" placeholder="Search title or company&hellip;" autocomplete="off">
  </div>
  <button id="filter-btn" onclick="toggleFilters()">
    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3 5a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm3 5a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>
    Filters<span class="fdot" id="fdot"></span>
  </button>
</div></header>
<div id="filter-panel">
  <div class="fp">
    <div class="frow"><span class="flbl">Role</span><div class="chips" id="role-chips"></div></div>
    <div class="frow"><span class="flbl">Tier</span><div class="chips" id="tier-chips"></div></div>
    <div class="frow"><span class="flbl">Src</span><div class="chips" id="src-chips"></div></div>
    <div class="frow sal-row"><span class="flbl">Sal</span>
      <input type="range" id="salSlider" min="0" max="25000" step="1000" value="0">
      <span id="salVal">Any salary</span>
    </div>
    <div class="frow sal-row"><span class="flbl">Score</span>
      <input type="range" id="scoreSlider" min="0" max="40" step="5" value="0">
      <span id="scoreVal">Any score</span>
    </div>
  </div>
</div>
<div id="stats-bar"><div class="si">
  <span class="sc" id="sc">${allJobs.length}</span>
  <span class="sof" id="sof">of ${allJobs.length}</span>
  <div class="ssep"></div>
  <div class="schips" id="schips"></div>
</div></div>
<div id="grid"></div>
<div id="no-results"><div class="nr-icon">&#x1F50D;</div><div class="nr-title">No matching jobs</div><div class="nr-sub">Try adjusting your filters or search term</div></div>
<footer>Sources: MyCareersFuture.gov.sg &amp; LinkedIn &middot; Pandian &middot; ${genStr}</footer>
<script>
var JOBS=${safeJson};
var TOTAL=JOBS.length;
var RM={TPM:{l:'TPM',c:'#4338ca',b:'#ede9fe'},SA:{l:'Solution Arch',c:'#1d4ed8',b:'#dbeafe'},PRESALES:{l:'PreSales',c:'#065f46',b:'#d1fae5'},NETWORK:{l:'Network',c:'#b45309',b:'#fef3c7'},INFRA_BD:{l:'Infra BD',c:'#be185d',b:'#fce7f3'},INFRA:{l:'Infrastructure',c:'#7c3aed',b:'#f3e8ff'},BD:{l:'Biz Dev',c:'#c2410c',b:'#ffedd5'},OTHER:{l:'Other',c:'#64748b',b:'#f1f5f9'}};
var TM={hyperscaler:{l:'Hyperscaler',c:'#d97706'},telco:{l:'Telco',c:'#059669'},enterprise:{l:'Enterprise',c:'#1d4ed8'},tech:{l:'Tech Co',c:'#7c3aed'},other:{l:'Other',c:'#64748b'}};
var ROLES=[{v:'all',l:'All'},{v:'TPM',l:'TPM'},{v:'SA',l:'Solution Arch'},{v:'NETWORK',l:'Network'},{v:'PRESALES',l:'PreSales'},{v:'BD',l:'Biz Dev'},{v:'INFRA_BD',l:'Infra BD'},{v:'INFRA',l:'Infrastructure'}];
var TIERS=[{v:'all',l:'All'},{v:'hyperscaler',l:'Hyperscaler'},{v:'telco',l:'Telco'},{v:'enterprise',l:'Enterprise'},{v:'tech',l:'Tech Co'},{v:'other',l:'Other'}];
var SRCS=[{v:'all',l:'All Sources',f:'src'},{v:'LinkedIn',l:'LinkedIn',f:'src'},{v:'MCF',l:'MCF',f:'src'},{v:'BOTH',l:'in + MCF',f:'src'},{v:'dream',l:'Dream',f:'dream'}];
var STATS=[{l:'TPM',r:'TPM',c:'#4338ca',b:'#ede9fe'},{l:'Sol.Arch',r:'SA',c:'#1d4ed8',b:'#dbeafe'},{l:'PreSales',r:'PRESALES',c:'#065f46',b:'#d1fae5'},{l:'Network',r:'NETWORK',c:'#b45309',b:'#fef3c7'},{l:'Infra BD',r:'INFRA_BD',c:'#be185d',b:'#fce7f3'},{l:'Infra',r:'INFRA',c:'#7c3aed',b:'#f3e8ff'},{l:'Biz Dev',r:'BD',c:'#c2410c',b:'#ffedd5'}];
var F={role:'all',tier:'all',src:'all',dream:false},minSal=0,minScore=0,srch='';
function eh(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function card(j){
  var rm=RM[j.role]||RM.OTHER,tm=TM[j.tier]||TM.other;
  var sl=j.src==='BOTH'?'in+MCF':j.src,sc=j.src==='BOTH'?'src-both':j.src==='MCF'?'src-mcf':'src-li';
  var b='';
  if(j.liUrl)b+='<a class="btn-li" href="'+eh(j.liUrl)+'" target="_blank" rel="noopener">Apply on LinkedIn →</a>';
  if(j.mcfUrl)b+='<a class="btn-mcf" href="'+eh(j.mcfUrl)+'" target="_blank" rel="noopener">Apply on MCF →</a>';
  var m=[j.posted,j.rank?'#'+j.rank:''].filter(Boolean).join(' · ');
  return '<div class="card'+(j.isDream?' dream':'')+'" data-role="'+j.role+'" data-tier="'+j.tier+'" data-src="'+j.src+'" data-salmin="'+j.salmin+'">'
    +'<div class="chdr"><span class="brole" style="background:'+rm.b+';color:'+rm.c+'">'+rm.l+'</span><span class="btier" style="color:'+tm.c+'">'+tm.l+'</span><span class="bsrc '+sc+'">'+sl+'</span><span class="score-txt">Score '+j.score+'</span></div>'
    +'<div class="ctitle">'+eh(j.title)+'</div>'
    +'<div class="cco">'+eh(j.company)+'</div>'
    +'<div class="cfooter"><span class="salary '+j.salCls+'">'+eh(j.salText)+'</span><span class="cmeta">'+m+'</span></div>'
    +'<div class="cbtns">'+b+'</div></div>';
}
function render(){
  var q=srch,filtered=JOBS.filter(function(j){
    var srcOk=F.src==='all'||(F.src==='BOTH'?j.src==='BOTH':(j.src===F.src||j.src==='BOTH'));
    return srcOk&&(F.role==='all'||j.role===F.role)&&(F.tier==='all'||j.tier===F.tier)&&(!F.dream||j.isDream)&&(minSal===0||j.salmax>=minSal)&&(minScore===0||j.score>=minScore)&&(!q||j.title.toLowerCase().includes(q)||j.company.toLowerCase().includes(q));
  });
  document.getElementById('grid').innerHTML=filtered.map(card).join('');
  document.getElementById('sc').textContent=filtered.length;
  document.getElementById('sof').textContent='of '+TOTAL;
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
function toggleFilters(){var p=document.getElementById('filter-panel'),b=document.getElementById('filter-btn');p.classList.toggle('open');b.classList.toggle('open',p.classList.contains('open'));}
document.getElementById('salSlider').addEventListener('input',function(){minSal=parseInt(this.value)||0;document.getElementById('salVal').textContent=minSal?'Max ≥ $'+minSal.toLocaleString()+'/mo':'Any salary';render();});
document.getElementById('scoreSlider').addEventListener('input',function(){minScore=parseInt(this.value)||0;document.getElementById('scoreVal').textContent=minScore?minScore+'+':'Any score';render();});
document.getElementById('searchBox').addEventListener('input',function(){srch=this.value.toLowerCase().trim();render();});
if(window.innerWidth>=700)document.getElementById('filter-panel').classList.add('open');
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
  console.log(`[${new Date().toISOString()}] Done.\n`);
}

run().catch(async err => {
  console.error(`[${new Date().toISOString()}] FATAL:`, err.message);
  try { await sendTelegram(`🚨 *Job Hunter Error*\n\`${err.message}\``); } catch {}
  process.exit(1);
});
