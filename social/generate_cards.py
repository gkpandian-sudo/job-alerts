"""
Card generators for Veralevel Jobs social posts.
All cards are 1080x1080 @ 100 DPI using matplotlib + PIL.
"""

from pathlib import Path
from datetime import date as _date
import textwrap

import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.figure import Figure

# ── Brand palette ─────────────────────────────────────────────────────────────
NAVY   = '#00183d'
BLUE   = '#005eb5'
LIGHT  = '#f6faff'
WHITE  = '#ffffff'
GREY   = '#44474f'
BORDER = '#c4c6d0'
GREEN  = '#0F6B3C'
GOLD   = '#d97706'

ROLE_COLORS = {
    'TPM':      ('#4338ca', '#ede9fe'),
    'SA':       ('#1d4ed8', '#dbeafe'),
    'PRESALES': ('#065f46', '#d1fae5'),
    'NETWORK':  ('#b45309', '#fef3c7'),
    'INFRA_BD': ('#be185d', '#fce7f3'),
    'INFRA':    ('#7c3aed', '#f3e8ff'),
    'BD':       ('#c2410c', '#ffedd5'),
    'OTHER':    ('#64748b', '#f1f5f9'),
}

ROLE_LABELS = {
    'TPM': 'TPM', 'SA': 'Sol. Arch', 'PRESALES': 'PreSales',
    'NETWORK': 'Network', 'INFRA_BD': 'Infra BD',
    'INFRA': 'Infra', 'BD': 'Biz Dev', 'OTHER': 'Other',
}

OUT_DIR = Path(__file__).resolve().parent / 'posts'


def _fig_ax(bg=NAVY):
    """Create a 1080x1080 figure with a solid background colour."""
    fig = Figure(figsize=(10.8, 10.8), dpi=100)
    ax  = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')
    fig.patch.set_facecolor(bg)
    ax.set_facecolor(bg)
    return fig, ax


