package com.mijlai.chat.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.mijlai.chat.ApiClient
import com.mijlai.chat.DeepSearchRef
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeepSearchScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var refs by remember { mutableStateOf<List<DeepSearchRef>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(err) { err?.let { snackbar.showSnackbar(it) } }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = { TopAppBar(title = { Text("البحث العميق") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, null) } }) }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(12.dp)) {
            OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), label = { Text("سؤال البحث") }, maxLines = 4)
            Spacer(Modifier.height(8.dp))
            Button(enabled = !loading && query.isNotBlank(), onClick = {
                loading = true; err = null
                scope.launch {
                    runCatching { ApiClient.deepSearch(query, JsonArray(emptyList())) }
                        .onSuccess { r -> refs = if (r.references.isNotEmpty()) r.references else r.results }
                        .onFailure { err = it.message }
                    loading = false
                }
            }, modifier = Modifier.fillMaxWidth()) {
                if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("بحث")
            }
            err?.let { Text(it, color = Color(0xFFDC2626)) }
            Spacer(Modifier.height(8.dp))
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(refs) { r ->
                    Card(Modifier.fillMaxWidth().clickable { }) {
                        Column(Modifier.padding(12.dp)) {
                            Text(r.title, style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(2.dp))
                            Text(r.url, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}
