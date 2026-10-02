// 隐藏 Windows 下的控制台窗口 (仅在 release 构建时生效)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;

use tauri::{Emitter, Manager};

// 系统字体族名枚举（供字体设置下拉列表使用）
// async：Tauri 将异步命令派发到线程池执行，避免 DirectWrite 全量枚举阻塞主线程
#[tauri::command]
async fn list_system_fonts() -> Result<Vec<String>, String> {
    use font_kit::source::SystemSource;
    SystemSource::new()
        .all_families()
        .map_err(|e| format!("{e}"))
}

/// 可执行程序所在目录（便携模式的根目录）
fn current_exe_dir() -> Option<std::path::PathBuf> {
    env::current_exe().ok()?.parent().map(|p| p.to_path_buf())
}

/// 助手资源目录：<exe 同级>/assets，不存在时自动创建。
/// 前端 assetService 通过该命令取得资源根目录，用于读取用户自定义的助手头像与台词。
#[tauri::command]
fn app_asset_dir() -> Result<String, String> {
    let dir = current_exe_dir()
        .ok_or_else(|| "无法定位可执行程序所在目录".to_string())?
        .join("assets");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建资源目录失败: {e}"))?;
    }
    dir.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "资源目录路径不是有效的 UTF-8".to_string())
}

// ============================ 系统托盘 ============================

/// 托盘图标 id（前端通过它间接定位托盘）
const TRAY_ID: &str = "main-tray";
/// 托盘菜单项 id（文案随语言重建，id 保持不变）
const TRAY_MENU_SHOW: &str = "tray_show";
const TRAY_MENU_QUIT: &str = "tray_quit";
/// 托盘小图标目标尺寸（Windows 通知区域按 16/32 显示）
const TRAY_ICON_SIZE: u32 = 32;
/// 前端监听此事件走「落盘 + 草稿」流程后再退出
const EVENT_TRAY_QUIT: &str = "app-tray-quit";

/// 显示并聚焦主窗口（托盘左键单击 / 菜单「显示主窗口」）
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 托盘小图标降采样：alpha 加权盒式平均，避免透明边缘出现暗边。
fn downscale_rgba(src: &[u8], sw: u32, sh: u32, size: u32) -> Vec<u8> {
    let mut out = vec![0u8; size as usize * size as usize * 4];
    if sw == 0 || sh == 0 || src.len() < sw as usize * sh as usize * 4 {
        return out;
    }
    for y in 0..size {
        let y0 = y * sh / size;
        let y1 = (((y + 1) * sh + size - 1) / size).min(sh);
        for x in 0..size {
            let x0 = x * sw / size;
            let x1 = (((x + 1) * sw + size - 1) / size).min(sw);
            let (mut r, mut g, mut b, mut a, mut n) = (0u64, 0u64, 0u64, 0u64, 0u64);
            for sy in y0..y1 {
                for sx in x0..x1 {
                    let i = (sy * sw + sx) as usize * 4;
                    let av = src[i + 3] as u64;
                    r += src[i] as u64 * av;
                    g += src[i + 1] as u64 * av;
                    b += src[i + 2] as u64 * av;
                    a += av;
                    n += 1;
                }
            }
            let o = (y * size + x) as usize * 4;
            if n > 0 && a > 0 {
                out[o] = (r / a) as u8;
                out[o + 1] = (g / a) as u8;
                out[o + 2] = (b / a) as u8;
                out[o + 3] = (a / n) as u8;
            }
        }
    }
    out
}

/// 用同一份图标同时更新「窗口/任务栏」与「托盘」，两处不会脱节。
/// path 为 None 时复位为随包内置图标。
#[tauri::command]
fn apply_app_icon(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    let maybe_src = match path {
        Some(p) => {
            let bytes = fs::read(&p).map_err(|e| format!("读取图标失败: {e}"))?;
            if bytes.is_empty() || bytes.len() > 4 * 1024 * 1024 {
                return Err("图标文件为空或超过 4MB".to_string());
            }
            Some(tauri::image::Image::from_bytes(&bytes).map_err(|e| format!("图标解码失败: {e}"))?)
        }
        None => app.default_window_icon().cloned(),
    };
    // 随包未内嵌图标时静默跳过，不因图标缺失让前端报错
    let Some(src) = maybe_src else { return Ok(()) };

    if let Some(win) = app.get_webview_window("main") {
        // 注意：Window::set_icon 收 Image（非 Option），托盘侧才是 Option<Image>
        win.set_icon(src.clone())
            .map_err(|e| format!("设置窗口图标失败: {e}"))?;
    }

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let small = if src.width() == TRAY_ICON_SIZE && src.height() == TRAY_ICON_SIZE {
            src.clone()
        } else {
            tauri::image::Image::new_owned(
                downscale_rgba(src.rgba(), src.width(), src.height(), TRAY_ICON_SIZE),
                TRAY_ICON_SIZE,
                TRAY_ICON_SIZE,
            )
        };
        tray.set_icon(Some(small))
            .map_err(|e| format!("设置托盘图标失败: {e}"))?;
    }
    Ok(())
}

