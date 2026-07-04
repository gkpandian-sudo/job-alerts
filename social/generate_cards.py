"""
Card generators for Veralevel Jobs social posts.
All cards are 1080x1080 @ 100 DPI using matplotlib + PIL.
Colors match the live dashboard at veralevel-job-alerts.vercel.app.
"""

from pathlib import Path
from datetime import date as _date
import textwrap

import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.figure import Figure

# ── Brand palette — exact values from the website CSS variables ────────────────
NAVY   = '#001835'   # --pri  sidebar / header background
BLUE   = '#005eb5'   # --sec  footer / link accent
BG     = '#f4f7fb'   # --bg   page background (light blue-grey)
SURF   = '#ffffff'   # --surf card / row surface
BDR    = '#e2e8f0'   # --bdr-s border between rows
TXT    = '#0d1117'   # --txt  main text (near-black)
TXT2   = '#6b7280'   # --txt2 secondary text (grey)
OUT    = '#9ca3af'   # --out  muted / placeholder
GRN    = '#059669'   # --grn  green (salary, MCF badge)
GOLD   = '#d97706'   # --gold dream star / score highlight
WHITE  = '#ffffff'

# Role pill colours — (text, background) — matching the website tag-role classes
ROLE_COLORS = {
    'TPM':      ('#4338ca', '#ede9fe'),   # indigo
    'SA':       ('#1d4ed8', '#dbeafe'),   # blue
    'PRESALES': ('#065f46', '#d1fae5'),   # green
    'NETWORK':  ('#b45309', '#fef3c7'),   # amber
    'INFRA_BD': ('#be185d', '#fce7f3'),   # pink
    'INFRA':    ('#7c3aed', '#f3e8ff'),   # purple
    'BD':       ('#c2410c', '#ffedd5'),   # orange
    'OTHER':    ('#64748b', '#f1f5f9'),   # slate
}

ROLE_LABELS = {
    'TPM': 'TPM', 'SA': 'Sol. Arch', 'PRESALES': 'PreSales',
    'NETWORK': 'Network', 'INFRA_BD': 'Infra BD',
    'INFRA': 'Infra', 'BD': 'Biz Dev', 'OTHER': 'Other',
}

OUT_DIR = Path(__file__).resolve().parent / 'posts'


def _fig_ax(bg=BG):
    """Create a 1080x1080 figure with a solid background colour."""
    fig = Figure(figsize=(10.8, 10.8), dpi=100)
    ax  = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')
    fig.patch.set_facecolor(bg)
    ax.set_facecolor(bg)
    return fig, ax


def _rect(ax, x, y, w, h, color, alpha=1.0, radius=0.0, edgecolor=None, linewidth=0):
    """Draw a filled rectangle on the axes."""
    if radius > 0:
        r = patches.FancyBboxPatch(
            (x, y), w, h,
            boxstyle=f'round,pad=0,rounding_size={radius}',
            linewidth=linewidth,
            edgecolor=edgecolor or 'none',
            facecolor=color, alpha=alpha,
            transform=ax.transAxes,
        )
    else:
        r = patches.Rectangle(
            (x, y), w, h,
            linewidth=linewidth,
            edgecolor=edgecolor or 'none',
            facecolor=color, alpha=alpha,
            transform=ax.transAxes,
        )
    ax.add_patch(r)


