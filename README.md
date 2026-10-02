<div align="center">
<a rel="noopener" target="_blank" href="https://circus-co.jp/product/dc5/"><img alt="少年は、運命に出会う――「D.C.5 ～ダ・カーポ5～」好評発売中" title="少年は、運命に出会う――「D.C.5 ～ダ・カーポ5～」好評発売中" src="https://circus-co.jp/product/dc5/rc/special/dc5-banner-650x120.jpg"></a>
</div>

<div align="center">

<img src="HimenoIcon.png" width="112" alt="大卡波领域大神编辑器 / Himeno Text Editor">

# 大卡波领域大神编辑器

**Himeno Text Editor** — 面向拥有固定解析格式脚本文本的对照翻译编辑器

[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#许可证)
![Version](https://img.shields.io/badge/version-0.8.0-informational)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

</div>

---

## 简介

一款面向视觉小说的**脚本文本对照翻译**桌面编辑器。针对以固定格式保存的脚本文本文件，
把「原文 / 译文」按行对齐呈现与编辑，配合词典、模糊匹配与工作区管理，
尽量减少翻译过程中的重复劳动。

> 本项目为**非官方同人工具**，与株式会社 CIRCUS 及《D.C.～ダ・カーポ～》系列官方
> 无任何隶属关系；仓库内不包含任何官方素材文件。详见 [ASSETS.md](ASSETS.md)。

## 功能

- **对照编辑**：原文/译文逐行对照，支持按行号跳转、孤儿行（结构不匹配）识别
- **词典与替换**：多词典、分类、模糊匹配，支持批量替换
- **检索**：文件内查找/替换、跨文件检索
- **工作区**：多工作区并行，会话状态、草稿与自动保存（草稿保留 30 天）
- **格式配置**：可自定义行正则/ID 正则，并按文件夹绑定
- **外观**：界面字体、工作区字体
- **助手与图标**：从程序同级的 `assets/` 目录读取自定义助手（gif / png / apng）与程序图标
- **检查更新**：手动检查 GitHub Release，发现新版本时给出提示与直达链接

## 运行

### 桌面版（推荐）

前置条件：

- **Node.js** 18 及以上
- **Rust** 工具链（<https://rustup.rs/>）
- Windows 需要 **WebView2**（Win11 已内置；Win10 一般已随 Edge 安装）

```bash
npm install
npm run tauri dev
```

打包发行版：

```bash
npm run tauri build
```

Windows 用户也可以直接双击 `run.bat`（自动安装依赖并启动开发模式）。

### 浏览器版（仅开发/自测）

```bash
npm run dev        # http://localhost:3000
```

浏览器环境无法访问「可执行程序同级目录」，因此**助手资源与自定义图标不可用**，
其余编辑功能正常。

## 自定义助手与程序图标

程序首次启动时会在**可执行程序同级目录**生成 `assets/`：

```
<exe 同级>/
├── portable_data/     程序自动创建（WebView2 数据）
└── assets/
    ├── README.md                 完整自定义指南（首次启动自动生成）
    ├── assistants/<助手名>/      头像 + 台词
    └── icon/icon.png             自定义程序图标
```

完整说明见 [`src/assets/customization/files/README.md`](src/assets/customization/files/README.md)
（即程序生成的 `assets/README.md`）。

构建期图标（exe / 安装包图标）由脚本生成：

```bash
npm run icons -- path/to/your-icon.png
```

## 开发命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run lint` | TypeScript 类型检查 |
| `npm run build` | 构建前端产物到 `dist/` |
| `npm run tauri dev` | 启动桌面版开发模式 |
| `npm run tauri build` | 打包发行版 |
| `npm run icons -- <png>` | 由一张 PNG 生成整套构建期图标 |
| `npm run clean` | 清理 `dist/` |

## 技术栈

Tauri 2 · React 19 · TypeScript · Vite 6 · Tailwind CSS 4

## 项目结构

```
src/                        前端（React + TS）
├── components/             界面组件
├── services/               资源目录 / 程序图标 / 检查更新
├── assets/customization/   首次启动写出的参考模板
├── i18n/                   中英文案
└── workspace/              工作区会话
src-tauri/                  Rust 后端（Tauri）
scripts/gen-icons.mjs       构建期图标生成
```

## 致谢

- **Google AI Studio** —— 本项目的原型最早在 Google AI Studio 中搭建，后经重构为独立的
  Tauri 桌面应用。感谢它提供的起步环境。
- 开源社区 —— Tauri、React、Vite、Tailwind CSS、lucide、motion 等，详见
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 同人声明

- 本软件为**非官方同人工具**，与株式会社 CIRCUS 无任何隶属、赞助或合作关系。
- 本仓库不包含任何官方素材**文件**；README 顶部的宣传横幅为官方配布的応援バナー，
  以**图片外链**方式引用，未收录进仓库。
- 程序图标为作者自制。
- 使用者自行放入 `assets/` 的素材由使用者负责，其权利归各自权利人所有。
- 相关角色、名称与商标的一切权利归株式会社 CIRCUS 所有。

## 许可证

本项目以 **MIT OR Apache-2.0** 双许可发布，你可任选其一：

- [LICENSE-MIT](LICENSE-MIT)
- [LICENSE-APACHE](LICENSE-APACHE)

第三方组件许可见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)；
素材与品牌声明见 [ASSETS.md](ASSETS.md)。

## 相关链接

- 《D.C.5 ～ダ・カーポ5～》官方网站：<https://circus-co.jp/product/dc5/>
- 官方応援バナー配布页：<https://circus-co.jp/product/dc5/special/download/>
