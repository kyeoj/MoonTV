/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getDoubanCategories, getDoubanList } from '@/lib/douban.client';
import { DoubanItem, DoubanResult } from '@/lib/types';

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
  >('year_desc');
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const type = searchParams.get('type') || 'movie';

  // 获取 runtimeConfig 中的自定义分类数据
  const [customCategories, setCustomCategories] = useState<
    Array<{ name: string; type: 'movie' | 'tv'; query: string }>
  >([]);

  // 选择器状态 - 完全独立，不依赖URL参数
  const [primarySelection, setPrimarySelection] = useState<string>(() => {
    if (type === 'movie') return '热门';
    if (type === 'tv') return 'tv';
    return '';
  });
  const [secondarySelection, setSecondarySelection] = useState<string>(() => {
    if (type === 'movie') return '全部';
    if (type === 'tv') return 'tv';
    if (type === 'show') return 'show';
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
    // 短暂延迟确保初始状态设置完成
    const timer = setTimeout(() => {
      setSelectorsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, []); // 只在组件挂载时执行一次

  // type变化时立即重置selectorsReady（最高优先级）
  useEffect(() => {
    setSelectorsReady(false);
    setLoading(true); // 立即显示loading状态
  }, [type]);

  // 当type变化时重置选择器状态
  useEffect(() => {
    if (type === 'custom' && customCategories.length > 0) {
      // 自定义分类模式：优先选择 movie，如果没有 movie 则选择 tv
      const types = Array.from(
        new Set(customCategories.map((cat) => cat.type))
      );
      if (types.length > 0) {
        // 优先选择 movie，如果没有 movie 则选择 tv
        let selectedType = types[0]; // 默认选择第一个
        if (types.includes('movie')) {
          selectedType = 'movie';
        } else {
          selectedType = 'tv';
        }
        setPrimarySelection(selectedType);

        // 设置选中类型的第一个分类的 query 作为二级选择
        const firstCategory = customCategories.find(
          (cat) => cat.type === selectedType
        );
        if (firstCategory) {
          setSecondarySelection(firstCategory.query);
        }
      }
    } else {
      // 原有逻辑
      if (type === 'movie') {
        setPrimarySelection('热门');
        setSecondarySelection('全部');
      } else if (type === 'tv') {
        setPrimarySelection('tv');
        setSecondarySelection('tv');
      } else if (type === 'show') {
        setPrimarySelection('');
        setSecondarySelection('show');
      } else {
        setPrimarySelection('');
        setSecondarySelection('全部');
      }
    }

    // 使用短暂延迟确保状态更新完成后标记选择器准备好
    const timer = setTimeout(() => {
      setSelectorsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [type, customCategories]);

  // 生成骨架屏数据
  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  // 生成API请求参数的辅助函数
  const getRequestParams = useCallback(
    (pageStart: number) => {
      if (type === 'tv') {
        return {
          kind: 'tv' as const,
          category: primarySelection || 'tv',
          type: secondarySelection,
          pageLimit: 25,
          pageStart,
        };
      }

      if (type === 'show') {
        return {
          kind: 'tv' as const,
          category: 'show',
          type: secondarySelection,
          pageLimit: 25,
          pageStart,
        };
      }

      // 电影类型
      return {
        kind: type as 'tv' | 'movie',
        category: primarySelection || '热门',
        type: secondarySelection,
        pageLimit: 25,
        pageStart,
      };
    },
    [type, primarySelection, secondarySelection]
  );

  // 防抖的数据加载函数
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      let data: DoubanResult;

      if (type === 'custom') {
        // 自定义分类模式：根据选中的一级和二级选项获取对应的分类
        const selectedCategory = customCategories.find(
          (cat) =>
            cat.type === primarySelection && cat.query === secondarySelection
        );

        if (selectedCategory) {
          const apiSort =
            sortOrder === 'rate_desc'
              ? 'rank'
              : sortOrder === 'default'
              ? 'recommend'
              : 'time';
          data = await getDoubanList({
            tag: selectedCategory.query,
            type: selectedCategory.type,
            pageLimit: 25,
            pageStart: 0,
            sort: apiSort,
          });
        } else {
          throw new Error('没有找到对应的分类');
        }
      } else {
        data = await getDoubanCategories(getRequestParams(0));
      }

      if (data.code === 200) {
        setDoubanData(data.list);
        setHasMore(data.list.length === 25);
        setLoading(false);
      } else {
        throw new Error(data.message || '获取数据失败');
      }
    } catch (err) {
      console.error(err);
    }
  }, [
    type,
    primarySelection,
    secondarySelection,
    getRequestParams,
    customCategories,
    sortOrder,
  ]);

  // 只在选择器准备好后才加载数据
  useEffect(() => {
    // 只有在选择器准备好时才开始加载
    if (!selectorsReady) {
      return;
    }

    // 重置页面状态
    setDoubanData([]);
    setCurrentPage(0);
    setHasMore(true);
    setIsLoadingMore(false);

    // 清除之前的防抖定时器
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // 使用防抖机制加载数据，避免连续状态更新触发多次请求
    debounceTimeoutRef.current = setTimeout(() => {
      loadInitialData();
    }, 100); // 100ms 防抖延迟

    // 清理函数
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
    loadInitialData,
  ]);

  // 单独处理 currentPage 变化（加载更多）
  useEffect(() => {
    if (currentPage > 0) {
      const fetchMoreData = async () => {
        try {
          setIsLoadingMore(true);

          let data: DoubanResult;
          if (type === 'custom') {
            // 自定义分类模式：根据选中的一级和二级选项获取对应的分类
            const selectedCategory = customCategories.find(
              (cat) =>
                cat.type === primarySelection &&
                cat.query === secondarySelection
            );

            if (selectedCategory) {
              const apiSort =
                sortOrder === 'rate_desc'
                  ? 'rank'
                  : sortOrder === 'default'
                  ? 'recommend'
                  : 'time';
              data = await getDoubanList({
                tag: selectedCategory.query,
                type: selectedCategory.type,
                pageLimit: 25,
                pageStart: currentPage * 25,
                sort: apiSort,
              });
            } else {
              throw new Error('没有找到对应的分类');
            }
          } else {
            data = await getDoubanCategories(
              getRequestParams(currentPage * 25)
            );
          }

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
  }, [
    currentPage,
    type,
    primarySelection,
    secondarySelection,
    customCategories,
    sortOrder,
  ]);

  // 设置滚动监听
  useEffect(() => {
    // 如果没有更多数据或正在加载，则不设置监听
    if (!hasMore || isLoadingMore || loading) {
      return;
    }

    // 确保 loadingRef 存在
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
      // 只有当值真正改变时才设置loading状态
      if (value !== primarySelection) {
        setLoading(true);

        // 智能根据选中的主标签切换排序策略
        if (value === '最新') {
          setSortOrder('year_desc');
        } else if (value === '热门' || value === 'tv') {
          setSortOrder('default');
        } else if (value === '豆瓣高分') {
          setSortOrder('rate_desc');
        }

        // 如果是自定义分类模式，同时更新一级和二级选择器
        if (type === 'custom' && customCategories.length > 0) {
          const firstCategory = customCategories.find(
            (cat) => cat.type === value
          );
          if (firstCategory) {
            // 批量更新状态，避免多次触发数据加载
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
      // 只有当值真正改变时才设置loading状态
      if (value !== secondarySelection) {
        setLoading(true);
        setSecondarySelection(value);
      }
    },
    [secondarySelection]
  );

  // 排序后的展示数据
  const displayData = useMemo(() => {
    if (sortOrder === 'year_desc') {
      return [...doubanData].sort((a, b) => {
        const yearA = parseInt(a.year) || 0;
        const yearB = parseInt(b.year) || 0;
        if (yearB !== yearA) {
          return yearB - yearA; // 年份倒序，最新在前
        }
        return 0;
      });
    }
    if (sortOrder === 'rate_desc') {
      return [...doubanData].sort((a, b) => {
        const rateA = parseFloat(a.rate) || 0;
        const rateB = parseFloat(b.rate) || 0;
        if (rateB !== rateA) {
          return rateB - rateA; // 评分降序
        }
        return 0;
      });
    }
    return doubanData;
  }, [doubanData, sortOrder]);

  const getPageTitle = () => {
    // 根据 type 生成标题
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
                来自豆瓣的精选内容
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
                displayData.map((item, index) => (
                  <div key={`${item.title}-${index}`} className='w-full'>
                    <VideoCard
                      from='douban'
                      title={item.title}
                      poster={item.poster}
                      douban_id={item.id}
                      rate={item.rate}
                      year={item.year}
                      type={type === 'movie' ? 'movie' : ''} // 电影类型严格控制，tv 不控
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
          {!hasMore && displayData.length > 0 && (
            <div className='text-center text-gray-500 py-8'>已加载全部内容</div>
          )}

          {/* 空状态 */}
          {!loading && displayData.length === 0 && (
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
