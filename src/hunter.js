#!/usr/bin/env node
// ============================================================
// TOL LANGIT Job Hunter
// Searches MyCareersFuture.gov.sg daily and sends new
// matching roles to Telegram
// ============================================================

require('dotenv').config();

const TELEGRAM_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_JOBS         = parseInt(process.env.MAX_JOBS || '10');
const MIN_SALARY       = parseInt(process.env.MIN_SALARY || '14000');
const HOURS_BACK       = parseInt(process.env.HOURS_BACK || '48');

// ── Job searches — tuned to Pandian's actual application history
// Using short queries that MCF search engine handles well
const SEARCHES = [
  { label: 'Solution Architect',       q: 'solution architect',          weight: 12 },
  { label: 'PreSales',                 q: 'presales',                    weight: 12 },
  { label: 'Technical Program Mgr',   q: 'technical program manager',   weight: 11 },
  { label: 'Infrastructure Manager',  q: 'infrastructure manager',      weight: 10 },
  { label: 'Security Architect',      q: 'security architect',          weight: 10 },
  { label: 'Cybersecurity Architect', q: 'cybersecurity architect',     weight: 10 },
  { label: 'Network Manager',         q: 'network manager',             weight:  9 },
  { label: 'Business Developer',      q: 'business developer',          weight:  9 },
];

// ── Boost score based on Pandian's interview-winning role types ─
const TITLE_BOOSTS = [
  { terms: ['technical program manager', 'technical pm', 'tpm'], boost: 6 },
  { terms: ['presales', 'pre-sales', 'pre sales', 'solution engineer'], boost: 6 },
  { terms: ['network', 'backbone', 'peering', 'interconnect'], boost: 5 },
  { terms: ['solution architect', 'solutions architect'], boost: 5 },
  { terms: ['business developer', 'business development'], boost: 5 },
  { terms: ['infrastructure', 'infra'], boost: 4 },
  { terms: ['cybersecurity', 'cyber security', 'security'], boost: 3 },
  { terms: ['telco', 'telecom'], boost: 3 },
  { terms: ['director', 'senior director', 'principal', 'head of'], boost: 3 },
  { terms: ['apac', 'asia pacific', 'singapore'], boost: 2 },
];

// ── Prioritise companies Pandian actively targets ─────────────
const COMPANY_BOOSTS = {
  'amazon': 4, 'google': 4, 'microsoft': 4, 'netflix': 4,
  'nokia': 3, 'cisco': 3, 'telesat': 3, 'servicenow': 3,
  'mastercard': 2, 'ericsson': 2, 'juniper': 2, 'akamai': 2,
  'crowdstrike': 2, 'zscaler': 2, 'palo alto': 1,
};

// ── Skip roles from companies with repeated rejections ────────
const COMPANY_EXCLUDES = ['cloudflare'];

// ── Skip if title contains these ─────────────────────────────
const TITLE_EXCLUDES = ['intern', 'internship', 'graduate', 'junior', 'entry level', 'fresh'];

