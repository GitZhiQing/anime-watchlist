// 追番计划 - Tauri 后端
// 注册 store / http / opener 插件，并提供 OAuth 本地回环服务器命令。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::State;

const OAUTH_PORT: u16 = 7359;
// 监听 IPv6 loopback ::1（与 REDIRECT_URI 的 localhost 对应：现代系统 localhost
// 多优先解析到 ::1，监听 ::1 可让浏览器首次尝试即命中，避免 IPv6→IPv4 回退延迟）。
const OAUTH_BIND: &str = "[::1]";

/// 正在运行的 OAuth 监听器的停止句柄。
/// 注意：Server 与 mpsc::Sender 都由监听线程所有，这里只持有停止标志，
/// 线程每秒轮询该标志，置 true 后线程退出并 drop Server，从而释放端口。
struct OauthServer {
    stop: Arc<AtomicBool>,
}

/// 全局单例监听槽：None 表示当前无监听。用 Mutex<Option<...>> 而非 OnceLock，
/// 因为它是两个命令需协调变更的可选槽位。
type OauthState = Mutex<Option<OauthServer>>;
const SUCCESS_HTML: &str = r#"<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>授权成功 · 追番计划</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;
    background:#0d0d0d;color:#e5e5e5;
    font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}
  .card{text-align:center;padding:48px 64px;border-radius:12px;
    background:#1a1a1a;border:1px solid #2a2a2a}
  .title{font-size:20px;font-weight:600;margin-bottom:8px;color:#f5f5f5}
  .hint{font-size:14px;color:#999;line-height:1.6}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-bottom:16px}
  .dot.ok{background:#4ade80}
  .dot.fail{background:#f87171}
</style></head>
<body><div class="card">
<div class="dot ok"></div>
<div class="title">授权成功</div>
<p class="hint">请返回「追番计划」应用。<br>本页面可关闭。</p>
</div></body></html>"#;

const FAIL_HTML: &str = r#"<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>授权失败 · 追番计划</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;
    background:#0d0d0d;color:#e5e5e5;
    font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}
  .card{text-align:center;padding:48px 64px;border-radius:12px;
    background:#1a1a1a;border:1px solid #2a2a2a}
  .title{font-size:20px;font-weight:600;margin-bottom:8px;color:#f5f5f5}
  .hint{font-size:14px;color:#999;line-height:1.6}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-bottom:16px}
  .dot.ok{background:#4ade80}
  .dot.fail{background:#f87171}
</style></head>
<body><div class="card">
<div class="dot fail"></div>
<div class="title">授权失败</div>
<p class="hint">未收到授权码，请返回重试。</p>
</div></body></html>"#;

/// 启动一次性本地回环 HTTP 服务器，等待 Bangumi OAuth 回调，
/// 解析出 `code` 后返回。整个调用阻塞，直到收到 code / 超时 / 被取消。
///
/// 重入安全：调用前会先停掉任何仍在运行的旧监听（置其停止标志、等待其退出），
/// 因此重复点击「认证」不会因端口仍被占用（os error 10048）而失败。
#[tauri::command]
async fn start_oauth_server(state: State<'_, OauthState>) -> Result<String, String> {
    // (1) 重入清理：停掉旧的监听线程，等其退出释放端口。
    {
        let mut guard = state.lock().map_err(|e| format!("状态锁中毒: {}", e))?;
        if let Some(prev) = guard.take() {
            prev.stop.store(true, Ordering::SeqCst);
        }
    }
    // 旧线程 recv_timeout 最长 1s；80ms 通常足够让其观察到 flag 并退出 drop Server。
    std::thread::sleep(std::time::Duration::from_millis(80));

    // (2) 绑定新 Server。
    let server = tiny_http::Server::http(format!("{}:{}", OAUTH_BIND, OAUTH_PORT))
        .map_err(|e| format!("无法监听 {}:{}: {}（请稍后重试）", OAUTH_BIND, OAUTH_PORT, e))?;

    // (3) 注册本次监听的停止句柄，再 spawn 线程。
    let stop = Arc::new(AtomicBool::new(false));
    {
        let mut guard = state.lock().map_err(|e| format!("状态锁中毒: {}", e))?;
        *guard = Some(OauthServer {
            stop: stop.clone(),
        });
    }

    // 设置一个总超时，避免永久阻塞（120s）
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    let stop_for_thread = stop.clone();
    std::thread::spawn(move || {
        // 只接一次请求；若 120s 内无请求，直接返回失败。
        let timeout = std::time::Duration::from_secs(120);
        let start = std::time::Instant::now();

        loop {
            // 被外部 stop_oauth_server 取消：发"已取消"并退出（drop Server 释放端口）。
            if stop_for_thread.load(Ordering::SeqCst) {
                let _ = tx.send(Err("已取消".into()));
                break;
            }
            if start.elapsed() > timeout {
                let _ = tx.send(Err("等待授权超时".into()));
                break;
            }
            // 非阻塞轮询：短暂阻塞接收
            match server.recv_timeout(std::time::Duration::from_secs(1)) {
                Ok(Some(request)) => {
                    let url = request.url().to_string();
                    // 仅接受 /callback 开头的请求；其他路径（探测/误访）回失败页并继续等。
                    if !url.starts_with("/callback") {
                        let response = tiny_http::Response::from_string(FAIL_HTML)
                            .with_header(tiny_http::Header::from_bytes(
                                b"content-type",
                                b"text/html; charset=utf-8",
                            )
                            .unwrap());
                        let _ = request.respond(response);
                        continue;
                    }
                    // 解析 query 中的 code
                    let code = extract_query_value(&url, "code");
                    let html = if code.is_some() {
                        SUCCESS_HTML
                    } else {
                        FAIL_HTML
                    };
                    let response = tiny_http::Response::from_string(html)
                        .with_header(tiny_http::Header::from_bytes(
                            b"content-type",
                            b"text/html; charset=utf-8",
                        )
                        .unwrap());
                    let _ = request.respond(response);
                    // 注意：成功发送不依赖 stop 标志，保证并发取消不丢失有效 code。
                    let _ = tx.send(code.ok_or_else(|| "回调中未包含 code".to_string()));
                    break;
                }
                Ok(None) => continue,
                Err(e) => {
                    let _ = tx.send(Err(format!("监听错误: {}", e)));
                    break;
                }
            }
        }
        // Server 在此被 drop，端口释放。
    });

    // (4) 阻塞等待结果。
    let result = rx
        .recv()
        .map_err(|e| format!("内部通信失败: {}", e))?;

    // (5) 退出前清理 state（仅当仍是自己的句柄，防御并发新 start 已替换它）。
    if let Ok(mut guard) = state.lock() {
        let is_ours = guard
            .as_ref()
            .map(|s| Arc::ptr_eq(&s.stop, &stop))
            .unwrap_or(false);
        if is_ours {
            *guard = None;
        }
    }
    result
}

/// 主动停止当前 OAuth 监听（如有）。供 JS 在取消/页面卸载/异常退出时调用，
/// 及时释放端口，避免等待 120s 超时。
#[tauri::command]
async fn stop_oauth_server(state: State<'_, OauthState>) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| format!("状态锁中毒: {}", e))?;
    if let Some(cur) = guard.take() {
        cur.stop.store(true, Ordering::SeqCst);
        // 监听线程会在 ≤1s 内观察到 flag，发"已取消"并退出。
    }
    Ok(())
}

/// 从 `/callback?code=xxx&...` 这样的 URL 中提取指定 query 参数的值。
fn extract_query_value(url: &str, key: &str) -> Option<String> {
    let q = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    for pair in q.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(percent_decode(v));
            }
        }
    }
    None
}

/// 简单的百分号解码（仅处理 %XX 和 +）。
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'+' {
            out.push(b' ');
            i += 1;
        } else if b == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                out.push(byte);
                i += 3;
                continue;
            }
            out.push(b);
            i += 1;
        } else {
            out.push(b);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .manage::<OauthState>(Mutex::new(None))
        .invoke_handler(tauri::generate_handler![
            start_oauth_server,
            stop_oauth_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
