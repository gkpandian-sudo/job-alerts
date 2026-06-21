#!/usr/bin/env node
// ============================================================
// TOL LANGIT Job Hunter
// Searches MyCareersFuture.gov.sg daily, sends last-24h roles
// Dream roles get a 2-day consecutive reminder
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { isHighPriority, linkedinLinks } = require('./linkedin');

const TELEGRAM_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_JOBS         = parseInt(process.env.MAX_JOBS   || '10');
const MIN_SALARY       = parseInt(process.env.MIN_SALARY || '14000');
const HOURS_BACK       = parseInt(process.env.HOURS_BACK || '24');
const STATE_FILE       = path.join(__dirname, '../state/dream-roles.json');

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

// ── State: load / save dream roles seen ──────────────────────
function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { dreamRoles: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

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

// ── Format regular job for digest ────────────────────────────
function formatJob(job, rank, isDream, score = 0) {
  const title   = job.title || 'Unknown Role';
  const company = job.postedCompany?.name || 'Unknown Company';
  const minSal  = job.salary?.minimum;
  const maxSal  = job.salary?.maximum;
  const salStr  = minSal
    ? `$${minSal.toLocaleString()} – $${maxSal?.toLocaleString() || '?'}/mo`
    : '_Salary not stated_';
  const posted = job.metadata?.newPostingDate?.substring(0, 10) || '';
  const link   = `https://www.mycareersfuture.gov.sg/job/${job.uuid}`;
  const nums   = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

  let msg = isDream ? `🌟 *DREAM ROLE* 🌟\n` : '';
  msg += `${nums[rank] || rank + 1} *${title}*\n`;
  msg += `🏢 ${company}\n`;
  msg += `💰 ${salStr}\n`;
  if (posted) msg += `📅 ${posted}\n`;
  msg += `🔗 [View & Apply](${link})`;
  if (isHighPriority(job, score)) {
    const { recruiterUrl, postsUrl } = linkedinLinks(job);
    msg += `\n👔 [Find Recruiter](${recruiterUrl}) · 🔍 [LinkedIn Posts](${postsUrl})`;
  }
  return msg;
}

// ── Dream role alert — attractive 2-day reminder ──────────────
function formatDreamAlert(job, dayNum) {
  const title   = job.title || 'Unknown Role';
  const company = job.postedCompany?.name || 'Unknown Company';
  const minSal  = job.salary?.minimum;
  const maxSal  = job.salary?.maximum;
  const salStr  = minSal
    ? `$${minSal.toLocaleString()} – $${maxSal?.toLocaleString() || '?'}/mo`
    : 'Not stated';
  const posted = job.metadata?.newPostingDate?.substring(0, 10) || '';
  const link   = `https://www.mycareersfuture.gov.sg/job/${job.uuid}`;

  const dayLabel  = dayNum === 1 ? '🔴 DAY 1 of 2 — Act Today!'  : '🆘 DAY 2 of 2 — Last Chance!';
  const urgency   = dayNum === 1 ? 'Posted fresh. Apply before the rush.' : 'Final reminder. Do not let this slip.';
  const dayBorder = dayNum === 1
    ? '🔥═══════════════════🔥'
    : '🆘═══════════════════🆘';

  const { recruiterUrl, postsUrl } = linkedinLinks(job);

  return (
    `╔${dayBorder}╗\n` +
    `        🎯 *DREAM ROLE ALERT*\n` +
    `╚${dayBorder}╝\n\n` +
    `⭐ *${title}*\n` +
    `🏢 *${company}*\n` +
    `💰 ${salStr}\n` +
    `📅 Posted: ${posted}\n\n` +
    `${dayLabel}\n` +
    `_${urgency}_\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👔 [Find Recruiter](${recruiterUrl}) · 🔍 [LinkedIn Posts](${postsUrl})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚀 *[APPLY NOW](${link})*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `_Matches your Google TPM · Edge · Peering profile_`
  );
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
    const state = loadState();
    const today = new Date().toISOString().substring(0, 10);

    // ── 1. Re-alert dream roles from yesterday (day 2 reminder) ─
    const dayTwoReminders = state.dreamRoles.filter(r => r.firstSeenDate !== today);
    for (const r of dayTwoReminders) {
      await sendTelegram(formatDreamAlert(r.job, 2));
      console.log(`Day-2 reminder sent: ${r.job.title}`);
    }

    // ── 2. Search MCF for today's jobs ───────────────────────────
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

    // ── 3. Send daily digest ──────────────────────────────────────
    if (top.length === 0) {
      await sendTelegram(`🔍 *Job Alert — ${prettyDate}*\n\n_No new roles posted in the last ${HOURS_BACK}h._`);
      console.log('No new jobs found in last 24h');
    } else {
      const dreamUuids = new Set(state.dreamRoles.map(r => r.job.uuid));
      let msg = `🔍 *${top.length} fresh roles — last 24h*\n`;
      msg += `📅 ${prettyDate}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += top.map(({ job, score }, i) => formatJob(job, i, isDreamRole(job), score)).join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');
      msg += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n_MyCareersFuture.gov.sg · $${MIN_SALARY.toLocaleString()}+/mo · last 24h only_`;
      await sendTelegram(msg);

      // ── 4. Send day-1 dream role alerts for new finds ───────────
      const newDreams = top
        .filter(({ job }) => isDreamRole(job) && !dreamUuids.has(job.uuid));

      for (const { job } of newDreams) {
        await sendTelegram(formatDreamAlert(job, 1));
        console.log(`Day-1 dream alert sent: ${job.title}`);
      }

      // ── 5. Update state — keep only today's dreams ───────────────
      // Remove yesterday's (already sent day-2), add today's new ones
      state.dreamRoles = [
        ...state.dreamRoles.filter(r => r.firstSeenDate === today), // already found today
        ...newDreams.map(({ job }) => ({ uuid: job.uuid, firstSeenDate: today, job: {
          uuid: job.uuid,
          title: job.title,
          postedCompany: job.postedCompany,
          salary: job.salary,
          metadata: { newPostingDate: job.metadata?.newPostingDate },
        }})),
      ];
      saveState(state);

      console.log(`[${new Date().toISOString()}] Sent ${top.length} jobs · ${newDreams.length} day-1 dream · ${dayTwoReminders.length} day-2 reminder`);
    }

  } catch (err) {
    console.error(`[${new Date().toISOString()}] FATAL:`, err.message);
    try { await sendTelegram(`🚨 *Job Hunter Error*\n\`${err.message}\``); } catch {}
    process.exit(1);
  }
}

run();
