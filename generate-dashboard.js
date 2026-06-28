#!/usr/bin/env node
// generate-dashboard.js — Pandian's Singapore Job Dashboard (MCF + LinkedIn)
// Usage: node generate-dashboard.js
// Outputs: ../../Singapore-Jobs-Dashboard.html

const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'public', 'index.html');

const MIN_SALARY       = 8000;
const MCF_LIMIT        = 40;   // per search query
const LI_PAGES         = 2;    // LinkedIn pages per query (25 jobs/page)
const LI_DELAY_MS      = 600;  // delay between LinkedIn requests (ms)
const LI_SINGAPORE_GEO = '102454443';

// ── Search queries (shared MCF + LinkedIn) ────────────────────────
const SEARCHES = [
  { label: 'TPM',               q: 'technical program manager',                 role: 'TPM',      weight: 12 },
  { label: 'Principal TPM',     q: 'principal technical program manager',        role: 'TPM',      weight: 12 },
  { label: 'Solution Architect',q: 'solution architect',                        role: 'SA',       weight: 12 },
  { label: 'Presales',          q: 'presales',                                  role: 'PRESALES', weight: 12 },
  { label: 'Pre-Sales Eng',     q: 'pre-sales engineer',                        role: 'PRESALES', weight: 11 },
  { label: 'Network Planning',  q: 'network planning manager',                  role: 'NETWORK',  weight: 11 },
  { label: 'Infra BD',          q: 'infrastructure business development',       role: 'INFRA_BD', weight: 11 },
  { label: 'Infra Prog Mgr',    q: 'infrastructure program manager',            role: 'TPM',      weight: 11 },
  { label: 'DC Planning',       q: 'data center planning delivery manager',     role: 'TPM',      weight: 11 },
  { label: 'Interconnect PM',   q: 'interconnection program manager',            role: 'NETWORK',  weight: 11 },
  { label: 'Proj Delivery Mgr', q: 'project delivery manager infrastructure',   role: 'TPM',      weight: 10 },
  { label: 'Tech Project Mgr',  q: 'technical project manager',                 role: 'TPM',      weight: 10 },
  { label: 'Security Architect',q: 'security architect',                        role: 'SA',       weight: 10 },
  { label: 'Mgmt Consultant',   q: 'managing consultant cybersecurity',          role: 'SA',       weight: 10 },
  { label: 'Network Manager',   q: 'network manager',                           role: 'NETWORK',  weight: 10 },
  { label: 'Infra Manager',     q: 'infrastructure manager',                    role: 'INFRA',    weight: 10 },
  { label: 'Biz Dev Tech',      q: 'business development manager technology',   role: 'BD',       weight:  9 },
  { label: 'Cloud Architect',   q: 'cloud architect',                           role: 'SA',       weight: 10 },
  { label: 'Telecom BD',        q: 'telecom business development',              role: 'INFRA_BD', weight: 10 },
  { label: 'Network Architect', q: 'network architect',                         role: 'NETWORK',  weight: 10 },
  { label: 'Program Mgr Tech',  q: 'program manager technology',                role: 'TPM',      weight:  9 },
];

// ── Company tier lookup ───────────────────────────────────────────
const COMPANY_TIERS = {
  hyperscaler: ['google', 'amazon', 'aws', 'microsoft', 'meta', 'apple', 'nvidia', 'oracle cloud', 'alibaba cloud', 'tencent cloud', 'salesforce', 'openai'],
  telco:       ['singtel', 'starhub', 'star hub', 'm1 limited', 'nokia', 'ericsson', 'huawei', 'ntt', 'verizon', 'at&t', 'deutsche telekom', 'vodafone', 'bharti', 'globe telecom', 'telstra', 'kddi', 'softbank', 'optus'],
  enterprise:  ['jpmorgan', 'jp morgan', 'goldman sachs', 'dbs', 'uob', 'ocbc', 'standard chartered', 'mastercard', 'visa', 'american express', 'singapore airlines', 'sia', 'grab', 'sea limited', 'shopee', 'lazada', 'gic', 'temasek', 'dyson', 'st engineering', 'defense science', 'govtech', 'prudential', 'great eastern', 'axa'],
  tech:        ['cisco', 'palo alto', 'crowdstrike', 'zscaler', 'cloudflare', 'fortinet', 'juniper', 'arista', 'akamai', 'elastic', 'red hat', 'servicenow', 'workday', 'sap', 'hashicorp', 'databricks', 'snowflake', 'stripe', 'twilio', 'cato networks', 'netskope'],
};

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
  { terms: ['apac', 'asia pacific', 'regional', 'singapore'], boost: 2 },
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

