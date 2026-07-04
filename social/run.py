"""
veralevel-jobs social auto-poster.
Post schedule (GitHub Actions cron, 08:00 SGT = 00:00 UTC):
  Monday    → weekly digest card
  Tue/Thu   → career tip (rotating 10-tip library)
  Wed/Fri   → top jobs card
  1st month → monthly pulse card
"""

import json
import os
import sys
import time
import subprocess
from datetime import date, datetime
from pathlib import Path

ROOT         = Path(__file__).resolve().parent.parent
JOBS_FILE    = ROOT / 'public' / 'jobs.json'
OUT_DIR      = ROOT / 'social' / 'posts'
COUNTER_FILE = ROOT / 'data' / 'social-counter.json'


def load_jobs() -> list:
    if not JOBS_FILE.exists():
        print(f'  WARN: {JOBS_FILE} not found — using empty list', file=sys.stderr)
        return []
    with open(JOBS_FILE) as f:
        return json.load(f)


def read_counter() -> int:
    if not COUNTER_FILE.exists():
        return 0
    with open(COUNTER_FILE) as f:
        return json.load(f).get('index', 0)


def write_counter(index: int):
    COUNTER_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(COUNTER_FILE, 'w') as f:
        json.dump({'index': index}, f)
    cmds = [
        ['git', 'config', 'user.email', 'github-actions[bot]@users.noreply.github.com'],
        ['git', 'config', 'user.name',  'github-actions[bot]'],
        ['git', 'add', str(COUNTER_FILE)],
        ['git', 'commit', '-m', f'chore: advance social-counter to {index} [skip ci]'],
        ['git', 'push', 'origin', 'main'],
    ]
    for cmd in cmds:
        subprocess.run(cmd, cwd=ROOT, capture_output=True)


def commit_and_push(image_path: Path) -> str:
    """Copy image into public/, commit, push, and return the Vercel CDN URL."""
    import shutil
    branch = 'main'

    # Mirror the image into public/social/posts/ so Vercel serves it publicly
    pub_dir = ROOT / 'public' / 'social' / 'posts'
    pub_dir.mkdir(parents=True, exist_ok=True)
    pub_path = pub_dir / image_path.name
    shutil.copy2(image_path, pub_path)

    cmds = [
        ['git', 'config', 'user.email', 'github-actions[bot]@users.noreply.github.com'],
        ['git', 'config', 'user.name',  'github-actions[bot]'],
        ['git', 'add', str(pub_path)],
        ['git', 'commit', '-m', f'auto: social post {date.today()}'],
        ['git', 'push', 'origin', branch],
    ]
    for cmd in cmds:
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        if result.returncode != 0 and 'nothing to commit' not in (result.stdout + result.stderr):
            print(result.stderr, file=sys.stderr)

    brand_site = os.environ.get('BRAND_SITE', '').rstrip('/')
    return f'{brand_site}/social/posts/{image_path.name}'


def wait_for_url(url: str, timeout: int = 300, interval: int = 10):
    """Poll url until HTTP 200 with image content-type, or timeout.

    Vercel has a catch-all SPA rewrite (index.html) that returns HTTP 200 for
    any path — even before a new deployment is live. We must check Content-Type
    is 'image/*' to confirm the actual PNG has been deployed, not index.html.
    """
    import requests as _req
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = _req.get(url, timeout=8, headers={'User-Agent': 'Mozilla/5.0'})
            ct = r.headers.get('content-type', '')
            print(f'  poll: HTTP {r.status_code} ({ct})')
            if r.status_code == 200 and ct.startswith('image/'):
                print(f'  CDN ready')
                return
        except Exception as e:
            print(f'  poll error: {type(e).__name__}: {e}')
        remaining = int(deadline - time.time())
        print(f'  waiting for Vercel deploy... ({remaining}s remaining)')
        time.sleep(interval)
    raise TimeoutError(f'Image URL not reachable after {timeout}s: {url}')


def decide_post_type(today: date) -> str:
    """Daily schedule always posts jobs with links (same as Telegram style).
    Other types (tip, weekly, monthly) are available via workflow_dispatch."""
    return 'jobs'


def main():
    import matplotlib
    matplotlib.use('Agg')

    sys.path.insert(0, str(ROOT / 'social'))

    from generate_cards import (
        make_top_jobs_card,
        make_career_tip_card,
        make_weekly_digest_card,
        make_monthly_pulse_card,
    )
    from captions import top_jobs, career_tip, weekly_digest, monthly_pulse
    from post_instagram import publish as ig_publish

    try:
        from post_linkedin import publish as li_publish
        has_linkedin = bool(os.environ.get('LINKEDIN_ACCESS_TOKEN'))
    except Exception as e:
        print(f'  LinkedIn module unavailable: {e}', file=sys.stderr)
        has_linkedin = False

    jobs      = load_jobs()
    post_date_env = os.environ.get('POST_DATE')
    today     = date.fromisoformat(post_date_env) if post_date_env else date.today()
    date_str  = today.strftime('%d %b %Y')
    post_type = os.environ.get('POST_TYPE') or decide_post_type(today)

    print(f'Post type: {post_type} ({today})')
    print(f'Jobs loaded: {len(jobs)}')
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── Generate card + captions ──────────────────────────────────
    if post_type == 'tip':
        from content import get_tip
        idx  = read_counter()
        tip  = get_tip(idx)
        print(f'  tip #{tip["tip_num"]}: {tip["title"]}')
        image_path = make_career_tip_card(tip, date_str, post_date=today)
        ig_caption, li_caption = career_tip(tip)
        write_counter((idx + 1) % 10)
        print(f'  counter advanced: {idx} → {(idx + 1) % 10}')

    elif post_type == 'weekly':
        image_path = make_weekly_digest_card(jobs, date_str, post_date=today)
        ig_caption, li_caption = weekly_digest(jobs, date_str)

    elif post_type == 'monthly':
        image_path = make_monthly_pulse_card(jobs, date_str, post_date=today)
        ig_caption, li_caption = monthly_pulse(jobs, date_str)

    else:  # 'jobs' (default)
        image_path = make_top_jobs_card(jobs, date_str, post_date=today)
        ig_caption, li_caption = top_jobs(jobs, date_str)

    print(f'  saved: {image_path}')

    # ── Commit image to repo, get CDN URL ────────────────────────
    image_url = commit_and_push(image_path)
    print(f'  url:   {image_url}')

    # ── Wait for Vercel CDN to serve the image ───────────────────
    wait_for_url(image_url)

    # ── Post to Instagram (URL-based) ─────────────────────────────
    if os.environ.get('IG_USER_ID') and os.environ.get('META_ACCESS_TOKEN'):
        ig_publish(image_url, ig_caption)
        print('  Instagram: posted')
    else:
        print('  Instagram: skipped (no IG_USER_ID / META_ACCESS_TOKEN)')

    # ── Post to LinkedIn (local file upload) ──────────────────────
    if has_linkedin:
        li_publish(str(image_path), li_caption)
        print('  LinkedIn: posted')
    else:
        print('  LinkedIn: skipped (no LINKEDIN_ACCESS_TOKEN)')

    print(f'Done — {post_type} post complete.')


if __name__ == '__main__':
    main()
