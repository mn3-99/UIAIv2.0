package com.mijlai.chat.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.mijlai.chat.ApiClient
import com.mijlai.chat.ImageGenResult
import com.mijlai.chat.ImageModel
import kotlinx.coroutines.launch

private data class Aspect(val label: String, val w: Int, val h: Int)
private val ASPECTS = listOf(
    Aspect("1:1", 1024, 1024),
    Aspect("3:2", 1152, 768),
    Aspect("2:3", 768, 1152),
    Aspect("16:9", 1344, 768),
    Aspect("9:16", 768, 1344)
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImageStudioScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var models by remember { mutableStateOf<List<ImageModel>>(emptyList()) }
    var selected by remember { mutableStateOf("") }
    var prompt by remember { mutableStateOf("") }
    var negative by remember { mutableStateOf("") }
    var aspect by remember { mutableStateOf(ASPECTS[0]) }
    var images by remember { mutableStateOf<List<ImageGenResult>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        runCatching { ApiClient.imageModels() }
            .onSuccess { m -> models = m; if (selected.isEmpty() && m.isNotEmpty()) selected = m[0].id }
            .onFailure { err = it.message }
    }
    LaunchedEffect(err) { err?.let { snackbar.showSnackbar(it) } }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = { TopAppBar(title = { Text("استوديو الصور") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, null) } }) }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(12.dp).verticalScroll(rememberScrollState())) {
            OutlinedTextField(prompt, { prompt = it }, Modifier.fillMaxWidth(), label = { Text("وصف الصورة") }, minLines = 3)
            Spacer(Modifier.height(8.dp))
            LazyRow { items(ASPECTS) { a -> ChoiceChip(a.label, a == aspect) { aspect = a } } }
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(negative, { negative = it }, Modifier.fillMaxWidth(), label = { Text("وصف سلبي (اختياري)") })
            Spacer(Modifier.height(8.dp))
            var menu by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(expanded = menu, onExpandedChange = { menu = it }) {
                OutlinedTextField(
                    value = models.firstOrNull { it.id == selected }?.name ?: selected,
                    onValueChange = {}, readOnly = true, label = { Text("النموذج") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = menu) },
                    modifier = Modifier.menuAnchor().fillMaxWidth()
                )
                ExposedDropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    models.forEach { m -> DropdownMenuItem(text = { Text(m.name) }, onClick = { selected = m.id; menu = false }) }
                }
            }
            Spacer(Modifier.height(12.dp))
            Button(enabled = !loading && prompt.isNotBlank() && selected.isNotBlank(), onClick = {
                loading = true; err = null
                scope.launch {
                    runCatching { ApiClient.generateImage(prompt, selected, aspect.w, aspect.h, negative, null) }
                        .onSuccess { images = listOf(it) + images }
                        .onFailure { err = it.message }
                    loading = false
                }
            }, modifier = Modifier.fillMaxWidth()) {
                if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("توليد")
            }
            Spacer(Modifier.height(12.dp))
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(images) { img ->
                    Card(Modifier.fillMaxWidth().clickable { }) {
                        AsyncImage(img.url, null, Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)))
                        Text("${img.label} · ${img.provider}", Modifier.padding(8.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun ChoiceChip(label: String, selected: Boolean, onClick: () -> Unit) {
    AssistChip(
        onClick = onClick, label = { Text(label) },
        modifier = Modifier.padding(end = 6.dp),
        colors = AssistChipDefaults.assistChipColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
        )
    )
}
