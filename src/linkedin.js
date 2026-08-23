const HYPERSCALERS = ['amazon', 'google', 'microsoft', 'netflix'];
const SCORE_THRESHOLD = 22;

function isHighPriority(job, score) {
  const company = (job.postedCompany?.name || '').toLowerCase();
  return HYPERSCALERS.some(h => company.includes(h)) || score >= SCORE_THRESHOLD;
}

// encodeURIComponent leaves ( ) ! ' * unescaped — a company name containing
// "(" or ")" would close a Telegram Markdown link early (`[text](url)`) and
// spill the rest of the URL into the message as plain text. Escape those too.
function encodeForMarkdownLink(s) {
  return encodeURIComponent(s).replace(/[()!'*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function linkedinLinks(job) {
  const company = job.postedCompany?.name || '';
  const title   = job.title || '';
  const recruiterUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeForMarkdownLink(company + ' recruiter Singapore')}`;
  const postsUrl     = `https://www.google.com/search?q=${encodeForMarkdownLink(`site:linkedin.com "${company}" "${title}" Singapore`)}`;
  return { recruiterUrl, postsUrl };
}

module.exports = { isHighPriority, linkedinLinks };
