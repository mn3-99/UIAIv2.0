/**
 * Parse a URL's hostname without ever throwing. Used where a malformed link
 * (user/agent-provided) would otherwise crash an entire message bubble.
 */
export function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