/// 重建托盘菜单文案并同步悬停提示（语言切换时由前端调用）。
#[tauri::command]
fn set_tray_menu(
    app: tauri::AppHandle,
    show: String,
    quit: String,
    tooltip: String,
) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "托盘尚未初始化".to_string())?;
    let show_item = tauri::menu::MenuItem::with_id(&app, TRAY_MENU_SHOW, &show, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit_item = tauri::menu::MenuItem::with_id(&app, TRAY_MENU_QUIT, &quit, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let menu =
        tauri::menu::Menu::with_items(&app, &[&show_item, &quit_item]).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    let _ = tray.set_tooltip(Some(&tooltip));
    Ok(())
}

// ================================================================

fn main() {
    // 1. 获取当前 exe 所在目录
    if let Some(exe_dir) = current_exe_dir() {
        // 2. 定义数据目录路径：在 exe 同级目录下创建 portable_data 文件夹
        let data_dir = exe_dir.join("portable_data");

        // 3. 如果该文件夹不存在，自动创建它
        if !data_dir.exists() {
            let _ = fs::create_dir_all(&data_dir);
        }

        // 4. 强制重定向 WebView2 数据目录
        // 这一步必须在 tauri::Builder 运行前完成！
        // 这会让 localStorage, IndexedDB, Cookies, 缓存等全部存入该目录
        env::set_var("WEBVIEW2_USER_DATA_FOLDER", &data_dir);
    }

    // 5. 启动 Tauri
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // 系统字体族名枚举（字体设置功能）
        .invoke_handler(tauri::generate_handler![
            list_system_fonts,
            app_asset_dir,
            apply_app_icon,
            set_tray_menu
        ])
        // 6. 将系统级拖拽事件（OLE drop target）转发为前端自定义事件，
        //    绕开 window.onDragDropEvent 在 Windows 上的事件标签兼容问题
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(drag_event) = event {
                match drag_event {
                    tauri::DragDropEvent::Enter { paths, .. } => {
                        eprintln!("[drag] enter: {paths:?}");
                        let _ = window.emit("app-drag-over", paths);
                    }
                    tauri::DragDropEvent::Over { .. } => {
                        let _ = window.emit("app-drag-over", Vec::<String>::new());
                    }
                    tauri::DragDropEvent::Drop { paths, .. } => {
                        eprintln!("[drag] drop: {paths:?}");
                        let _ = window.emit("app-drag-drop", paths);
                    }
                    _ => {
                        eprintln!("[drag] leave/cancel");
                        let _ = window.emit("app-drag-leave", ());
                    }
                }
            }
        })
        // 7. 系统托盘：左键显示主窗口；菜单由前端按语言重建文案
        .setup(|app| {
            let show_item =
                tauri::menu::MenuItem::with_id(app, TRAY_MENU_SHOW, "显示主窗口", true, None::<&str>)?;
            let quit_item =
                tauri::menu::MenuItem::with_id(app, TRAY_MENU_QUIT, "退出", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show_item, &quit_item])?;
            let mut builder = tauri::tray::TrayIconBuilder::with_id(TRAY_ID)
                .tooltip("Himeno Text Editor")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    if id == TRAY_MENU_SHOW {
                        show_main_window(app);
                    } else if id == TRAY_MENU_QUIT {
                        // 不直接 app.exit()：先让前端走既有的落盘 + 草稿流程，避免丢数据
                        let _ = app.emit(EVENT_TRAY_QUIT, ());
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                ;
            // 图标可选：缺失时托盘仍可用（后续 apply_app_icon 会补上）
            if let Some(icon) = app.default_window_icon().cloned() {
                builder = builder.icon(icon);
            }
            builder.build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
