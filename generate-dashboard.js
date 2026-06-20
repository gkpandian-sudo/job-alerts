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
  if (!min && !max) return null;
  if (min && max)  return `$${min.toLocaleString()} – $${max.toLocaleString()}/mo`;
  if (min)         return `$${min.toLocaleString()}+/mo`;
  return null;
}

function salaryClass(min) {
  if (!min)       return 'sal-unknown';
  if (min >= 18000) return 'sal-premium';
  if (min >= 12000) return 'sal-high';
  if (min >= 8000)  return 'sal-mid';
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

  const mcfCount  = jobs.filter(j => j.source === 'MCF'  || j.source === 'BOTH').length;
  const liCount   = jobs.filter(j => j.source === 'LinkedIn' || j.source === 'BOTH').length;
  const bothCount = jobs.filter(j => j.source === 'BOTH').length;

  const roleCounts = {};
  const tierCounts = {};
  for (const j of jobs) {
    roleCounts[j.role] = (roleCounts[j.role] || 0) + 1;
    tierCounts[j.tier] = (tierCounts[j.tier] || 0) + 1;
  }

  const cards = jobs.map((j, i) => {
    const rm     = ROLE_META[j.role] || ROLE_META.OTHER;
    const tm     = TIER_META[j.tier] || TIER_META.other;
    const sal    = fmtSalary(j.salaryMin, j.salaryMax);
    const salCls = salaryClass(j.salaryMin);
    const posted = daysAgo(j.postedDate);
    const srcBadge = j.source === 'BOTH'
      ? `<span class="badge-src badge-mcf">MCF</span><span class="badge-src badge-li">in</span>`
      : j.source === 'LinkedIn'
        ? `<span class="badge-src badge-li">in LinkedIn</span>`
        : `<span class="badge-src badge-mcf">MCF</span>`;

    return `
  <div class="card${j.isDream ? ' is-dream' : ''}"
       data-role="${j.role}" data-tier="${j.tier}"
       data-src="${j.source}" data-salmin="${j.salaryMin}"
       data-title="${escHtml(j.title)}" data-company="${escHtml(j.company)}">
    <div class="card-header">
      <span class="badge-role" style="background:${rm.bg};color:${rm.color}">${rm.label}</span>
      <span class="badge-tier" style="color:${tm.color}">${tm.label}</span>
      ${j.isDream ? '<span class="badge-dream">⭐ Dream</span>' : ''}
      ${srcBadge}
      <span class="score-pill">score ${j.score}</span>
    </div>
    <div class="card-title">${escHtml(j.title)}</div>
    <div class="card-company">${escHtml(j.company)}</div>
    <div class="card-footer">
      <span class="salary ${salCls}">${sal || (j.source === 'LinkedIn' ? 'See on LinkedIn' : 'Not stated')}</span>
      <div class="card-meta">
        ${posted ? `<span class="posted">${posted}</span>` : ''}
        <span class="rank-num">#${i+1}</span>
      </div>
    </div>
    <div class="card-links">
      <a class="card-link" href="${escHtml(j.url)}" target="_blank" rel="noopener">
        ${j.source === 'LinkedIn' ? 'View on LinkedIn →' : 'View on MCF →'}
      </a>${j.urlAlt ? `<a class="card-link card-link-li" href="${escHtml(j.urlAlt)}" target="_blank" rel="noopener">LinkedIn →</a>` : ''}
    </div>
  </div>`;
  }).join('\n');

  const roleChips = Object.entries(roleCounts).sort((a,b) => b[1]-a[1]).map(([r,c]) => {
    const m = ROLE_META[r] || ROLE_META.OTHER;
    return `<button class="chip" data-filter="role" data-value="${r}" style="--chip-color:${m.color}">${m.label} <span class="chip-count">${c}</span></button>`;
  }).join('');

  const tierChips = Object.entries(tierCounts).sort((a,b) => b[1]-a[1]).map(([t,c]) => {
    const m = TIER_META[t] || TIER_META.other;
    return `<button class="chip" data-filter="tier" data-value="${t}" style="--chip-color:${m.color}">${m.label} <span class="chip-count">${c}</span></button>`;
  }).join('');

  const statsHtml = Object.entries(ROLE_META)
    .filter(([r]) => roleCounts[r])
    .map(([r,m]) => `<div class="stat"><span class="stat-num" style="color:${m.color}">${roleCounts[r]}</span><span class="stat-lbl">${m.label}</span></div>`)
    .join('<div class="stat-sep"></div>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SG Jobs — ${generated}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#070b14;color:#e2e8f0;min-height:100vh;padding:0 0 4rem}

/* topbar */
.topbar{background:#0d1520;border-bottom:1px solid #1e2d40;padding:.85rem 1.5rem;position:sticky;top:0;z-index:100;backdrop-filter:blur(8px)}
.topbar-inner{max-width:1400px;margin:0 auto;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.logo{font-size:1.05rem;font-weight:800;color:#f8fafc;white-space:nowrap}.logo span{color:#38bdf8}
.meta-pills{display:flex;gap:.4rem;flex-wrap:wrap}
.meta-pill{background:#152133;border:1px solid #1e3a5f;border-radius:999px;padding:.18rem .6rem;font-size:.7rem;color:#94a3b8}
.meta-pill.hl{border-color:#0ea5e9;color:#38bdf8}
.meta-pill.li{border-color:#0077b5;color:#60a5fa}
.meta-pill.mcf{border-color:#1d4ed8;color:#93c5fd}
.search-wrap{margin-left:auto}
#searchBox{background:#152133;border:1px solid #1e3a5f;border-radius:.5rem;padding:.4rem .75rem;color:#e2e8f0;font-size:.82rem;width:210px;outline:none}
#searchBox:focus{border-color:#38bdf8}

/* filters */
.filters{max-width:1400px;margin:1rem auto .25rem;padding:0 1.5rem}
.filter-row{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin-bottom:.5rem}
.filter-label{font-size:.68rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.06em;min-width:3.5rem}
.chip{background:#0d1520;border:1px solid #1e2d40;border-radius:999px;padding:.22rem .6rem;font-size:.72rem;color:#94a3b8;cursor:pointer;transition:all .12s;white-space:nowrap}
.chip:hover,.chip.active{border-color:var(--chip-color,#38bdf8);color:var(--chip-color,#38bdf8)}
.chip.active{background:color-mix(in srgb,var(--chip-color,#38bdf8) 12%,transparent);font-weight:700}
.chip-count{opacity:.55;font-size:.65rem}
.chip-all{--chip-color:#f8fafc}
.sal-filter{display:flex;align-items:center;gap:.5rem;font-size:.75rem}
.sal-filter label{color:#64748b}
#salSlider{width:110px;accent-color:#38bdf8}
#salVal{color:#38bdf8;font-weight:700;min-width:4rem}

/* stats */
.stats-bar{max-width:1400px;margin:.6rem auto;padding:0 1.5rem}
.stats-inner{background:#0d1520;border:1px solid #1e2d40;border-radius:.5rem;padding:.55rem 1rem;display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap}
.stat{display:flex;flex-direction:column;align-items:center;min-width:2.5rem}
.stat-num{font-size:1rem;font-weight:700;color:#f8fafc}
.stat-lbl{font-size:.6rem;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
.stat-sep{width:1px;height:1.75rem;background:#1e2d40}
.shown-count{font-size:.78rem;color:#94a3b8;margin-left:auto}
#shownNum{color:#f8fafc;font-weight:700}

/* grid */
.grid{max-width:1400px;margin:0 auto;padding:0 1.5rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(295px,1fr));gap:.9rem}
.no-results{text-align:center;padding:3rem;color:#475569;font-size:.9rem}

/* card */
.card{background:#0d1520;border:1px solid #1e2d40;border-radius:.85rem;padding:1rem 1.1rem .9rem;display:flex;flex-direction:column;gap:.45rem;transition:border-color .12s,transform .1s}
.card:hover{border-color:#1e3a5f;transform:translateY(-1px)}
.card.is-dream{border-color:#b45309;background:linear-gradient(135deg,#0d1520 75%,#1c1508)}
.card.is-dream:hover{border-color:#d97706}
.card.hidden{display:none!important}

.card-header{display:flex;gap:.35rem;align-items:center;flex-wrap:wrap}
.badge-role{border-radius:999px;padding:.12rem .5rem;font-size:.64rem;font-weight:700}
.badge-tier{font-size:.64rem;font-weight:600}
.badge-dream{background:#78350f;color:#fde68a;border-radius:999px;padding:.1rem .45rem;font-size:.64rem;font-weight:700}
/* source badges */
.badge-src{border-radius:999px;padding:.1rem .45rem;font-size:.63rem;font-weight:700}
.badge-li{background:#0a3d6b;color:#60a5fa;border:1px solid #0077b5}
.badge-mcf{background:#0a2d5e;color:#93c5fd;border:1px solid #1d4ed8}
.card-links{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.2rem}.card-link-li{border-color:#0e4a7a;color:#60a5fa}.card-link-li:hover{background:#0077b520;border-color:#0077b5}
.score-pill{margin-left:auto;font-size:.62rem;color:#334155}

.card-title{font-size:.88rem;font-weight:700;color:#f1f5f9;line-height:1.35}
.card-company{font-size:.75rem;color:#64748b;font-weight:500}
.card-footer{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-top:auto}
.salary{font-size:.76rem;font-weight:700}
.sal-premium{color:#4ade80}.sal-high{color:#34d399}.sal-mid{color:#60a5fa}.sal-low,.sal-unknown{color:#475569}
.card-meta{display:flex;gap:.4rem;align-items:center}
.posted{font-size:.67rem;color:#475569}
.rank-num{font-size:.62rem;color:#1e293b}
.card-link{display:inline-block;margin-top:.2rem;color:#38bdf8;font-size:.72rem;text-decoration:none;font-weight:600;border:1px solid #1e3a5f;border-radius:.4rem;padding:.22rem .55rem;align-self:flex-start;transition:all .1s}
.card-link:hover{background:#0ea5e920;border-color:#0ea5e9}

footer{max-width:1400px;margin:2rem auto 0;padding:0 1.5rem;font-size:.7rem;color:#334155}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-inner">
    <div class="logo">🔍 SG Jobs <span>Dashboard</span></div>
    <div class="meta-pills">
      <span class="meta-pill hl">${jobs.length} curated roles</span>
      <span class="meta-pill li">in LinkedIn: ${liCount}</span>
      <span class="meta-pill mcf">MCF: ${mcfCount}</span>
      <span class="meta-pill">$${MIN_SALARY.toLocaleString()}+/mo</span>
      <span class="meta-pill">${generated}</span>
    </div>
    <div class="search-wrap">
      <input id="searchBox" type="search" placeholder="Search title or company…" autocomplete="off">
    </div>
  </div>
</div>

<div class="filters">
  <div class="filter-row">
    <span class="filter-label">Role</span>
    <button class="chip chip-all active" data-filter="role" data-value="all">All</button>
    ${roleChips}
  </div>
  <div class="filter-row">
    <span class="filter-label">Tier</span>
    <button class="chip chip-all active" data-filter="tier" data-value="all">All</button>
    ${tierChips}
  </div>
  <div class="filter-row">
    <span class="filter-label">Source</span>
    <button class="chip chip-all active" data-filter="src" data-value="all" style="--chip-color:#f8fafc">All</button>
    <button class="chip" data-filter="src" data-value="MCF" style="--chip-color:#93c5fd">MCF (${mcfCount})</button>
    <button class="chip" data-filter="src" data-value="LinkedIn" style="--chip-color:#60a5fa">LinkedIn (${liCount})</button>
    ${bothCount ? `<button class="chip" data-filter="src" data-value="BOTH" style="--chip-color:#a78bfa">Both MCF+in (${bothCount})</button>` : ''}
    <button class="chip" data-filter="dream" data-value="dream" style="--chip-color:#fbbf24">⭐ Dream only</button>
  </div>
  <div class="filter-row">
    <span class="filter-label">Salary</span>
    <div class="sal-filter">
      <label for="salSlider">Min</label>
      <input id="salSlider" type="range" min="0" max="25000" step="1000" value="0">
      <span id="salVal">Any</span>
    </div>
  </div>
</div>

<div class="stats-bar">
  <div class="stats-inner">
    <div class="stat"><span class="stat-num" id="shownNum">${jobs.length}</span><span class="stat-lbl">Shown</span></div>
    <div class="stat-sep"></div>
    ${statsHtml}
    <div class="stat-sep"></div>
    ${Object.entries(TIER_META).filter(([t]) => tierCounts[t]).map(([t,m]) => `<div class="stat"><span class="stat-num" style="color:${m.color}">${tierCounts[t]}</span><span class="stat-lbl">${m.label.replace(/^[^ ]+ /,'')}</span></div>`).join('')}
  </div>
</div>

<div class="grid" id="grid">
${cards}
</div>
<div class="no-results hidden" id="noResults">No jobs match your current filters.</div>

<footer>
  Sources: MyCareersFuture.gov.sg &amp; LinkedIn · Pandian's Job Search ·
  Refresh: <code>node job-alerts/generate-dashboard.js</code> · ${generated}
</footer>

<script>
const grid      = document.getElementById('grid');
const cards     = Array.from(grid.querySelectorAll('.card'));
const noResults = document.getElementById('noResults');
const shownNum  = document.getElementById('shownNum');
const salSlider = document.getElementById('salSlider');
const salVal    = document.getElementById('salVal');
const searchBox = document.getElementById('searchBox');

let filters  = { role: 'all', tier: 'all', src: 'all', dream: false };
let minSal   = 0;
let searchQ  = '';

function apply() {
  let n = 0;
  for (const c of cards) {
    const ok =
      (filters.role  === 'all' || c.dataset.role    === filters.role) &&
      (filters.tier  === 'all' || c.dataset.tier    === filters.tier) &&
      (filters.src === 'all' || (filters.src === 'BOTH' ? c.dataset.src === 'BOTH' : (c.dataset.src === filters.src || c.dataset.src === 'BOTH'))) &&
      (!filters.dream          || c.classList.contains('is-dream'))   &&
      (minSal === 0 || !c.dataset.salmin || parseInt(c.dataset.salmin)||0 >= minSal) &&
      (!searchQ || c.dataset.title.toLowerCase().includes(searchQ) || c.dataset.company.toLowerCase().includes(searchQ));
    c.classList.toggle('hidden', !ok);
    if (ok) n++;
  }
  shownNum.textContent = n;
  noResults.classList.toggle('hidden', n > 0);
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const f = chip.dataset.filter, v = chip.dataset.value;
    if (f === 'dream') {
      filters.dream = !filters.dream;
      chip.classList.toggle('active', filters.dream);
    } else {
      filters[f] = v;
      document.querySelectorAll(\`.chip[data-filter="\${f}"]\`).forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    }
    apply();
  });
});

salSlider.addEventListener('input', () => {
  minSal = parseInt(salSlider.value);
  salVal.textContent = minSal ? '$' + minSal.toLocaleString() + '/mo' : 'Any';
  apply();
});

searchBox.addEventListener('input', () => {
  searchQ = searchBox.value.toLowerCase().trim();
  apply();
});
</script>
</body>
</html>`;
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
