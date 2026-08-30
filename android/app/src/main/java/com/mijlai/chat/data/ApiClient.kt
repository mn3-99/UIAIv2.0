package com.mijlai.chat

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder

object ApiClient {
    var baseUrl: String = "https://mijlai.duckdns.org"

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(120, java.util.concurrent.TimeUnit.SECONDS)
        .build()

    private val JSON = "application/json; charset=utf-8".toMediaType()

    fun modelForTier(tier: String): String = when (tier) {
        "mini" -> "direct:mijlai-mini"
        "flash" -> "direct:mijlai-flash"
        "pro" -> "direct:mijlai-pro"
        "pwr" -> "direct:mijlai-pwr"
        else -> "direct:mijlai-pwr"
    }

    suspend fun sendChat(
        prompt: String,
        messagesJson: JsonArray,
        chatId: String,
        tier: String,
        systemPrompt: String?
    ): String = withContext(Dispatchers.IO) {
        val body = buildJsonObject {
            put("prompt", prompt)
            put("messages", messagesJson)
            put("chat_id", chatId)
            put("model", modelForTier(tier))
            put("user_id", "guest")
            put("email", "guest@mijlai.com")
            if (!systemPrompt.isNullOrBlank()) put("system_prompt", systemPrompt)
        }
        val req = Request.Builder()
            .url("$baseUrl/api/chat/send")
            .post(body.toString().toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("send failed: ${resp.code}")
            val text = resp.body?.string() ?: throw IOException("empty response")
            val json = Json.parseToJsonElement(text).jsonObject
            json["task_id"]?.jsonPrimitive?.content
                ?: throw IOException("no task_id in response")
        }
    }

    fun streamChat(taskId: String): Flow<StreamEvent> = flow {
        val url = "$baseUrl/api/chat/stream/${URLEncoder.encode(taskId, "UTF-8")}?offset=0"
        val req = Request.Builder().url(url).get().build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                emit(StreamEvent.Done("failed", "stream failed ${resp.code}"))
                return@flow
            }
            val source = resp.body?.source() ?: return@flow
            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                if (!line.startsWith("data:")) continue
                val data = line.removePrefix("data:").trim()
                if (data == "[DONE]") continue
                try {
                    val json = Json.parseToJsonElement(data).jsonObject
                    when (json["t"]?.jsonPrimitive?.content) {
                        "token" -> {
                            val d = json["d"]?.jsonPrimitive?.contentOrNull
                            if (!d.isNullOrEmpty()) emit(StreamEvent.Token(d))
                        }
                        "think" -> {
                            val d = json["d"]?.jsonPrimitive?.contentOrNull ?: ""
                            val full = json["full"]?.jsonPrimitive?.booleanOrNull ?: false
                            emit(StreamEvent.Think(d, full))
                        }
                        "done" -> {
                            val status = json["status"]?.jsonPrimitive?.content ?: "completed"
                            val err = json["error"]?.jsonPrimitive?.contentOrNull
                            emit(StreamEvent.Done(status, err))
                        }
                    }
                } catch (_: Exception) { /* ignore malformed frame */ }
            }
        }
    }.flowOn(Dispatchers.IO)

    suspend fun deepSearch(query: String, history: JsonArray): DeepSearchResponse = withContext(Dispatchers.IO) {
        val body = buildJsonObject {
            put("query", query)
            put("max_results", 8)
            put("history", history)
        }
        val req = Request.Builder().url("$baseUrl/api/search/deep")
            .post(body.toString().toRequestBody(JSON)).build()
        client.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: "{}"
            val json = Json.parseToJsonElement(text).jsonObject
            val references = json["references"]?.jsonArray?.mapNotNull { e ->
                val o = e.jsonObject
                DeepSearchRef(
                    num = o["num"]?.jsonPrimitive?.intOrNull ?: 0,
                    title = o["title"]?.jsonPrimitive?.contentOrNull ?: "",
                    url = o["url"]?.jsonPrimitive?.contentOrNull ?: ""
                )
            } ?: emptyList()
            val results = json["results"]?.jsonArray?.mapNotNull { e ->
                val o = e.jsonObject
                DeepSearchRef(0, o["title"]?.jsonPrimitive?.contentOrNull ?: "", o["url"]?.jsonPrimitive?.contentOrNull ?: "")
            } ?: emptyList()
            DeepSearchResponse(
                needsSearch = json["needs_search"]?.jsonPrimitive?.booleanOrNull ?: results.isNotEmpty(),
                references = references,
                results = results
            )
        }
    }

    suspend fun imageModels(): List<ImageModel> = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$baseUrl/api/image/v2/models").get().build()
        client.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: "{}"
            val json = Json.parseToJsonElement(text).jsonObject
            json["models"]?.jsonArray?.mapNotNull { e ->
                val o = e.jsonObject
                ImageModel(
                    o["id"]?.jsonPrimitive?.contentOrNull ?: "",
                    o["name"]?.jsonPrimitive?.contentOrNull ?: ""
                )
            }?.filter { it.id.isNotEmpty() } ?: emptyList()
        }
    }

    suspend fun generateImage(
        prompt: String, model: String, width: Int, height: Int, negative: String, seed: Int?
    ): ImageGenResult = withContext(Dispatchers.IO) {
        val body = buildJsonObject {
            put("prompt", prompt)
            put("model", model)
            put("width", width)
            put("height", height)
            put("negativePrompt", negative)
            if (seed != null) put("seed", seed)
        }
        val req = Request.Builder().url("$baseUrl/api/image/v2/generate")
            .post(body.toString().toRequestBody(JSON)).build()
        client.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: "{}"
            val json = Json.parseToJsonElement(text).jsonObject
            if (json["success"]?.jsonPrimitive?.booleanOrNull != true)
                throw IOException(json["error"]?.jsonPrimitive?.contentOrNull ?: "generation failed")
            ImageGenResult(
                url = json["url"]?.jsonPrimitive?.contentOrNull ?: "",
                prompt = prompt,
                model = json["model"]?.jsonPrimitive?.contentOrNull ?: model,
                provider = json["provider"]?.jsonPrimitive?.contentOrNull ?: "",
                label = json["label"]?.jsonPrimitive?.contentOrNull ?: ""
            )
        }
    }
}
