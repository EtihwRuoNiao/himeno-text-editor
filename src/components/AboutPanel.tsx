import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from '../contexts/AppContext';
import { openExternal } from '../utils/openExternal';
import { checkLatestVersion, getPendingUpdate } from '../services/updateCheckService';
import {
  APP_AUTHOR,
  APP_AUTHOR_URL,
  APP_COPYRIGHT_YEAR,
  APP_LICENSE_APACHE_URL,
  APP_LICENSE_MIT_URL,
  APP_NAME_EN,
  APP_NAME_ZH,
  APP_RELEASES_LATEST_URL,
  APP_REPO_NAME,
  APP_REPO_URL,
  APP_TECH_STACK,
} from '../config/appInfo';
import appIconUrl from '../assets/customization/files/_template/avatar.png?url';

/**
 * 「关于」内容的固定高度：两处入口（设置面板 / 文件列表）尺寸一致，
 * 外部据此计算弹出层翻转阈值，不再依赖运行时测量。
 *
 * 高度由固定行高拼出，与语言、面板宽度无关（中/英 × 两处入口实测均为 206）：
 *   头部 52 + 间距 12 + 分隔线 1 + 间距 12
 *   + 4 行 × 16 + 3 × 间距 8 = 88
 *   + 间距 12 + 分隔线 1 + 间距 12 + 版权行 16 = 206
 */
export const ABOUT_PANEL_HEIGHT = 206;
/**
 * 弹出层相对面板的额外高度，供外部计算翻转阈值：
 * 标题行（text-sm + mb-3 ≈ 32）+ 内边距 p-4（上下 32）+ 边框（2）= 66
 * 实测弹出层总高 = ABOUT_PANEL_HEIGHT + 66 = 342px
 */
export const ABOUT_POPOVER_EXTRA = 66;

interface AboutPanelProps {
  /** 是否显示「检查更新」按钮（仅设置面板传入 true；两处尺寸保持一致） */
  showUpdateCheck?: boolean;
}

const LinkButton: React.FC<{ label: string; url: string; onFail: () => void }> = ({ label, url, onFail }) => (
  <button
    type="button"
    onClick={async () => { if (!(await openExternal(url))) onFail(); }}
    className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 hover:underline transition-colors"
  >
    {label}
    <ExternalLink size={10} className="shrink-0" />
  </button>
);

