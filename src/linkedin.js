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
