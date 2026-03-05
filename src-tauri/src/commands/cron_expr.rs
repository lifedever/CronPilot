use croner::Cron;
use chrono::Utc;
use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, Serialize)]
pub struct CronValidation {
    pub is_valid: bool,
    pub error: Option<String>,
    pub human_readable: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NextRun {
    pub datetime: String,
    pub relative: String,
}

#[tauri::command]
pub fn validate_cron(expr: String) -> Result<CronValidation, AppError> {
    match Cron::new(&expr).parse() {
        Ok(_) => Ok(CronValidation {
            is_valid: true,
            error: None,
            human_readable: Some(describe_cron(&expr)),
        }),
        Err(e) => Ok(CronValidation {
            is_valid: false,
            error: Some(e.to_string()),
            human_readable: None,
        }),
    }
}

#[tauri::command]
pub fn get_next_runs(expr: String, count: u32) -> Result<Vec<NextRun>, AppError> {
    let cron = Cron::new(&expr)
        .parse()
        .map_err(|e| AppError::CronExpression(e.to_string()))?;

    let now = Utc::now();
    let mut runs = Vec::new();

    for next in cron.iter_from(now).take(count as usize) {
        let duration = next - now;
        let relative = format_relative_time(duration);
        runs.push(NextRun {
            datetime: next.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
            relative,
        });
    }

    Ok(runs)
}

fn describe_cron(expr: &str) -> String {
    let parts: Vec<&str> = expr.split_whitespace().collect();
    if parts.len() < 5 {
        return expr.to_string();
    }

    let (minute, hour, dom, month, dow) = (parts[0], parts[1], parts[2], parts[3], parts[4]);

    match (minute, hour, dom, month, dow) {
        ("*", "*", "*", "*", "*") => "Every minute".to_string(),
        (m, "*", "*", "*", "*") if m.starts_with("*/") => {
            format!("Every {} minutes", &m[2..])
        }
        ("0", "*", "*", "*", "*") => "Every hour".to_string(),
        ("0", h, "*", "*", "*") if h.starts_with("*/") => {
            format!("Every {} hours", &h[2..])
        }
        ("0", "0", "*", "*", "*") => "Every day at midnight".to_string(),
        ("0", h, "*", "*", "*") => format!("Every day at {}:00", h),
        (m, h, "*", "*", "*") => format!("Every day at {}:{:0>2}", h, m),
        ("0", "0", "*", "*", d) => format!("Every week on {}", day_name(d)),
        ("0", "0", d, "*", "*") => format!("Every month on day {}", d),
        _ => expr.to_string(),
    }
}

fn day_name(d: &str) -> &str {
    match d {
        "0" | "7" => "Sunday",
        "1" => "Monday",
        "2" => "Tuesday",
        "3" => "Wednesday",
        "4" => "Thursday",
        "5" => "Friday",
        "6" => "Saturday",
        _ => d,
    }
}

fn format_relative_time(duration: chrono::TimeDelta) -> String {
    let secs = duration.num_seconds();
    if secs < 60 {
        format!("in {} seconds", secs)
    } else if secs < 3600 {
        format!("in {} minutes", secs / 60)
    } else if secs < 86400 {
        let hours = secs / 3600;
        let mins = (secs % 3600) / 60;
        if mins > 0 {
            format!("in {}h {}m", hours, mins)
        } else {
            format!("in {} hours", hours)
        }
    } else {
        let days = secs / 86400;
        format!("in {} days", days)
    }
}
