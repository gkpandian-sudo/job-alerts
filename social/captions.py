"""
Caption generators for Instagram and LinkedIn posts.
Each function returns (instagram_caption, linkedin_caption).
"""

import os

SITE         = os.environ.get('BRAND_SITE',     'veralevel-job-alerts.vercel.app')
TELEGRAM     = os.environ.get('BRAND_TELEGRAM', 't.me/pandiangk')
LINKEDIN_URL = os.environ.get('BRAND_LINKEDIN', 'linkedin.com/in/pandiangk')

IG_TAGS = (
    "#singapore #sgjobs #singaporejobs #hiring #techjobs "
    "#tpm #solutionarchitect #presales #networkengineer "
    "#careerinsg #jobhunt #linkedinsg #sgtech #pandian "
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
    """Caption for a top-jobs card."""
    top3 = jobs[:3]

    # Instagram
    ig_lines = [
        f'🔍 Top Singapore Tech Roles — {date_str}',
        '',
    ]
    for j in top3:
        sal = f"${j['salaryMin']:,}/mo" if j.get('salaryMin') else 'Salary TBD'
        ig_lines.append(f"▶ {j['title']} @ {j['company']}")
        ig_lines.append(f"  💰 {sal}")
        ig_lines.append('')
    ig_lines += [
        f'📋 Full list → {SITE}',
        f'📱 Daily alerts → {TELEGRAM}',
        '',
        IG_TAGS,
    ]

    # LinkedIn
    li_lines = [
        f'📌 Top Singapore Tech Roles — {date_str}',
        '',
        'Curated picks from MyCareersFuture + LinkedIn today:',
        '',
    ]
    for j in top3:
        sal = f"${j['salaryMin']:,} – ${j['salaryMax']:,}/mo" if j.get('salaryMin') and j.get('salaryMax') else 'Salary not disclosed'
        li_lines.append(f"• {j['title']}")
        li_lines.append(f"  {j['company']}  ·  {_role_label(j.get('role', 'OTHER'))}  ·  {sal}")
        li_lines.append('')
    li_lines += [
        f'Browse all curated roles: {SITE}',
        '',
        'Updated daily. Focused on TPM, Solution Architect, PreSales, Network Engineering & Infrastructure roles in Singapore.',
    ]

    return '\n'.join(ig_lines), '\n'.join(li_lines)


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

    li_lines = [
        f'Career Tip #{tip["tip_num"]}: {tip["title"]}',
        '',
        tip['body'],
        '',
        'Practical takeaways:',
    ]
    for b in tip.get('bullets', []):
        li_lines.append(f'• {b}')
    li_lines += [
        '',
        f'Sharing daily Singapore job market insights and curated tech roles at {SITE}',
        '',
        '#Singapore #CareerAdvice #JobSearch #TechJobs #SingaporeJobs',
    ]

    return '\n'.join(ig_lines), '\n'.join(li_lines)


def weekly_digest(jobs: list, date_str: str) -> tuple[str, str]:
    """Caption for a weekly digest card."""
    role_order  = ['TPM', 'SA', 'PRESALES', 'NETWORK', 'INFRA_BD', 'INFRA', 'BD']
    role_counts = {r: sum(1 for j in jobs if j.get('role') == r) for r in role_order}
    counts_str  = '  '.join(f'{_role_label(r)}: {role_counts[r]}' for r in role_order if role_counts[r])
    total       = len(jobs)

    ig_lines = [
        f'📊 Week in Singapore Tech Jobs — {date_str}',
        '',
        f'{total} curated roles this week:',
        counts_str,
        '',
        '🏆 Dream roles flagged · Salary data included',
        '',
        f'📋 Full dashboard → {SITE}',
        f'📱 Daily Telegram alerts → {TELEGRAM}',
        '',
        IG_TAGS,
    ]

    li_lines = [
        f'Singapore Tech Jobs — Weekly Digest ({date_str})',
        '',
        f'{total} curated roles tracked this week across MCF and LinkedIn.',
        '',
        'Breakdown by role type:',
    ]
    for r in role_order:
        if role_counts[r]:
            li_lines.append(f'• {_role_label(r)}: {role_counts[r]}')
    li_lines += [
        '',
        f'Browse the full curated dashboard: {SITE}',
        '',
        'Roles covered: TPM, Solution Architect, PreSales, Network Engineering, Infrastructure, Business Development — focused on senior individual contributors and managers in Singapore.',
    ]

    return '\n'.join(ig_lines), '\n'.join(li_lines)


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

    li_lines = [
        f'Singapore Tech Job Market — {month_year} Pulse',
        '',
        f'Tracked {total} curated tech and infrastructure roles in Singapore this month.',
        '',
        'Role distribution:',
    ]
    for r in role_order:
        if role_counts[r]:
            li_lines.append(f'• {_role_label(r)}: {role_counts[r]}')
    li_lines += [
        '',
        'Data sourced from MyCareersFuture and LinkedIn, filtered and scored daily.',
        f'Full dashboard: {SITE}',
        '',
        '#Singapore #SingaporeJobs #TechJobs #JobMarket #Hiring #TPM #SolutionArchitect #PreSales',
    ]

    return '\n'.join(ig_lines), '\n'.join(li_lines)
