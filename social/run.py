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


def wait_for_url(url: str, timeout: int = 180, interval: int = 10):
    """Poll url until HTTP 200 or timeout (Vercel deploy can take ~60s)."""
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            code = urllib.request.urlopen(url, timeout=5).getcode()
            if code == 200:
                print(f'  CDN ready ({url})')
                return
        except Exception:
            pass
        remaining = int(deadline - time.time())
        print(f'  waiting for Vercel deploy... ({remaining}s remaining)')
        time.sleep(interval)
    raise TimeoutError(f'Image URL not reachable after {timeout}s: {url}')


def decide_post_type(today: date) -> str:
    """Determine post type from today's date and weekday."""
    if today.day <= 2:
        return 'monthly'
    wd = today.weekday()  # 0=Mon
    if wd == 0:
        return 'weekly'
    if wd in (1, 3):      # Tue, Thu
        return 'tip'
    if wd in (2, 4):      # Wed, Fri
        return 'jobs'
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
    today     = date.today()
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
        image_path = make_career_tip_card(tip, date_str)
        ig_caption, li_caption = career_tip(tip)
        write_counter((idx + 1) % 10)
        print(f'  counter advanced: {idx} → {(idx + 1) % 10}')

    elif post_type == 'weekly':
        image_path = make_weekly_digest_card(jobs, date_str)
        ig_caption, li_caption = weekly_digest(jobs, date_str)

    elif post_type == 'monthly':
        image_path = make_monthly_pulse_card(jobs, date_str)
        ig_caption, li_caption = monthly_pulse(jobs, date_str)

    else:  # 'jobs' (default)
        image_path = make_top_jobs_card(jobs, date_str)
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
