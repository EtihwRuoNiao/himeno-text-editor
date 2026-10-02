/**
 * 应用元信息：作者 / 仓库 / 许可证。
 * 「关于」面板与 README 共用同一来源；更换仓库名时只需修改本文件。
 */
export const APP_NAME_ZH = '大卡波领域大神编辑器';
export const APP_NAME_EN = 'Himeno Text Editor';

export const APP_AUTHOR = 'EtihwRuoNiao';
export const APP_AUTHOR_URL = 'https://github.com/EtihwRuoNiao';

export const APP_REPO_NAME = 'himeno-text-editor';
export const APP_REPO_URL = `https://github.com/${APP_AUTHOR}/${APP_REPO_NAME}`;

export const APP_LICENSE_LABEL = 'MIT OR Apache-2.0';
export const APP_LICENSE_MIT_URL = `${APP_REPO_URL}/blob/main/LICENSE-MIT`;
export const APP_LICENSE_APACHE_URL = `${APP_REPO_URL}/blob/main/LICENSE-APACHE`;

/** 最新正式版 API（api.github.com 返回 CORS 头，可直接 fetch；release.name 即"注明版本号"） */
export const APP_LATEST_RELEASE_API = `https://api.github.com/repos/${APP_AUTHOR}/${APP_REPO_NAME}/releases/latest`;
/** 用户可见的"最新正式版"页面 */
export const APP_RELEASES_LATEST_URL = `${APP_REPO_URL}/releases/latest`;

export const APP_TECH_STACK = 'Tauri + React';
export const APP_COPYRIGHT_YEAR = '2026';
