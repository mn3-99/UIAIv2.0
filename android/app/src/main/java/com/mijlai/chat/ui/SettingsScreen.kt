package com.mijlai.chat.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.mijlai.chat.data.AppPrefs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    var url by remember { mutableStateOf(AppPrefs.getBaseUrl()) }
    var saved by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("الإعدادات") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, null) } }
            )
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Text("رابط الخادم (Server URL)", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(url, { url = it }, Modifier.fillMaxWidth(), placeholder = { Text("https://...") }, singleLine = true)
            Spacer(Modifier.height(12.dp))
            Button(onClick = { AppPrefs.setBaseUrl(url); saved = true }) { Text("حفظ") }
            if (saved) Text("تم الحفظ ✓", color = Color(0xFF16A34A))
            Spacer(Modifier.height(18.dp))
            Text("MijlAi v2.0.0 — تطبيق أندرويد أصلي", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
