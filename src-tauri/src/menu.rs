use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter,
};

/// Returns true if system locale starts with "zh"
fn is_zh() -> bool {
    sys_locale::get_locale()
        .map(|l| l.starts_with("zh"))
        .unwrap_or(false)
}

pub fn setup_menu(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let zh = is_zh();

    // Helper closure for bilingual labels
    let t = |en: &str, zh_text: &str| -> String {
        if zh { zh_text.to_string() } else { en.to_string() }
    };

    // ── CronPilot (App) menu ──
    let about = MenuItemBuilder::with_id("about", t("About CronPilot", "关于 CronPilot"))
        .build(app)?;
    let check_update = MenuItemBuilder::with_id("check_update", t("Check for Updates...", "检查更新..."))
        .build(app)?;
    let settings = MenuItemBuilder::with_id("settings", t("Settings...", "设置..."))
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let app_menu = SubmenuBuilder::new(app, "CronPilot")
        .item(&about)
        .separator()
        .item(&check_update)
        .item(&settings)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(&t("Hide CronPilot", "隐藏 CronPilot")))?)
        .item(&PredefinedMenuItem::hide_others(app, Some(&t("Hide Others", "隐藏其他")))?)
        .item(&PredefinedMenuItem::show_all(app, Some(&t("Show All", "显示全部")))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some(&t("Quit CronPilot", "退出 CronPilot")))?)
        .build()?;

    // ── File menu ──
    let import_crontab = MenuItemBuilder::with_id("import_crontab", t("Import from Crontab", "从 Crontab 导入"))
        .accelerator("CmdOrCtrl+I")
        .build(app)?;
    let export_backup = MenuItemBuilder::with_id("export_backup", t("Export Backup...", "导出备份..."))
        .accelerator("CmdOrCtrl+E")
        .build(app)?;
    let import_backup = MenuItemBuilder::with_id("import_backup", t("Import Backup...", "导入备份..."))
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, t("File", "文件"))
        .item(&import_crontab)
        .separator()
        .item(&export_backup)
        .item(&import_backup)
        .build()?;

    // ── Edit menu ──
    let edit_menu = SubmenuBuilder::new(app, t("Edit", "编辑"))
        .item(&PredefinedMenuItem::undo(app, Some(&t("Undo", "撤销")))?)
        .item(&PredefinedMenuItem::redo(app, Some(&t("Redo", "重做")))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(&t("Cut", "剪切")))?)
        .item(&PredefinedMenuItem::copy(app, Some(&t("Copy", "复制")))?)
        .item(&PredefinedMenuItem::paste(app, Some(&t("Paste", "粘贴")))?)
        .item(&PredefinedMenuItem::select_all(app, Some(&t("Select All", "全选")))?)
        .build()?;

    // ── Window menu ──
    let window_menu = SubmenuBuilder::new(app, t("Window", "窗口"))
        .item(&PredefinedMenuItem::minimize(app, Some(&t("Minimize", "最小化")))?)
        .item(&PredefinedMenuItem::maximize(app, Some(&t("Maximize", "最大化")))?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some(&t("Close", "关闭")))?)
        .build()?;

    // ── Help menu ──
    let github = MenuItemBuilder::with_id("github", t("GitHub Repository", "GitHub 仓库"))
        .build(app)?;
    let report_issue = MenuItemBuilder::with_id("report_issue", t("Report an Issue", "反馈问题"))
        .build(app)?;
    let help_menu = SubmenuBuilder::new(app, t("Help", "帮助"))
        .item(&github)
        .item(&report_issue)
        .build()?;

    // ── Build & set menu ──
    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &window_menu, &help_menu])
        .build()?;
    app.set_menu(menu)?;

    // ── Handle events ──
    app.on_menu_event(move |app_handle, event| {
        match event.id().0.as_str() {
            "about" => {
                let _ = app_handle.emit("menu-navigate", "settings");
            }
            "check_update" => {
                let _ = app_handle.emit("menu-check-update", ());
            }
            "settings" => {
                let _ = app_handle.emit("menu-navigate", "settings");
            }
            "import_crontab" => {
                let _ = app_handle.emit("menu-import-crontab", ());
            }
            "export_backup" => {
                let _ = app_handle.emit("menu-export-backup", ());
            }
            "import_backup" => {
                let _ = app_handle.emit("menu-import-backup", ());
            }
            "github" => {
                let _ = tauri_plugin_opener::open_url(
                    "https://github.com/lifedever/CronPilot",
                    None::<&str>,
                );
            }
            "report_issue" => {
                let _ = tauri_plugin_opener::open_url(
                    "https://github.com/lifedever/CronPilot/issues",
                    None::<&str>,
                );
            }
            _ => {}
        }
    });

    Ok(())
}