const EXCLUDE_TITLE   = ['intern', 'internship', 'graduate programme', 'junior', 'fresh grad', 'entry level', 'trainee'];
const EXCLUDE_COMPANY = ['part time', 'freelance'];

// ── Helpers ───────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function detectTier(companyName) {
  const n = (companyName || '').toLowerCase();
  for (const [tier, kws] of Object.entries(COMPANY_TIERS)) {
    if (kws.some(k => n.includes(k))) return tier;
  }
  return 'other';
}

function detectRole(title) {
  const t = (title || '').toLowerCase();
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
  const t = (title   || '').toLowerCase();
  const c = (company || '').toLowerCase();
  return DREAM_RULES.some(r => c.includes(r.company) && r.terms.some(term => t.includes(term)));
}

function scoreJob(title, company, salaryMin, salaryMax, baseWeight) {
  const t = (title   || '').toLowerCase();
  const c = (company || '').toLowerCase();

  if (EXCLUDE_TITLE.some(e => t.includes(e))) return -1;
  if (EXCLUDE_COMPANY.some(e => c.includes(e))) return -1;
  if (salaryMax > 0 && salaryMax < MIN_SALARY) return -1;

  let score = baseWeight;

  for (const { terms, boost } of TITLE_BOOSTS) {
    if (terms.some(term => t.includes(term))) score += boost;
  }
  for (const [co, boost] of Object.entries(COMPANY_BOOSTS)) {
    if (c.includes(co)) { score += boost; break; }
  }

  if (salaryMin >= 20000) score += 6;
  else if (salaryMin >= 15000) score += 4;
  else if (salaryMin >= 12000) score += 3;
  else if (salaryMin >= 8000)  score += 2;
  else if (salaryMax >= MIN_SALARY) score += 1;

  if (isDream(title, company)) score += 8;

  return score;
}

// ── MCF source ────────────────────────────────────────────────────
async function searchMCF(query) {
  const url = new URL('https://api.mycareersfuture.gov.sg/v2/jobs');
  url.searchParams.set('search', query);
  url.searchParams.set('limit', MCF_LIMIT);
  url.searchParams.set('sortBy', 'new_posting_date');
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 JobDashboard/2.0', 'Accept': 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map(job => ({
    source:    'MCF',
    id:        'mcf_' + job.uuid,
    title:     job.title || '',
    company:   job.postedCompany?.name || '',
    location:  'Singapore',
    salaryMin: job.salary?.minimum || 0,
    salaryMax: job.salary?.maximum || 0,
    postedDate: job.metadata?.newPostingDate?.substring(0,10) || null,
    url:       `https://www.mycareersfuture.gov.sg/job/${job.uuid}`,
  }));
}

// ── LinkedIn source ───────────────────────────────────────────────
const LI_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://www.linkedin.com/jobs/search/',
  'Cache-Control':   'no-cache',
};

function parseLinkedInHtml(html) {
  const jobs = [];
  const idRx      = /data-entity-urn="urn:li:jobPosting:(\d+)"/g;
  const titleRx   = /<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>\s*([^<]+?)\s*<\/h3>/g;
  const companyRx = /<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>[\s\S]*?<a[^>]*>\s*([^<]+?)\s*<\/a>/g;
  const locRx     = /<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/g;
  const dateRx    = /datetime="([^"]+)"/g;

  const ids       = [...html.matchAll(idRx)].map(m => m[1]);
  const titles    = [...html.matchAll(titleRx)].map(m => m[1].trim());
  const companies = [...html.matchAll(companyRx)].map(m => m[1].trim());
  const locs      = [...html.matchAll(locRx)].map(m => m[1].trim());
  const dates     = [...html.matchAll(dateRx)].map(m => m[1].substring(0,10));

  for (let i = 0; i < ids.length; i++) {
    jobs.push({
      source:    'LinkedIn',
      id:        'li_' + ids[i],
      title:     titles[i]    || '',
      company:   companies[i] || '',
      location:  locs[i]      || 'Singapore',
      salaryMin: 0,
      salaryMax: 0,
      postedDate: dates[i]   || null,
      url:       `https://www.linkedin.com/jobs/view/${ids[i]}`,
    });
  }
  return jobs;
}

