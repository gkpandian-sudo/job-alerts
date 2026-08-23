#!/usr/bin/env node
// ============================================================
// TOL LANGIT Job Hunter
// Searches MyCareersFuture.gov.sg daily, sends last-24h roles
// ============================================================

require('dotenv').config();

const TELEGRAM_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = [process.env.TELEGRAM_CHAT_ID, process.env.TELEGRAM_GROUP_CHAT_ID].filter(Boolean);
const MAX_JOBS         = parseInt(process.env.MAX_JOBS   || '10');
const MIN_SALARY       = parseInt(process.env.MIN_SALARY || '14000');
const HOURS_BACK       = parseInt(process.env.HOURS_BACK || '24');

// ── Job searches ──────────────────────────────────────────────
const SEARCHES = [
  { label: 'Solution Architect',      q: 'solution architect',        weight: 12 },
  { label: 'PreSales',                q: 'presales',                  weight: 12 },
  { label: 'Technical Program Mgr',  q: 'technical program manager', weight: 11 },
  { label: 'Infrastructure Manager', q: 'infrastructure manager',    weight: 10 },
  { label: 'Security Architect',     q: 'security architect',        weight: 10 },
  { label: 'Cybersecurity Architect',q: 'cybersecurity architect',   weight: 10 },
  { label: 'Network Manager',        q: 'network manager',           weight:  9 },
  { label: 'Business Developer',     q: 'business developer',        weight:  9 },
];

// ── Title score boosts ────────────────────────────────────────
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

// ── Company boosts ────────────────────────────────────────────
const COMPANY_BOOSTS = {
  'amazon': 4, 'google': 4, 'microsoft': 4, 'netflix': 4,
  'nokia': 3, 'cisco': 3, 'telesat': 3, 'servicenow': 3,
  'cloudflare': 3, 'palo alto': 3, 'cato networks': 3,
  'mastercard': 2, 'ericsson': 2, 'juniper': 2, 'akamai': 2,
  'crowdstrike': 2, 'zscaler': 2,
};

// ── Dream role rules — 2-day consecutive alerts ───────────────
const DREAM_ROLE_RULES = [
  { company: 'google', terms: ['technical program manager', 'tpm', 'peering', 'edge', 'capacity', 'network'] },
];

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
  return (await res.json()).results || [];
}

// ── Dream role check ─────────────────────────────────────────
function isDreamRole(job) {
  const title   = (job.title || '').toLowerCase();
  const company = (job.postedCompany?.name || '').toLowerCase();
  return DREAM_ROLE_RULES.some(r =>
    company.includes(r.company) && r.terms.some(t => title.includes(t))
  );
}

// ── Scoring ───────────────────────────────────────────────────
function scoreJob(job, baseWeight) {
  const title   = (job.title || '').toLowerCase();
  const desc    = (job.description || '').replace(/<[^>]+>/g, '').toLowerCase();
  const company = (job.postedCompany?.name || '').toLowerCase();

  if (TITLE_EXCLUDES.some(t => title.includes(t))) return -1;

  let score = baseWeight;
  for (const { terms, boost } of TITLE_BOOSTS) {
    if (terms.some(t => title.includes(t))) score += boost;
    else if (terms.some(t => desc.includes(t))) score += Math.floor(boost / 2);
  }
  for (const [co, boost] of Object.entries(COMPANY_BOOSTS)) {
    if (company.includes(co)) { score += boost; break; }
  }

  const minSal = job.salary?.minimum || 0;
  const maxSal = job.salary?.maximum || 0;
  if (maxSal > 0 && maxSal < MIN_SALARY) return -1;
  if (minSal >= 20000) score += 4;
  else if (minSal >= 17000) score += 3;
  else if (minSal >= 14000) score += 2;
  else if (maxSal >= 14000) score += 1;

  return score;
}

// ── Filter to recent jobs ─────────────────────────────────────
function isRecent(job) {
  const posted = job.metadata?.newPostingDate || job.metadata?.originalPostingDate;
  if (!posted) return true;
  const ageHours = (Date.now() - new Date(posted).getTime()) / 3600000;
  return ageHours <= HOURS_BACK;
}

// ── Markdown-escape user-controlled text (Telegram legacy Markdown) ──
function esc(s) {
  return String(s || '').replace(/([_*`[\]])/g, '\\$1');
}

// ── Format one job line for the digest ────────────────────────
function formatJob(job, rank, isDream) {
  const title   = esc(job.title || 'Unknown role');
  const company = esc(job.postedCompany?.name || 'Unknown company');
  const minSal  = job.salary?.minimum;
  const maxSal  = job.salary?.maximum;
  const salStr  = minSal
    ? `$${minSal.toLocaleString()}–$${maxSal?.toLocaleString() || '?'}/mo`
    : 'salary not stated';
  const posted = job.metadata?.newPostingDate?.substring(0, 10) || '';
  const link   = `https://www.mycareersfuture.gov.sg/job/${job.uuid}`;
  const star   = isDream ? '⭐ ' : '';

  let msg = `${rank + 1}. ${star}*${title}*\n`;
  msg += `${company}${posted ? ` · posted ${posted}` : ''} · ${salStr}\n`;
  msg += `[Apply →](${link})`;
  return msg;
}

// ── Send Telegram (to every configured recipient) ──────────────
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

  const failed = [];
  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      for (const chunk of chunks) {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          }),
        });
        if (!resp.ok) throw new Error(await resp.text());
      }
    } catch (e) {
      failed.push(`${chatId} (${e.message})`);
    }
  }
  if (failed.length === TELEGRAM_CHAT_IDS.length) {
    throw new Error(`Telegram: every recipient failed — ${failed.join('; ')}`);
  }
  if (failed.length) console.error(`Telegram: ${failed.length} recipient(s) failed — ${failed.join('; ')}`);
}

// ── Main ──────────────────────────────────────────────────────
async function run() {
  console.log(`[${new Date().toISOString()}] Job Hunter started`);

  try {
    // ── Search MCF for today's jobs ───────────────────────────
    const searchResults = await Promise.all(
      SEARCHES.map(s =>
        searchMCF(s.q).then(jobs => ({ ...s, jobs })).catch(() => ({ ...s, jobs: [] }))
      )
    );

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

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, MAX_JOBS);

    const now = new Date();
    const prettyDate = now.toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore',
    });

    // ── Send daily digest ──────────────────────────────────────
    if (top.length === 0) {
      await sendTelegram(`*No new roles* — ${prettyDate}\nNothing posted in the last ${HOURS_BACK}h.`);
      console.log('No new jobs found in last 24h');
    } else {
      const roleWord = top.length === 1 ? 'role' : 'roles';
      let msg = `*${top.length} new ${roleWord}* · ${prettyDate}\n\n`;
      msg += top.map(({ job }, i) => formatJob(job, i, isDreamRole(job))).join('\n\n');
      msg += `\n\n—\n$${MIN_SALARY.toLocaleString()}+/mo · MyCareersFuture.gov.sg`;
      await sendTelegram(msg);
      console.log(`[${new Date().toISOString()}] Sent ${top.length} jobs`);
    }

  } catch (err) {
    console.error(`[${new Date().toISOString()}] FATAL:`, err.message);
    try { await sendTelegram(`⚠️ *Job hunter error*\n\`${err.message}\``); } catch {}
    process.exit(1);
  }
}

run();
