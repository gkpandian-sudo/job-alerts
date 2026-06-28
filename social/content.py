"""
Rotating library of 10 career tips for Singapore job seekers.
"""

TIPS = [
    {
        "tip_num": "01",
        "title": "Beat the ATS Filter",
        "body": (
            "Most Singapore companies use applicant tracking systems that scan resumes "
            "for exact keyword matches before a human ever reads your application. "
            "Mirror the job description language precisely — if they say 'stakeholder management', "
            "don't write 'stakeholder engagement'."
        ),
        "bullets": [
            "Copy role-specific keywords verbatim from the JD",
            "Use a clean, single-column layout — ATS chokes on tables and columns",
            "Run your resume through an ATS checker before submitting",
        ],
        "tag": "RESUME",
    },
    {
        "tip_num": "02",
        "title": "LinkedIn Profile for SG Market",
        "body": (
            "Singapore hiring managers Google you before replying to your application. "
            "A half-filled LinkedIn profile is a silent disqualification. "
            "Treat your headline as prime real estate — it should say what you do AND "
            "the outcome you deliver, not just your job title."
        ),
        "bullets": [
            "Add 'Open to Work' (visible to recruiters only) if actively searching",
            "List specific tools, certs, and vendors in Skills — keyword-searchable",
            "Get 3 recommendations from managers or senior peers",
        ],
        "tag": "LINKEDIN",
    },
    {
        "tip_num": "03",
        "title": "MCF vs LinkedIn — When to Use Which",
        "body": (
            "MyCareersFuture (MCF) is mandatory for most Singapore-based companies hiring locals, "
            "making it a goldmine for roles that never appear on LinkedIn. "
            "LinkedIn meanwhile dominates multinational and hyperscaler postings. "
            "Use both — never one or the other."
        ),
        "bullets": [
            "Set MCF job alerts for your top 3 role types with salary filter",
            "LinkedIn: use Boolean search (TPM OR 'Technical Program Manager')",
            "Apply via MCF for SG companies — it signals local eligibility",
        ],
        "tag": "STRATEGY",
    },
    {
        "tip_num": "04",
        "title": "Salary Negotiation in Singapore",
        "body": (
            "Singapore employers expect negotiation — accepting the first offer signals "
            "you lack market awareness. Research the MCF salary benchmarks for your role "
            "before the conversation. Ask for the top of the stated range, then negotiate "
            "perks if base is fixed."
        ),
        "bullets": [
            "Counter at 10-15% above initial offer — it's standard practice",
            "Use MCF salary data as your anchor point in negotiations",
            "Negotiate joining bonus to offset notice period loss",
        ],
        "tag": "SALARY",
    },
    {
        "tip_num": "05",
        "title": "Write a TPM / SA Resume That Stands Out",
        "body": (
            "Technical Program Manager and Solution Architect resumes fail when they list "
            "responsibilities instead of outcomes. Hiring managers want to see scale, "
            "complexity, and business impact — not a job description copy-paste."
        ),
        "bullets": [
            "Lead with: 'Delivered X across Y teams in Z timeline'",
            "Quantify: budget managed, headcount influenced, latency reduced",
            "Add a 'Key Technologies' section: cloud, vendors, tools, certs",
        ],
        "tag": "RESUME",
    },
    {
        "tip_num": "06",
        "title": "Activate Your Referral Network",
        "body": (
            "Referred candidates are 4x more likely to be hired and move through the process "
            "faster. In Singapore's tight tech community, a warm intro beats a cold application "
            "every time. Your network is your most underused career asset."
        ),
        "bullets": [
            "Message ex-colleagues at target companies — be specific about the role",
            "Attend SGTech, AWS, Google, and Cisco events to build new connections",
            "Offer value first: share a useful article, make an intro for them",
        ],
        "tag": "NETWORK",
    },
    {
        "tip_num": "07",
        "title": "What SG Hiring Managers Look For",
        "body": (
            "Singapore hiring managers at MNCs prioritise APAC scope experience, "
            "cross-cultural communication, and vendor management skills. "
            "Domestic Singapore experience alone is often insufficient for regional roles — "
            "highlight any ASEAN, ANZ, or India exposure prominently."
        ),
        "bullets": [
            "Call out APAC scope explicitly: 'across 8 APAC markets'",
            "Highlight experience with Singapore government or GLC stakeholders",
            "Show cultural range: managed distributed teams across time zones",
        ],
        "tag": "INTERVIEW",
    },
    {
        "tip_num": "08",
        "title": "Read a JD Like a Recruiter",
        "body": (
            "Job descriptions are wish lists — not every bullet is equally weighted. "
            "Recruiters write JDs by committee and often include aspirational requirements. "
            "Focus on the first 3-5 responsibilities listed (highest priority) and "
            "apply if you match 70% of must-haves."
        ),
        "bullets": [
            "The first 3 bullets are the actual job — match those first",
            "'Nice to have' sections are negotiable — don't let them deter you",
            "If salary isn't listed, research MCF benchmarks for that role",
        ],
        "tag": "STRATEGY",
    },
    {
        "tip_num": "09",
        "title": "STAR Method for SG Interviews",
        "body": (
            "Singapore MNC interviews heavily favour the STAR method "
            "(Situation, Task, Action, Result) for behavioural questions. "
            "Prepare 6-8 STAR stories that you can adapt across different questions — "
            "they should span leadership, conflict, failure, and execution."
        ),
        "bullets": [
            "Result must include a metric: %, $, time saved, or scale",
            "Keep Situation and Task brief (20%) — spend 80% on Action and Result",
            "Prepare a failure STAR story — it shows self-awareness and growth",
        ],
        "tag": "INTERVIEW",
    },
    {
        "tip_num": "10",
        "title": "Negotiate Notice Period & Joining Bonus",
        "body": (
            "Singapore's standard notice period is 1-3 months, which can cost you "
            "competing offers. Negotiate a joining bonus to offset the salary gap "
            "during your notice, and clarify if early release is possible — "
            "many employers allow 2-4 weeks early exit for senior hires."
        ),
        "bullets": [
            "Ask HR: 'Is early release possible if a replacement is found sooner?'",
            "Joining bonus = 1-2 months salary is normal for senior IC and manager roles",
            "Get all negotiated terms in writing before resigning",
        ],
        "tag": "SALARY",
    },
]

ROTATION_LENGTH = 10


def get_tip(index: int) -> dict:
    return TIPS[index % ROTATION_LENGTH]
