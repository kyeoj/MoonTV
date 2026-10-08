import {
  getNormalizedSearchQueries,
  toSimplified,
  toTraditional,
} from '@/lib/chinese';

describe('Chinese conversion and normalization', () => {
  it('converts Traditional Chinese to Simplified Chinese correctly', async () => {
    expect(await toSimplified('家庭關係證明書')).toBe('家庭关系证明书');
    expect(await toSimplified('鐵拳教育')).toBe('铁拳教育');
    expect(await toSimplified('中頭獎還是要上班')).toBe('中头奖还是要上班');
  });

  it('converts Simplified Chinese to Traditional Chinese correctly', async () => {
    expect(await toTraditional('家庭关系证明书')).toBe('家庭關係證明書');
    expect(await toTraditional('铁拳教育')).toBe('鐵拳教育');
  });

  it('generates normalized search queries for Traditional Chinese input', async () => {
    const queries = await getNormalizedSearchQueries('家庭關係證明書');
    expect(queries).toEqual(['家庭关系证明书', '家庭關係證明書']);
  });

  it('returns single query for already Simplified Chinese input', async () => {
    const queries = await getNormalizedSearchQueries('家庭关系证明书');
    expect(queries).toEqual(['家庭关系证明书']);
  });

  it('handles empty or whitespace inputs gracefully', async () => {
    expect(await toSimplified('')).toBe('');
    expect(await getNormalizedSearchQueries('  ')).toEqual([]);
  });
});
