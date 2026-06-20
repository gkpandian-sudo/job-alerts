#!/usr/bin/env node
// ============================================================
// TOL LANGIT Job Fetch — On-demand CLI
// Usage: node src/fetch.js [options]
//   --salary 15000   minimum salary (default: 15000)
//   --limit  10      max results    (default: 10)
//   --hours  24      recency window (default: 24)
//   --all            ignore recency filter (show all matching)
//   --telegram       also push results to Telegram
// ============================================================

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const args    = process.argv.slice(2);
const flag    = (name, def) => { const i = args.indexOf(name); return i !== -1 && args[i+1] ? args[i+1] : def; };
const hasFlag = name => args.includes(name);

const MIN_SALARY    = parseInt(flag('--salary', process.env.MIN_SALARY || '15000'));
const MAX_JOBS      = parseInt(flag('--limit',  process.env.MAX_JOBS   || '10'));
const HOURS_BACK    = hasFlag('--all') ? Infinity : parseInt(flag('--hours', process.env.HOURS_BACK || '24'));
const SEND_TELEGRAM = hasFlag('--telegram');

const TELEGRAM_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── Searches ──────────────────────────────────────────────────
const SEARCHES = [
  { label: 'Solution Architect',      q: 'solution architect',        weight: 12 },
  { label: 'PreSales',                q: 'presales',                  weight: 12 },
  { label: 'Technical Program Mgr',   q: 'technical program manager', weight: 11 },
  { label: 'Infrastructure Manager',  q: 'infrastructure manager',    weight: 10 },
  { label: 'Security Architect',      q: 'security architect',        weight: 10 },
  { label: 'Cybersecurity Architect', q: 'cybersecurity architect',   weight: 10 },
  { label: 'Network Manager',         q: 'network manager',           weight:  9 },
  { label: 'Business Developer',      q: 'business developer',        weight:  9 },
];

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

const COMPANY_BOOSTS = {
  'amazon': 4, 'google': 4, 'microsoft': 4, 'netflix': 4,
  'nokia': 3, 'cisco': 3, 'telesat': 3, 'servicenow': 3,
  'cloudflare': 3, 'palo alto': 3, 'cato networks': 3,
  'mastercard': 2, 'ericsson': 2, 'juniper': 2, 'akamai': 2,
  'crowdstrike': 2, 'zscaler': 2,
};

const DREAM_RULES = [
  { company: 'google', terms: ['technical program manager', 'tpm', 'peering', 'edge', 'capacity', 'network'] },
];

const TITLE_EXCLUDES = ['intern', 'internship', 'graduate', 'junior', 'entry level', 'fresh'];

// ── MCF API ───────────────────────────────────────────────────
async function searchMCF(query, limit = 30) {
  const url = new URL('https://api.mycareersfuture.gov.sg/v2/jobs');
  url.searchParams.set('search', query);
  url.searchParams.set('limit', limit);
  url.searchParams.set('sortBy', 'new_posting_date');
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 Job-Alerts-Bot/1.0' },
  });
  if (!res.ok) throw new Error(`MCF API ${res.status}`);
  return (await res.json()).results || [];
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
  else if (minSal >= 15000) score += 2;
  else if (maxSal >= MIN_SALARY) score += 1;
  return score;
}

function isRecent(job) {
  if (HOURS_BACK === Infinity) return true;
  const posted = job.metadata?.newPostingDate || job.metadata?.originalPostingDate;
  if (!posted) return true;
  return (Date.now() - new Date(posted).getTime()) / 3600000 <= HOURS_BACK;
}

function isDream(job) {
  const title   = (job.title || '').toLowerCase();
  const company = (job.postedCompany?.name || '').toLowerCase();
  return DREAM_RULES.some(r => company.includes(r.company) && r.terms.some(t => title.includes(t)));
}