// ── MCF API ──────────────────────────────────────────────────
async function searchMCF(query, limit = 30) {
  const url = new URL('https://api.mycareersfuture.gov.sg/v2/jobs');
  url.searchParams.set('search', query);
  url.searchParams.set('limit', limit);
  url.searchParams.set('sortBy', 'new_posting_date');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 Job-Alerts-Bot/1.0' },
  });
  if (!res.ok) throw new Error(`MCF API error: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

// ── Scoring ───────────────────────────────────────────────────
function scoreJob(job, baseWeight) {
  const titleLower   = (job.title || '').toLowerCase();
  const descLower    = (job.description || '').replace(/<[^>]+>/g, '').toLowerCase();
  const companyLower = (job.postedCompany?.name || '').toLowerCase();

  if (TITLE_EXCLUDES.some(t => titleLower.includes(t))) return -1;
  if (COMPANY_EXCLUDES.some(c => companyLower.includes(c))) return -1;

  let score = baseWeight;

  // Title boosts
  for (const { terms, boost } of TITLE_BOOSTS) {
    if (terms.some(t => titleLower.includes(t))) score += boost;
    else if (terms.some(t => descLower.includes(t))) score += Math.floor(boost / 2);
  }

  // Company boosts
  for (const [co, boost] of Object.entries(COMPANY_BOOSTS)) {
    if (companyLower.includes(co)) { score += boost; break; }
  }

  // Salary filter: only exclude if the MAX stated salary is below target
  // (unstated = keep; min below target but max above = keep)
  const minSal = job.salary?.minimum || 0;
  const maxSal = job.salary?.maximum || 0;
  if (maxSal > 0 && maxSal < MIN_SALARY) return -1;

  // Salary bonus for high earners
  if (minSal >= 20000) score += 4;
  else if (minSal >= 17000) score += 3;
  else if (minSal >= 14000) score += 2;
  else if (maxSal >= 14000) score += 1; // top of range hits target

  return score;
}

// ── Filter to recent jobs ─────────────────────────────────────
function isRecent(job) {
  const posted = job.metadata?.newPostingDate || job.metadata?.originalPostingDate;
  if (!posted) return true; // include if unknown
  const age = (Date.now() - new Date(posted).getTime()) / 3600000; // hours
  return age <= HOURS_BACK;
}

// ── Format one job for Telegram ───────────────────────────────
function formatJob(job, rank) {
  const title   = job.title || 'Unknown Role';
  const company = job.postedCompany?.name || 'Unknown Company';
  const minSal  = job.salary?.minimum;
  const maxSal  = job.salary?.maximum;
  const salStr  = minSal ? `$${minSal.toLocaleString()} – $${maxSal?.toLocaleString() || '?'}/mo` : '_Salary not stated_';
  const posted  = job.metadata?.newPostingDate?.substring(0, 10) || '';
  const link    = `https://www.mycareersfuture.gov.sg/job/${job.uuid}`;

  const nums = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const num  = nums[rank] || `${rank + 1}.`;

  let msg = `${num} *${title}*\n`;
  msg += `🏢 ${company}\n`;
  msg += `💰 ${salStr}\n`;
  if (posted) msg += `📅 ${posted}\n`;
  msg += `🔗 [View & Apply](${link})`;
  return msg;
}

// ── Send Telegram ─────────────────────────────────────────────
async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const chunks = [];
  let rem = text;
  while (rem.length > 4000) {
    let cut = rem.lastIndexOf('\n', 4000);
    if (cut === -1) cut = 4000;
    chunks.push(rem.slice(0, cut));
    rem = rem.slice(cut).trimStart();
  }
  if (rem) chunks.push(rem);

  for (const chunk of chunks) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: chunk,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    if (!resp.ok) throw new Error(`Telegram error: ${await resp.text()}`);
  }
}

// ── Main ──────────────────────────────────────────────────────
async function run() {
  console.log(`[${new Date().toISOString()}] Job Hunter started`);

  try {
    // Fetch all searches in parallel
    const searchResults = await Promise.all(
      SEARCHES.map(s => searchMCF(s.q).then(jobs => ({ ...s, jobs })).catch(() => ({ ...s, jobs: [] })))
    );

    // Merge, deduplicate by uuid, score
    const seen   = new Set();
    const scored = [];

    for (const { jobs, weight } of searchResults) {
      for (const job of jobs) {
        if (seen.has(job.uuid)) continue;
        seen.add(job.uuid);
        if (!isRecent(job)) continue;
        const score = scoreJob(job, weight);
        if (score < 0) continue;
        scored.push({ job, score });
      }
    }

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, MAX_JOBS);

    const now = new Date();
    const prettyDate = now.toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore',
    });

    if (top.length === 0) {
      await sendTelegram(`🔍 *Job Alert — ${prettyDate}*\n\n_No new matching roles in the last ${HOURS_BACK}h._`);
      console.log('No matching jobs found');
      return;
    }

    let msg = `🔍 *Job Alert — ${top.length} new roles*\n`;
    msg += `📅 ${prettyDate}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += top.map(({ job }, i) => formatJob(job, i)).join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');
    msg += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n_Source: MyCareersFuture.gov.sg · Min salary $${MIN_SALARY.toLocaleString()}/mo_`;

    await sendTelegram(msg);
    console.log(`[${new Date().toISOString()}] Sent ${top.length} jobs to Telegram`);

  } catch (err) {
    console.error(`[${new Date().toISOString()}] FATAL:`, err.message);
    try {
      await sendTelegram(`🚨 *Job Hunter Error*\n\`${err.message}\``);
    } catch {}
    process.exit(1);
  }
}

run();
