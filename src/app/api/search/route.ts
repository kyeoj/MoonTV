import { NextResponse } from 'next/server';

import { getNormalizedSearchQueries, toSimplified } from '@/lib/chinese';
import { getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  }

  const queries = await getNormalizedSearchQueries(query);
  const simplifiedQuery = await toSimplified(query.trim());
  const config = await getConfig();
  const apiSites = config.SourceConfig.filter((site) => !site.disabled);
  const searchPromises = queries.flatMap((q) =>
    apiSites.map((site) => searchFromApi(site, q))
  );

  try {
    const results = await Promise.all(searchPromises);
    let flattenedResults = results.flat();

    // 根据 source + id 去重，避免简繁多次检索返回相同内容
    const seen = new Set<string>();
    flattenedResults = flattenedResults.filter((result) => {
      const key = `${result.source}-${result.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 为每个结果填充简体规范化标题，供前端聚合去重和排序使用
    await Promise.all(
      flattenedResults.map(async (result) => {
        result.normalized_title = await toSimplified(result.title);
      })
    );

    if (!config.SiteConfig.DisableYellowFilter) {
      flattenedResults = flattenedResults.filter((result) => {
        const typeName = result.type_name || '';
        return !yellowWords.some((word: string) => typeName.includes(word));
      });
    }
    const cacheTime = await getCacheTime();

    return NextResponse.json(
      {
        results: flattenedResults,
        simplifiedQuery:
          simplifiedQuery !== query.trim() ? simplifiedQuery : undefined,
      },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
