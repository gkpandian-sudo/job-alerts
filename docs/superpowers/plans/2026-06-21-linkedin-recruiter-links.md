# LinkedIn Recruiter Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For every job at a hyperscaler (Amazon/Google/Microsoft/Netflix) or scoring ≥ 22, surface two LinkedIn-related links — a recruiter people search and a Google `site:linkedin.com` post search — in the terminal output, web card, and Telegram messages.

**Architecture:** A new shared module `src/linkedin.js` owns the `isHighPriority` predicate and `linkedinLinks` URL builder. Both `fetch.js` and `hunter.js` require it and call the two functions at their respective output touch points. No external API calls — both outputs are pre-built URLs the user opens manually.

**Tech Stack:** Node.js ≥ 18, `node:test` (built-in), no new dependencies.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/linkedin.js` | `isHighPriority()` + `linkedinLinks()` |
| Create | `tests/linkedin.test.js` | Unit tests for both functions |
| Modify | `src/fetch.js` | Terminal output, web card, Telegram block |
| Modify | `src/hunter.js` | `formatJob`, `formatDreamAlert` |

---

## Task 1: Create `src/linkedin.js` with unit tests (TDD)

**Files:**
- Create: `tests/linkedin.test.js`
- Create: `src/linkedin.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/linkedin.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isHighPriority, linkedinLinks } = require('../src/linkedin');

test('isHighPriority: hyperscaler qualifies at any score', () => {
  const job = { postedCompany: { name: 'GOOGLE ASIA PACIFIC PTE. LTD.' }, title: 'SWE' };
  assert.equal(isHighPriority(job, 10), true);
});

test('isHighPriority: amazon qualifies at any score', () => {
  const job = { postedCompany: { name: 'AMAZON WEB SERVICES SINGAPORE PRIVATE LIMITED' }, title: 'SA' };
  assert.equal(isHighPriority(job, 5), true);
});

test('isHighPriority: microsoft qualifies at any score', () => {
  const job = { postedCompany: { name: 'MICROSOFT OPERATIONS PTE LTD' }, title: 'PM' };
  assert.equal(isHighPriority(job, 8), true);
});

test('isHighPriority: netflix qualifies at any score', () => {
  const job = { postedCompany: { name: 'Netflix Singapore' }, title: 'Engineer' };
  assert.equal(isHighPriority(job, 9), true);
});

test('isHighPriority: score >= 22 qualifies non-hyperscaler', () => {
  const job = { postedCompany: { name: 'Accenture' }, title: 'Solution Architect' };
  assert.equal(isHighPriority(job, 22), true);
});

test('isHighPriority: score 21 non-hyperscaler does not qualify', () => {
  const job = { postedCompany: { name: 'Accenture' }, title: 'Solution Architect' };
  assert.equal(isHighPriority(job, 21), false);
});

test('isHighPriority: missing postedCompany does not throw', () => {
  const job = { title: 'SA' };
  assert.equal(isHighPriority(job, 10), false);
});

test('linkedinLinks: recruiterUrl targets LinkedIn people search', () => {
  const job = { postedCompany: { name: 'Google' }, title: 'TPM' };
  const { recruiterUrl } = linkedinLinks(job);
  assert.ok(recruiterUrl.startsWith('https://www.linkedin.com/search/results/people/'));
  assert.ok(recruiterUrl.includes('Google'));
  assert.ok(recruiterUrl.includes('recruiter'));
  assert.ok(recruiterUrl.includes('Singapore'));
});

test('linkedinLinks: postsUrl targets Google site:linkedin.com', () => {
  const job = { postedCompany: { name: 'Google' }, title: 'TPM' };
  const { postsUrl } = linkedinLinks(job);
  assert.ok(postsUrl.startsWith('https://www.google.com/search?q='));
  assert.ok(postsUrl.toLowerCase().includes('linkedin.com'));
  assert.ok(postsUrl.includes('Google'));
  assert.ok(postsUrl.includes('TPM'));
  assert.ok(postsUrl.includes('Singapore'));
});

