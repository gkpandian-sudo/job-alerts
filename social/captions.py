"""Caption generators for Instagram posts."""

import os

SITE     = os.environ.get('BRAND_SITE',     'https://veralevel-job-alerts.vercel.app')
TELEGRAM = os.environ.get('BRAND_TELEGRAM', 'https://t.me/pandiangk')

ROLE_EMOJI = {
    'TPM':      '⚙️',
    'SA':       '🏗',
    'PRESALES': '🤝',
    'NETWORK':  '🌐',
    'INFRA_BD': '📡',
    'INFRA':    '🖥',
    'BD':       '💼',
    'OTHER':    '🔷',
}
NUMS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']

IG_TAGS = (
    "#singapore #sgjobs #singaporejobs #hiring #techjobs "
    "#tpm #solutionarchitect #presales #networkengineer "
    "#careerinsg #jobhunt #sgtech #pandian "
    "#jobsearch #veraleveljobs #sgprofessionals"
)


def _role_label(role: str) -> str:
    return {
        'TPM':      'Technical Program Manager',
        'SA':       'Solution Architect',
        'PRESALES': 'PreSales / SE',
        'NETWORK':  'Network',
        'INFRA_BD': 'Infra Business Dev',
        'INFRA':    'Infrastructure',
        'BD':       'Business Development',
        'OTHER':    'Other',
    }.get(role, role)


def top_jobs(jobs: list, date_str: str) -> tuple[str, str]:
    """Daily top-jobs caption — Telegram-style with direct apply links."""
    top5 = jobs[:5]

    ig_lines = [
        f'🔍 Top Singapore Tech Roles — {date_str}',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
    ]
    for i, j in enumerate(top5):
        sal_min = j.get('salaryMin') or 0
        sal_max = j.get('salaryMax') or 0
        if sal_min and sal_max:
            sal = f"${sal_min:,} – ${sal_max:,}/mo"
        elif sal_min:
            sal = f"${sal_min:,}+/mo"
        else:
            sal = 'Salary TBD'
        src  = '📋 MCF' if j.get('source') == 'MCF' else '🔗 Apply'
        num  = NUMS[i] if i < len(NUMS) else f'{i+1}.'
        role = ROLE_EMOJI.get(j.get('role', 'OTHER'), '🔷')
        ig_lines.append(f'{num} {role} {j["title"]}')
        ig_lines.append(f'🏢 {j["company"]}')
        ig_lines.append(f'💰 {sal}')
        ig_lines.append(f'{src}: {j["url"]}')
        ig_lines.append('')

    ig_lines += [
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        f'📋 Full dashboard → {SITE}',
        f'📱 Daily alerts → {TELEGRAM}',
        '',
        IG_TAGS,
    ]

    ig_caption = '\n'.join(ig_lines)
    return ig_caption, ig_caption  # li_caption unused until LinkedIn is set up


def career_tip(tip: dict) -> tuple[str, str]:
    """Caption for a career tip card."""
    bullets = '\n'.join(f'→ {b}' for b in tip.get('bullets', []))

    ig_lines = [
        f'💡 Career Tip #{tip["tip_num"]}: {tip["title"]}',
        '',
        tip['body'],
        '',
        bullets,
        '',
        '💾 Save this post — you\'ll want it later.',
        '',
        f'📋 Browse SG jobs → {SITE}',
        f'📱 Daily alerts → {TELEGRAM}',
        '',
        IG_TAGS,
    ]

    ig_caption = '\n'.join(ig_lines)
    return ig_caption, ig_caption


def weekly_digest(jobs: list, date_str: str) -> tuple[str, str]:
    """Caption for a weekly digest card."""
    role_order  = ['TPM', 'SA', 'PRESALES', 'NETWORK', 'INFRA_BD', 'INFRA', 'BD']
    role_counts = {r: sum(1 for j in jobs if j.get('role') == r) for r in role_order}
    total       = len(jobs)

    ig_lines = [
        f'📊 Week in Singapore Tech Jobs — {date_str}',
        '',
        f'{total} curated roles this week:',
        '',
    ]
    for r in role_order:
        if role_counts[r]:
            ig_lines.append(f'▶ {_role_label(r)}: {role_counts[r]}')
    ig_lines += [
        '',
        '🏆 Dream roles flagged · Salary data included',
        '',
        f'📋 Full dashboard → {SITE}',
        f'📱 Daily alerts → {TELEGRAM}',
        '',
        IG_TAGS,
    ]

    ig_caption = '\n'.join(ig_lines)
    return ig_caption, ig_caption


def monthly_pulse(jobs: list, date_str: str) -> tuple[str, str]:
    """Caption for a monthly pulse card."""
    from datetime import date
    month_year  = date.today().strftime('%B %Y')
    role_order  = ['TPM', 'SA', 'PRESALES', 'NETWORK', 'INFRA_BD', 'INFRA', 'BD']
    role_counts = {r: sum(1 for j in jobs if j.get('role') == r) for r in role_order}
    total       = len(jobs)

    ig_lines = [
        f'📈 Singapore Job Market Pulse — {month_year}',
        '',
        f'{total} curated roles tracked. Here\'s what\'s hot:',
        '',
    ]
    for r in role_order:
        if role_counts[r]:
            ig_lines.append(f'▶ {_role_label(r)}: {role_counts[r]}')
    ig_lines += [
        '',
        f'📋 Browse all → {SITE}',
        f'📱 Alerts → {TELEGRAM}',
        '',
        IG_TAGS,
    ]

    ig_caption = '\n'.join(ig_lines)
    return ig_caption, ig_caption
