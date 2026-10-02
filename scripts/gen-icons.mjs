#!/usr/bin/env node
/**
 * 由一张 PNG 生成 Tauri 需要的整套应用图标（src-tauri/icons/**）。
 *
 * 用法：
 *   npm run icons -- path/to/icon.png
 *   npm run icons -- path/to/icon.png --dry-run
 *
 * 说明：
 * - 输入必须是 PNG，正方形，建议 1024x1024（最小 512x512）。
 * - 只影响**构建期**的 exe / 安装包图标。运行时的窗口与任务栏图标
 *   由 <exe 同级>/assets/icon/icon.png 提供，见 assets/README.md。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_SIDE = 512;
const RECOMMENDED_SIDE = 1024;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const fail = (msg) => { console.error(`[icons] ${msg}`); process.exit(1); };

function readPngSize(file) {
  const buf = readFileSync(file);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const input = args.find((a) => !a.startsWith('--'));

if (!input) fail('缺少输入 PNG。用法：npm run icons -- path/to/icon.png');
const src = path.resolve(input);
if (!existsSync(src)) fail(`找不到文件：${src}`);

const size = readPngSize(src);
if (!size) fail(`${src} 不是有效的 PNG 文件`);
if (size.width !== size.height) fail(`图标必须是正方形，当前为 ${size.width}x${size.height}`);
if (size.width < MIN_SIDE) fail(`图标过小（${size.width}x${size.height}），至少需要 ${MIN_SIDE}x${MIN_SIDE}`);
if (size.width < RECOMMENDED_SIDE) {
  console.warn(`[icons] 建议使用 ${RECOMMENDED_SIDE}x${RECOMMENDED_SIDE}，当前 ${size.width}x${size.height}`);
}

// CLI 调用方式：
// Windows 上 Node 禁止不带 shell 直接 spawn .cmd（EINVAL），
// 因此优先用当前 node 直接执行 @tauri-apps/cli 的入口脚本。
const cliEntry = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const useNode = existsSync(cliEntry);
const cmd = useNode ? process.execPath : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
const cmdArgs = useNode ? [cliEntry, 'icon', src] : ['--no-install', 'tauri', 'icon', src];

console.log(`[icons] 输入：${src} (${size.width}x${size.height})`);
console.log(`[icons] 执行：${useNode ? 'node' : cmd} ${cmdArgs.join(' ')}`);
console.log('[icons] 输出：src-tauri/icons/**（icon.ico / icon.icns / 各平台尺寸）');

if (dryRun) {
  console.log('[icons] --dry-run：未执行');
  process.exit(0);
}

const res = spawnSync(cmd, cmdArgs, {
  stdio: 'inherit',
  cwd: ROOT,
  shell: !useNode && process.platform === 'win32',
});
if (res.error) fail(`执行失败：${res.error.message}`);
process.exit(res.status ?? 1);