test('linkedinLinks: special characters in company name are URL-encoded', () => {
  const job = { postedCompany: { name: 'Palo Alto Networks' }, title: 'Security Architect' };
  const { recruiterUrl, postsUrl } = linkedinLinks(job);
  assert.ok(!recruiterUrl.includes(' '));
  assert.ok(!postsUrl.includes(' '));
});
```

- [ ] **Step 2: Run to confirm all tests fail**

```
node --test tests/linkedin.test.js
```

Expected: Error — `Cannot find module '../src/linkedin'`

- [ ] **Step 3: Implement `src/linkedin.js`**

Create `src/linkedin.js`:

```js
const HYPERSCALERS = ['amazon', 'google', 'microsoft', 'netflix'];
const SCORE_THRESHOLD = 22;

function isHighPriority(job, score) {
  const company = (job.postedCompany?.name || '').toLowerCase();
  return HYPERSCALERS.some(h => company.includes(h)) || score >= SCORE_THRESHOLD;
}

function linkedinLinks(job) {
  const company = job.postedCompany?.name || '';
  const title   = job.title || '';
  const recruiterUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company + ' recruiter Singapore')}`;
  const postsUrl     = `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com "${company}" "${title}" Singapore`)}`;
  return { recruiterUrl, postsUrl };
}

module.exports = { isHighPriority, linkedinLinks };
```

- [ ] **Step 4: Run tests to confirm all pass**

```
node --test tests/linkedin.test.js
```

Expected: `# tests 11`, `# pass 11`, `# fail 0`

- [ ] **Step 5: Add test script to `package.json`**

In `package.json`, add to `"scripts"`:
```json
"test": "node --test tests/**/*.test.js"
```

- [ ] **Step 6: Commit**

```bash
git add src/linkedin.js tests/linkedin.test.js package.json
git commit -m "feat: add linkedin.js with isHighPriority and linkedinLinks"
```

---

## Task 2: Wire `fetch.js` — terminal output

**Files:**
- Modify: `src/fetch.js` (lines 1–14 for require, lines 295–309 for forEach block)

- [ ] **Step 1: Add require at the top of `fetch.js`**

After line 14 (`const path = require('path');`), insert:

```js
const { isHighPriority, linkedinLinks } = require('./linkedin');
```

- [ ] **Step 2: Update the `top.forEach` block**

Replace lines 295–309 (the `top.forEach` block):

```js
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
  console.log(`   ${link}`);
  if (isHighPriority(job, score)) {
    const { recruiterUrl, postsUrl } = linkedinLinks(job);
    console.log(`   👔 Recruiter: ${recruiterUrl}`);
    console.log(`   🔍 LI Posts:  ${postsUrl}`);
  }
  console.log('');
});
```

- [ ] **Step 3: Manual smoke test**

```
node src/fetch.js --all --limit 5 --salary 8000
```

Expected: High-scoring jobs (Google TPM, AWS TPM, Microsoft TPM) show two extra lines:
```
   👔 Recruiter: https://www.linkedin.com/search/results/people/?keywords=...
   🔍 LI Posts:  https://www.google.com/search?q=site%3Alinkedin.com...
```
Lower-scoring non-hyperscaler jobs show no extra lines.

- [ ] **Step 4: Commit**

```bash
git add src/fetch.js
git commit -m "feat(fetch): show recruiter links in terminal for high-priority jobs"
```

---

## Task 3: Wire `fetch.js` — web card

**Files:**
- Modify: `src/fetch.js` (`saveWebOutput` function ~line 122, `buildHtml` function ~line 152)

- [ ] **Step 1: Extend job payload in `saveWebOutput`**

In the `saveWebOutput` function, replace the `jobs:` array builder (lines ~132–142):

