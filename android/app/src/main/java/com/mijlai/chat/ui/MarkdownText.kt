package com.mijlai.chat.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.sp

@Composable
fun MarkdownText(text: String, modifier: Modifier = Modifier) {
    Text(parseMarkdown(text), modifier = modifier, style = MaterialTheme.typography.bodyMedium)
}

fun parseMarkdown(md: String): AnnotatedString = buildAnnotatedString {
    val lines = md.split("\n")
    var inCode = false
    val codeBuf = StringBuilder()
    for (line in lines) {
        if (line.startsWith("```")) {
            if (inCode) {
                withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Color.LightGray.copy(alpha = 0.18f))) {
                    append(codeBuf.toString())
                }
                append("\n")
                codeBuf.clear()
                inCode = false
            } else {
                inCode = true
            }
            continue
        }
        if (inCode) { codeBuf.append(line).append("\n"); continue }

        val heading = "^#{1,6}\\s+(.*)".toRegex().find(line)
        if (heading != null) {
            val level = heading.value.takeWhile { it == '#' }.length
            val size = (22 - level * 2).coerceAtLeast(14)
            withStyle(SpanStyle(fontWeight = FontWeight.Bold, fontSize = size.sp)) {
                append(heading.groupValues[1]); append("\n")
            }
            continue
        }

        if (line.startsWith("- ") || line.startsWith("* ")) {
            appendInline("• " + line.substring(2))
            append("\n")
            continue
        }

        appendInline(line)
        append("\n")
    }
    if (inCode && codeBuf.isNotEmpty()) append(codeBuf.toString())
}

private fun AnnotatedString.Builder.appendInline(text: String) {
    var i = 0
    while (i < text.length) {
        when {
            text.startsWith("**", i) -> {
                val end = text.indexOf("**", i + 2)
                if (end != -1) {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(text.substring(i + 2, end)) }
                    i = end + 2; continue
                }
            }
            text.startsWith("`", i) -> {
                val end = text.indexOf("`", i + 1)
                if (end != -1) {
                    withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Color.LightGray.copy(alpha = 0.18f))) {
                        append(text.substring(i + 1, end))
                    }
                    i = end + 1; continue
                }
            }
            text.startsWith("*", i) -> {
                val end = text.indexOf("*", i + 1)
                if (end != -1) {
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(text.substring(i + 1, end)) }
                    i = end + 1; continue
                }
            }
            text.startsWith("[", i) -> {
                val m = "\\[([^\\[\\]]+)\\]\\((https?://[^)]+)\\)".toRegex().find(text.substring(i))
                if (m != null) {
                    val (label, url) = m.destructured
                    withStyle(SpanStyle(color = Blue600, textDecoration = TextDecoration.Underline)) { append(label) }
                    i = i + m.value.length; continue
                }
            }
        }
        append(text[i]); i++
    }
}
