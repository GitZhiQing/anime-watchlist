// 追番计划 - Tauri 后端
// 注册 store / http / opener 插件，并提供 OAuth 本地回环服务器命令。

const OAUTH_PORT: u16 = 7359;
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
/// 解析出 `code` 后返回。整个调用阻塞，直到收到 code 或监听失败。
#[tauri::command]
async fn start_oauth_server() -> Result<String, String> {
    let server = tiny_http::Server::http(format!("127.0.0.1:{}", OAUTH_PORT))
        .map_err(|e| format!("无法监听 127.0.0.1:{}: {}", OAUTH_PORT, e))?;

    // 设置一个总超时，避免永久阻塞（120s）
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    std::thread::spawn(move || {
        // 只接一次请求；若 120s 内无请求，直接返回失败。
        let timeout = std::time::Duration::from_secs(120);
        let start = std::time::Instant::now();

        loop {
            if start.elapsed() > timeout {
                let _ = tx.send(Err("等待授权超时".into()));
                break;
            }
            // 非阻塞轮询：短暂阻塞接收
            match server.recv_timeout(std::time::Duration::from_secs(1)) {
                Ok(Some(request)) => {
                    let url = request.url().to_string();
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
    });

    rx.recv()
        .map_err(|e| format!("内部通信失败: {}", e))?
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
        .invoke_handler(tauri::generate_handler![start_oauth_server])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
