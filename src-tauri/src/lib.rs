use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessagePayload {
    pub id: String,
    pub chat_id: String,
    pub role: String,
    pub content: String,
    pub model_id: Option<String>,
    pub timestamp: i64,
}

pub struct AppDatabaseState {
    pub db_path: String,
}

#[tauri::command]
fn trigger_haptic_feedback(app: AppHandle, level: String) -> Result<(), String> {
    #[cfg(mobile)]
    {
        println!("Mobile haptic trigger level: {}", level);
    }
    println!("Native haptic event: {}", level);
    Ok(())
}

#[tauri::command]
async fn save_local_message(
    message: ChatMessagePayload,
    state: State<'_, Mutex<AppDatabaseState>>,
) -> Result<bool, String> {
    let db_guard = state.lock().map_err(|e| e.to_string())?;
    let conn = rusqlite::Connection::open(&db_guard.db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            model_id TEXT,
            timestamp INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO messages (id, chat_id, role, content, model_id, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &message.id,
            &message.chat_id,
            &message.role,
            &message.content,
            &message.model_id,
            &message.timestamp,
        ),
    )
    .map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
async fn get_local_chat_history(
    chat_id: String,
    state: State<'_, Mutex<AppDatabaseState>>,
) -> Result<Vec<ChatMessagePayload>, String> {
    let db_guard = state.lock().map_err(|e| e.to_string())?;
    let conn = rusqlite::Connection::open(&db_guard.db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, chat_id, role, content, model_id, timestamp 
             FROM messages WHERE chat_id = ?1 ORDER BY timestamp ASC",
        )
        .map_err(|e| e.to_string())?;

    let message_iter = stmt
        .query_map([&chat_id], |row| {
            Ok(ChatMessagePayload {
                id: row.get(0)?,
                chat_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                model_id: row.get(4)?,
                timestamp: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    for msg in message_iter {
        if let Ok(m) = msg {
            messages.push(m);
        }
    }

    Ok(messages)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(AppDatabaseState {
            db_path: "mijlai_native_chat.db".to_string(),
        }))
        .invoke_handler(tauri::generate_handler![
            trigger_haptic_feedback,
            save_local_message,
            get_local_chat_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
