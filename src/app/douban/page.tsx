/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getDoubanList } from '@/lib/douban.client';
import { DoubanItem } from '@/lib/types';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import DoubanCustomSelector from '@/components/DoubanCustomSelector';
import DoubanSelector from '@/components/DoubanSelector';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

function DoubanPageClient() {
  const searchParams = useSearchParams();
  const [doubanData, setDoubanData] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectorsReady, setSelectorsReady] = useState(false);
  const [sortOrder, setSortOrder] = useState<
    'year_desc' | 'default' | 'rate_desc'
  >('year_desc'); // 默认最新上映 (Latest first)
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const type = searchParams.get('type') || 'movie';

  // 获取 runtimeConfig 中的自定义分类数据
  const [customCategories, setCustomCategories] = useState<
    Array<{ name: string; type: 'movie' | 'tv'; query: string }>
  >([]);

  // 选择器状态
  const [primarySelection, setPrimarySelection] = useState<string>(() => {
    if (type === 'movie') return '热门';
    if (type === 'tv') return '热门';
    if (type === 'show') return '综艺';
    return '热门';
  });
  const [secondarySelection, setSecondarySelection] = useState<string>(() => {
    return '全部';
  });

  // 获取自定义分类数据
  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setCustomCategories(runtimeConfig.CUSTOM_CATEGORIES);
    }
  }, []);

  // 初始化时标记选择器为准备好状态
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectorsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  // type变化时立即重置selectorsReady
  useEffect(() => {
    setSelectorsReady(false);
    setLoading(true);
  }, [type]);

  // 当type变化时重置选择器状态
  useEffect(() => {
    if (type === 'custom' && customCategories.length > 0) {
      const types = Array.from(
        new Set(customCategories.map((cat) => cat.type))
      );
      if (types.length > 0) {
        const selectedType = types.includes('movie') ? 'movie' : 'tv';
        setPrimarySelection(selectedType);

        const firstCategory = customCategories.find(
          (cat) => cat.type === selectedType
        );
        if (firstCategory) {
          setSecondarySelection(firstCategory.query);
        }
      }
    } else {
      if (type === 'movie') {
        setPrimarySelection('热门');
        setSecondarySelection('全部');
      } else if (type === 'tv') {
        setPrimarySelection('热门');
        setSecondarySelection('');
      } else if (type === 'show') {
        setPrimarySelection('综艺');
        setSecondarySelection('');
      } else {
        setPrimarySelection('热门');
        setSecondarySelection('全部');
      }
    }

    const timer = setTimeout(() => {
      setSelectorsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [type, customCategories]);

  // 生成骨架屏数据
  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  // 生成全量API请求参数
  const getFetchParams = useCallback(
    (pageStart: number) => {
      const apiSort =
        sortOrder === 'rate_desc'
          ? 'rank'
          : sortOrder === 'year_desc'
          ? 'time'
          : 'recommend';

      if (type === 'custom') {
        const selectedCategory = customCategories.find(
          (cat) =>
            cat.type === primarySelection && cat.query === secondarySelection
        );
        if (selectedCategory) {
          return {
            tag: selectedCategory.query,
            type: selectedCategory.type,
            pageLimit: 25,
            pageStart,
            sort: apiSort,
          };
        }
        throw new Error('没有找到对应的分类');
      }

      if (type === 'tv') {
        return {
          tag: primarySelection || '热门',
          type: 'tv',
          pageLimit: 25,
          pageStart,
          sort: apiSort,
        };
      }

      if (type === 'show') {
        return {
          tag: '综艺',
          type: 'tv',
          pageLimit: 25,
          pageStart,
          sort: apiSort,
        };
      }

      // movie: 优先使用选中的二级细分标签（如华语、欧美、动作、科幻），若选全部则使用一级分类标签（热门、最新、经典、豆瓣高分）
      const tag =
        secondarySelection && secondarySelection !== '全部'
          ? secondarySelection
          : primarySelection || '热门';

      return {
        tag,
        type: 'movie',
        pageLimit: 25,
        pageStart,
        sort: apiSort,
      };
    },
    [type, primarySelection, secondarySelection, customCategories, sortOrder]
  );

  // 防抖的数据加载函数
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const params = getFetchParams(0);
      const data = await getDoubanList(params);

      if (data.code === 200) {
        setDoubanData(data.list);
        setHasMore(data.list.length === 25);
        setLoading(false);
      } else {
        throw new Error(data.message || '获取数据失败');
      }
    } catch (err) {
      console.error(err);
      setDoubanData([]);
      setHasMore(false);
      setLoading(false);
    }
  }, [getFetchParams]);

  // 只在选择器准备好后才加载数据
  useEffect(() => {
    if (!selectorsReady) {
      return;
    }

    // 重置页面状态
    setDoubanData([]);
    setCurrentPage(0);
    setHasMore(true);
    setIsLoadingMore(false);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      loadInitialData();
    }, 100);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [
    selectorsReady,
    type,
    primarySelection,
    secondarySelection,
    sortOrder,
    loadInitialData,
  ]);

  // 单独处理 currentPage 变化（加载更多 / 无限滚动）
  useEffect(() => {
    if (currentPage > 0) {
      const fetchMoreData = async () => {
        try {
          setIsLoadingMore(true);
          const params = getFetchParams(currentPage * 25);
          const data = await getDoubanList(params);

          if (data.code === 200) {
            setDoubanData((prev) => [...prev, ...data.list]);
            setHasMore(data.list.length === 25);
          } else {
            throw new Error(data.message || '获取数据失败');
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingMore(false);
        }
      };

      fetchMoreData();
    }
  }, [currentPage, getFetchParams]);

  // 设置滚动监听
  useEffect(() => {
    if (!hasMore || isLoadingMore || loading) {
      return;
    }

    if (!loadingRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setCurrentPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadingRef.current);
    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoadingMore, loading]);

  // 处理选择器变化
  const handlePrimaryChange = useCallback(
    (value: string) => {
      if (value !== primarySelection) {
        setLoading(true);

        if (type === 'custom' && customCategories.length > 0) {
          const firstCategory = customCategories.find(
            (cat) => cat.type === value
          );
          if (firstCategory) {
            setPrimarySelection(value);
            setSecondarySelection(firstCategory.query);
          } else {
            setPrimarySelection(value);
          }
        } else {
          setPrimarySelection(value);
        }
      }
    },
    [primarySelection, type, customCategories]
  );

  const handleSecondaryChange = useCallback(
    (value: string) => {
      if (value !== secondarySelection) {
        setLoading(true);
        setSecondarySelection(value);
      }
    },
    [secondarySelection]
  );

  const getPageTitle = () => {
    return type === 'movie'
      ? '电影'
      : type === 'tv'
      ? '电视剧'
      : type === 'show'
      ? '综艺'
      : '自定义';
  };

  const getActivePath = () => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);

    const queryString = params.toString();
    const activePath = `/douban${queryString ? `?${queryString}` : ''}`;
    return activePath;
  };

  return (
    <PageLayout activePath={getActivePath()}>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible'>
        {/* 页面标题和选择器 */}
        <div className='mb-6 sm:mb-8 space-y-4 sm:space-y-6'>
          {/* 页面标题与排序选项 */}
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
            <div>
              <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2 dark:text-gray-200'>
                {getPageTitle()}
              </h1>
              <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
                来自豆瓣的精选全量内容
              </p>
            </div>

            {/* 排序方式选择器 */}
            <div className='flex items-center gap-2 self-start sm:self-auto'>
              <span className='text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400'>
                排序:
              </span>
              <div className='relative inline-flex bg-gray-200/60 rounded-full p-0.5 sm:p-1 dark:bg-gray-700/60 backdrop-blur-sm'>
                <button
                  onClick={() => setSortOrder('year_desc')}
                  className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 cursor-pointer ${
                    sortOrder === 'year_desc'
                      ? 'bg-white dark:bg-gray-500 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                  }`}
                >
                  最新上映
                </button>
                <button
                  onClick={() => setSortOrder('default')}
                  className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 cursor-pointer ${
                    sortOrder === 'default'
                      ? 'bg-white dark:bg-gray-500 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                  }`}
                >
                  综合推荐
                </button>
                <button
                  onClick={() => setSortOrder('rate_desc')}
                  className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 cursor-pointer ${
                    sortOrder === 'rate_desc'
                      ? 'bg-white dark:bg-gray-500 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                  }`}
                >
                  最高评分
                </button>
              </div>
            </div>
          </div>

          {/* 选择器组件 */}
          {type !== 'custom' ? (
            <div className='bg-white/60 dark:bg-gray-800/40 rounded-2xl p-4 sm:p-6 border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
              <DoubanSelector
                type={type as 'movie' | 'tv' | 'show'}
                primarySelection={primarySelection}
                secondarySelection={secondarySelection}
                onPrimaryChange={handlePrimaryChange}
                onSecondaryChange={handleSecondaryChange}
              />
            </div>
          ) : (
            <div className='bg-white/60 dark:bg-gray-800/40 rounded-2xl p-4 sm:p-6 border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
              <DoubanCustomSelector
                customCategories={customCategories}
                primarySelection={primarySelection}
                secondarySelection={secondarySelection}
                onPrimaryChange={handlePrimaryChange}
                onSecondaryChange={handleSecondaryChange}
              />
            </div>
          )}
        </div>

        {/* 内容展示区域 */}
        <div className='max-w-[95%] mx-auto mt-8 overflow-visible'>
          {/* 内容网格 */}
          <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
            {loading || !selectorsReady
              ? // 显示骨架屏
                skeletonData.map((index) => <DoubanCardSkeleton key={index} />)
              : // 显示实际数据
                doubanData.map((item, index) => (
                  <div key={`${item.title}-${index}`} className='w-full'>
                    <VideoCard
                      from='douban'
                      title={item.title}
                      poster={item.poster}
                      douban_id={item.id}
                      rate={item.rate}
                      year={item.year}
                      type={type === 'movie' ? 'movie' : ''}
                    />
                  </div>
                ))}
          </div>

          {/* 加载更多指示器 */}
          {hasMore && !loading && (
            <div
              ref={(el) => {
                if (el && el.offsetParent !== null) {
                  (
                    loadingRef as React.MutableRefObject<HTMLDivElement | null>
                  ).current = el;
                }
              }}
              className='flex justify-center mt-12 py-8'
            >
              {isLoadingMore && (
                <div className='flex items-center gap-2'>
                  <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500'></div>
                  <span className='text-gray-600'>加载中...</span>
                </div>
              )}
            </div>
          )}

          {/* 没有更多数据提示 */}
          {!hasMore && doubanData.length > 0 && (
            <div className='text-center text-gray-500 py-8'>已加载全部内容</div>
          )}

          {/* 空状态 */}
          {!loading && doubanData.length === 0 && (
            <div className='text-center text-gray-500 py-8'>暂无相关内容</div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default function DoubanPage() {
  return (
    <Suspense>
      <DoubanPageClient />
    </Suspense>
  );
}
