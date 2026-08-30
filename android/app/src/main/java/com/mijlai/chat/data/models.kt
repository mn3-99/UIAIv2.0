package com.mijlai.chat

data class ChatMessage(
    val id: String,
    val role: String,            // "user" | "assistant"
    val content: String,
    val status: String = "complete", // complete | streaming | thinking | error
    val thinking: String = "",
)

data class ImageGenResult(
    val url: String,
    val prompt: String,
    val model: String = "",
    val provider: String = "",
    val label: String = "",
)

data class DeepSearchRef(
    val num: Int = 0,
    val title: String,
    val url: String,
)

data class DeepSearchResponse(
    val needsSearch: Boolean,
    val references: List<DeepSearchRef>,
    val results: List<DeepSearchRef>,
)

data class ImageModel(val id: String, val name: String)

sealed class StreamEvent {
    data class Token(val text: String) : StreamEvent()
    data class Think(val text: String, val full: Boolean) : StreamEvent()
    data class Done(val status: String, val error: String?) : StreamEvent()
}
