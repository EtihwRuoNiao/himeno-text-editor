# 助手资源目录

本目录由《大卡波领域大神编辑器》在首次启动时自动生成，位于**可执行程序（exe）同级**。
程序启动后会扫描 `assistants/`，把其中的**每个子文件夹识别为一个助手**。

```
assets/
├── README.md                  本说明
├── assistants/
│   ├── manifest.schema.json    manifest.json 的 JSON Schema（编辑器校验用）
│   ├── _template/              参考模板：复制改名即可新增助手（_ 开头不会被扫描）
│   │   ├── manifest.json
│   │   ├── avatar.png
│   │   ├── quotes.zh-CN.txt
│   │   └── quotes.en-US.txt
│   └── 你的助手名/              ← 自建目录
│       ├── manifest.json       （可选，不放也能用）
│       ├── avatar.gif|png|apng （必需，目录内第一张图片即头像）
│       └── quotes.zh-CN.txt    （可选，每行一条台词）
└── icon/                       自建目录（自定义程序图标用，见下文）
    └── icon.png                放进这里即替换窗口/任务栏图标
```

## 三步添加一个助手

1. 复制 `assistants/_template` 整个文件夹，改名为你想要的助手名（如 `my_partner`）。
2. 把里面的 `avatar.png` 换成你自己的图片。**支持 gif / png / apng**（apng 动态图可正常播放）。
3. 编辑 `quotes.zh-CN.txt`，每行写一条台词。保存后重新打开设置面板即可看到。

## 零配置规则

不放 `manifest.json` 也能工作，程序按以下默认值推断：

| 项目 | 缺省值 |
|---|---|
| 显示名 | 文件夹名 |
| 头像 | 目录内第一张 `gif/png/apng/webp` 图片 |
| 台词 | `quotes.zh-CN.txt` / `quotes.en-US.txt` |
| 气泡配色 | `gray`（中性灰） |
| 气泡停留 | 3000 毫秒 |
| 头像填充 | `cover`（裁剪填满） |

## manifest.json 字段

```json
{
  "version": 1,
  "displayName": "小助手",
  "symbol": "🌸",
  "fit": "cover",
  "avatar": "avatar.png",
  "bubble": { "variant": "pink", "durationMs": 3000 },
  "quotes": { "zh-CN": "quotes.zh-CN.txt", "en-US": "quotes.en-US.txt" }
}
```

- `symbol`：显示在气泡文字前后的表情，例如 `🌸` 会让气泡显示为 `🌸台词🌸`。
- `fit`：`cover` 裁剪填满（默认）／`contain` 完整显示。
- `bubble.variant`：可选 `pink`、`pinkDeep`、`yellow`、`yellowDeep`、`green`、`gray`、`blue`、`purple`。
- `bubble.durationMs`：气泡停留时长，500 ~ 60000 毫秒。
- `avatar` / `quotes`：只接受**本目录内的文件名**，不允许路径分隔符或 `..`。

## 台词文件格式

```
# 以 # 开头的行会被忽略
这是一条台词。
这是另一条台词。
```

空行会被忽略；点一下助手头像，就会从台词里随机抽一条显示成气泡。

## 自定义程序图标

在 `assets/` 下新建 `icon/` 目录，放入一张 PNG 并命名为 `icon.png`：

```
assets/icon/icon.png
```

- 程序启动时自动应用为**窗口标题栏与任务栏图标**；也可在「窗口设置」里用「自定义程序图标」开关切换。
- 仅支持 PNG、正方形，建议 256×256 或更大，且不超过 4 MB。
- 这只影响**运行时**图标。**exe 文件在资源管理器里显示的图标**由构建期决定，需用源码仓库里的脚本重新生成：

```
npm run icons -- path/to/your-icon.png
```

## 常见问题

- **改了文件没反应？** 重新打开设置面板（关闭再打开）会重新扫描目录。
- **助手上没有图片？** 检查图片扩展名是否为 `gif/png/apng/webp`，且文件是否直接放在助手目录下。
- **`manifest.json` 写错了？** 程序会忽略该文件并按零配置规则处理，不会崩溃；可用 `manifest.schema.json` 校验。
- **程序图标没变？** 确认文件名是 `assets/icon/icon.png`（必须是 PNG），并在「窗口设置」里打开「自定义程序图标」。
- **浏览器里打开？** 本功能仅桌面版可用（浏览器无法访问 exe 同级目录）。

## 版权提示

本目录中的素材由你自己提供。请勿放入你无权分发的第三方素材。
