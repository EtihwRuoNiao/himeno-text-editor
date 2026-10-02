export const translations = {
  'en-US': {

    // Header
    'open_folder': 'Open Folder', 'open_file': 'Open File', 'restore': 'Restore', 'save_export': 'Save', 'undo': 'Undo', 'redo': 'Redo', 'edit_source': 'Edit Source', 'highlight_half': 'Highlight Half-width', 'highlight_full': 'Highlight Full-width', 'file_list': 'File List', 'no_file': 'No File', 'saving': 'Saving...', 'saved': 'Saved', 'error': 'Error',

    // Navigation Control
    'jump_to': 'Jump to',

    // File List
    'files': 'Files', 'search_files': 'Search files...', 'toggle_filter_mode': 'Toggle Filter Mode',

    // Main View
    'no_file_loaded': 'No file loaded', 'open_folder_hint': 'Open/Drop a folder or a text file to start editing',

    // Draft Bar
    'draft_detected': 'Detected an unsaved draft for {fileName} from {time}.', 'restore_draft': 'Restore Draft', 'discard': 'Discard',

    // Context Menu
    'cut': 'Cut', 'copy': 'Copy', 'paste': 'Paste as Plain Text', 'delete': 'Delete', 'search_in_text': 'Search in Editable Text...',

    // Search Panel
    'find': 'Find', 'replace': 'Replace', 'do_replace': 'Replace (Enter)', 'do_replace_all': 'Replace All (Ctrl+Enter)', 'replace_all_confirm': 'Replace All', 'no_results': 'No results', 'match_case': 'Match Case', 'previous_match': 'Previous Match (Shift+Enter)', 'next_match': 'Next Match (Enter)',

    // Settings Modal
    'settings': 'Settings', 'settings_header': 'Settings (ESC)', 'language': 'Language / 语言', 'editor_settings': 'Editor', 'edit_source_desc': 'Allow editing original text', 'highlight_half_desc': 'Highlight all half-width Characters', 'highlight_full_desc': 'Show full-width formal String hints', 'fuzzy_match': 'Fuzzy Match', 'fuzzy_match_desc': 'Match terms across lines & spaces', 'done': 'Done', 'manage_dictionary': 'User Dictionary', 'description_dictionary': 'Underline Untranslated Entries\r\nClick Entry to Copy Target',
    'window_settings': 'Window Settings', 'resolution': 'Resolution', 'fullscreen': 'Fullscreen (F11)', 'start_maximized': 'Maximized (Alt+Enter)',
    'window_settings_updated': 'Window settings updated',
    'custom': 'Custom',
    'close_to_tray': 'Close to tray',
    'tray_show_window': 'Show Main Window',
    'tray_quit': 'Quit',
    'tray_minimized_title': 'Minimize to Tray',
    'tray_minimized_hint': 'The application will keep running in the background. Click the tray icon to bring the window back.',
    'tray_minimize_confirm': 'Minimize to Tray',
    'font_settings': 'Font Settings', 'ui_font': 'UI Font', 'workspace_font': 'Workspace Font', 'default_font': 'Default', 'font_settings_updated': 'Font settings updated',
    'parser_format': 'Parser Format', 'active_profile': 'Active Profile', 'profile_name': 'Profile Name', 'regex_line': 'Line Regex', 'regex_id': 'ID Regex', 'add_profile': 'Add Profile', 'delete_profile': 'Delete Profile', 'delete_profile_title': 'Delete Profile', 'delete_profile_message': 'Are you sure you want to delete "{name}"?', 'default_profile': 'Global', 'folder_binding': 'Format', 'enable_id_regex': 'Enable ID Regex', 'parser_format_updated': 'Parser format updated, files reloaded', 'save_blocked_by_validation': 'Save blocked: lines diff {ratioL}%, chars diff {ratioC}%', 'id_overcapture_error': 'Save blocked: ID regex matched all content lines. No blocks created. Check your ID regex.', 'orphan_context_not_found': 'No matching context found for this line',
    'quit_app': 'Quit',
    'quit_confirm_title': 'Quit Application',
    'quit_confirm_message': 'Are you sure you want to quit?',

    // Dictionary Modal - General
    'dictionary_title': 'Dictionary', 'toggle_dictionary': 'Current Available',
    // Dictionary Modal - Config Management
    'config_management': 'Configs', 'default_dictionary_name': 'Default', 'import_config': 'Import', 'new_config': 'New Config', 'delete_config': 'Delete Config', 'rename_config': 'Rename Config', 'rename': 'Rename', 'clear_dictionary': 'Clear All', 'config_name': 'Config Name', 'config_name_exists': 'Config name already exists.',
    // Dictionary Modal - Toolbar & Tabs
    'add_entry': 'Add Entry', 'merge_update_current': 'Merge/Update Current', 'import_dictionary': 'Import', 'export_dictionary': 'Export', 'search_dictionary': 'Search dictionary...', 'save_as_csv': 'Save as CSV', 'save_as_txt': 'Save as TXT',
    // Dictionary Modal - Table
    'source_text': 'Source Text', 'target_text': 'Target Text', 'notes': 'Notes', 'actions': 'Actions', 'no_entries': 'No entries found',
    // Dictionary Modal - Batch Operations
    'selected_count': '{count} selected', 'move_to': 'Move to...', 'batch_delete': 'Delete Selected', 'cancel_selection': 'Cancel',
    // Dictionary Modal - Footer
    'dict_stats': 'Category: {current} / Total: {total}',
    // Dictionary Modal - Categories
    'cat_person': 'Person', 'cat_location': 'Location', 'cat_term': 'Term', 'cat_uncategorized': 'Other',

    // Confirm Modal
    'confirm': 'Confirm', 'cancel': 'Cancel', 'close': 'Close',
    'discard_draft_title': 'Discard Draft', 'discard_draft_message': 'Are you sure you want to discard this draft?\nThis action cannot be undone.',
    'changes_discarded': 'Changes discarded',
    'discard_changes_title': 'Discard Changes', 'discard_changes_message': 'Are you sure you want to discard changes to "{source}"?',
    'delete_entry_title': 'Delete Entry', 'delete_entry_message': 'Are you sure you want to delete the entry for "{source}"?',
    'discard_new_entry_title': 'Discard New Entry', 'discard_new_entry_message': 'Are you sure you want to discard this new entry?',
    'batch_delete_title': 'Delete Entries', 'batch_delete_message': 'Are you sure you want to delete {count} selected entries?',
    'confirm_delete_config_message': 'Are you sure you want to delete the config "{name}"?\nAll entries within it will be permanently lost.',
    'confirm_clear_dictionary': 'Are you sure you want to clear the entire dictionary?',
    'replace_all_title': 'Replace All', 'replace_all_message': 'Are you sure you want to replace "{find}" \r\nwith "{replace}"\r\nin all {count} occurrences?',

    // Toasts & Notifications
    'entry_fill_required_fields': 'Please fill in both the source and translation',
    'entry_add_success': 'Entry added',
    'entry_save_success': 'Entry saved',
    'save_success': 'File saved successfully!',
    'download_success': 'File downloaded successfully!',
    'copied': 'Copied: {text}',
    'regex_copied': 'Regex copied',
    'draft_restored': 'Draft restored successfully',
    'draft_discarded': 'Draft discarded.',
    'entry_deleted': 'Entry deleted.',
    'entries_deleted': 'Selected entries deleted.',
    'replaced_all_success': 'Replaced all occurrences.',
    'dictionary_cleared': 'Dictionary cleared.',
    'config_deleted': 'Config deleted.',
    'config_renamed': 'Config renamed successfully.',
    'config_added': 'Config added successfully.',
    'import_success': 'Imported {count} entries successfully',
    'import_success_detailed': 'Imported {added} new entries, updated {updated} entries',
    'import_merged_success': 'Merged {added} new & {updated} entries into "{configName}"',
    'import_new_config_success': 'Created new config "{configName}" with {count} entries',
    'export_success': 'Dictionary exported to Download Folder',
    'export_to_folder_success': 'Dictionary exported to: {folder}',
    'import_error': 'Import failed: Invalid file format',
    'read_file_error': 'Failed to read file: {fileName}',
    'pick_directory_error': 'Failed to open directory. Your browser might not support this feature.',
    'no_previous_folder': 'No previous folder found.',
    'restore_permission_denied': 'Permission denied to restore folder.',
    'restore_folder_error': 'Failed to restore folder.',
    'save_fallback_download': 'Save failed, falling back to download.',

    // Folder Management
    'manage_folders': 'Manage Folders', 'folder_list': 'Folder List',
    'add_folder': 'Add Folder',
    'remove_folder': 'Remove Folder',
    'cannot_remove_active_folder': 'Cannot remove active folder',
    'active_folder': 'Active Folder',
    'no_active_folder': 'No active folder',
    'no_saved_folders': 'No saved folders yet',
    'folder_already_exists': 'Folder already in the list',
    'folder_added': 'Folder "{name}" added to the list',
    'folder_removed': 'Folder removed',
    'switch_folder_error': 'Failed to switch folder.',
    'remove_folder_confirm_title': 'Remove Folder',
    'remove_folder_confirm_message': 'Remove "{name}" from the folder list?',
    'open_in_explorer': 'Open in Explorer',
    'back': 'Back',
    'back_to_parent': 'Back to parent folder',
    'root_list': 'Root List',
    'breadcrumb_omitted': '{count} folder(s) hidden: {names}',
    'new_workspace': 'New Workspace',
    'close_workspace': 'Close workspace',
    'workspace_limit_reached': 'Workspace limit reached (8)',
    'workspace_folded_more': '{count} more workspace(s) folded',
    'dirty_ws_title': 'Unsaved Changes',
    'dirty_ws_message': '"{name}" has unsaved changes. What would you like to do?',
    'save_and_close': 'Save & Close',
    'discard_and_close': 'Discard & Close',
    'workspace_save_failed': 'Failed to save the workspace file',
    'quit_dirty_title': 'Unsaved Workspaces',
    'quit_dirty_message': '{count} workspace(s) have unsaved changes: {names}. Exit anyway?',
    'save_all_and_exit': 'Save All & Exit',
    'exit_without_saving': 'Exit Without Saving',
    'file_open_in_workspace': 'File is already open in Workspace {seq}',
    'open_as_working_folder': 'Open as working folder',
    'folder_files': 'Files ({count})',
    'no_files_in_folder': 'No files in this folder',
    'no_subfolders': 'No subfolders in this folder',
    'folder_descendant_blocked': 'Cannot add this folder: it is a subdirectory of a saved folder',
    'follow_parent_config': 'Follow Parent',
    'open_file_confirm_title': 'Open File',
    'open_file_confirm_message': 'Open "{name}"? The working folder will be switched if needed.',
    'merge_subfolders_title': 'Merge Subfolders',
    'merge_subfolders_message': 'Existing subfolders detected. Continuing will merge the currently saved subfolders into this folder. Continue?',
    'merge_success': 'Folder added, existing subfolders merged',
    'continue': 'Continue',

    // Drag & Drop
    'drop_to_open': 'Drop to Open',
    'drop_hint': 'Drop a folder or a text file to get started',
    'dropped_folder': '📁 Loaded folder "{name}" ({count} files)',
    'dropped_file': '📄 Opened file "{name}"',
    'restore_success': '📁 Restored "{name}" ({count} files)',
    'no_restore_record': '📢 No previous progress record',

    // Partner Settings
    'partner_settings': 'Partner Settings', 'slot': 'Slot',
    'none_hidden': 'None (Hidden)',

    // Assistant Assets (read from <exe>/assets/assistants)
    'open_asset_folder': 'Open Assets Folder',
    'rescan_assets': 'Rescan',
    'assets_found': '{count} assistant(s) on disk',
    'assets_desktop_only': 'Desktop version only',
    'assets_error': 'Assets unavailable',
    'assets_empty_hint': 'Put an image into assets/assistants/ to add one',
    'default_assistant': 'Assistant',
    'default_assistant_quote_1': 'Drop an image into the assets folder and I will become whoever you like.',
    'default_assistant_quote_2': 'Click me again!',
    'default_assistant_quote_3': 'Put a gif, png or apng into assets/assistants to add a friend.',

    // Custom app icon (<exe>/assets/icon)
    'custom_app_icon': 'Custom App Icon',
    'icon_custom_active': 'Using assets/icon/{name}',
    'icon_custom_missing': 'No PNG found in assets/icon/',

    // About
    'about': 'About',
    'about_author': 'Author',
    'about_repository': 'Repository',
    'about_license': 'License',
    'about_tech_stack': 'Tech Stack',
    'open_link_failed': 'Failed to open the link',

    // Update check
    'update_check': 'Check',
    'update_checking': 'Checking…',
    'update_latest': 'Up to date',
    'update_failed': 'Check failed',
    'update_available': 'New version',
    'update_err_404': 'No release found (repository is private or has no release yet)',
    'update_err_403': 'Rate limited, please try again later',
    'update_err_timeout': 'Request timed out',
    'update_no_version': 'No version information in the latest release',

  },

  'zh-CN': {

    // Header
    'open_folder': '打开文件夹', 'open_file': '打开文件', 'restore': '恢复进度', 'save_export': '保存', 'undo': '撤销', 'redo': '重做', 'edit_source': '编辑原文', 'highlight_half': '高亮半角', 'highlight_full': '高亮全角', 'file_list': '文件列表', 'no_file': '未加载文件', 'saving': '正在保存...', 'saved': '已保存', 'error': '错误',

    // Navigation Control
    'jump_to': '跳转',

    // File List
    'files': '文件列表', 'search_files': '搜索文件...', 'toggle_filter_mode': '切换筛选模式',

    // Main View
    'no_file_loaded': '未加载任何文件', 'open_folder_hint': '打开或拖入文件夹、文本文件以开始编辑',

    // Draft Bar
    'draft_detected': '检测到 {fileName} 有未保存的草稿（保存于 {time}）。', 'restore_draft': '恢复草稿', 'discard': '放弃',

    // Context Menu
    'cut': '剪切', 'copy': '复制', 'paste': '粘贴为纯文本', 'delete': '删除', 'search_in_text': '在可编辑文本中搜索...',

    // Search Panel
    'find': '查找', 'replace': '替换', 'do_replace': '替换 (Enter)', 'do_replace_all': '全部替换 (Ctrl+Enter)', 'replace_all_confirm': '全部替换', 'no_results': '未找到结果', 'match_case': '区分大小写', 'previous_match': '向前匹配 (Shift+Enter)', 'next_match': '向后匹配 (Enter)',

    // Settings Modal
    'settings': '设置', 'settings_header': '设置 (ESC)', 'language': '界面语言', 'editor_settings': '编辑器设置', 'edit_source_desc': '允许修改原始文本', 'highlight_half_desc': '突出显示所有半角字符', 'highlight_full_desc': '突出显示格式提示字符', 'fuzzy_match': '模糊匹配', 'fuzzy_match_desc': '允许跨行或忽略空格匹配词条', 'done': '完成', 'manage_dictionary': '用户词典', 'description_dictionary': '下划线自动标记未翻译条目\r\n单击被标记条目复制译文',
    'window_settings': '窗口设置', 'resolution': '窗口化分辨率', 'fullscreen': '全屏模式 (F11)', 'start_maximized': '最大化 (Alt+Enter)',
    'window_settings_updated': '窗口设置已更新',
    'custom': '自定义',
    'close_to_tray': '关闭到托盘',
    'tray_show_window': '显示主窗口',
    'tray_quit': '退出',
    'tray_minimized_title': '最小化到系统托盘',
    'tray_minimized_hint': '程序将在后台继续运行。点击托盘图标可恢复窗口。',
    'tray_minimize_confirm': '最小化到托盘',
    'font_settings': '字体设置', 'ui_font': '界面字体', 'workspace_font': '工作区字体', 'default_font': '默认', 'font_settings_updated': '字体设置已更新',
    'parser_format': '解析格式', 'active_profile': '当前配置', 'profile_name': '配置名称', 'regex_line': '行正则', 'regex_id': 'ID 正则', 'add_profile': '新建配置', 'delete_profile': '删除配置', 'delete_profile_title': '删除解析格式', 'delete_profile_message': '确定要删除解析格式"{name}"吗？', 'default_profile': '全局配置', 'folder_binding': '格式', 'enable_id_regex': '启用 ID 正则', 'parser_format_updated': '已更新解析格式', 'save_blocked_by_validation': '保存被阻止：行差异 {ratioL}%，字符差异 {ratioC}%。请检查当前解析格式。', 'id_overcapture_error': '保存被阻止：ID 正则匹配了所有内容行，没有创建任何文本块。请检查 ID 正则配置。', 'orphan_context_not_found': '未找到与当前行匹配的上下文',
    'quit_app': '退出程序',
    'quit_confirm_title': '退出程序',
    'quit_confirm_message': '确定要退出程序吗？',

    // Dictionary Modal - General
    'dictionary_title': '用户翻译词典', 'toggle_dictionary': '启用当前词典',
    // Dictionary Modal - Config Management
    'config_management': '词典配置', 'default_dictionary_name': '默认词典', 'import_config': '导入配置', 'new_config': '新建配置', 'delete_config': '删除配置', 'rename_config': '重命名配置', 'rename': '重命名', 'clear_dictionary': '清空词典', 'config_name': '配置名称', 'config_name_exists': '配置名称已存在',
    // Dictionary Modal - Toolbar & Tabs
    'add_entry': '新增条目', 'merge_update_current': '合并/更新当前配置', 'import_dictionary': '导入', 'export_dictionary': '导出', 'search_dictionary': '搜索词典...', 'save_as_csv': '保存为 CSV', 'save_as_txt': '保存为 TXT',
    // Dictionary Modal - Table
    'source_text': '原文', 'target_text': '译文', 'notes': '备注', 'actions': '操作', 'no_entries': '未找到条目',
    // Dictionary Modal - Batch Operations
    'selected_count': '已选择 {count} 项', 'move_to': '移动到...', 'batch_delete': '删除选中', 'cancel_selection': '取消选择',
    // Dictionary Modal - Footer
    'dict_stats': '当前分类: {current} / 词典合计: {total}',
    // Dictionary Modal - Categories
    'cat_person': '人名', 'cat_location': '地名', 'cat_term': '专名', 'cat_uncategorized': '未分类',

    // Confirm Modal
    'confirm': '确认', 'cancel': '取消', 'close': '关闭',
    'discard_draft_title': '放弃草稿', 'discard_draft_message': '您确定要放弃此草稿吗？\n此操作无法撤销。',
    'changes_discarded': '已放弃修改',
    'discard_changes_title': '放弃修改', 'discard_changes_message': '您确定要放弃对“{source}”的修改吗？',
    'delete_entry_title': '删除条目', 'delete_entry_message': '您确定要删除条目“{source}”吗？',
    'discard_new_entry_title': '放弃新建', 'discard_new_entry_message': '您确定要放弃新建条目吗？',
    'batch_delete_title': '删除条目', 'batch_delete_message': '您确定要删除所选的 {count} 个条目吗？',
    'confirm_delete_config_message': '确定要删除配置“{name}”吗？\n其中的所有条目都将被永久删除。',
    'confirm_clear_dictionary': '确定要清空整个词典吗？',
    'replace_all_title': '全部替换', 'replace_all_message': '确定要将所有 {count} 处　“{find}”\r\n替换为　“{replace}”　吗？',

    // Toasts & Notifications
    'entry_fill_required_fields': '请完整输入原文和译文',
    'entry_add_success': '添加成功',
    'entry_save_success': '保存成功',
    'save_success': '文件保存成功！',
    'download_success': '文件已成功下载！',
    'copied': '已复制译文：{text}',
    'regex_copied': '正则已复制',
    'draft_restored': '草稿已成功恢复',
    'draft_discarded': '草稿已放弃',
    'entry_deleted': '条目已删除',
    'entries_deleted': '已删除所选条目',
    'replaced_all_success': '已完成全部替换',
    'dictionary_cleared': '词典已清空',
    'config_deleted': '配置已删除',
    'config_renamed': '配置已成功重命名',
    'config_added': '配置已成功添加',
    'import_success': '成功导入 {count} 条条目',
    'import_success_detailed': '成功导入 {added} 条新条目，更新 {updated} 条已有条目',
    'import_merged_success': '已合并 {added} 条新条目和 {updated} 条更新条目到“{configName}”',
    'import_new_config_success': '已创建新配置“{configName}”并导入 {count} 条条目',
    'export_success': '词典已导出至下载文件夹',
    'export_to_folder_success': '词典已导出至当前文件夹：{folder}',
    'import_error': '导入失败：文件格式无法识别',
    'read_file_error': '读取文件失败：{fileName}',
    'pick_directory_error': '无法打开文件夹。您的浏览器可能不支持此功能。',
    'no_previous_folder': '未找到之前打开的文件夹。',
    'restore_permission_denied': '恢复文件夹权限被拒绝',
    'restore_folder_error': '恢复文件夹失败。',
    'save_fallback_download': '保存失败，已回退为下载',

    // Folder Management
    'manage_folders': '文件夹管理', 'folder_list': '文件夹列表',
    'add_folder': '添加文件夹',
    'remove_folder': '删除文件夹',
    'cannot_remove_active_folder': '不能删除当前工作文件夹',
    'active_folder': '当前工作文件夹',
    'no_active_folder': '无当前工作文件夹',
    'no_saved_folders': '还没有保存的文件夹',
    'folder_already_exists': '该文件夹已在列表中',
    'folder_added': '文件夹"{name}"已添加到列表',
    'folder_removed': '文件夹已移除',
    'switch_folder_error': '切换文件夹失败。',
    'remove_folder_confirm_title': '删除文件夹',
    'remove_folder_confirm_message': '确定要从列表移除 "{name}" 吗？',
    'open_in_explorer': '在资源管理器中打开',
    'back': '返回',
    'back_to_parent': '返回上级文件夹',
    'root_list': '根列表',
    'breadcrumb_omitted': '已省略 {count} 个目录：{names}',
    'new_workspace': '新建工作区',
    'close_workspace': '关闭工作区',
    'workspace_limit_reached': '已达工作区数量上限（8）',
    'workspace_folded_more': '已折叠 {count} 个工作区',
    'dirty_ws_title': '未保存的更改',
    'dirty_ws_message': '"{name}" 存在未保存的更改，如何处理？',
    'save_and_close': '保存并关闭',
    'discard_and_close': '放弃并关闭',
    'workspace_save_failed': '工作区文件保存失败',
    'quit_dirty_title': '存在未保存的工作区',
    'quit_dirty_message': '{count} 个工作区存在未保存的更改：{names}。\n仍要退出吗？',
    'save_all_and_exit': '全部保存并退出',
    'exit_without_saving': '不保存退出',
    'file_open_in_workspace': '该文件已在 工作区{seq} 中打开',
    'open_as_working_folder': '打开为工作文件夹',
    'folder_files': '文件 ({count})',
    'no_files_in_folder': '该文件夹下没有文件',
    'no_subfolders': '该文件夹下没有子文件夹',
    'folder_descendant_blocked': '无法添加该文件夹：它是已保存文件夹的子目录',
    'follow_parent_config': '跟随配置',
    'open_file_confirm_title': '打开文件',
    'open_file_confirm_message': '确定要打开文件"{name}"吗？\n打开前会按需切换工作文件夹。',
    'merge_subfolders_title': '合并子目录',
    'merge_subfolders_message': '检测到子目录已存在，继续添加会合并当前已保存的子目录，是否继续？',
    'merge_success': '已添加文件夹并合并已保存的子目录',
    'continue': '继续',

    // Drag & Drop
    'drop_to_open': '松开以打开',
    'drop_hint': '拖入文件夹或文本文件以开始',
    'dropped_folder': '📁 已加载文件夹 "{name}"（共 {count} 个文件）',
    'dropped_file': '📄 已打开文件 "{name}"',
    'restore_success': '📁 已恢复进度（{name}，共 {count} 个文件）',
    'no_restore_record': '📢 当前没有进度记录',

    // Partner Settings
    'partner_settings': '助手设置', 'slot': '助手',
    'none_hidden': '无（隐藏）',

    // 助手资源（读取自 <exe>/assets/assistants）
    'open_asset_folder': '打开资源文件夹',
    'rescan_assets': '重新扫描',
    'assets_found': '磁盘上发现 {count} 个助手',
    'assets_desktop_only': '仅桌面版可用',
    'assets_error': '资源目录不可用',
    'assets_empty_hint': '把图片放进 assets/assistants/ 即可新增助手',
    'default_assistant': '默认助手',
    'default_assistant_quote_1': '把图片放进 assets 文件夹，就能把我换成你喜欢的样子。',
    'default_assistant_quote_2': '再点我一下！',
    'default_assistant_quote_3': '把 gif / png / apng 丢进 assets/assistants 就能添加新助手。',

    // 自定义程序图标（<exe>/assets/icon）
    'custom_app_icon': '自定义程序图标',
    'icon_custom_active': '已应用 assets/icon/{name}',
    'icon_custom_missing': 'assets/icon/ 下未找到 PNG',

    // 关于
    'about': '关于',
    'about_author': '作者',
    'about_repository': '仓库',
    'about_license': '许可证',
    'about_tech_stack': '技术栈',
    'open_link_failed': '链接打开失败',

    // 检查更新
    'update_check': '检查更新',
    'update_checking': '检测中…',
    'update_latest': '已是最新',
    'update_failed': '检测失败',
    'update_available': '检测到新版本',
    'update_err_404': '未找到 Release（仓库未公开或尚未发布）',
    'update_err_403': '请求过于频繁，请稍后再试',
    'update_err_timeout': '请求超时',
    'update_no_version': '最新 Release 中未找到版本信息',

  }
};

export type TranslationKey = keyof typeof translations['en-US'];
export type Language = keyof typeof translations;