async function searchLinkedIn(query) {
  const allJobs = [];
  for (let page = 0; page < LI_PAGES; page++) {
    const url = new URL('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search');
    url.searchParams.set('keywords', query);
    url.searchParams.set('location', 'Singapore');
    url.searchParams.set('geoId', LI_SINGAPORE_GEO);
    url.searchParams.set('start', page * 25);
    url.searchParams.set('count', 25);
    url.searchParams.set('f_WT', '1,2,3');  // on-site, hybrid, remote

    try {
      if (page > 0) await sleep(LI_DELAY_MS);
      const res = await fetch(url.toString(), { headers: LI_HEADERS });
      if (!res.ok) break;
      const html = await res.text();
      if (html.length < 100) break;
      const jobs = parseLinkedInHtml(html);
      if (jobs.length === 0) break;
      allJobs.push(...jobs);
    } catch {
      break;
    }
  }
  return allJobs;
}

// ── Fuzzy cross-source dedup ──────────────────────────────────────
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

// ── Scoring + dedup ───────────────────────────────────────────────
function processJobs(rawJobs) {
  const seen   = new Set();
  const scored = [];

  for (const { jobs, weight, role } of rawJobs) {
    for (const job of jobs) {
      if (seen.has(job.id)) continue;
      seen.add(job.id);

      const score = scoreJob(job.title, job.company, job.salaryMin, job.salaryMax, weight);
      if (score < 0) continue;

      const detectedRole = detectRole(job.title);
      scored.push({
        ...job,
        score,
        role:    detectedRole !== 'OTHER' ? detectedRole : role,
        tier:    detectTier(job.company),
        isDream: isDream(job.title, job.company),
      });
    }
  }

  return fuzzyDedup(scored).sort((a, b) => {
    if (!a.postedDate && !b.postedDate) return b.score - a.score;
    if (!a.postedDate) return 1;
    if (!b.postedDate) return -1;
    const diff = new Date(b.postedDate) - new Date(a.postedDate);
    return diff !== 0 ? diff : b.score - a.score;
  });
}

// ── HTML builder ──────────────────────────────────────────────────
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
  if (!min && !max) return null;
  if (min && max)  return `$${min.toLocaleString()} – $${max.toLocaleString()}/mo`;
  if (min)         return `$${min.toLocaleString()}+/mo`;
  return null;
}

function salaryClass(min) {
  if (!min)          return 'sal-unknown';
  if (min >= 18000)  return 'sal-premium';
  if (min >= 12000)  return 'sal-high';
  if (min >= 8000)   return 'sal-mid';
  return 'sal-low';
}

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)   return `${diff}d ago`;
  if (diff < 30)  return `${Math.floor(diff/7)}w ago`;
  return `${Math.floor(diff/30)}mo ago`;
}