/** 「关于」内容：被设置面板与文件列表面板共用 */
export const AboutPanel: React.FC<AboutPanelProps> = ({ showUpdateCheck = false }) => {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failDetail, setFailDetail] = useState('');
  // 「已是最新」：瞬时态（3 秒后回到「检查更新」），避免按钮看起来毫无反应
  const [latest, setLatest] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  // 初值即读取持久化记录（渲染期完成，避免徽章闪入）
  const [pending, setPending] = useState<string | null>(() => getPendingUpdate(__APP_VERSION__));
  const failTimerRef = useRef<number | null>(null);
  const latestTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (failTimerRef.current !== null) window.clearTimeout(failTimerRef.current);
    if (latestTimerRef.current !== null) window.clearTimeout(latestTimerRef.current);
  }, []);

  const onCheck = async () => {
    if (checking) return;
    setChecking(true);
    setFailed(false);
    setLatest(false);
    const res = await checkLatestVersion(__APP_VERSION__);
    setChecking(false);

    if (res.kind === 'newer') { setPending(res.version); return; }
    if (res.kind === 'same') {
      setPending(null);
      setLatestVersion(res.version);
      setLatest(true);
      if (latestTimerRef.current !== null) window.clearTimeout(latestTimerRef.current);
      latestTimerRef.current = window.setTimeout(() => setLatest(false), 3000);
      return;
    }

    // 失败/未解析到版本：保留已有记录（一次网络抖动不应抹掉已知的新版本提示）
    setPending(getPendingUpdate(__APP_VERSION__));
    const detail =
      res.kind === 'no-version' ? t('update_no_version')
      : res.code === 404 ? t('update_err_404')
      : res.code === 403 ? t('update_err_403')
      : res.message === 'timeout' ? t('update_err_timeout')
      : t('update_failed');
    setFailDetail(detail);
    setFailed(true);
    if (failTimerRef.current !== null) window.clearTimeout(failTimerRef.current);
    failTimerRef.current = window.setTimeout(() => setFailed(false), 3000);
  };

  const onFail = () => window.dispatchEvent(new CustomEvent('app-toast', { detail: t('open_link_failed') }));

  // 行高固定 + 不换行：保证面板总高与语言、面板宽度无关（尺寸真正写死）
  // 左块（标签）宽度由最宽标签自适应，与取值之间固定留出一个全角字符（gap-x-3 = 12px）
  const row = (key: string, label: string, content: React.ReactNode) => (
    <React.Fragment key={key}>
      <dt className="min-w-0 truncate text-gray-400">{label}</dt>
      <dd className="min-w-0 truncate text-gray-700">{content}</dd>
    </React.Fragment>
  );

  return (
    <div className="flex flex-col space-y-3" style={{ height: ABOUT_PANEL_HEIGHT }}>
      <div className="flex h-[52px] items-center gap-3 shrink-0">
        <img src={appIconUrl} alt="" className="w-10 h-10 rounded-lg shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-800 truncate">{APP_NAME_ZH}</div>
          <div className="text-xs text-gray-500 truncate">{APP_NAME_EN}</div>
          {/* 版本号 · 检查按钮 · 新版本徽章：同一行固定高度，避免额外占位行留下空白 */}
          <div className="flex h-4 items-center gap-2 overflow-hidden whitespace-nowrap text-[11px] leading-4 font-mono text-gray-400">
            <span className="shrink-0">v{__APP_VERSION__}</span>
            {showUpdateCheck && (
              <button
                type="button"
                onClick={onCheck}
                disabled={checking}
                title={failed ? failDetail : latest ? `${t('update_latest')} v${latestVersion}` : undefined}
                className="shrink-0 rounded px-1.5 font-sans text-[11px] text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:cursor-default transition-colors"
              >
                {checking ? t('update_checking') : failed ? t('update_failed') : latest ? t('update_latest') : t('update_check')}
              </button>
            )}
            {pending && (
              <button
                type="button"
                onClick={async () => { if (!(await openExternal(APP_RELEASES_LATEST_URL))) onFail(); }}
                className="inline-flex shrink-0 items-center gap-0.5 font-sans text-[11px] text-pink-600 hover:underline transition-colors"
              >
                {t('update_available')}
                <ExternalLink size={10} className="shrink-0" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="h-px bg-gray-100 shrink-0" />

      <dl className="grid grid-cols-[auto_1fr] auto-rows-[16px] items-center gap-x-3 gap-y-2 text-xs leading-4">
        {row('author', t('about_author'), <LinkButton label={APP_AUTHOR} url={APP_AUTHOR_URL} onFail={onFail} />)}
        {row('repo', t('about_repository'), <LinkButton label={APP_REPO_NAME} url={APP_REPO_URL} onFail={onFail} />)}
        {row('license', t('about_license'), (
          <span className="inline-flex items-center gap-1">
            <LinkButton label="MIT" url={APP_LICENSE_MIT_URL} onFail={onFail} />
            <span className="text-gray-400">OR</span>
            <LinkButton label="Apache-2.0" url={APP_LICENSE_APACHE_URL} onFail={onFail} />
          </span>
        ))}
        {row('stack', t('about_tech_stack'), APP_TECH_STACK)}
      </dl>

      <div className="h-px bg-gray-100 shrink-0" />

      <div className="text-[11px] leading-4 text-gray-400 shrink-0">© {APP_COPYRIGHT_YEAR} {APP_AUTHOR}</div>
    </div>
  );
};
