/**
 * Cloudflare Pages Function: /api/chat
 * Streams AI responses directly using Cloudflare Workers AI binding env.AI
 */

interface Env {
  AI: any;
  GEMINI_API_KEY?: string;
  ACCESS_PASSWORD?: string;
}

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;

  try {
    const body: any = await request.json();
    const { messages, modelId = '@cf/meta/llama-3.1-8b-instruct', temperature = 0.7 } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'الرسائل مطلوبة' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Direct Workers AI binding execution
    if (env.AI) {
      const responseStream = await env.AI.run(modelId, {
        messages,
        stream: true,
        max_tokens: 2048,
        temperature
      });

      return new Response(responseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

    // Fallback if env.AI is not bound in local preview mode
    return new Response(JSON.stringify({ error: 'Cloudflare Workers AI binding [AI] غير معرف في wrangler.toml' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'حدث خطأ في الخادم' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
