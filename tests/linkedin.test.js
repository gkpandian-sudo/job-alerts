const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isHighPriority, linkedinLinks } = require('../src/linkedin');

test('isHighPriority: hyperscaler qualifies at any score', () => {
  const job = { postedCompany: { name: 'GOOGLE ASIA PACIFIC PTE. LTD.' }, title: 'SWE' };
  assert.equal(isHighPriority(job, 10), true);
});

test('isHighPriority: amazon qualifies at any score', () => {
  const job = { postedCompany: { name: 'AMAZON WEB SERVICES SINGAPORE PRIVATE LIMITED' }, title: 'SA' };
  assert.equal(isHighPriority(job, 5), true);
});

test('isHighPriority: microsoft qualifies at any score', () => {
  const job = { postedCompany: { name: 'MICROSOFT OPERATIONS PTE LTD' }, title: 'PM' };
  assert.equal(isHighPriority(job, 8), true);
});

test('isHighPriority: netflix qualifies at any score', () => {
  const job = { postedCompany: { name: 'Netflix Singapore' }, title: 'Engineer' };
  assert.equal(isHighPriority(job, 9), true);
});

test('isHighPriority: score >= 22 qualifies non-hyperscaler', () => {
  const job = { postedCompany: { name: 'Accenture' }, title: 'Solution Architect' };
  assert.equal(isHighPriority(job, 22), true);
});

test('isHighPriority: score 21 non-hyperscaler does not qualify', () => {
  const job = { postedCompany: { name: 'Accenture' }, title: 'Solution Architect' };
  assert.equal(isHighPriority(job, 21), false);
});

test('isHighPriority: missing postedCompany does not throw', () => {
  const job = { title: 'SA' };
  assert.equal(isHighPriority(job, 10), false);
});

test('linkedinLinks: recruiterUrl targets LinkedIn people search', () => {
  const job = { postedCompany: { name: 'Google' }, title: 'TPM' };
  const { recruiterUrl } = linkedinLinks(job);
  assert.ok(recruiterUrl.startsWith('https://www.linkedin.com/search/results/people/'));
  assert.ok(recruiterUrl.includes('Google'));
  assert.ok(recruiterUrl.includes('recruiter'));
  assert.ok(recruiterUrl.includes('Singapore'));
});

test('linkedinLinks: postsUrl targets Google site:linkedin.com', () => {
  const job = { postedCompany: { name: 'Google' }, title: 'TPM' };
  const { postsUrl } = linkedinLinks(job);
  assert.ok(postsUrl.startsWith('https://www.google.com/search?q='));
  assert.ok(postsUrl.toLowerCase().includes('linkedin.com'));
  assert.ok(postsUrl.includes('Google'));
  assert.ok(postsUrl.includes('TPM'));
  assert.ok(postsUrl.includes('Singapore'));
});

test('linkedinLinks: special characters in company name are URL-encoded', () => {
  const job = { postedCompany: { name: 'Palo Alto Networks' }, title: 'Security Architect' };
  const { recruiterUrl, postsUrl } = linkedinLinks(job);
  assert.ok(!recruiterUrl.includes(' '));
  assert.ok(!postsUrl.includes(' '));
});
