package com.mijlai.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

class ChatViewModel : ViewModel() {
    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private val _tier = MutableStateFlow("flash")
    val tier: StateFlow<String> = _tier.asStateFlow()

    private val _webSearch = MutableStateFlow(false)
    val webSearch: StateFlow<Boolean> = _webSearch.asStateFlow()

    private val _skillPrompt = MutableStateFlow("")
    val skillPrompt: StateFlow<String> = _skillPrompt.asStateFlow()

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var job: Job? = null

    fun setTier(t: String) { _tier.value = t }
    fun toggleWebSearch() { _webSearch.value = !_webSearch.value }
    fun setSkillPrompt(p: String) { _skillPrompt.value = p }

    fun send(prompt: String, imageDataUrls: List<String> = emptyList()) {
        if (prompt.isBlank() || _isGenerating.value) return
        job?.cancel()

        val userMsg = ChatMessage(id = "u${System.currentTimeMillis()}", role = "user", content = prompt)
        val assistantId = "a${System.currentTimeMillis()}"
        val assistantMsg = ChatMessage(id = assistantId, role = "assistant", content = "", status = "thinking")
        _messages.value = _messages.value + userMsg + assistantMsg
        _isGenerating.value = true
        _error.value = null

        job = viewModelScope.launch {
            try {
                val history = _messages.value.filter { it.id != assistantId }.map { msg ->
                    buildJsonObject {
                        put("role", msg.role)
                        put("content", msg.content)
                    }
                }.toMutableList()

                // Attach images (as data URLs) to the latest user message.
                if (imageDataUrls.isNotEmpty() && history.isNotEmpty()) {
                    val last = history.last().jsonObject
                    val lastText = last["content"]?.jsonPrimitive?.content ?: ""
                    history[history.lastIndex] = buildJsonObject {
                        put("role", "user")
                        putJsonArray("content") {
                            add(buildJsonObject { put("type", "text"); put("text", lastText) })
                            imageDataUrls.forEach { u ->
                                add(buildJsonObject {
                                    put("type", "image_url")
                                    putJsonObject("image_url") { put("url", u) }
                                })
                            }
                        }
                    }
                }

                var finalPrompt = prompt
                if (_webSearch.value) {
                    val ds = ApiClient.deepSearch(prompt, JsonArray(history))
                    if (ds.references.isNotEmpty()) {
                        val refBlock = ds.references.joinToString("\n") { "[${it.num}] ${it.title}\n${it.url}" }
                        finalPrompt = "استعن بمصادر الويب التالية عند الإجابة واستشهد بأرقامها [1] [2]:\n\n$refBlock\n\n---\n\nسؤال المستخدم: $prompt"
                    }
                }

                val taskId = ApiClient.sendChat(
                    finalPrompt, JsonArray(history),
                    "default_chat", _tier.value, _skillPrompt.value.ifBlank { null }
                )

                var full = ""
                var think = ""
                ApiClient.streamChat(taskId).collect { ev ->
                    when (ev) {
                        is StreamEvent.Token -> {
                            full += ev.text
                            updateAssistant(assistantId) { it.copy(content = full, status = "streaming") }
                        }
                        is StreamEvent.Think -> {
                            think = if (ev.full) ev.text else think + ev.text
                            updateAssistant(assistantId) { it.copy(thinking = think) }
                        }
                        is StreamEvent.Done -> {
                            if (ev.status == "failed" || ev.status == "aborted") {
                                updateAssistant(assistantId) {
                                    it.copy(status = "error", content = full.ifBlank { ev.error ?: "تم الإيقاف" })
                                }
                                _error.value = ev.error
                            } else {
                                updateAssistant(assistantId) { it.copy(status = "complete") }
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                updateAssistant(assistantId) { it.copy(status = "error", content = e.message ?: "خطأ غير متوقع") }
                _error.value = e.message
            } finally {
                _isGenerating.value = false
            }
        }
    }

    fun stop() {
        job?.cancel()
        _isGenerating.value = false
    }

    fun clearError() { _error.value = null }

    private fun updateAssistant(id: String, transform: (ChatMessage) -> ChatMessage) {
        _messages.value = _messages.value.map { if (it.id == id) transform(it) else it }
    }
}