// ── Web output ────────────────────────────────────────────────
function saveWebOutput(top, totalMatches, meta) {
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      salaryMin: meta.salaryMin,
      recencyLabel: meta.recencyLabel,
      totalMatches,
      showing: top.length,
    },
    jobs: top.map(({ job, score }, i) => ({
      rank: i + 1,
      score,
      isDream: isDream(job),
      title:   job.title || 'Unknown Role',
      company: job.postedCompany?.name || 'Unknown Company',
      salaryMin: job.salary?.minimum || null,
      salaryMax: job.salary?.maximum || null,
      postedDate: job.metadata?.newPostingDate?.substring(0, 10) || null,
      url: `https://www.mycareersfuture.gov.sg/job/${job.uuid}`,
    })),
  };

  fs.writeFileSync(path.join(PUBLIC_DIR, 'jobs.json'), JSON.stringify(payload, null, 2));

  const html = buildHtml(payload);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), html);
  console.log(`  ✓ Web report saved → ${path.join(PUBLIC_DIR, 'index.html')}\n`);
}

function buildHtml(payload) {
  const { meta, jobs } = payload;
  const generated = new Date(meta.generatedAt).toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore',
  }) + ' SGT';

  const cards = jobs.map(j => {
    const sal = j.salaryMin
      ? `$${j.salaryMin.toLocaleString()} – $${j.salaryMax?.toLocaleString() ?? '?'}/mo`
      : 'Salary not stated';
    const dreamBadge = j.isDream
      ? `<span class="badge dream">⭐ Dream</span>` : '';
    const salClass = j.salaryMin >= 20000 ? 'sal-high' : j.salaryMin >= 15000 ? 'sal-mid' : 'sal-low';
    return `
    <a class="card${j.isDream ? ' is-dream' : ''}" href="${j.url}" target="_blank" rel="noopener">
      <div class="card-top">
        <span class="rank">#${j.rank}</span>
        ${dreamBadge}
        <span class="score">score ${j.score}</span>
      </div>
      <div class="title">${escHtml(j.title)}</div>
      <div class="company">${escHtml(j.company)}</div>
      <div class="meta-row">
        <span class="salary ${salClass}">${sal}</span>
        ${j.postedDate ? `<span class="posted">${j.postedDate}</span>` : ''}
      </div>
    </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Job Hunt — ${generated}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; padding: 1.5rem 1rem 3rem; }
  header { max-width: 860px; margin: 0 auto 1.5rem; }
  h1 { font-size: 1.4rem; font-weight: 700; color: #f8fafc; }
  .subtitle { font-size: 0.85rem; color: #94a3b8; margin-top: .35rem; }
  .pill { display: inline-block; background: #1e293b; border: 1px solid #334155; border-radius: 999px; padding: .15rem .6rem; font-size: .75rem; margin-right: .35rem; }
  .grid { max-width: 860px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 1rem; }
  .card { display: block; background: #1e293b; border: 1px solid #334155; border-radius: .75rem; padding: 1rem 1.1rem; text-decoration: none; color: inherit; transition: border-color .15s, box-shadow .15s; }
  .card:hover { border-color: #60a5fa; box-shadow: 0 0 0 2px #1d4ed820; }
  .card.is-dream { border-color: #f59e0b; background: #1c1a10; }
  .card.is-dream:hover { border-color: #fbbf24; box-shadow: 0 0 0 2px #78350f40; }
  .card-top { display: flex; align-items: center; gap: .4rem; margin-bottom: .55rem; }
  .rank { font-size: .75rem; color: #64748b; font-weight: 600; }
  .score { font-size: .7rem; color: #64748b; margin-left: auto; }
  .badge { font-size: .7rem; font-weight: 700; padding: .1rem .45rem; border-radius: 999px; }
  .badge.dream { background: #78350f; color: #fde68a; }
  .title { font-size: .95rem; font-weight: 600; color: #f1f5f9; line-height: 1.35; margin-bottom: .3rem; }
  .company { font-size: .78rem; color: #94a3b8; margin-bottom: .55rem; }
  .meta-row { display: flex; align-items: center; justify-content: space-between; gap: .5rem; font-size: .75rem; }
  .salary { font-weight: 600; }
  .sal-high { color: #4ade80; }
  .sal-mid  { color: #60a5fa; }
  .sal-low  { color: #94a3b8; }
  .posted { color: #64748b; }
  footer { max-width: 860px; margin: 2rem auto 0; font-size: .75rem; color: #475569; }
</style>
</head>
<body>
<header>
  <h1>🔍 Job Hunt</h1>
  <div class="subtitle">
    <span class="pill">$${meta.salaryMin.toLocaleString()}+/mo</span>
    <span class="pill">${meta.recencyLabel}</span>
    <span class="pill">${meta.showing} of ${meta.totalMatches} matches</span>
    <span class="pill">Generated ${generated}</span>
  </div>
</header>
<div class="grid">
${cards}
</div>
<footer>Source: MyCareersFuture · Refresh by running <code>node src/fetch.js</code></footer>
</body>
</html>`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Telegram send ─────────────────────────────────────────────
async function sendTelegram(text) {
  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());
}

// ── Main ──────────────────────────────────────────────────────
async function run() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore',
  });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' });

  const recencyLabel = HOURS_BACK === Infinity ? 'all time' : `last ${HOURS_BACK}h`;
  console.log(`\n🔍  Job Hunt  —  ${dateStr}  ${timeStr} SGT`);
  console.log(`    Salary $${MIN_SALARY.toLocaleString()}+/mo  ·  ${recencyLabel}  ·  top ${MAX_JOBS}`);
  console.log('─'.repeat(52));

  process.stdout.write('  Searching MCF');
  const results = await Promise.all(
    SEARCHES.map(s =>
      searchMCF(s.q)
        .then(jobs => { process.stdout.write('.'); return { ...s, jobs }; })
        .catch(() => { process.stdout.write('!'); return { ...s, jobs: [] }; })
    )
  );
  console.log(' done\n');

  const seen   = new Set();
  const scored = [];
  for (const { jobs, weight } of results) {
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

  if (top.length === 0) {
    console.log(`  No $${MIN_SALARY.toLocaleString()}+ roles found (${recencyLabel}).\n`);
    saveWebOutput([], 0, { salaryMin: MIN_SALARY, recencyLabel });
    return;
  }

  top.forEach(({ job, score }, i) => {
    const title   = job.title || 'Unknown Role';
    const company = job.postedCompany?.name || 'Unknown Company';
    const minSal  = job.salary?.minimum;
    const maxSal  = job.salary?.maximum;
    const salStr  = minSal ? `$${minSal.toLocaleString()} – $${maxSal?.toLocaleString() || '?'}` : 'Salary not stated';
    const posted  = job.metadata?.newPostingDate?.substring(0, 10) || '';
    const link    = `https://www.mycareersfuture.gov.sg/job/${job.uuid}`;
    const dream   = isDream(job) ? ' ⭐ DREAM' : '';

    console.log(`${i + 1}.${dream} ${title}`);
    console.log(`   ${company}`);
    console.log(`   ${salStr}/mo  ·  ${posted}  ·  score ${score}`);
    console.log(`   ${link}\n`);
  });

  console.log('─'.repeat(52));
  console.log(`  ${top.length} of ${scored.length} matches shown\n`);

  // ── Save web output ───────────────────────────────────────────
  saveWebOutput(top, scored.length, { salaryMin: MIN_SALARY, recencyLabel });

  // ── Optional Telegram push ────────────────────────────────────
  if (SEND_TELEGRAM) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('  ✗ --telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set\n');
      return;
    }
    const nums = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    let msg = `🔍 *${top.length} roles — on-demand*\n📅 ${dateStr} ${timeStr} SGT\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += top.map(({ job }, i) => {
      const title   = job.title || 'Unknown';
      const company = job.postedCompany?.name || '';
      const minSal  = job.salary?.minimum;
      const maxSal  = job.salary?.maximum;
      const salStr  = minSal ? `$${minSal.toLocaleString()} – $${maxSal?.toLocaleString() || '?'}/mo` : '_Not stated_';
      const posted  = job.metadata?.newPostingDate?.substring(0, 10) || '';
      const link    = `https://www.mycareersfuture.gov.sg/job/${job.uuid}`;
      const dreamStr = isDream(job) ? `🌟 *DREAM ROLE*\n` : '';
      return `${dreamStr}${nums[i] || i+1} *${title}*\n🏢 ${company}\n💰 ${salStr}\n${posted ? `📅 ${posted}\n` : ''}🔗 [Apply](${link})`;
    }).join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');
    msg += `\n\n_$${MIN_SALARY.toLocaleString()}+/mo · ${recencyLabel} · MyCareersFuture_`;

    try {
      await sendTelegram(msg);
      console.log('  ✓ Sent to Telegram\n');
    } catch (e) {
      console.error(`  ✗ Telegram failed: ${e.message}\n`);
    }
  }
}

run().catch(err => { console.error('\nError:', err.message); process.exit(1); });