```js
jobs: top.map(({ job, score }, i) => {
  const highPri = isHighPriority(job, score);
  const links   = highPri ? linkedinLinks(job) : null;
  return {
    rank: i + 1,
    score,
    isDream:      isDream(job),
    isHighPriority: highPri,
    recruiterUrl: links?.recruiterUrl || null,
    postsUrl:     links?.postsUrl     || null,
    title:   job.title || 'Unknown Role',
    company: job.postedCompany?.name || 'Unknown Company',
    salaryMin: job.salary?.minimum || null,
    salaryMax: job.salary?.maximum || null,
    postedDate: job.metadata?.newPostingDate?.substring(0, 10) || null,
    url: `https://www.mycareersfuture.gov.sg/job/${job.uuid}`,
  };
}),
```

- [ ] **Step 2: Add CSS for LinkedIn buttons**

In `buildHtml`, inside the `<style>` block, append before the closing `</style>`:

```css
  .li-links { display: flex; gap: .4rem; margin-top: .65rem; flex-wrap: wrap; }
  .li-btn { font-size: .7rem; padding: .2rem .55rem; border-radius: .35rem; border: 1px solid #334155; color: #60a5fa; text-decoration: none; background: #0f172a; transition: border-color .15s, color .15s; white-space: nowrap; }
  .li-btn:hover { border-color: #60a5fa; color: #93c5fd; }
  .li-btn.li-dream { border-color: #78350f; color: #fbbf24; background: #1c1510; }
  .li-btn.li-dream:hover { border-color: #f59e0b; color: #fde68a; }
```

- [ ] **Step 3: Add LinkedIn buttons to card template**

In `buildHtml`, inside the `cards` map, after the `.meta-row` div and before the closing `</a>`, insert:

```js
const liClass = j.isDream ? ' li-dream' : '';
const liButtons = j.recruiterUrl ? `
      <div class="li-links">
        <a class="li-btn${liClass}" href="${j.recruiterUrl}" target="_blank" rel="noopener">👔 Find Recruiter</a>
        <a class="li-btn${liClass}" href="${j.postsUrl}" target="_blank" rel="noopener">🔍 LinkedIn Posts</a>
      </div>` : '';
```

Then add `${liButtons}` to the card return string, just before the closing `</a>`:

```js
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
      ${liButtons}
    </a>
```

- [ ] **Step 4: Manual smoke test**

```
node src/fetch.js --all --limit 10 --salary 8000
```

Then open `public/index.html` in a browser. Verify:
- Google/Amazon/Microsoft cards show amber or blue "👔 Find Recruiter" and "🔍 LinkedIn Posts" buttons
- Clicking "Find Recruiter" opens a LinkedIn people search in a new tab
- Clicking "LinkedIn Posts" opens a Google search in a new tab
- Low-scoring non-hyperscaler cards show no buttons

- [ ] **Step 5: Commit**

```bash
git add src/fetch.js public/index.html public/jobs.json
git commit -m "feat(fetch): add recruiter buttons to web cards for high-priority jobs"
```

---

## Task 4: Wire `fetch.js` — Telegram block

**Files:**
- Modify: `src/fetch.js` (Telegram section of `run()`, ~lines 322–337)

- [ ] **Step 1: Update the Telegram message builder**

In the `run()` function, find the optional Telegram section (inside `if (SEND_TELEGRAM)`). Replace the `top.map` call that builds the message body:

```js
msg += top.map(({ job, score }, i) => {
  const title   = job.title || 'Unknown';
  const company = job.postedCompany?.name || '';
  const minSal  = job.salary?.minimum;
  const maxSal  = job.salary?.maximum;
  const salStr  = minSal ? `$${minSal.toLocaleString()} – $${maxSal?.toLocaleString() || '?'}/mo` : '_Not stated_';
  const posted  = job.metadata?.newPostingDate?.substring(0, 10) || '';
  const link    = `https://www.mycareersfuture.gov.sg/job/${job.uuid}`;
  const dreamStr = isDream(job) ? `🌟 *DREAM ROLE*\n` : '';
  let entry = `${dreamStr}${nums[i] || i+1} *${title}*\n🏢 ${company}\n💰 ${salStr}\n${posted ? `📅 ${posted}\n` : ''}🔗 [Apply](${link})`;
  if (isHighPriority(job, score)) {
    const { recruiterUrl, postsUrl } = linkedinLinks(job);
    entry += `\n👔 [Find Recruiter](${recruiterUrl}) · 🔍 [LinkedIn Posts](${postsUrl})`;
  }
  return entry;
}).join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');
```

- [ ] **Step 2: Manual smoke test (if Telegram credentials are available)**

```
node src/fetch.js --all --limit 5 --salary 8000 --telegram
```

Expected: Telegram message for high-priority jobs includes the recruiter line. If no credentials, skip — the change is structurally identical to Task 2 and visually verifiable from the string built.

- [ ] **Step 3: Commit**

```bash
git add src/fetch.js
git commit -m "feat(fetch): append recruiter links in Telegram message for high-priority jobs"
```

---

## Task 5: Wire `hunter.js` — `formatJob`

**Files:**
- Modify: `src/hunter.js` (top require, `formatJob` signature ~line 136, call site ~line 273)

- [ ] **Step 1: Add require at the top of `hunter.js`**

After line 8 (`require('dotenv').config();`), insert:

```js
const { isHighPriority, linkedinLinks } = require('./linkedin');
```

- [ ] **Step 2: Add `score` parameter to `formatJob`**

Change the function signature at line 136 from:

```js
function formatJob(job, rank, isDream) {
```

to:

```js
function formatJob(job, rank, isDream, score = 0) {
```

- [ ] **Step 3: Append recruiter line inside `formatJob`**

At the end of `formatJob`, before `return msg;`, insert:

```js
  if (isHighPriority(job, score)) {
    const { recruiterUrl, postsUrl } = linkedinLinks(job);
    msg += `\n👔 [Find Recruiter](${recruiterUrl}) · 🔍 [LinkedIn Posts](${postsUrl})`;
  }
```

So the full end of `formatJob` reads:

```js
  msg += `🔗 [View & Apply](${link})`;
  if (isHighPriority(job, score)) {
    const { recruiterUrl, postsUrl } = linkedinLinks(job);
    msg += `\n👔 [Find Recruiter](${recruiterUrl}) · 🔍 [LinkedIn Posts](${postsUrl})`;
  }
  return msg;
```

- [ ] **Step 4: Pass `score` at the `formatJob` call site**

In `run()`, find line ~273:

```js
msg += top.map(({ job }, i) => formatJob(job, i, isDreamRole(job))).join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');
```

Replace with:

```js
msg += top.map(({ job, score }, i) => formatJob(job, i, isDreamRole(job), score)).join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');
```

- [ ] **Step 5: Commit**

```bash
git add src/hunter.js
git commit -m "feat(hunter): append recruiter links in daily digest for high-priority jobs"
```

---

## Task 6: Wire `hunter.js` — `formatDreamAlert`

**Files:**
- Modify: `src/hunter.js` (`formatDreamAlert` function ~lines 158–190)

- [ ] **Step 1: Insert recruiter links above the APPLY NOW button**

Dream roles always qualify. In `formatDreamAlert`, find the return block and insert the recruiter line between the urgency separator and the APPLY NOW line:

```js
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
```

- [ ] **Step 2: Run unit tests to confirm nothing broke**

```
node --test tests/linkedin.test.js
```

Expected: `# pass 11`, `# fail 0`

- [ ] **Step 3: Commit**

```bash
git add src/hunter.js
git commit -m "feat(hunter): add recruiter links to dream role Telegram alerts"
```

---

## Self-Review Checklist

**Spec coverage:**
- `src/linkedin.js` with `isHighPriority` + `linkedinLinks` → Task 1 ✓
- Trigger: hyperscaler OR score ≥ 22 → Task 1 (both conditions in `isHighPriority`) ✓
- Terminal output (fetch.js) → Task 2 ✓
- Web card with amber/blue styling → Task 3 ✓
- Telegram block (fetch.js) → Task 4 ✓
- `formatJob` in hunter.js → Task 5 ✓
- `formatDreamAlert` in hunter.js → Task 6 ✓
- Dream alert: recruiter line above APPLY NOW → Task 6 ✓
- `jobs.json` schema unchanged → `recruiterUrl`/`postsUrl` added to payload but schema extension is backward-compatible ✓

**No placeholders:** All code blocks are complete and self-contained.

**Type consistency:** `isHighPriority(job, score)` and `linkedinLinks(job)` signatures are consistent across Tasks 1–6. `{ recruiterUrl, postsUrl }` destructuring is used uniformly.
