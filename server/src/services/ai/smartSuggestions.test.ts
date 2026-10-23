import { describe, expect, it } from 'vitest';
import { validateSuggestedPageOrder } from './suggestPageOrder.js';
import { validateSummaryBullets } from './suggestSummary.js';

const a = 'bbf1fcba-61d4-447a-8e12-d3437973805b';
const b = '9d862cb3-edc4-4c2f-9a90-abdf1f42c6cd';
const pages = [
  { id: a, extractedText: 'Page 2 continues inheritance and explains overriding methods.' },
  { id: b, extractedText: 'Page 1 introduces Java classes and inheritance.' },
];
const order = {
  orderedAssetIds: [b, a],
  reasons: [
    { assetId: b, reason: 'Introduces the topic.', evidence: 'Page 1 introduces' },
    { assetId: a, reason: 'Continues the lesson.', evidence: 'Page 2 continues' },
  ],
  uncertainAssetIds: [],
};

describe('grounded smart suggestions', () => {
  it('accepts a supported exact page permutation with source evidence', () => {
    expect(validateSuggestedPageOrder(order, pages).orderedAssetIds).toEqual([b, a]);
  });
  it('rejects invented, duplicate, and missing page IDs', () => {
    expect(() =>
      validateSuggestedPageOrder({ ...order, orderedAssetIds: [a, a] }, pages),
    ).toThrow();
    expect(() => validateSuggestedPageOrder({ ...order, orderedAssetIds: [a] }, pages)).toThrow();
    expect(() =>
      validateSuggestedPageOrder(
        { ...order, orderedAssetIds: [a, '3d506493-10bf-471f-ab21-a9af75b65018'] },
        pages,
      ),
    ).toThrow();
  });
  it('rejects order reasoning that is absent from its source page', () => {
    expect(() =>
      validateSuggestedPageOrder(
        {
          ...order,
          reasons: [{ ...order.reasons[0], evidence: 'unknown heading' }, order.reasons[1]],
        },
        pages,
      ),
    ).toThrow();
  });
  it('requires summary citations to refer to the actual source text', () => {
    const bullets = [
      { text: 'Java classes are introduced.', sourceAssetId: b, excerpt: 'Java classes' },
      { text: 'Inheritance is explained.', sourceAssetId: a, excerpt: 'inheritance' },
      { text: 'Method overriding is covered.', sourceAssetId: a, excerpt: 'overriding methods' },
    ];
    expect(validateSummaryBullets({ bullets }, pages)).toHaveLength(3);
    expect(() =>
      validateSummaryBullets(
        { bullets: [{ ...bullets[0], excerpt: 'nonexistent proof' }, ...bullets.slice(1)] },
        pages,
      ),
    ).toThrow();
    expect(() =>
      validateSummaryBullets(
        {
          bullets: [
            { ...bullets[0], sourceAssetId: '3d506493-10bf-471f-ab21-a9af75b65018' },
            ...bullets.slice(1),
          ],
        },
        pages,
      ),
    ).toThrow();
  });
});
