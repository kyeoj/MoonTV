type ConvertFn = (text: string) => string;

let t2sConverter: ConvertFn | null = null;
let s2tConverter: ConvertFn | null = null;
let initPromise: Promise<void> | null = null;

async function ensureConverters(): Promise<void> {
  if (t2sConverter && s2tConverter) return;
  if (!initPromise) {
    initPromise = (async () => {
      const OpenCC = await import('opencc-js');
      t2sConverter = OpenCC.Converter({ from: 't', to: 'cn' });
      s2tConverter = OpenCC.Converter({ from: 'cn', to: 't' });
    })();
  }
  return initPromise;
}

/**
 * 将繁体中文异步转换为简体中文
 */
export async function toSimplified(text: string): Promise<string> {
  if (!text) return '';
  try {
    await ensureConverters();
    return t2sConverter ? t2sConverter(text) : text;
  } catch {
    return text;
  }
}

/**
 * 将简体中文异步转换为繁体中文
 */
export async function toTraditional(text: string): Promise<string> {
  if (!text) return '';
  try {
    await ensureConverters();
    return s2tConverter ? s2tConverter(text) : text;
  } catch {
    return text;
  }
}

/**
 * 获取规范化搜索词列表
 * 当输入包含繁体中文时，同时生成简体中文查询词进行联合检索
 */
export async function getNormalizedSearchQueries(
  query: string
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const simplified = await toSimplified(trimmed);
  if (simplified && simplified !== trimmed) {
    // 优先使用简体检索（绝大部分资源采集站均使用简体），同时保留原始繁体作为备选
    return [simplified, trimmed];
  }
  return [trimmed];
}
