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
  msg += `${num} ${roleTag} *${j.title}*\n`;
  msg += `🏢 ${j.company}${tierTag}\n`;
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
    `⭐ *${j.title}*\n` +
    `🏢 *${j.company}*\n` +
    `💰 ${sal}\n` +
    `📅 ${j.postedDate || '?'} · ${srcTag}\n\n` +
    `${day}\n` +
    `_${note}_\n\n` +
    `${SEP}\n` +
    `🚀 *[APPLY NOW](${j.url})*\n` +
    `${SEP}`
  );
}

// ── HTML dashboard builder (inlined from generate-dashboard.js) ─
const ROLE_META = {
  TPM:      { label: 'TPM',            color: '#6366f1', bg: '#1e1b4b' },
  SA:       { label: 'Solution Arch',  color: '#0ea5e9', bg: '#082f49' },
  PRESALES: { label: 'PreSales',       color: '#10b981', bg: '#064e3b' },
  NETWORK:  { label: 'Network',        color: '#f59e0b', bg: '#451a03' },
  INFRA_BD: { label: 'Infra BD',       color: '#ec4899', bg: '#500724' },
  INFRA:    { label: 'Infrastructure', color: '#8b5cf6', bg: '#2e1065' },
  BD:       { label: 'Biz Dev',        color: '#f97316', bg: '#431407' },
  OTHER:    { label: 'Other',          color: '#64748b', bg: '#1e293b' },
};
const TIER_META = {
  hyperscaler: { label: '⚡ Hyperscaler', color: '#fbbf24' },
  telco:       { label: '📡 Telco',       color: '#34d399' },
  enterprise:  { label: '🏢 Enterprise',  color: '#60a5fa' },
  tech:        { label: '🛡 Tech Co',     color: '#a78bfa' },
  other:       { label: '🔷 Other',       color: '#94a3b8' },
};

