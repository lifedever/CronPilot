use croner::Cron;
use chrono::Local;
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

    let now = Local::now();
    let mut runs = Vec::new();

    for next in cron.iter_from(now).take(count as usize) {
        let duration = next - now;
        let relative = format_relative_time(duration);
        runs.push(NextRun {
            datetime: next.format("%Y-%m-%d %H:%M:%S").to_string(),
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

#[cfg(test)]
mod tests {
    use super::*;

    // --- validate_cron ---

    #[test]
    fn test_validate_cron_valid_expressions() {
        let cases = vec![
            "* * * * *",
            "0 0 * * *",
            "*/5 * * * *",
            "0 9 * * 1-5",
            "0 0 1 * *",
            "30 4 1,15 * *",
            "0 22 * * 1-5",
        ];
        for expr in cases {
            let result = validate_cron(expr.to_string()).unwrap();
            assert!(result.is_valid, "Expected '{}' to be valid", expr);
            assert!(result.error.is_none());
            assert!(result.human_readable.is_some());
        }
    }

    #[test]
    fn test_validate_cron_invalid_expressions() {
        let cases = vec![
            "",
            "not a cron",
            "* * *",
            "60 * * * *",
            "* 25 * * *",
        ];
        for expr in cases {
            let result = validate_cron(expr.to_string()).unwrap();
            assert!(!result.is_valid, "Expected '{}' to be invalid", expr);
            assert!(result.error.is_some());
            assert!(result.human_readable.is_none());
        }
    }

    // --- describe_cron ---

    #[test]
    fn test_describe_every_minute() {
        assert_eq!(describe_cron("* * * * *"), "Every minute");
    }

    #[test]
    fn test_describe_every_n_minutes() {
        assert_eq!(describe_cron("*/5 * * * *"), "Every 5 minutes");
        assert_eq!(describe_cron("*/15 * * * *"), "Every 15 minutes");
    }

    #[test]
    fn test_describe_every_hour() {
        assert_eq!(describe_cron("0 * * * *"), "Every hour");
    }

    #[test]
    fn test_describe_every_n_hours() {
        assert_eq!(describe_cron("0 */2 * * *"), "Every 2 hours");
        assert_eq!(describe_cron("0 */6 * * *"), "Every 6 hours");
    }

    #[test]
    fn test_describe_daily_midnight() {
        assert_eq!(describe_cron("0 0 * * *"), "Every day at midnight");
    }

    #[test]
    fn test_describe_daily_at_hour() {
        assert_eq!(describe_cron("0 9 * * *"), "Every day at 9:00");
        assert_eq!(describe_cron("0 22 * * *"), "Every day at 22:00");
    }

    #[test]
    fn test_describe_daily_at_hour_minute() {
        assert_eq!(describe_cron("30 9 * * *"), "Every day at 9:30");
        assert_eq!(describe_cron("5 14 * * *"), "Every day at 14:05");
    }

    #[test]
    fn test_describe_weekly() {
        assert_eq!(describe_cron("0 0 * * 1"), "Every week on Monday");
        assert_eq!(describe_cron("0 0 * * 0"), "Every week on Sunday");
        assert_eq!(describe_cron("0 0 * * 7"), "Every week on Sunday");
    }

    #[test]
    fn test_describe_monthly() {
        assert_eq!(describe_cron("0 0 1 * *"), "Every month on day 1");
        assert_eq!(describe_cron("0 0 15 * *"), "Every month on day 15");
    }

    #[test]
    fn test_describe_complex_returns_raw() {
        assert_eq!(describe_cron("0 9 * * 1-5"), "0 9 * * 1-5");
        assert_eq!(describe_cron("30 4 1,15 * *"), "30 4 1,15 * *");
    }

    #[test]
    fn test_describe_too_few_fields() {
        assert_eq!(describe_cron("* * *"), "* * *");
    }

    // --- day_name ---

    #[test]
    fn test_day_names() {
        assert_eq!(day_name("0"), "Sunday");
        assert_eq!(day_name("1"), "Monday");
        assert_eq!(day_name("2"), "Tuesday");
        assert_eq!(day_name("3"), "Wednesday");
        assert_eq!(day_name("4"), "Thursday");
        assert_eq!(day_name("5"), "Friday");
        assert_eq!(day_name("6"), "Saturday");
        assert_eq!(day_name("7"), "Sunday");
        assert_eq!(day_name("8"), "8");
    }

    // --- format_relative_time ---

    #[test]
    fn test_format_relative_seconds() {
        let d = chrono::TimeDelta::seconds(30);
        assert_eq!(format_relative_time(d), "in 30 seconds");
    }

    #[test]
    fn test_format_relative_minutes() {
        let d = chrono::TimeDelta::seconds(120);
        assert_eq!(format_relative_time(d), "in 2 minutes");
        let d = chrono::TimeDelta::seconds(3599);
        assert_eq!(format_relative_time(d), "in 59 minutes");
    }

    #[test]
    fn test_format_relative_hours_exact() {
        let d = chrono::TimeDelta::seconds(3600);
        assert_eq!(format_relative_time(d), "in 1 hours");
        let d = chrono::TimeDelta::seconds(7200);
        assert_eq!(format_relative_time(d), "in 2 hours");
    }

    #[test]
    fn test_format_relative_hours_with_minutes() {
        let d = chrono::TimeDelta::seconds(3660);
        assert_eq!(format_relative_time(d), "in 1h 1m");
        let d = chrono::TimeDelta::seconds(5400);
        assert_eq!(format_relative_time(d), "in 1h 30m");
    }

    #[test]
    fn test_format_relative_days() {
        let d = chrono::TimeDelta::seconds(86400);
        assert_eq!(format_relative_time(d), "in 1 days");
        let d = chrono::TimeDelta::seconds(172800);
        assert_eq!(format_relative_time(d), "in 2 days");
    }

    // --- get_next_runs ---

    #[test]
    fn test_get_next_runs_valid() {
        let result = get_next_runs("* * * * *".to_string(), 5).unwrap();
        assert_eq!(result.len(), 5);
        for run in &result {
            // datetime should be in local time format: "YYYY-MM-DD HH:MM:SS"
            assert!(run.datetime.len() >= 19, "datetime too short: {}", run.datetime);
            assert!(run.relative.starts_with("in "));
        }
    }

    #[test]
    fn test_get_next_runs_invalid_expr() {
        let result = get_next_runs("invalid".to_string(), 5);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_next_runs_zero_count() {
        let result = get_next_runs("* * * * *".to_string(), 0).unwrap();
        assert!(result.is_empty());
    }
}
