# 第三方组件许可 / Third-Party Notices

本文件列出本项目**直接依赖**的第三方组件及其许可证。

> 本项目自身以 **MIT OR Apache-2.0** 发布，见 [LICENSE-MIT](LICENSE-MIT) 与 [LICENSE-APACHE](LICENSE-APACHE)。
> 素材与品牌声明见 [ASSETS.md](ASSETS.md)。

完整的（含传递依赖）清单可用以下命令获取：

```bash
npm ls --omit=dev                              # 前端
cargo metadata --format-version 1 --manifest-path src-tauri/Cargo.toml   # 后端
```

## 前端（npm 生产依赖）

| 组件 | 版本 | 许可证 |
|---|---|---|
| `@tailwindcss/vite` | 4.2.1 | MIT |
| `@tanstack/react-virtual` | 3.13.19 | MIT |
| `@tauri-apps/api` | 2.11.0 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-dialog` | 2.7.1 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-fs` | 2.5.1 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-opener` | 2.5.4 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-process` | 2.3.1 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-shell` | 2.3.5 | MIT OR Apache-2.0 |
| `@vitejs/plugin-react` | 5.1.4 | MIT |
| `idb-keyval` | 6.2.2 | Apache-2.0 |
| `lucide-react` | 0.546.0 | ISC |
| `motion` | 12.34.3 | MIT |
| `react` | 19.2.4 | MIT |
| `react-dom` | 19.2.4 | MIT |
| `react-virtuoso` | 4.18.1 | MIT |
| `vite` | 6.4.1 | MIT |

## 后端（Rust 直接依赖）

| crate | 版本 | 许可证 |
|---|---|---|
| `font-kit` | 0.14.3 | MIT OR Apache-2.0 |
| `log` | 0.4.32 | MIT OR Apache-2.0 |
| `serde` | 1.0.228 | MIT OR Apache-2.0 |
| `serde_json` | 1.0.150 | MIT OR Apache-2.0 |
| `tauri` | 2.11.2 | Apache-2.0 OR MIT |
| `tauri-plugin-dialog` | 2.7.1 | Apache-2.0 OR MIT |
| `tauri-plugin-fs` | 2.5.1 | Apache-2.0 OR MIT |
| `tauri-plugin-log` | 2.8.0 | Apache-2.0 OR MIT |
| `tauri-plugin-opener` | 2.5.4 | Apache-2.0 OR MIT |
| `tauri-plugin-process` | 2.3.1 | Apache-2.0 OR MIT |
| `tauri-plugin-shell` | 2.3.5 | Apache-2.0 OR MIT |

---

_本清单依据 `package.json` / `src-tauri/Cargo.toml` 与实际安装的包信息生成。_
