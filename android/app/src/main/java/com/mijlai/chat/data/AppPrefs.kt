package com.mijlai.chat

import android.content.Context
import android.content.SharedPreferences

object AppPrefs {
    private const val NAME = "mijlai_prefs"
    private const val KEY_URL = "base_url"

    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = context.getSharedPreferences(NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_URL, null)
        ApiClient.baseUrl = saved ?: context.getString(R.string.default_base_url)
    }

    fun getBaseUrl(): String =
        prefs.getString(KEY_URL, null) ?: "https://mijlai.duckdns.org"

    fun setBaseUrl(url: String) {
        prefs.edit().putString(KEY_URL, url).apply()
        ApiClient.baseUrl = url
    }
}
