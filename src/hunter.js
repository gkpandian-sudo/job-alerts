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
const MIN_SALARY       = parseInt(process.env.MIN_SALARY || '8000');
const HOURS_BACK       = parseInt(process.env.HOURS_BACK || '48');

// ── Job searches — ordered by priority ───────────────────────
const SEARCHES = [
  { label: 'Solution Architect',   q: 'solution architect',          weight: 10 },
  { label: 'PreSales',             q: 'presales solution engineer',  weight: 10 },
  { label: 'Cybersecurity Arch',   q: 'cybersecurity architect',     weight: 10 },
  { label: 'Cyber PreSales',       q: 'cybersecurity presales',      weight:  9 },
  { label: 'Telco Architect',      q: 'telco network architect',     weight:  8 },
  { label: 'Cloud Architect',      q: 'cloud solution architect',    weight:  8 },
  { label: 'Security Consultant',  q: 'security consultant architect', weight: 7 },
];

// ── Boost score if these appear in title/description ─────────
const TITLE_BOOSTS = [
  { terms: ['presales', 'pre-sales', 'pre sales'], boost: 5 },
  { terms: ['solution architect', 'solutions architect'], boost: 5 },
  { terms: ['cybersecurity', 'cyber security'], boost: 4 },
  { terms: ['telco', 'telecom'], boost: 3 },
  { terms: ['senior', 'principal', 'lead'], boost: 2 },
  { terms: ['remote', 'hybrid'], boost: 1 },
];

// ── Skip if title contains these ─────────────────────────────
const TITLE_EXCLUDES = ['intern', 'internship', 'graduate', 'junior', 'entry level'];

// ── MCF API ──────────────────────────────────────────────────
async function searchMCF(query, limit = 30) {
  const url = new URL('https://api.mycareersfuture.gov.sg/v2/jobs');
  url.searchParams.set('search', query);
  url.searchParams.set('limit', limit);
  url.searchParams.set('sortBy', 'new_posting_date');
  url.searchParams.set('salary', MIN_SALARY);

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 Job-Alerts-Bot/1.0' },
  });
  if (!res.ok) throw new Error(`MCF API error: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

// ── Scoring ───────────────────────────────────────────────────
function scoreJob(job, baseWeight) {
  const titleLower = (job.title || '').toLowerCase();
  const descLower  = (job.description || '').replace(/<[^>]+>/g, '').toLowerCase();

  if (TITLE_EXCLUDES.some(t => titleLower.includes(t))) return -1;

  let score = baseWeight;
  for (const { terms, boost } of TITLE_BOOSTS) {
    if (terms.some(t => titleLower.includes(t))) score += boost;
    else if (terms.some(t => descLower.includes(t))) score += Math.floor(boost / 2);
  }

  // Salary bonus
  const minSal = job.salary?.minimum || 0;
  if (minSal >= 15000) score += 3;
  else if (minSal >= 10000) score += 2;
  else if (minSal >= 8000) score += 1;

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
