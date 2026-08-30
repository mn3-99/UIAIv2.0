package com.mijlai.chat

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.mijlai.chat.data.AppPrefs
import com.mijlai.chat.ui.ChatScreen
import com.mijlai.chat.ui.DeepSearchScreen
import com.mijlai.chat.ui.ImageStudioScreen
import com.mijlai.chat.ui.MijlAiTheme
import com.mijlai.chat.ui.SettingsScreen

enum class Screen { Chat, Images, Search, Settings }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppPrefs.init(this)
        setContent {
            MijlAiTheme {
                AppRoot()
            }
        }
    }
}

@Composable
fun AppRoot() {
    var screen by remember { mutableStateOf(Screen.Chat) }
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = screen == Screen.Chat,
                    onClick = { screen = Screen.Chat },
                    icon = { Icon(Icons.Filled.Chat, null) },
                    label = { Text("محادثة") }
                )
                NavigationBarItem(
                    selected = screen == Screen.Images,
                    onClick = { screen = Screen.Images },
                    icon = { Icon(Icons.Filled.Image, null) },
                    label = { Text("صور") }
                )
                NavigationBarItem(
                    selected = screen == Screen.Search,
                    onClick = { screen = Screen.Search },
                    icon = { Icon(Icons.Filled.Search, null) },
                    label = { Text("بحث") }
                )
                NavigationBarItem(
                    selected = screen == Screen.Settings,
                    onClick = { screen = Screen.Settings },
                    icon = { Icon(Icons.Filled.Settings, null) },
                    label = { Text("إعدادات") }
                )
            }
        }
    ) { padding ->
        Surface(Modifier.fillMaxSize().padding(padding)) {
            when (screen) {
                Screen.Chat -> ChatScreen()
                Screen.Images -> ImageStudioScreen(onBack = { screen = Screen.Chat })
                Screen.Search -> DeepSearchScreen(onBack = { screen = Screen.Chat })
                Screen.Settings -> SettingsScreen(onBack = { screen = Screen.Chat })
            }
        }
    }
}