def _save(fig, filename: str) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / filename
    fig.savefig(path, dpi=100, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close(fig)
    return path


# ── Card 1: Top Jobs ──────────────────────────────────────────────────────────

def make_top_jobs_card(jobs: list, date_str: str, post_date=None) -> Path:
    """
    Top-5 scoring jobs card — light theme matching the website.
    Background: #f4f7fb | Header: #001835 | Rows: white cards.
    """
    fig, ax = _fig_ax(BG)
    top5 = jobs[:5] if jobs else []

    # ── Header strip (dark navy, matching sidebar) ─────────────────
    _rect(ax, 0, 0.87, 1, 0.13, NAVY)

    # Brand wordmark
    ax.text(0.06, 0.955, 'Veralevel',
            ha='left', va='center', color=WHITE,
            fontsize=26, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.345, 0.955, 'Jobs',
            ha='left', va='center', color=GOLD,
            fontsize=26, fontweight='normal', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    ax.text(0.06, 0.900, f'Top Roles in Singapore  ·  {date_str}',
            ha='left', va='center', color=(1, 1, 1, 0.65),
            fontsize=12, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Blue accent right edge (mirroring site's --sec colour dot)
    _rect(ax, 0.93, 0.87, 0.07, 0.13, BLUE)
    ax.text(0.965, 0.933, '382\nroles',
            ha='center', va='center', color=WHITE,
            fontsize=8, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # ── Job rows ──────────────────────────────────────────────────
    row_h   = 0.148
    row_top = 0.855
    pad     = 0.030   # horizontal padding

    if not top5:
        ax.text(0.5, 0.5, 'No jobs data available',
                ha='center', va='center', color=TXT2,
                fontsize=20, fontfamily='DejaVu Sans',
                transform=ax.transAxes)
    else:
        for i, job in enumerate(top5):
            y_top = row_top - i * row_h
            row_y = y_top - row_h + 0.006

            is_dream = job.get('isDream', False)

            # White row card with subtle border
            _rect(ax, pad, row_y, 1 - 2 * pad, row_h - 0.010,
                  SURF, radius=0.010,
                  edgecolor=BDR, linewidth=0.8)

            # Dream job: gold left accent bar (matches website card left border)
            if is_dream:
                _rect(ax, pad, row_y, 0.007, row_h - 0.010, GOLD, radius=0.003)

            # ── Role pill ─────────────────────────────────────────
            role = job.get('role', 'OTHER')
            rc_text, rc_bg = ROLE_COLORS.get(role, ROLE_COLORS['OTHER'])
            pill_x = pad + 0.018 + (0.010 if is_dream else 0)
            pill_y = y_top - row_h * 0.30
            pill_w = 0.12
            _rect(ax, pill_x, pill_y - 0.016, pill_w, 0.034, rc_bg, radius=0.005)
            ax.text(pill_x + pill_w / 2, pill_y - 0.001,
                    ROLE_LABELS.get(role, role),
                    ha='center', va='center', color=rc_text,
                    fontsize=9, fontweight='bold', fontfamily='DejaVu Sans',
                    transform=ax.transAxes)

            # ── Job title ─────────────────────────────────────────
            title_x = pill_x + pill_w + 0.018
            title = (job.get('title') or '')[:50]
            ax.text(title_x, y_top - row_h * 0.27,
                    title,
                    ha='left', va='center', color=NAVY,
                    fontsize=13, fontweight='bold', fontfamily='DejaVu Sans',
                    transform=ax.transAxes)

            # ── Company name ──────────────────────────────────────
            company = (job.get('company') or 'Unknown')[:36]
            ax.text(title_x, y_top - row_h * 0.60,
                    company,
                    ha='left', va='center', color=TXT2,
                    fontsize=11, fontfamily='DejaVu Sans',
                    transform=ax.transAxes)

            # ── Salary (green, matching --grn) ────────────────────
            sal_min = int(job.get('salaryMin') or 0)
            sal_max = int(job.get('salaryMax') or 0)
            if sal_min and sal_max:
                sal_text = f'S\\${sal_min:,} – S\\${sal_max:,}/mo'
            elif sal_min:
                sal_text = f'S\\${sal_min:,}+/mo'
            else:
                sal_text = ''
            if sal_text:
                ax.text(title_x, y_top - row_h * 0.85,
                        sal_text,
                        ha='left', va='center', color=GRN,
                        fontsize=9.5, fontfamily='DejaVu Sans',
                        transform=ax.transAxes)

            # ── Score badge (right side) ──────────────────────────
            score = job.get('score', 0)
            score_x, score_y = 0.88, y_top - row_h * 0.50
            _rect(ax, score_x - 0.045, score_y - 0.022, 0.10, 0.044,
                  '#f0f4f9', radius=0.006)
            ax.text(score_x - 0.010, score_y,
                    '▲', ha='center', va='center', color=GOLD,
                    fontsize=10, fontweight='bold', fontfamily='DejaVu Sans',
                    transform=ax.transAxes)
            ax.text(score_x + 0.022, score_y,
                    str(score), ha='center', va='center', color=TXT2,
                    fontsize=11, fontweight='bold', fontfamily='DejaVu Sans',
                    transform=ax.transAxes)

            # Dream star
            if is_dream:
                ax.text(0.94, y_top - row_h * 0.20, '★',
                        ha='center', va='center', color=GOLD,
                        fontsize=14, transform=ax.transAxes)

    # ── Footer strip (--sec blue, matching site's button colour) ──
    _rect(ax, 0, 0, 1, 0.082, BLUE)
    ax.text(0.5, 0.048, 'veralevel-job-alerts.vercel.app',
            ha='center', va='center', color=WHITE,
            fontsize=14, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.5, 0.016, 'Daily Singapore tech job alerts',
            ha='center', va='center', color=(1, 1, 1, 0.7),
            fontsize=10, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    return _save(fig, f'{(post_date or _date.today()).isoformat()}-top-jobs.png')


# ── Card 2: Career Tip ────────────────────────────────────────────────────────

def make_career_tip_card(tip: dict, date_str: str, post_date=None) -> Path:
    """Career tip card — light theme with gold accent header."""
    fig, ax = _fig_ax(BG)

    # Dark navy header
    _rect(ax, 0, 0.87, 1, 0.13, NAVY)
    ax.text(0.06, 0.955, 'Veralevel',
            ha='left', va='center', color=WHITE,
            fontsize=26, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.345, 0.955, 'Jobs',
            ha='left', va='center', color=GOLD,
            fontsize=26, fontweight='normal', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.06, 0.900, 'Career Tip',
            ha='left', va='center', color=(1, 1, 1, 0.65),
            fontsize=12, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Gold accent right
    _rect(ax, 0.93, 0.87, 0.07, 0.13, GOLD)
    ax.text(0.965, 0.933, f'#{tip["tip_num"]}',
            ha='center', va='center', color=NAVY,
            fontsize=11, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Main content area — white card
    _rect(ax, 0.03, 0.09, 0.94, 0.765, SURF, radius=0.012,
          edgecolor=BDR, linewidth=0.8)

    # Tip number (large watermark)
    ax.text(0.88, 0.78, f'#{tip["tip_num"]}',
            ha='right', va='top', color=BG,
            fontsize=80, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Tag badge
    _rect(ax, 0.06, 0.795, 0.18, 0.036, GOLD, radius=0.005)
    ax.text(0.15, 0.813, tip['tag'],
            ha='center', va='center', color=NAVY,
            fontsize=10, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Title
    title_lines = textwrap.wrap(tip['title'], width=28)
    for li, line in enumerate(title_lines[:3]):
        ax.text(0.06, 0.760 - li * 0.072,
                line,
                ha='left', va='center', color=NAVY,
                fontsize=30, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)

    # Divider
    divider_y = 0.760 - len(title_lines[:3]) * 0.072 - 0.025
    ax.axhline(y=divider_y, color=BDR, linewidth=1.5, xmin=0.06, xmax=0.94)

    # Body text
    body_wrapped = textwrap.wrap(tip['body'], width=58)
    body_y = divider_y - 0.042
    for line in body_wrapped[:5]:
        ax.text(0.06, body_y, line,
                ha='left', va='center', color=TXT2,
                fontsize=12, fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        body_y -= 0.038

    # Bullets
    bullet_y = body_y - 0.025
    for bullet in tip.get('bullets', [])[:3]:
        bwrapped = textwrap.wrap(bullet, width=54)
        # Gold bullet dot
        _rect(ax, 0.06, bullet_y - 0.008, 0.012, 0.012, GOLD, radius=0.003)
        ax.text(0.085, bullet_y - 0.001,
                bwrapped[0],
                ha='left', va='center', color=TXT,
                fontsize=12, fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        if len(bwrapped) > 1:
            ax.text(0.085, bullet_y - 0.036,
                    bwrapped[1],
                    ha='left', va='center', color=TXT,
                    fontsize=12, fontfamily='DejaVu Sans',
                    transform=ax.transAxes)
            bullet_y -= 0.036
        bullet_y -= 0.050

    # Footer
    _rect(ax, 0, 0, 1, 0.082, BLUE)
    ax.text(0.5, 0.048, 'Follow for daily Singapore job alerts',
            ha='center', va='center', color=WHITE,
            fontsize=13, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.5, 0.016, 'veralevel-job-alerts.vercel.app',
            ha='center', va='center', color=(1, 1, 1, 0.7),
            fontsize=10, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    return _save(fig, f'{(post_date or _date.today()).isoformat()}-career-tip.png')


# ── Card 3: Weekly Digest ─────────────────────────────────────────────────────

def make_weekly_digest_card(jobs: list, date_str: str, post_date=None) -> Path:
    """Weekly digest card — light theme matching website."""
    fig, ax = _fig_ax(BG)

    # Header
    _rect(ax, 0, 0.87, 1, 0.13, NAVY)
    ax.text(0.06, 0.955, 'Veralevel',
            ha='left', va='center', color=WHITE,
            fontsize=26, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.345, 0.955, 'Jobs',
            ha='left', va='center', color=GOLD,
            fontsize=26, fontweight='normal', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.06, 0.900, f'Week in Jobs  ·  Singapore  ·  {date_str}',
            ha='left', va='center', color=(1, 1, 1, 0.65),
            fontsize=12, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Role counts section — white card
    _rect(ax, 0.03, 0.63, 0.94, 0.230, SURF, radius=0.012,
          edgecolor=BDR, linewidth=0.8)

    role_order = ['TPM', 'SA', 'PRESALES', 'NETWORK', 'INFRA_BD', 'INFRA', 'BD']
    role_counts = {r: sum(1 for j in jobs if j.get('role') == r) for r in role_order}

    ax.text(0.06, 0.840, 'ROLES THIS WEEK',
            ha='left', va='center', color=TXT2,
            fontsize=10, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    pill_x, pill_y = 0.06, 0.800
    max_per_row, col = 4, 0
    pill_w = 0.205
    for role in role_order:
        count = role_counts.get(role, 0)
        if count == 0:
            continue
        rc_text, rc_bg = ROLE_COLORS.get(role, ROLE_COLORS['OTHER'])
        _rect(ax, pill_x, pill_y - 0.028, pill_w, 0.044, rc_bg, radius=0.006)
        ax.text(pill_x + pill_w / 2, pill_y - 0.006,
                f'{ROLE_LABELS.get(role, role)}: {count}',
                ha='center', va='center', color=rc_text,
                fontsize=11, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        col += 1
        if col % max_per_row == 0:
            pill_x = 0.06
            pill_y -= 0.065
        else:
            pill_x += pill_w + 0.018

    ax.text(0.06, 0.652, f'{len(jobs)} curated roles total',
            ha='left', va='center', color=NAVY,
            fontsize=13, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Top picks section — white card
    _rect(ax, 0.03, 0.09, 0.94, 0.522, SURF, radius=0.012,
          edgecolor=BDR, linewidth=0.8)

    ax.text(0.06, 0.591, 'TOP PICKS THIS WEEK',
            ha='left', va='center', color=TXT2,
            fontsize=10, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    dream_jobs = [j for j in jobs if j.get('isDream')]
    top3 = (dream_jobs + [j for j in jobs if not j.get('isDream')])[:3]

    for i, job in enumerate(top3):
        y = 0.545 - i * 0.140
        role = job.get('role', 'OTHER')
        rc_text, rc_bg = ROLE_COLORS.get(role, ROLE_COLORS['OTHER'])

        # Role pill
        _rect(ax, 0.06, y - 0.016, 0.100, 0.032, rc_bg, radius=0.004)
        ax.text(0.110, y - 0.001,
                ROLE_LABELS.get(role, role),
                ha='center', va='center', color=rc_text,
                fontsize=9, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)

        # Score badge
        score = job.get('score', 0)
        _rect(ax, 0.175, y - 0.016, 0.065, 0.032, '#f0f4f9', radius=0.004)
        ax.text(0.183, y - 0.001, '▲',
                ha='left', va='center', color=GOLD,
                fontsize=9, fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        ax.text(0.207, y - 0.001, str(score),
                ha='left', va='center', color=TXT2,
                fontsize=9, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)

        # Job title (now primary)
        ax.text(0.255, y + 0.006,
                (job.get('title') or '')[:46],
                ha='left', va='center', color=NAVY,
                fontsize=12, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        # Company
        ax.text(0.255, y - 0.028,
                (job.get('company') or '')[:36],
                ha='left', va='center', color=TXT2,
                fontsize=10, fontfamily='DejaVu Sans',
                transform=ax.transAxes)

        if job.get('isDream'):
            ax.text(0.935, y - 0.006, '★',
                    ha='center', va='center', color=GOLD,
                    fontsize=16, transform=ax.transAxes)

        if i < 2:
            ax.axhline(y=y - 0.072, color=BDR, linewidth=0.8, xmin=0.04, xmax=0.96)

    # Footer
    _rect(ax, 0, 0, 1, 0.082, BLUE)
    ax.text(0.5, 0.048, 'veralevel-job-alerts.vercel.app',
            ha='center', va='center', color=WHITE,
            fontsize=14, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.5, 0.016, 'Daily Singapore tech job alerts',
            ha='center', va='center', color=(1, 1, 1, 0.7),
            fontsize=10, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    return _save(fig, f'{(post_date or _date.today()).isoformat()}-weekly.png')


# ── Card 4: Monthly Pulse ─────────────────────────────────────────────────────

def make_monthly_pulse_card(jobs: list, date_str: str, post_date=None) -> Path:
    """Monthly pulse card with horizontal bar chart — light theme."""
    fig, ax = _fig_ax(BG)

    from datetime import date as d
    month_year = d.today().strftime('%B %Y')

    # Header
    _rect(ax, 0, 0.87, 1, 0.13, NAVY)
    ax.text(0.06, 0.955, 'Veralevel',
            ha='left', va='center', color=WHITE,
            fontsize=26, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.345, 0.955, 'Jobs',
            ha='left', va='center', color=GOLD,
            fontsize=26, fontweight='normal', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.06, 0.900, f'Market Pulse  ·  Singapore  ·  {month_year}',
            ha='left', va='center', color=(1, 1, 1, 0.65),
            fontsize=12, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # White content card
    _rect(ax, 0.03, 0.09, 0.94, 0.765, SURF, radius=0.012,
          edgecolor=BDR, linewidth=0.8)

    # Role bar chart
    role_order = ['TPM', 'SA', 'PRESALES', 'NETWORK', 'INFRA_BD', 'INFRA', 'BD']
    role_counts = [(r, sum(1 for j in jobs if j.get('role') == r)) for r in role_order]
    role_counts = [(r, c) for r, c in role_counts if c > 0]
    max_count   = max((c for _, c in role_counts), default=1)

    ax.text(0.06, 0.833, 'ROLE DISTRIBUTION',
            ha='left', va='center', color=TXT2,
            fontsize=10, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    bar_left   = 0.18
    bar_max_w  = 0.66
    bar_y      = 0.795
    bar_h      = 0.050
    bar_gap    = 0.018

    for role, count in role_counts:
        rc_text, rc_bg = ROLE_COLORS.get(role, ROLE_COLORS['OTHER'])
        bar_w = max(bar_max_w * (count / max_count), 0.04)

        # Label (left)
        ax.text(bar_left - 0.012, bar_y - bar_h / 2,
                ROLE_LABELS.get(role, role),
                ha='right', va='center', color=TXT,
                fontsize=10, fontfamily='DejaVu Sans',
                transform=ax.transAxes)

        # Bar background track
        _rect(ax, bar_left, bar_y - bar_h + 0.004, bar_max_w, bar_h - 0.008,
              '#f0f4f9', radius=0.004)

        # Filled bar
        _rect(ax, bar_left, bar_y - bar_h + 0.004, bar_w, bar_h - 0.008,
              rc_text, radius=0.004)

        # Count label
        ax.text(bar_left + bar_w + 0.014, bar_y - bar_h / 2,
                str(count),
                ha='left', va='center', color=TXT,
                fontsize=10, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)

        bar_y -= bar_h + bar_gap

    # Total
    ax.axhline(y=bar_y - 0.010, color=BDR, linewidth=1.0, xmin=0.04, xmax=0.96)
    ax.text(0.06, bar_y - 0.038,
            f'{len(jobs)} total roles tracked',
            ha='left', va='center', color=NAVY,
            fontsize=13, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.06, bar_y - 0.065,
            'Updated daily from MyCareersFuture + LinkedIn',
            ha='left', va='center', color=TXT2,
            fontsize=10, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Footer
    _rect(ax, 0, 0, 1, 0.082, BLUE)
    ax.text(0.5, 0.048, 'veralevel-job-alerts.vercel.app',
            ha='center', va='center', color=WHITE,
            fontsize=14, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.5, 0.016, 'Daily Singapore tech job alerts',
            ha='center', va='center', color=(1, 1, 1, 0.7),
            fontsize=10, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    return _save(fig, f'{(post_date or _date.today()).isoformat()}-monthly.png')