function fmtSalary(min, max) {
  if (min && max) return `$${min.toLocaleString()} – $${max.toLocaleString()}/mo`;
  if (min)        return `$${min.toLocaleString()}+/mo`;
  return null;
}
function salCls(min) {
  if (!min)       return 'sal-unknown';
  if (min >= 18000) return 'sal-premium';
  if (min >= 12000) return 'sal-high';
  if (min >= 8000)  return 'sal-mid';
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
  const mcfCount  = allJobs.filter(j => j.source === 'MCF'  || j.source === 'BOTH').length;
  const liCount   = allJobs.filter(j => j.source === 'LinkedIn' || j.source === 'BOTH').length;
  const bothCount = allJobs.filter(j => j.source === 'BOTH').length;
  const roleCounts = {}; const tierCounts = {};
  for (const j of allJobs) {
    roleCounts[j.role] = (roleCounts[j.role]||0)+1;
    tierCounts[j.tier] = (tierCounts[j.tier]||0)+1;
  }
  const genStr = new Date(generated).toLocaleString('en-GB', {
    weekday:'short',day:'2-digit',month:'short',year:'numeric',
    hour:'2-digit',minute:'2-digit',timeZone:'Asia/Singapore',
  }) + ' SGT';

  const cards = allJobs.map((j, i) => {
    const rm=ROLE_META[j.role]||ROLE_META.OTHER, tm=TIER_META[j.tier]||TIER_META.other;
    const sal=fmtSalary(j.salaryMin,j.salaryMax), posted=daysAgo(j.postedDate);
    const srcBadge = j.source === 'BOTH'
      ? `<span class="badge-src badge-mcf">MCF</span><span class="badge-src badge-li">in</span>`
      : j.source === 'LinkedIn'
        ? `<span class="badge-src badge-li">in LinkedIn</span>`
        : `<span class="badge-src badge-mcf">MCF</span>`;
    return `
  <div class="card${j.isDream?' is-dream':''}" data-role="${j.role}" data-tier="${j.tier}" data-src="${j.source}" data-salmin="${j.salaryMin}" data-title="${escHtml(j.title)}" data-company="${escHtml(j.company)}">
    <div class="card-header">
      <span class="badge-role" style="background:${rm.bg};color:${rm.color}">${rm.label}</span>
      <span class="badge-tier" style="color:${tm.color}">${tm.label}</span>
      ${j.isDream?'<span class="badge-dream">⭐ Dream</span>':''}
      ${srcBadge}
      <span class="score-pill">score ${j.score}</span>
    </div>
    <div class="card-title">${escHtml(j.title)}</div>
    <div class="card-company">${escHtml(j.company)}</div>
    <div class="card-footer">
      <span class="salary ${salCls(j.salaryMin)}">${sal||(j.source==='LinkedIn'?'See on LinkedIn':'Not stated')}</span>
      <div class="card-meta">${posted?`<span class="posted">${posted}</span>`:''}<span class="rank-num">#${i+1}</span></div>
    </div>
    <div class="card-links">
      <a class="card-link" href="${escHtml(j.url)}" target="_blank" rel="noopener">${j.source==='LinkedIn'?'View on LinkedIn →':'View on MCF →'}</a>${j.urlAlt?`<a class="card-link card-link-li" href="${escHtml(j.urlAlt)}" target="_blank" rel="noopener">LinkedIn →</a>`:''}
    </div>
  </div>`;
  }).join('\n');

  const roleChips = Object.entries(roleCounts).sort((a,b)=>b[1]-a[1]).map(([r,c])=>{
    const m=ROLE_META[r]||ROLE_META.OTHER;
    return `<button class="chip" data-filter="role" data-value="${r}" style="--chip-color:${m.color}">${m.label} <span class="chip-count">${c}</span></button>`;
  }).join('');
  const tierChips = Object.entries(tierCounts).sort((a,b)=>b[1]-a[1]).map(([t,c])=>{
    const m=TIER_META[t]||TIER_META.other;
    return `<button class="chip" data-filter="tier" data-value="${t}" style="--chip-color:${m.color}">${m.label} <span class="chip-count">${c}</span></button>`;
  }).join('');
  const statsHtml = Object.entries(ROLE_META).filter(([r])=>roleCounts[r]).map(([r,m])=>`<div class="stat"><span class="stat-num" style="color:${m.color}">${roleCounts[r]}</span><span class="stat-lbl">${m.label}</span></div>`).join('<div class="stat-sep"></div>');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SG Jobs — ${genStr}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#070b14;color:#e2e8f0;min-height:100vh;padding:0 0 4rem}
.topbar{background:#0d1520;border-bottom:1px solid #1e2d40;padding:.85rem 1.5rem;position:sticky;top:0;z-index:100}
.topbar-inner{max-width:1400px;margin:0 auto;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.logo{font-size:1.05rem;font-weight:800;color:#f8fafc;white-space:nowrap}.logo span{color:#38bdf8}
.meta-pills{display:flex;gap:.4rem;flex-wrap:wrap}
.meta-pill{background:#152133;border:1px solid #1e3a5f;border-radius:999px;padding:.18rem .6rem;font-size:.7rem;color:#94a3b8}
.meta-pill.hl{border-color:#0ea5e9;color:#38bdf8}.meta-pill.li{border-color:#0077b5;color:#60a5fa}.meta-pill.mcf{border-color:#1d4ed8;color:#93c5fd}
.search-wrap{margin-left:auto}
#searchBox{background:#152133;border:1px solid #1e3a5f;border-radius:.5rem;padding:.4rem .75rem;color:#e2e8f0;font-size:.82rem;width:210px;outline:none}
#searchBox:focus{border-color:#38bdf8}
.filters{max-width:1400px;margin:1rem auto .25rem;padding:0 1.5rem}
.filter-row{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin-bottom:.5rem}
.filter-label{font-size:.68rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.06em;min-width:3.5rem}
.chip{background:#0d1520;border:1px solid #1e2d40;border-radius:999px;padding:.22rem .6rem;font-size:.72rem;color:#94a3b8;cursor:pointer;transition:all .12s;white-space:nowrap}
.chip:hover,.chip.active{border-color:var(--chip-color,#38bdf8);color:var(--chip-color,#38bdf8)}
.chip.active{background:color-mix(in srgb,var(--chip-color,#38bdf8) 12%,transparent);font-weight:700}
.chip-count{opacity:.55;font-size:.65rem}.chip-all{--chip-color:#f8fafc}
.sal-filter{display:flex;align-items:center;gap:.5rem;font-size:.75rem}
.sal-filter label{color:#64748b}#salSlider{width:110px;accent-color:#38bdf8}#salVal{color:#38bdf8;font-weight:700;min-width:4rem}
.stats-bar{max-width:1400px;margin:.6rem auto;padding:0 1.5rem}
.stats-inner{background:#0d1520;border:1px solid #1e2d40;border-radius:.5rem;padding:.55rem 1rem;display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap}
.stat{display:flex;flex-direction:column;align-items:center;min-width:2.5rem}
.stat-num{font-size:1rem;font-weight:700;color:#f8fafc}.stat-lbl{font-size:.6rem;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
.stat-sep{width:1px;height:1.75rem;background:#1e2d40}
.grid{max-width:1400px;margin:0 auto;padding:0 1.5rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(295px,1fr));gap:.9rem}
.no-results{text-align:center;padding:3rem;color:#475569;font-size:.9rem}
.card{background:#0d1520;border:1px solid #1e2d40;border-radius:.85rem;padding:1rem 1.1rem .9rem;display:flex;flex-direction:column;gap:.45rem;transition:border-color .12s,transform .1s}
.card:hover{border-color:#1e3a5f;transform:translateY(-1px)}
.card.is-dream{border-color:#b45309;background:linear-gradient(135deg,#0d1520 75%,#1c1508)}.card.is-dream:hover{border-color:#d97706}
.card.hidden{display:none!important}
.card-header{display:flex;gap:.35rem;align-items:center;flex-wrap:wrap}
.badge-role{border-radius:999px;padding:.12rem .5rem;font-size:.64rem;font-weight:700}
.badge-tier{font-size:.64rem;font-weight:600}.badge-dream{background:#78350f;color:#fde68a;border-radius:999px;padding:.1rem .45rem;font-size:.64rem;font-weight:700}
.badge-src{border-radius:999px;padding:.1rem .45rem;font-size:.63rem;font-weight:700}
.badge-li{background:#0a3d6b;color:#60a5fa;border:1px solid #0077b5}.badge-mcf{background:#0a2d5e;color:#93c5fd;border:1px solid #1d4ed8}
.score-pill{margin-left:auto;font-size:.62rem;color:#334155}
.card-links{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.2rem}.card-link-li{border-color:#0e4a7a;color:#60a5fa}.card-link-li:hover{background:#0077b520;border-color:#0077b5}
.card-title{font-size:.88rem;font-weight:700;color:#f1f5f9;line-height:1.35}.card-company{font-size:.75rem;color:#64748b;font-weight:500}
.card-footer{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-top:auto}
.salary{font-size:.76rem;font-weight:700}
.sal-premium{color:#4ade80}.sal-high{color:#34d399}.sal-mid{color:#60a5fa}.sal-low,.sal-unknown{color:#475569}
.card-meta{display:flex;gap:.4rem;align-items:center}.posted{font-size:.67rem;color:#475569}.rank-num{font-size:.62rem;color:#1e293b}
.card-link{display:inline-block;margin-top:.2rem;color:#38bdf8;font-size:.72rem;text-decoration:none;font-weight:600;border:1px solid #1e3a5f;border-radius:.4rem;padding:.22rem .55rem;align-self:flex-start;transition:all .1s}
.card-link:hover{background:#0ea5e920;border-color:#0ea5e9}
footer{max-width:1400px;margin:2rem auto 0;padding:0 1.5rem;font-size:.7rem;color:#334155}
</style></head><body>
<div class="topbar"><div class="topbar-inner">
  <div class="logo">🔍 SG Jobs <span>Dashboard</span></div>
  <div class="meta-pills">
    <span class="meta-pill hl">${allJobs.length} curated roles</span>
    <span class="meta-pill li">in LinkedIn: ${liCount}</span>
    <span class="meta-pill mcf">MCF: ${mcfCount}</span>
    ${bothCount?`<span class="meta-pill" style="border-color:#7c3aed;color:#a78bfa">Both: ${bothCount}</span>`:''}
    <span class="meta-pill">$${MIN_SALARY.toLocaleString()}+/mo</span>
    <span class="meta-pill">${genStr}</span>
  </div>
  <div class="search-wrap"><input id="searchBox" type="search" placeholder="Search title or company…" autocomplete="off"></div>
</div></div>
<div class="filters">
  <div class="filter-row"><span class="filter-label">Role</span><button class="chip chip-all active" data-filter="role" data-value="all">All</button>${roleChips}</div>
  <div class="filter-row"><span class="filter-label">Tier</span><button class="chip chip-all active" data-filter="tier" data-value="all">All</button>${tierChips}</div>
  <div class="filter-row">
    <span class="filter-label">Source</span>
    <button class="chip chip-all active" data-filter="src" data-value="all" style="--chip-color:#f8fafc">All</button>
    <button class="chip" data-filter="src" data-value="MCF" style="--chip-color:#93c5fd">MCF (${mcfCount})</button>
    <button class="chip" data-filter="src" data-value="LinkedIn" style="--chip-color:#60a5fa">LinkedIn (${liCount})</button>
    ${bothCount?`<button class="chip" data-filter="src" data-value="BOTH" style="--chip-color:#a78bfa">Both MCF+in (${bothCount})</button>`:''}
    <button class="chip" data-filter="dream" data-value="dream" style="--chip-color:#fbbf24">⭐ Dream only</button>
  </div>
  <div class="filter-row"><span class="filter-label">Salary</span>
    <div class="sal-filter"><label for="salSlider">Min</label><input id="salSlider" type="range" min="0" max="25000" step="1000" value="0"><span id="salVal">Any</span></div>
  </div>
</div>
<div class="stats-bar"><div class="stats-inner">
  <div class="stat"><span class="stat-num" id="shownNum">${allJobs.length}</span><span class="stat-lbl">Shown</span></div>
  <div class="stat-sep"></div>${statsHtml}
  <div class="stat-sep"></div>
  ${Object.entries(TIER_META).filter(([t])=>tierCounts[t]).map(([t,m])=>`<div class="stat"><span class="stat-num" style="color:${m.color}">${tierCounts[t]}</span><span class="stat-lbl">${m.label.replace(/^[^ ]+ /,'')}</span></div>`).join('')}
</div></div>
<div class="grid" id="grid">${cards}</div>
<div class="no-results hidden" id="noResults">No jobs match your current filters.</div>
<footer>Sources: MyCareersFuture.gov.sg &amp; LinkedIn · Pandian · Refresh: <code>node job-alerts/daily-hunter.js</code> · ${genStr}</footer>
<script>
const grid=document.getElementById('grid'),cards=Array.from(grid.querySelectorAll('.card')),noResults=document.getElementById('noResults'),shownNum=document.getElementById('shownNum'),salSlider=document.getElementById('salSlider'),salVal=document.getElementById('salVal'),searchBox=document.getElementById('searchBox');
let filters={role:'all',tier:'all',src:'all',dream:false},minSal=0,searchQ='';
function apply(){let n=0;for(const c of cards){const src=c.dataset.src;const srcOk=filters.src==='all'||(filters.src==='BOTH'?src==='BOTH':(src===filters.src||src==='BOTH'));const ok=srcOk&&(filters.role==='all'||c.dataset.role===filters.role)&&(filters.tier==='all'||c.dataset.tier===filters.tier)&&(!filters.dream||c.classList.contains('is-dream'))&&(minSal===0||!c.dataset.salmin||parseInt(c.dataset.salmin)||0>=minSal)&&(!searchQ||c.dataset.title.toLowerCase().includes(searchQ)||c.dataset.company.toLowerCase().includes(searchQ));c.classList.toggle('hidden',!ok);if(ok)n++;}shownNum.textContent=n;noResults.classList.toggle('hidden',n>0);}
document.querySelectorAll('.chip').forEach(chip=>{chip.addEventListener('click',()=>{const f=chip.dataset.filter,v=chip.dataset.value;if(f==='dream'){filters.dream=!filters.dream;chip.classList.toggle('active',filters.dream);}else{filters[f]=v;document.querySelectorAll(\`.chip[data-filter="\${f}"]\`).forEach(c=>c.classList.remove('active'));chip.classList.add('active');}apply();});});
salSlider.addEventListener('input',()=>{minSal=parseInt(salSlider.value);salVal.textContent=minSal?'$'+minSal.toLocaleString()+'/mo':'Any';apply();});
searchBox.addEventListener('input',()=>{searchQ=searchBox.value.toLowerCase().trim();apply();});
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