def _rect(ax, x, y, w, h, color, alpha=1.0, radius=0.0):
    """Draw a filled rectangle on the axes."""
    if radius > 0:
        r = patches.FancyBboxPatch(
            (x, y), w, h,
            boxstyle=f'round,pad=0,rounding_size={radius}',
            linewidth=0, facecolor=color, alpha=alpha,
            transform=ax.transAxes,
        )
    else:
        r = patches.Rectangle(
            (x, y), w, h,
            linewidth=0, facecolor=color, alpha=alpha,
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

def make_top_jobs_card(jobs: list, date_str: str) -> Path:
    """
    Top-5 scoring jobs card (1080x1080, dark navy).
    Returns saved PNG path.
    """
    fig, ax = _fig_ax(NAVY)
    top5 = jobs[:5] if jobs else []

    # ── Header strip ──────────────────────────────────────────────
    _rect(ax, 0, 0.88, 1, 0.12, NAVY)

    ax.text(0.5, 0.955, 'VERALEVEL JOBS',
            ha='center', va='center', color=WHITE,
            fontsize=28, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.5, 0.908, f'Top Roles in Singapore  ·  {date_str}',
            ha='center', va='center', color='#93c5fd',
            fontsize=13, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Gold divider
    ax.axhline(y=0.875, color=GOLD, linewidth=2.5, xmin=0.04, xmax=0.96)

    # ── Job rows ──────────────────────────────────────────────────
    row_h   = 0.145
    row_top = 0.855

    if not top5:
        ax.text(0.5, 0.5, 'No jobs data available',
                ha='center', va='center', color=WHITE,
                fontsize=20, fontfamily='DejaVu Sans',
                transform=ax.transAxes)
    else:
        for i, job in enumerate(top5):
            y_top = row_top - i * row_h
            y_mid = y_top - row_h / 2

            # Row background (subtle alternating)
            bg_col = '#001833' if i % 2 == 0 else '#001025'
            _rect(ax, 0.03, y_top - row_h + 0.005, 0.94, row_h - 0.008, bg_col, radius=0.008)

            # Role pill
            role     = job.get('role', 'OTHER')
            rc_text, rc_bg = ROLE_COLORS.get(role, ROLE_COLORS['OTHER'])
            pill_x, pill_y = 0.06, y_top - row_h * 0.28
            _rect(ax, pill_x, pill_y - 0.018, 0.095, 0.038, rc_bg, radius=0.004)
            ax.text(pill_x + 0.0475, pill_y - 0.001,
                    ROLE_LABELS.get(role, role),
                    ha='center', va='center', color=rc_text,
                    fontsize=9, fontweight='bold', fontfamily='DejaVu Sans',
                    transform=ax.transAxes)

            # Company name
            company = (job.get('company') or 'Unknown')[:32]
            ax.text(0.175, y_top - row_h * 0.26,
                    company,
                    ha='left', va='center', color=WHITE,
                    fontsize=13, fontweight='bold', fontfamily='DejaVu Sans',
                    transform=ax.transAxes)

            # Job title
            title = (job.get('title') or '')[:52]
            ax.text(0.175, y_top - row_h * 0.60,
                    title,
                    ha='left', va='center', color='#93c5fd',
                    fontsize=11, fontfamily='DejaVu Sans',
                    transform=ax.transAxes)

            # Score badge (right side)
            score = job.get('score', 0)
            ax.text(0.88, y_top - row_h * 0.32,
                    f'▲ {score}',
                    ha='center', va='center', color=GOLD,
                    fontsize=13, fontweight='bold', fontfamily='DejaVu Sans',
                    transform=ax.transAxes)

            # Salary (right, smaller)
            sal_min = job.get('salaryMin', 0)
            sal_max = job.get('salaryMax', 0)
            if sal_min and sal_max:
                sal_text = f'${sal_min:,}–${sal_max:,}/mo'
            elif sal_min:
                sal_text = f'${sal_min:,}+/mo'
            else:
                sal_text = ''
            if sal_text:
                ax.text(0.88, y_top - row_h * 0.68,
                        sal_text,
                        ha='center', va='center', color='#4ade80',
                        fontsize=9, fontfamily='DejaVu Sans',
                        transform=ax.transAxes)

            # Row separator
            if i < len(top5) - 1:
                sep_y = y_top - row_h + 0.003
                ax.axhline(y=sep_y, color='#1e3a5f', linewidth=0.8, xmin=0.04, xmax=0.96)

    # ── Footer strip ──────────────────────────────────────────────
    _rect(ax, 0, 0, 1, 0.10, BLUE)
    ax.text(0.5, 0.05, 'veralevel-job-alerts.vercel.app',
            ha='center', va='center', color=WHITE,
            fontsize=14, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    return _save(fig, f'{_date.today().isoformat()}-top-jobs.png')


# ── Card 2: Career Tip ────────────────────────────────────────────────────────

def make_career_tip_card(tip: dict, date_str: str) -> Path:
    """Career tip card (1080x1080, dark navy with gold accent)."""
    fig, ax = _fig_ax(NAVY)

    # Gold accent bar at top
    _rect(ax, 0, 0.955, 1, 0.045, GOLD)
    ax.text(0.5, 0.978, 'C A R E E R   T I P',
            ha='center', va='center', color=NAVY,
            fontsize=11, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Tip number (large, faded)
    ax.text(0.08, 0.875, f'#{tip["tip_num"]}',
            ha='left', va='center', color='#0a2550',
            fontsize=72, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes, alpha=0.6)

    # Tag badge
    _rect(ax, 0.06, 0.825, 0.16, 0.036, GOLD, radius=0.004)
    ax.text(0.14, 0.843, tip['tag'],
            ha='center', va='center', color=NAVY,
            fontsize=10, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Title
    title_lines = textwrap.wrap(tip['title'], width=26)
    for li, line in enumerate(title_lines[:3]):
        ax.text(0.06, 0.785 - li * 0.075,
                line,
                ha='left', va='center', color=WHITE,
                fontsize=32, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)

    # Body text
    body_wrapped = textwrap.wrap(tip['body'], width=55)
    body_y = 0.620
    for line in body_wrapped[:4]:
        ax.text(0.06, body_y, line,
                ha='left', va='center', color='#94a3b8',
                fontsize=13, fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        body_y -= 0.046

    # Divider
    ax.axhline(y=body_y - 0.015, color='#1e3a5f', linewidth=1.5, xmin=0.06, xmax=0.94)

    # Bullets
    bullet_y = body_y - 0.065
    for bullet in tip.get('bullets', [])[:3]:
        bwrapped = textwrap.wrap(bullet, width=52)
        ax.text(0.07, bullet_y,
                '→  ' + bwrapped[0],
                ha='left', va='center', color=WHITE,
                fontsize=13, fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        if len(bwrapped) > 1:
            ax.text(0.095, bullet_y - 0.038,
                    bwrapped[1],
                    ha='left', va='center', color=WHITE,
                    fontsize=13, fontfamily='DejaVu Sans',
                    transform=ax.transAxes)
            bullet_y -= 0.038
        bullet_y -= 0.058

    # Footer strip
    _rect(ax, 0, 0, 1, 0.10, BLUE)
    ax.text(0.5, 0.055, 'Follow for daily Singapore job alerts',
            ha='center', va='center', color=WHITE,
            fontsize=13, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.5, 0.022, 'veralevel-job-alerts.vercel.app',
            ha='center', va='center', color='#93c5fd',
            fontsize=11, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    return _save(fig, f'{_date.today().isoformat()}-career-tip.png')


# ── Card 3: Weekly Digest ─────────────────────────────────────────────────────

def make_weekly_digest_card(jobs: list, date_str: str) -> Path:
    """Weekly digest card (1080x1080, light background)."""
    fig, ax = _fig_ax(LIGHT)

    # Header navy strip
    _rect(ax, 0, 0.875, 1, 0.125, NAVY)
    ax.text(0.5, 0.950, 'WEEK IN JOBS',
            ha='center', va='center', color=WHITE,
            fontsize=26, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.5, 0.900, f'Singapore  ·  {date_str}',
            ha='center', va='center', color='#93c5fd',
            fontsize=14, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Role counts
    role_order = ['TPM', 'SA', 'PRESALES', 'NETWORK', 'INFRA_BD', 'INFRA', 'BD']
    role_counts = {r: sum(1 for j in jobs if j.get('role') == r) for r in role_order}

    ax.text(0.06, 0.840, 'ROLES THIS WEEK',
            ha='left', va='center', color=NAVY,
            fontsize=11, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    pill_x, pill_y = 0.06, 0.790
    max_per_row = 4
    col = 0
    for role in role_order:
        count = role_counts.get(role, 0)
        if count == 0:
            continue
        rc_text, rc_bg = ROLE_COLORS.get(role, ROLE_COLORS['OTHER'])
        pill_w = 0.20
        _rect(ax, pill_x, pill_y - 0.030, pill_w, 0.048, rc_bg, radius=0.006)
        ax.text(pill_x + pill_w / 2, pill_y - 0.006,
                f'{ROLE_LABELS.get(role, role)}: {count}',
                ha='center', va='center', color=rc_text,
                fontsize=11, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        col += 1
        if col % max_per_row == 0:
            pill_x  = 0.06
            pill_y -= 0.068
        else:
            pill_x += pill_w + 0.025

    # Total count
    total_y = 0.640
    ax.text(0.06, total_y,
            f'Total: {len(jobs)} curated roles',
            ha='left', va='center', color=NAVY,
            fontsize=14, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Top 3 highlighted jobs
    dream_jobs = [j for j in jobs if j.get('isDream')]
    top3 = (dream_jobs + [j for j in jobs if not j.get('isDream')])[:3]

    ax.axhline(y=0.615, color=BORDER, linewidth=1.0, xmin=0.04, xmax=0.96)
    ax.text(0.06, 0.590, 'TOP PICKS THIS WEEK',
            ha='left', va='center', color=NAVY,
            fontsize=11, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    for i, job in enumerate(top3):
        y = 0.540 - i * 0.110
        role = job.get('role', 'OTHER')
        rc_text, rc_bg = ROLE_COLORS.get(role, ROLE_COLORS['OTHER'])
        _rect(ax, 0.06, y - 0.020, 0.088, 0.034, rc_bg, radius=0.004)
        ax.text(0.104, y - 0.003,
                ROLE_LABELS.get(role, role),
                ha='center', va='center', color=rc_text,
                fontsize=9, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        ax.text(0.165, y + 0.004,
                (job.get('company') or '')[:30],
                ha='left', va='center', color=NAVY,
                fontsize=13, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        ax.text(0.165, y - 0.028,
                (job.get('title') or '')[:48],
                ha='left', va='center', color=GREY,
                fontsize=11, fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        if job.get('isDream'):
            ax.text(0.935, y - 0.008, '★',
                    ha='center', va='center', color=GOLD,
                    fontsize=18, transform=ax.transAxes)

    # Footer
    _rect(ax, 0, 0, 1, 0.10, BLUE)
    ax.text(0.5, 0.055, 'veralevel-job-alerts.vercel.app',
            ha='center', va='center', color=WHITE,
            fontsize=14, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.5, 0.022, 'Follow for daily Singapore job alerts',
            ha='center', va='center', color='#93c5fd',
            fontsize=11, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    return _save(fig, f'{_date.today().isoformat()}-weekly.png')


# ── Card 4: Monthly Pulse ─────────────────────────────────────────────────────

def make_monthly_pulse_card(jobs: list, date_str: str) -> Path:
    """Monthly pulse card with horizontal bar chart of role counts."""
    fig, ax = _fig_ax(NAVY)

    # Header
    _rect(ax, 0, 0.88, 1, 0.12, '#000d20')
    ax.text(0.5, 0.955, 'SINGAPORE JOB MARKET',
            ha='center', va='center', color=WHITE,
            fontsize=22, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    from datetime import date as d
    month_year = d.today().strftime('%B %Y')
    ax.text(0.5, 0.905, month_year,
            ha='center', va='center', color=GOLD,
            fontsize=16, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Role counts
    role_order = ['TPM', 'SA', 'PRESALES', 'NETWORK', 'INFRA_BD', 'INFRA', 'BD']
    role_counts = [(r, sum(1 for j in jobs if j.get('role') == r)) for r in role_order]
    role_counts = [(r, c) for r, c in role_counts if c > 0]
    max_count   = max((c for _, c in role_counts), default=1)

    ax.text(0.06, 0.848, 'ROLE DISTRIBUTION',
            ha='left', va='center', color='#94a3b8',
            fontsize=11, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    bar_y      = 0.798
    bar_height = 0.058
    bar_gap    = 0.022
    bar_max_w  = 0.72

    for role, count in role_counts:
        rc_text, _ = ROLE_COLORS.get(role, ROLE_COLORS['OTHER'])
        bar_w = bar_max_w * (count / max_count) if max_count > 0 else 0.05
        _rect(ax, 0.06, bar_y - bar_height, bar_w, bar_height - 0.005, rc_text, radius=0.003)
        ax.text(0.055, bar_y - bar_height / 2,
                ROLE_LABELS.get(role, role),
                ha='right', va='center', color=WHITE,
                fontsize=10, fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        ax.text(0.06 + bar_w + 0.012, bar_y - bar_height / 2,
                str(count),
                ha='left', va='center', color=WHITE,
                fontsize=11, fontweight='bold', fontfamily='DejaVu Sans',
                transform=ax.transAxes)
        bar_y -= bar_height + bar_gap

    # Total
    ax.text(0.06, bar_y - 0.02,
            f'{len(jobs)} total roles tracked this month',
            ha='left', va='center', color='#94a3b8',
            fontsize=12, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Gold divider
    ax.axhline(y=bar_y - 0.06, color=GOLD, linewidth=1.5, xmin=0.04, xmax=0.96)

    # CTA text above footer
    ax.text(0.5, bar_y - 0.10,
            'Updated daily from MCF + LinkedIn',
            ha='center', va='center', color='#94a3b8',
            fontsize=12, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    # Footer
    _rect(ax, 0, 0, 1, 0.10, BLUE)
    ax.text(0.5, 0.055, 'veralevel-job-alerts.vercel.app',
            ha='center', va='center', color=WHITE,
            fontsize=14, fontweight='bold', fontfamily='DejaVu Sans',
            transform=ax.transAxes)
    ax.text(0.5, 0.022, 'Follow for daily Singapore job alerts',
            ha='center', va='center', color='#93c5fd',
            fontsize=11, fontfamily='DejaVu Sans',
            transform=ax.transAxes)

    return _save(fig, f'{_date.today().isoformat()}-monthly.png')