function buildDashboard(jobs, stats, generatedAt) {
  const generated = new Date(generatedAt).toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore',
  }) + ' SGT';

  const cardData = jobs.map((j, i) => ({
    title:   j.title,   company: j.company, role:    j.role,
    tier:    j.tier,    src:     j.source,  salmin:  j.salaryMin || 0,
    salCls:  salaryClass(j.salaryMin),
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
<meta name="description" content="Curated Singapore tech, telco &amp; infrastructure jobs for TPMs, Solution Architects, Presales and Network professionals. Updated daily from MyCareersFuture and LinkedIn.">
<meta name="robots" content="index, follow">
<meta property="og:title" content="Veralevel Jobs — Singapore Tech &amp; Telco Roles">
<meta property="og:description" content="Curated daily job alerts for TPM, Solution Architect, Presales and Network roles in Singapore.">
<meta property="og:type" content="website">
<link rel="canonical" href="https://veralevel-job-alerts.vercel.app/">
<title>Veralevel Jobs — ${generated}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--pri:#00183d;--sec:#005eb5;--bg:#f6faff;--surf:#fff;--surf-lo:#f0f4f9;--bdr:#c4c6d0;--txt:#171c20;--txt2:#44474f;--out:#747780;--grn:#0F6B3C;--sb-w:260px;--hdr-h:60px}
body{background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--txt);min-height:100vh;-webkit-font-smoothing:antialiased}
input[type=range]{accent-color:var(--sec);cursor:pointer;width:100%}
::-webkit-scrollbar{height:4px;width:4px}::-webkit-scrollbar-thumb{background:var(--bdr);border-radius:99px}
.msym{font-family:'Material Symbols Outlined';font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 20;font-size:18px;line-height:1;vertical-align:middle;display:inline-block;flex-shrink:0}
.msym.filled{font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20}
header{position:sticky;top:0;z-index:200;background:var(--surf);height:var(--hdr-h);border-bottom:1px solid var(--bdr);box-shadow:0 1px 4px rgba(0,24,61,.06);display:flex;align-items:center}
.hdr{width:100%;padding:0 20px;display:flex;align-items:center;gap:12px}
.logo{font-family:'DM Sans',sans-serif;font-size:20px;font-weight:700;letter-spacing:-.5px;flex-shrink:0;text-decoration:none;line-height:1}
.logo-v{color:var(--pri)}.logo-j{color:var(--sec)}
.srch{flex:1;position:relative;min-width:0}
.srch .msym{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--out);pointer-events:none;font-size:20px}
#searchBox{width:100%;background:#eaeef3;border:1.5px solid transparent;border-radius:999px;padding:9px 14px 9px 40px;color:var(--txt);font-size:14px;font-family:'Inter',sans-serif;outline:none;transition:border-color .15s,background .15s}
#searchBox:focus{border-color:var(--sec);background:var(--surf)}
#searchBox::placeholder{color:var(--out)}
#filter-btn{display:none;align-items:center;gap:6px;background:var(--sec);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;flex-shrink:0;position:relative}
.fdot{display:none;background:#ef4444;color:#fff;border-radius:99px;padding:1px 5px;font-size:10px;font-weight:700;margin-left:2px}
.fdot.on{display:inline}
@media(max-width:1023px){#filter-btn{display:flex}}
#sb-backdrop{display:none;position:fixed;inset:0;top:var(--hdr-h);background:rgba(0,0,0,.4);z-index:149}
#sb-backdrop.show{display:block}
#sidebar{position:fixed;left:0;top:var(--hdr-h);width:var(--sb-w);height:calc(100vh - var(--hdr-h));overflow-y:auto;background:var(--surf-lo);border-right:1px solid var(--bdr);padding:20px 16px 32px;z-index:150;display:flex;flex-direction:column}
@media(max-width:1023px){#sidebar{transform:translateX(-100%);transition:transform .25s ease;box-shadow:4px 0 20px rgba(0,0,0,.12)}}
@media(max-width:1023px){#sidebar.open{transform:translateX(0)}}
.sb-ttl{font-family:'DM Sans',sans-serif;font-size:16px;font-weight:700;color:var(--pri);margin-bottom:2px}
.sb-sub{font-size:12px;color:var(--txt2);margin-bottom:20px}
.sb-sec{margin-bottom:18px}
.sb-lbl{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.sb-lbl .msym{font-size:16px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{background:var(--surf);color:var(--txt2);border:1.5px solid var(--bdr);border-radius:999px;padding:5px 12px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;line-height:1.4;transition:all .1s}
.chip.active{background:var(--sec);color:#fff;border-color:var(--sec);font-weight:700}
.chip:hover:not(.active){border-color:var(--sec);color:var(--sec)}
.ccount{opacity:.6;font-size:10px;margin-left:2px}
.sb-sval{font-size:13px;font-weight:600;color:var(--sec);margin-top:6px}
.btn-clear{width:100%;padding:9px;background:transparent;border:1.5px solid var(--bdr);border-radius:8px;color:var(--txt2);font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;margin-top:auto;transition:all .1s}
.btn-clear:hover{border-color:var(--sec);color:var(--sec)}
#main{margin-left:var(--sb-w);min-height:calc(100vh - var(--hdr-h));display:flex;flex-direction:column}
@media(max-width:1023px){#main{margin-left:0}}
#page-hdr{padding:16px 20px 0;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px}
.ph-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ph-cnt{font-family:'DM Sans',sans-serif;font-size:20px;font-weight:700;color:var(--pri)}
.ph-tot{font-size:14px;color:var(--txt2)}
.ph-live{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--txt2)}
.ldot{width:8px;height:8px;border-radius:99px;background:var(--grn);flex-shrink:0;animation:blink 2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.ph-date{font-size:12px;color:var(--txt2);display:flex;align-items:center;gap:5px}
.ph-date .msym{font-size:15px}
#stats-bar{padding:10px 20px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.schips{display:flex;gap:5px;flex-wrap:wrap}
.sch{display:inline-flex;align-items:center;gap:4px;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;white-space:nowrap}
#grid{padding:14px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}
@media(max-width:599px){#grid{grid-template-columns:1fr;padding:10px 12px}}
.card{background:var(--surf);border-radius:12px;box-shadow:0px 4px 12px rgba(15,45,92,.08);border:1px solid #e4e9ed;border-left:2px solid transparent;padding:16px;display:flex;flex-direction:column;gap:10px;transition:box-shadow .15s,border-left-color .15s}
.card:hover{box-shadow:0px 8px 24px rgba(15,45,92,.14);border-left-color:var(--sec)}
.card.dream{background:linear-gradient(135deg,#fffdf0 0%,#fff8dc 100%);border-left-color:#d97706}
.card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.card-title{font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;color:var(--pri);line-height:1.4;flex:1}
.card-rank{font-size:11px;font-weight:700;color:var(--out);flex-shrink:0;background:#f0f4f9;border-radius:6px;padding:2px 6px;white-space:nowrap}
.dream-star{color:#d97706;font-size:20px}
.card-co{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--txt2);flex-wrap:wrap}
.card-co .msym{font-size:16px;color:var(--out)}
.src-li{background:#dbeafe;color:#1d4ed8;border-radius:99px;padding:2px 8px;font-size:10px;font-weight:700;flex-shrink:0}
.src-mcf{background:#dcfce7;color:#15803d;border-radius:99px;padding:2px 8px;font-size:10px;font-weight:700;flex-shrink:0}
.src-both{background:#f3e8ff;color:#7c3aed;border-radius:99px;padding:2px 8px;font-size:10px;font-weight:700;flex-shrink:0}
.card-tags{display:flex;gap:8px;flex-wrap:wrap}
.tag-role,.tag-score{display:inline-flex;align-items:center;gap:5px;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600}
.tag-role .msym,.tag-score .msym{font-size:14px}
.tag-score{background:#f0f4f9;color:var(--txt2)}
.card-sal{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--txt);background:#f6faff;border-radius:8px;padding:7px 10px;border:1px solid #e4e9ed}
.card-sal .msym{font-size:16px;color:var(--sec)}
.card-sal.dim{color:var(--out);font-weight:400}
.card-sal.dim .msym{color:var(--bdr)}
.card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:4px}
.card-posted{font-size:11px;color:var(--out)}
.card-btns{display:flex;gap:6px}
.btn-li,.btn-mcf{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;text-decoration:none;font-family:'Inter',sans-serif;white-space:nowrap;transition:opacity .1s}
.btn-li{background:#0a66c2;color:#fff}.btn-mcf{background:var(--grn);color:#fff}
.btn-li:hover,.btn-mcf:hover{opacity:.85}
#no-results{display:none;text-align:center;padding:60px 20px}
#no-results.show{display:block}
.nr-icon{font-size:36px;margin-bottom:10px}.nr-title{font-size:16px;font-weight:700;color:#475569;margin-bottom:6px}.nr-sub{font-size:13px;color:#94a3b8}
footer{background:#dfe3e8;padding:20px;font-size:12px;color:var(--txt2);margin-top:auto}
.ft-inner{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px}
.ft-brand{font-family:'DM Sans',sans-serif;font-weight:700;color:var(--pri);font-size:14px}
.ft-copy{font-size:11px;color:var(--out);margin-top:3px}
.ft-links{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.ft-links a{color:var(--txt2);text-decoration:none;transition:color .1s}
.ft-links a:hover{color:var(--sec)}
.ft-right{text-align:right}
.ft-right div{font-size:11px;color:var(--out)}
</style></head><body>
<header>
  <div class="hdr">
    <a class="logo" href="/"><span class="logo-v">Veralevel</span><span class="logo-j"> Jobs</span></a>
    <div class="srch"><span class="msym">search</span><input type="search" id="searchBox" placeholder="Search title or company…" autocomplete="off"></div>
    <button id="filter-btn" onclick="toggleSidebar()"><span class="msym">tune</span> Filters<span class="fdot" id="fdot"></span></button>
  </div>
</header>
<div id="sb-backdrop" onclick="toggleSidebar()"></div>
<aside id="sidebar">
  <div class="sb-ttl">Filters</div>
  <div class="sb-sub">Refine job alerts</div>
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
    <div class="sb-lbl"><span class="msym">star</span> Score</div>
    <input type="range" id="scoreSlider" min="0" max="40" step="5" value="0">
    <div class="sb-sval" id="scoreVal">Any score</div>
  </div>
  <button class="btn-clear" onclick="clearFilters()">Clear Filters</button>
</aside>
<div id="main">
  <div id="page-hdr">
    <div class="ph-left">
      <span class="ph-cnt"><span id="sc">${jobs.length}</span> <span class="ph-tot" id="sof">of ${jobs.length}</span></span>
      <span class="ph-live"><span class="ldot"></span> Refreshed just now</span>
    </div>
    <div class="ph-date"><span class="msym">calendar_today</span> ${generated}</div>
  </div>
  <div id="stats-bar"><div class="schips" id="schips"></div></div>
  <div id="grid"></div>
  <div id="no-results"><div class="nr-icon">&#x1F50D;</div><div class="nr-title">No matching jobs</div><div class="nr-sub">Try adjusting your filters or search term</div></div>
  <footer>
    <div class="ft-inner">
      <div><div class="ft-brand">Veralevel Jobs</div><div class="ft-copy">&copy; 2026 Veralevel Jobs</div></div>
      <div class="ft-links"><a href="#">Source Credits</a><a href="#">Privacy</a><a href="#">Terms</a></div>
      <div class="ft-right"><div>Powered by MCF &amp; LinkedIn</div><div>Curated by Pandian</div></div>
    </div>
  </footer>
</div>
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
  var rm=RM[j.role]||RM.OTHER;
  var rkEl=j.isDream?'<span class="msym filled dream-star">star</span>':'<span class="card-rank">#'+j.rank+'</span>';
  var sb='';
  if(j.src==='BOTH')sb='<span class="src-both">in+MCF</span>';
  else if(j.src==='LinkedIn')sb='<span class="src-li">LinkedIn</span>';
  else if(j.src==='MCF')sb='<span class="src-mcf">MCF</span>';
  var sal='';
  if(j.salText&&j.salText!=='Not stated'&&j.salText!=='See on LinkedIn')sal='<div class="card-sal"><span class="msym">payments</span> '+eh(j.salText)+'</div>';
  else if(j.salText)sal='<div class="card-sal dim"><span class="msym">payments</span> '+eh(j.salText)+'</div>';
  var btns='';
  if(j.liUrl)btns+='<a class="btn-li" href="'+eh(j.liUrl)+'" target="_blank" rel="noopener">LinkedIn →</a>';
  if(j.mcfUrl)btns+='<a class="btn-mcf" href="'+eh(j.mcfUrl)+'" target="_blank" rel="noopener">MCF →</a>';
  return '<div class="card'+(j.isDream?' dream':'')+'" data-role="'+j.role+'" data-tier="'+j.tier+'" data-src="'+j.src+'" data-salmin="'+j.salmin+'" data-salmax="'+j.salmax+'" data-score="'+j.score+'">'
    +'<div class="card-top"><div class="card-title">'+eh(j.title)+'</div>'+rkEl+'</div>'
    +'<div class="card-co"><span class="msym">business</span> <span>'+eh(j.company)+'</span>'+sb+'</div>'
    +'<div class="card-tags">'
      +'<span class="tag-role" style="background:'+rm.b+';color:'+rm.c+'"><span class="msym">work</span> '+rm.l+'</span>'
      +'<span class="tag-score"><span class="msym filled">star</span> '+j.score+' Score</span>'
    +'</div>'
    +sal
    +'<div class="card-foot"><span class="card-posted">'+(j.posted?'Posted: '+eh(j.posted):'')+' </span><div class="card-btns">'+btns+'</div></div>'
    +'</div>';
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
function toggleSidebar(){var sb=document.getElementById('sidebar'),bd=document.getElementById('sb-backdrop');sb.classList.toggle('open');bd.classList.toggle('show');}
function clearFilters(){F={role:'all',tier:'all',src:'all',dream:false};minSal=0;minScore=0;document.getElementById('salSlider').value=0;document.getElementById('scoreSlider').value=0;document.getElementById('salVal').textContent='Any salary';document.getElementById('scoreVal').textContent='Any score';chips();render();}
document.getElementById('salSlider').addEventListener('input',function(){minSal=parseInt(this.value)||0;document.getElementById('salVal').textContent=minSal?'Max ≥ $'+minSal.toLocaleString()+'/mo':'Any salary';render();});
document.getElementById('scoreSlider').addEventListener('input',function(){minScore=parseInt(this.value)||0;document.getElementById('scoreVal').textContent=minScore?minScore+'+':'Any score';render();});
document.getElementById('searchBox').addEventListener('input',function(){srch=this.value.toLowerCase().trim();render();});
chips();render();
</script></body></html>`;
}

// ── Main ──────────────────────────────────────────────────────────
async function run() {
  const now = new Date();
  console.log('\n🔍  Singapore Jobs Dashboard (MCF + LinkedIn)');
  console.log('    ' + now.toLocaleString('en-GB', { timeZone: 'Asia/Singapore' }) + ' SGT');
  console.log('─'.repeat(54));

  // ── MCF ───────────────────────────────────────────────────────
  process.stdout.write('  MCF');
  const mcfResults = await Promise.all(
    SEARCHES.map(s =>
      searchMCF(s.q)
        .then(jobs => { process.stdout.write('.'); return { ...s, jobs }; })
        .catch(()  => { process.stdout.write('!'); return { ...s, jobs: [] }; })
    )
  );
  const mcfRaw = mcfResults.reduce((n, r) => n + r.jobs.length, 0);
  console.log(` done (${mcfRaw} raw)\n`);

  // ── LinkedIn ──────────────────────────────────────────────────
  process.stdout.write('  LinkedIn');
  const liResults = [];
  for (const s of SEARCHES) {
    try {
      const jobs = await searchLinkedIn(s.q);
      process.stdout.write('.');
      liResults.push({ ...s, jobs });
      await sleep(LI_DELAY_MS);
    } catch {
      process.stdout.write('!');
      liResults.push({ ...s, jobs: [] });
    }
  }
  const liRaw = liResults.reduce((n, r) => n + r.jobs.length, 0);
  console.log(` done (${liRaw} raw)\n`);

  // ── Process ───────────────────────────────────────────────────
  const allRaw = [...mcfResults, ...liResults];
  const jobs   = processJobs(allRaw);

  const mcfCount = jobs.filter(j => j.source === 'MCF').length;
  const liCount  = jobs.filter(j => j.source === 'LinkedIn').length;

  console.log(`  ${jobs.length} unique jobs (MCF: ${mcfCount}, LinkedIn: ${liCount})\n`);

  // Top 10 preview
  jobs.slice(0, 10).forEach((j, i) => {
    const dream = j.isDream ? ' ⭐' : '';
    const sal   = j.salaryMin ? `$${j.salaryMin.toLocaleString()} – $${j.salaryMax?.toLocaleString() ?? '?'}/mo` : 'Salary TBD';
    console.log(`${i+1}.${dream} [${j.source}][${j.role}] ${j.title}`);
    console.log(`   ${j.company} | ${sal} | ${j.postedDate || '?'}`);
    console.log(`   ${j.url}\n`);
  });

  const html = buildDashboard(jobs, {}, now.toISOString());
  fs.writeFileSync(OUT, html, 'utf8');
  console.log('─'.repeat(54));
  console.log(`  ✓ Saved → ${OUT}`);
  console.log(`  Double-click to open.\n`);
}

run().catch(err => { console.error('\nError:', err.message); process.exit(1); });
