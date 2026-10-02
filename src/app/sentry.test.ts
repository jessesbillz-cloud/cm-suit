import { describe, expect, it } from 'vitest';
import type { Breadcrumb, ErrorEvent } from '@sentry/react';
import { scrubBreadcrumb, scrubEvent, scrubText } from './sentryScrub';

const R = '[redacted]';

describe('link secrets never reach Sentry', () => {
  it('drops the request link and hub tokens from an address, keeps the rest', () => {
    expect(scrubText('https://app.example.test/r/job-1?t=SampleToken123&h=hub-9&view=list')).toBe(
      `https://app.example.test/r/job-1?t=${R}&h=${R}&view=list`,
    );
    expect(scrubText('/h/hub-9?t=SampleToken123')).toBe(`/h/hub-9?t=${R}`);
    expect(scrubText('/d/job-1?view=board&t=SampleToken123&day=2026-10-02')).toBe(`/d/job-1?view=board&t=${R}&day=2026-10-02`);
  });

  it('drops any token-like value, in the query or the fragment', () => {
    expect(scrubText('/signin#access_token=aaa.bbb.ccc&refresh_token=ddd&type=magiclink')).toBe(
      `/signin#access_token=${R}&refresh_token=${R}&type=magiclink`,
    );
    expect(scrubText('/auth/callback?code=abc123&next=%2Fall%2Fboard')).toBe(`/auth/callback?code=${R}&next=%2Fall%2Fboard`);
    expect(scrubText('/x?apikey=k1&sig=s1&page=2')).toBe(`/x?apikey=${R}&sig=${R}&page=2`);
  });

  it('drops a personal sign-in key from the path', () => {
    expect(scrubText('https://app.example.test/k/SampleKey987?x=1')).toBe(`https://app.example.test/k/${R}?x=1`);
  });

  it('finds addresses inside free text', () => {
    expect(scrubText('Failed to fetch https://db.example.test/fn/request-link?t=SampleToken123 (500)')).toBe(
      `Failed to fetch https://db.example.test/fn/request-link?t=${R} (500)`,
    );
  });

  it('leaves text without secrets alone', () => {
    const plain = '/p/job-1/rfis/rfi-2?window=1 and some words = here';
    expect(scrubText(plain)).toBe(plain);
  });

  it('scrubs the whole event: the page, its Referer, the error and the breadcrumbs', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'Sample error at /r/job-1?t=SampleToken123',
      request: { url: 'https://app.example.test/r/job-1?t=SampleToken123', headers: { Referer: 'https://app.example.test/h/hub-9?t=HubToken456' } },
      exception: { values: [{ type: 'Error', value: 'Could not open /a/link-1?t=AccessToken789' }] },
      breadcrumbs: [{ category: 'navigation', data: { from: '/h/hub-9?t=HubToken456', to: '/r/job-1?t=SampleToken123&h=hub-9' } }],
      tags: { area: 'request-link' },
    };
    const out = scrubEvent(event);
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/SampleToken123|HubToken456|AccessToken789/);
    expect(out.request?.url).toBe(`https://app.example.test/r/job-1?t=${R}`);
    expect(out.breadcrumbs?.[0]?.data).toEqual({ from: `/h/hub-9?t=${R}`, to: `/r/job-1?t=${R}&h=${R}` });
    expect(out.tags).toEqual({ area: 'request-link' });
    // The original is not changed.
    expect(event.request?.url).toBe('https://app.example.test/r/job-1?t=SampleToken123');
  });

  it('scrubs a breadcrumb before it is kept', () => {
    const crumb: Breadcrumb = { category: 'fetch', data: { method: 'POST', url: '/fn/access?t=AccessToken789', status_code: 200 } };
    expect(scrubBreadcrumb(crumb).data).toEqual({ method: 'POST', url: `/fn/access?t=${R}`, status_code: 200 });
  });
});
