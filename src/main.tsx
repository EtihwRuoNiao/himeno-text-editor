import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ensureAssetScaffold } from './services/assetService';

// 启动引导：确保可执行程序同级的 assets 目录与参考模板存在。
// 已存在的文件不会被覆盖；浏览器环境或初始化失败均静默跳过，不影响应用启动。
void ensureAssetScaffold().then((res) => {
  if (res.created.length > 0) console.info('[assets] 已生成参考文件:', res.created.join(', '));
  else if (res.error) console.warn('[assets] 初始化跳过:', res.error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
