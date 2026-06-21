# LinkedIn Recruiter Links — Design Spec
**Date:** 2026-06-21  
**Status:** Approved

## Problem

For high-priority job matches (dream roles and hyperscaler companies with high scores), the current output only shows the MCF apply link. There is no quick path to find the recruiter or LinkedIn posts about the role — both of which increase the chance of a warm outreach.

## Goal

For qualifying jobs, automatically generate and surface two LinkedIn-related links:
1. A LinkedIn people search URL to find recruiters at the company in Singapore
2. A Google search URL (`site:linkedin.com`) to find public LinkedIn posts about the role

These links appear on all three output surfaces: web card, terminal, and Telegram.

## Trigger Criteria (Condition D)

A job qualifies for recruiter links if **either** is true:
- **Hyperscaler company**: company name contains `amazon`, `google`, `microsoft`, or `netflix`
- **High score**: computed score ≥ 22

These match independently — a low-scoring Google job still qualifies; a non-hyperscaler job scoring 22+ also qualifies.

## Architecture

### New file: `src/linkedin.js`

Pure utility module with two exports:

```js
isHighPriority(job, score)
// Returns true if hyperscaler OR score >= 22

linkedinLinks(job)
// Returns { recruiterUrl, postsUrl }
// recruiterUrl: linkedin.com/search/results/people/?keywords=<Company> recruiter Singapore
// postsUrl:     google.com/search?q=site:linkedin.com "<Company>" "<Title>" Singapore
```

No side effects. Both functions are self-contained and testable.

### Changes to `fetch.js`

Three touch points, all using `require('./linkedin')`:

1. **Terminal output** — after the MCF link, print two extra lines for qualifying jobs:
   ```
   👔 Recruiter: <recruiterUrl>
   🔍 LI Posts:  <postsUrl>
   ```

2. **`buildHtml`** — add two small buttons at the bottom of qualifying job cards:
   - `[👔 Find Recruiter]` → recruiterUrl
   - `[🔍 LinkedIn Posts]` → postsUrl
   - Dream cards: buttons in amber; hyperscaler-only cards: buttons in blue

3. **Telegram block** — append one line to qualifying job messages:
   ```
   👔 [Find Recruiter](recruiterUrl) · 🔍 [LinkedIn Posts](postsUrl)
   ```

### Changes to `hunter.js`

Two touch points:

1. **`formatJob`** — append recruiter line for qualifying jobs in the daily digest Telegram message
2. **`formatDreamAlert`** — always append recruiter line (inserted above the APPLY NOW button), since dream roles always qualify

## URL Formats

**LinkedIn people search:**
```
https://www.linkedin.com/search/results/people/?keywords=<Company>%20recruiter%20Singapore
```
Company name is taken from `job.postedCompany.name`, URL-encoded.

**Google site:linkedin.com search:**
```
https://www.google.com/search?q=site%3Alinkedin.com+%22<Company>%22+%22<Title>%22+Singapore
```
Both company and title are quoted for precision, URL-encoded.

## What Does Not Change

- Scoring logic — no score changes
- `DREAM_RULES` — no changes to dream role detection
- `COMPANY_BOOSTS` — no changes to scoring
- State management (`state/dream-roles.json`) — unchanged
- `public/jobs.json` schema — unchanged (links are generated at render time, not stored)

## Out of Scope

- Scraping LinkedIn or Google programmatically (ToS risk, auth required)
- Storing "recruiter found" status
- Sending separate Telegram messages for recruiter links (inline only)
