package com.mijlai.chat.ui

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.mijlai.chat.ChatMessage
import com.mijlai.chat.ChatViewModel

private val TIERS = listOf(
    Tier("mini", "MijlAi Mini", Icons.Filled.Bolt),
    Tier("flash", "MijlAi Flash", Icons.Filled.AutoAwesome),
    Tier("pro", "MijlAi Pro", Icons.Filled.WorkspacePremium),
    Tier("pwr", "MijlAi PWR", Icons.Filled.Star),
)

private data class Tier(val id: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val SKILLS = listOf(
    "مبرمج" to "أنت مبرمج خبير: اكتب كوداً دقيقاً، وشرحاً موجزاً.",
    "كاتب" to "أنت كاتب مبدع: صغ نصاً أدبياً سلساً.",
    "مترجم" to "ترجم النص بدقة مع الحفاظ على المعنى والأسلوب.",
    "ملخص" to "لخّص النص في نقاط واضحة ومختصرة.",
    "محلل" to "حلّل المشكلة خطوة بخطوة بمنطق صارم.",
)

fun uriToDataUrl(context: Context, uri: Uri): String? = try {
    context.contentResolver.openInputStream(uri)?.use { input ->
        val bytes = input.readBytes()
        val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
        "data:$mime;base64,$b64"
    }
} catch (_: Exception) { null }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen() {
    val vm: ChatViewModel = viewModel()
    val messages by vm.messages.collectAsState()
    val tier by vm.tier.collectAsState()
    val webSearch by vm.webSearch.collectAsState()
    val isGenerating by vm.isGenerating.collectAsState()
    val error by vm.error.collectAsState()
    val skillActive by vm.skillPrompt.collectAsState()

    val context = LocalContext.current
    val listState = rememberLazyListState()
    var input by remember { mutableStateOf("") }
    var attached by remember { mutableStateOf<List<String>>(emptyList()) }
    var menuOpen by remember { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { uriToDataUrl(context, it)?.let { d -> attached = attached + d } }
    }

    LaunchedEffect(messages.size, messages.lastOrNull()?.content?.length) {
        if (messages.isNotEmpty()) listState.scrollToItem(messages.lastIndex)
    }
    LaunchedEffect(error) {
        error?.let { snackbar.showSnackbar(it); vm.clearError() }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("MijlAi", style = MaterialTheme.typography.titleLarge) },
                actions = {
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(TIERS.first { it.id == tier }.icon, null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(2.dp))
                                Text(TIERS.first { it.id == tier }.label, color = MaterialTheme.colorScheme.primary)
                                Icon(Icons.Filled.ArrowDropDown, null, tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            TIERS.forEach { t ->
                                DropdownMenuItem(
                                    text = { Text(t.label) },
                                    leadingIcon = { Icon(t.icon, null) },
                                    onClick = { vm.setTier(t.id); menuOpen = false }
                                )
                            }
                        }
                    }
                    IconButton(onClick = { vm.toggleWebSearch() }) {
                        Icon(
                            if (webSearch) Icons.Filled.Public else Icons.Filled.Search,
                            "بحث الويب",
                            tint = if (webSearch) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            )
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (messages.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("ابدأ محادثتك مع MijlAi", color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                    }
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize().padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(messages) { MessageBubble(it) }
                    }
                }
            }

            if (attached.isNotEmpty()) {
                LazyRow(contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)) {
                    items(attached) { url ->
                        Box(Modifier.padding(end = 6.dp)) {
                            AsyncImage(url, null, Modifier.size(48.dp).clip(RoundedCornerShape(8.dp)))
                            IconButton(onClick = { attached = attached - url }, Modifier.align(Alignment.TopEnd).size(18.dp)) {
                                Icon(Icons.Filled.Close, null, tint = Color.White, modifier = Modifier.size(14.dp))
                            }
                        }
                    }
                }
            }

            SkillsRow(skillActive) { vm.setSkillPrompt(it) }

            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.Bottom) {
                IconButton(onClick = { launcher.launch("image/*") }) {
                    Icon(Icons.Filled.AttachFile, "إرفاق صورة", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextField(
                    value = input,
                    onValueChange = { input = it },
                    placeholder = { Text("اكتب رسالتك...") },
                    modifier = Modifier.weight(1f),
                    maxLines = 6,
                    colors = TextFieldDefaults.colors(
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    )
                )
                Spacer(Modifier.width(4.dp))
                if (isGenerating) {
                    IconButton(onClick = { vm.stop() }) { Icon(Icons.Filled.Stop, "إيقاف", tint = MaterialTheme.colorScheme.error) }
                } else {
                    IconButton(enabled = input.isNotBlank(), onClick = {
                        vm.send(input, attached)
                        input = ""; attached = emptyList()
                    }) { Icon(Icons.Filled.Send, "إرسال", tint = MaterialTheme.colorScheme.primary) }
                }
            }
        }
    }
}

@Composable
private fun SkillsRow(active: String, onSelect: (String) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp)) {
        items(SKILLS) { (label, prompt) ->
            val isActive = active == prompt
            AssistChip(
                onClick = { onSelect(if (isActive) "" else prompt) },
                label = { Text(label) },
                modifier = Modifier.padding(end = 6.dp),
                colors = AssistChipDefaults.assistChipColors(
                    containerColor = if (isActive) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
                )
            )
        }
    }
}

@Composable
private fun MessageBubble(msg: ChatMessage) {
    val isUser = msg.role == "user"
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (isUser) Alignment.End else Alignment.Start) {
        if (msg.thinking.isNotBlank()) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.padding(bottom = 4.dp).fillMaxWidth(0.92f)
            ) {
                Text(
                    "🧠 ${msg.thinking}",
                    Modifier.padding(10.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = if (isUser) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
            tonalElevation = if (isUser) 0.dp else 1.dp,
            modifier = Modifier.fillMaxWidth(0.92f)
        ) {
            Column(Modifier.padding(12.dp)) {
                when {
                    msg.status == "thinking" && msg.content.isEmpty() ->
                        Text(
                            "يفكّر...",
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (isUser) Color.White else MaterialTheme.colorScheme.onSurface
                        )
                    msg.status == "error" ->
                        Text(msg.content, color = Color(0xFFDC2626))
                    else ->
                        MarkdownText(msg.content, modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
}
