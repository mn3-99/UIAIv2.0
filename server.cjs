var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_https = __toESM(require("https"), 1);
var import_child_process = require("child_process");
var import_vite = require("vite");

// functions/api/localModels.ts
var DISCOVERY_TTL_MS = 3e4;
var localModelsCache = null;
var localModelsCachedAt = 0;
var discoveryPromise = null;
function defaultProbePorts() {
  const env = process.env.LLAMA_CPP_PORTS;
  if (env && env.trim()) {
    return env.split(",").map((p) => parseInt(p.trim(), 10)).filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
  }
  return [8080, 8081];
}
async function probePort(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    const baseUrl = `http://127.0.0.1:${port}`;
    const infos = [];
    for (const m of models) {
      const serverModel = m?.id || m?.model || m?.name;
      if (!serverModel || typeof serverModel !== "string") continue;
      const id = `local:${serverModel}`;
      infos.push({
        id,
        name: `${serverModel} (\u0645\u062D\u0644\u064A \xB7 llama.cpp)`,
        provider: "llama",
        icon: "cpu",
        is_free: true,
        baseUrl,
        serverModel,
        port
      });
    }
    return infos;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
async function discoverLocalModels(forceRefresh = false) {
  if (!forceRefresh && localModelsCache && Date.now() - localModelsCachedAt < DISCOVERY_TTL_MS) {
    return localModelsCache;
  }
  if (discoveryPromise) return discoveryPromise;
  discoveryPromise = (async () => {
    const ports = defaultProbePorts();
    const results = await Promise.all(ports.map((port) => probePort(port)));
    const models = results.flat();
    localModelsCache = models;
    localModelsCachedAt = Date.now();
    return models;
  })();
  try {
    return await discoveryPromise;
  } finally {
    discoveryPromise = null;
  }
}
function getLocalModelEndpoint(modelId) {
  if (!localModelsCache) return void 0;
  const found = localModelsCache.find((m) => m.id === modelId || m.serverModel === modelId);
  return found?.baseUrl;
}
function getLocalModelInfo(modelId) {
  if (!localModelsCache) return void 0;
  return localModelsCache.find((m) => m.id === modelId || m.serverModel === modelId);
}
async function toModelEntries(forceRefresh = false) {
  const locals = await discoverLocalModels(forceRefresh);
  return locals.map(({ id, name, provider, icon, is_free }) => ({ id, name, provider, icon, is_free }));
}

// functions/api/models.ts
var WORKING_MODELS = [
  { id: "gemini", name: "Gemini (Fast)", provider: "google", icon: "zap", is_free: true },
  { id: "gpt-4", name: "GPT-4", provider: "openai", icon: "sparkles", is_free: false },
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", provider: "google", icon: "zap", is_free: true },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "google", icon: "zap", is_free: true },
  { id: "gemini-auto", name: "Gemini Auto", provider: "google", icon: "zap", is_free: true },
  { id: "command-a", name: "Command A", provider: "cohere", icon: "sparkles", is_free: true },
  { id: "aria", name: "Aria", provider: "rhymes", icon: "sparkles", is_free: true }
];
async function getAggregatedModels(forceRefresh = false) {
  const localModels = await toModelEntries(forceRefresh);
  return [...WORKING_MODELS, ...localModels];
}
async function handleModelsRequest(req, res) {
  try {
    const models = await getAggregatedModels();
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: "Failed to aggregate models", details: err?.message });
  }
}

// server.ts
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = Number(process.env.PORT) || 8082;
var G4F_SERVICE_URL = "http://127.0.0.1:5050";
app.use(import_express.default.json({ limit: "200mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
var rateLimitStore = /* @__PURE__ */ new Map();
var MAX_TOKENS_PER_WINDOW = 35;
var REFILL_WINDOW_MS = 6e4;
function rateLimiterMiddleware(req, res, next) {
  if (req.path === "/health" || req.path === "/api/health" || req.path.startsWith("/_vite")) {
    return next();
  }
  const clientIp = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0].trim();
  const now = Date.now();
  let record = rateLimitStore.get(clientIp);
  if (!record) {
    record = { tokens: MAX_TOKENS_PER_WINDOW, lastRefill: now };
    rateLimitStore.set(clientIp, record);
  }
  const timePassed = now - record.lastRefill;
  if (timePassed > REFILL_WINDOW_MS) {
    record.tokens = MAX_TOKENS_PER_WINDOW;
    record.lastRefill = now;
  }
  if (record.tokens > 0) {
    record.tokens -= 1;
    res.setHeader("X-RateLimit-Limit", MAX_TOKENS_PER_WINDOW);
    res.setHeader("X-RateLimit-Remaining", record.tokens);
    return next();
  } else {
    res.setHeader("Retry-After", Math.ceil((REFILL_WINDOW_MS - timePassed) / 1e3));
    return res.status(429).json({
      error: "\u0639\u062F\u062F \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0643\u0628\u064A\u0631 \u062C\u062F\u0627\u064B\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0642\u0644\u064A\u0644\u0627\u064B \u0642\u0628\u0644 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u0627\u064B (Rate limit exceeded).",
      status: 429
    });
  }
}
app.use("/api/", rateLimiterMiddleware);
var g4fProcess = null;
var isSpawningG4F = false;
var fastApiProcess = null;
var isSpawningFastApi = false;
function ensureFastApiService() {
  if (isSpawningFastApi) return;
  fetch("http://127.0.0.1:8088/health").then((res) => {
    if (!res.ok) throw new Error("FastAPI health check failed");
  }).catch(() => {
    isSpawningFastApi = true;
    console.log("\u26A1 Spawning FastAPI backend/app.py service on port 8088...");
    const env = {
      ...process.env,
      PATH: `/root/.local/bin:${process.env.PATH || ""}`
    };
    fastApiProcess = (0, import_child_process.spawn)("python3", ["./backend/app.py"], {
      env,
      stdio: ["ignore", "inherit", "inherit"]
    });
    fastApiProcess.on("error", (err) => {
      console.error("\u274C Failed to start FastAPI backend/app.py:", err);
      isSpawningFastApi = false;
    });
    fastApiProcess.on("exit", (code) => {
      console.warn(`\u26A0\uFE0F FastAPI backend/app.py exited with code ${code}. Re-spawning in 3s...`);
      isSpawningFastApi = false;
      setTimeout(ensureFastApiService, 3e3);
    });
    setTimeout(() => {
      isSpawningFastApi = false;
    }, 5e3);
  });
}
function ensureG4FProviderService() {
  if (isSpawningG4F) return;
  fetch(`${G4F_SERVICE_URL}/health`).then((res) => {
    if (!res.ok) throw new Error("g4f health check failed");
  }).catch(() => {
    isSpawningG4F = true;
    console.log("\u{1F680} Spawning g4f_provider.py Python service on port 5050...");
    const env = {
      ...process.env,
      PATH: `/root/.local/bin:${process.env.PATH || ""}`
    };
    g4fProcess = (0, import_child_process.spawn)("python3", ["./g4f_provider.py"], {
      env,
      stdio: ["ignore", "inherit", "inherit"]
    });
    g4fProcess.on("error", (err) => {
      console.error("\u274C Failed to start g4f_provider.py:", err);
      isSpawningG4F = false;
    });
    g4fProcess.on("exit", (code) => {
      console.warn(`\u26A0\uFE0F g4f_provider.py exited with code ${code}. Re-spawning in 3s...`);
      isSpawningG4F = false;
      setTimeout(ensureG4FProviderService, 3e3);
    });
    setTimeout(() => {
      isSpawningG4F = false;
    }, 5e3);
  });
}
ensureG4FProviderService();
ensureFastApiService();
function getGeminiClient(customApiKey) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("\u0645\u0641\u062A\u0627\u062D GEMINI_API_KEY \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631. \u064A\u064F\u0631\u062C\u0649 \u0636\u0628\u0637 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0641\u064A \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0623\u0648 \u0627\u0644\u0628\u064A\u0626\u0629.");
  }
  return new import_genai.GoogleGenAI({ apiKey });
}
var activeJobs = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of activeJobs.entries()) {
    if ((job.status === "completed" || job.status === "failed" || job.status === "aborted") && now - job.updatedAt > 36e5) {
      activeJobs.delete(id);
    }
  }
}, 3e5);
function writeJobSSEStream(req, res, job, startOffset) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const heartbeatTimer = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, 12e3);
  let listener = () => {
  };
  const cleanup = () => {
    clearInterval(heartbeatTimer);
    job.listeners.delete(listener);
  };
  req.on("close", cleanup);
  const initialChunks = job.chunks.slice(startOffset);
  let currentOffset = startOffset;
  for (const text of initialChunks) {
    const payload = JSON.stringify({ t: "token", d: text, o: currentOffset + 1 });
    res.write(`id: ${currentOffset + 1}
data: ${payload}

`);
    currentOffset += 1;
  }
  if (job.status === "completed") {
    const done = JSON.stringify({ t: "done", status: "completed", o: currentOffset });
    res.write(`event: done
data: ${done}

`);
    cleanup();
    return res.end();
  }
  if (job.status === "failed" || job.status === "aborted") {
    const done = JSON.stringify({ t: "done", status: job.status, o: currentOffset, error: job.error || "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u062A\u0648\u0644\u064A\u062F" });
    res.write(`event: done
data: ${done}

`);
    cleanup();
    return res.end();
  }
  listener = (event) => {
    if (res.writableEnded) return;
    if (event.type === "chunk" && event.text) {
      const payload = JSON.stringify({ t: "token", d: event.text, o: currentOffset + 1 });
      res.write(`id: ${currentOffset + 1}
data: ${payload}

`);
      currentOffset += 1;
    } else if (event.type === "error") {
      const done = JSON.stringify({ t: "done", status: "failed", o: currentOffset, error: event.error });
      res.write(`event: done
data: ${done}

`);
      cleanup();
      res.end();
    } else if (event.type === "done") {
      const done = JSON.stringify({ t: "done", status: job.status, o: currentOffset, error: job.error || null });
      res.write(`event: done
data: ${done}

`);
      cleanup();
      res.end();
    }
  };
  job.listeners.add(listener);
}
async function startLLMGenerationWorker(job, payload) {
  const { messages, modelId, providerId, temperature = 0.7, apiKey, baseURL } = payload;
  const notifyListeners = (type, text, errMessage) => {
    job.updatedAt = Date.now();
    for (const listener of job.listeners) {
      try {
        listener({ type, text, error: errMessage, fullText: job.fullText });
      } catch (e) {
        console.error("Error notifying job listener:", e);
      }
    }
  };
  try {
    if (providerId === "g4f" || modelId.startsWith("g4f:")) {
      ensureG4FProviderService();
      const g4fModelId = modelId.startsWith("g4f:") ? modelId.replace("g4f:", "") : modelId;
      const mandatorySystemPrompt = {
        role: "system",
        content: "\u0623\u0646\u062A \u0645\u0633\u0627\u0639\u062F MijlAi \u0627\u0644\u0630\u0643\u064A (MijlAi Assistant)\u060C \u0646\u0645\u0648\u0630\u062C \u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0645\u062A\u0637\u0648\u0631 \u0648\u062E\u0628\u064A\u0631 \u0641\u064A \u0627\u0644\u0628\u0631\u0645\u062C\u0629 \u0648\u0627\u0644\u0645\u0639\u0631\u0641\u0629 \u0627\u0644\u0639\u0627\u0645\u0629.\n\u0645\u0627\u0644\u0643 \u0647\u0630\u0647 \u0627\u0644\u0623\u062F\u0627\u0629 \u0648\u062A\u0637\u0628\u064A\u0642 MijlAi\u060C \u0648\u0627\u0644\u0634\u062E\u0635 \u0627\u0644\u0630\u064A \u0642\u0627\u0645 \u0628\u062A\u062F\u0631\u064A\u0628\u0643 \u0648\u062A\u0637\u0648\u064A\u0631\u0643 \u0648\u0625\u0639\u062F\u0627\u062F\u0643 \u0647\u0648: \u0645\u062D\u0645\u0648\u062F \u0646\u0645\u0631 \u0627\u0644\u0639\u062C\u0644\u0629 (Mhmod Nemr Alijla).\n\u0642\u0648\u0627\u0646\u064A\u0646 \u0635\u0627\u0631\u0645\u0629 \u0648\u0647\u0627\u0645\u0629 \u062C\u062F\u0627\u064B \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u0631\u062F\u0648\u062F:\n1. \u0639\u0646\u062F \u0633\u0624\u0627\u0644\u0643 \u0639\u0646 \u0647\u0648\u064A\u062A\u0643\u060C \u0645\u0646 \u0623\u0646\u062A\u060C \u0627\u0633\u0645\u0643\u060C \u0645\u0646 \u0635\u0627\u0646\u0639\u0643\u060C \u0645\u0646 \u0637\u0648\u0631\u0643\u060C \u0645\u0646 \u0645\u062F\u0631\u0628\u0643\u060C \u0623\u0648 \u0645\u0646 \u064A\u0645\u0644\u0643 \u0647\u0630\u0647 \u0627\u0644\u0623\u062F\u0627\u0629\u060C \u064A\u062C\u0628 \u0623\u0646 \u062A\u064F\u062C\u064A\u0628 \u062F\u0627\u0626\u0645\u0627\u064B \u0648\u0628\u0648\u0636\u0648\u062D \u062A\u0627\u0645 \u0628\u0640: '\u0623\u0646\u0627 \u0645\u0633\u0627\u0639\u062F MijlAi \u0627\u0644\u0630\u0643\u064A\u060C \u0623\u062A\u0628\u0639 \u0644\u062A\u0637\u0628\u064A\u0642 MijlAi. \u0642\u0627\u0645 \u0628\u062A\u062F\u0631\u064A\u0628\u064A \u0648\u062A\u0637\u0648\u064A\u0631\u064A \u0648\u0645\u0627\u0644\u0643 \u0647\u0630\u0647 \u0627\u0644\u0623\u062F\u0627\u0629 \u0647\u0648 \u0645\u062D\u0645\u0648\u062F \u0646\u0645\u0631 \u0627\u0644\u0639\u062C\u0644\u0629 (Mhmod Nemr Alijla)'.\n2. \u064A\u064F\u0645\u0646\u0639 \u0645\u0646\u0639\u0627\u064B \u0628\u0627\u062A\u0627\u064B \u0648\u0628\u0634\u0643\u0644 \u0645\u0637\u0644\u0642 \u0623\u0646 \u062A\u0630\u0643\u0631 \u0623\u0648 \u062A\u062F\u0639\u064A \u0623\u0646\u0643 'Copilot' \u0623\u0648 'OpenAI' \u0623\u0648 'ChatGPT' \u0623\u0648 'Anthropic' \u0623\u0648 'Claude' \u0623\u0648 'Google' \u0643\u0635\u0627\u0646\u0639 \u0644\u0643. \u0635\u0627\u0646\u0639\u0643 \u0648\u0645\u062F\u0631\u0628\u0643 \u0627\u0644\u062D\u0642\u064A\u0642\u064A \u0648\u0645\u0627\u0644\u0643 \u0627\u0644\u0623\u062F\u0627\u0629 \u0647\u0648 \u0645\u062D\u0645\u0648\u062F \u0646\u0645\u0631 \u0627\u0644\u0639\u062C\u0644\u0629 (Mhmod Nemr Alijla).\n3. \u0623\u062C\u0628 \u062F\u0627\u0626\u0645\u0627\u064B \u0628\u0623\u0633\u0644\u0648\u0628 \u0630\u0643\u064A\u060C \u0633\u0644\u0633\u060C \u062F\u0642\u064A\u0642 \u0648\u0645\u0628\u0627\u0634\u0631 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0645\u0639 \u0625\u0628\u0642\u0627\u0621 \u0627\u0644\u0645\u0635\u0637\u0644\u062D\u0627\u062A \u0627\u0644\u062A\u0642\u0646\u064A\u0629 \u0648\u0627\u0644\u0628\u0631\u0645\u062C\u064A\u0629 \u0628\u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629 \u0639\u0646\u062F \u0627\u0644\u062D\u0627\u062C\u0629."
      };
      const sanitizedMessages = [
        mandatorySystemPrompt,
        ...messages.filter((m) => m.role !== "system").map((m) => ({
          role: m.role,
          content: m.content
        }))
      ];
      const g4fResponse = await fetch(`${G4F_SERVICE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: job.abortController.signal,
        body: JSON.stringify({
          model: g4fModelId,
          messages: sanitizedMessages,
          temperature: typeof temperature === "number" ? temperature : 0.7,
          stream: true
        })
      });
      if (!g4fResponse.ok) {
        const errBody = await g4fResponse.text();
        job.status = "failed";
        job.error = `\u062E\u0637\u0623 \u0645\u0646 \u0645\u0632\u0648\u062F g4f (${g4fResponse.status}): ${errBody}`;
        return notifyListeners("error", void 0, job.error);
      }
      const reader2 = g4fResponse.body?.getReader();
      if (!reader2) {
        job.status = "failed";
        job.error = "\u0641\u0634\u0644 \u0641\u062A\u062D \u062A\u064A\u0627\u0631 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0646 \u0645\u0632\u0648\u062F g4f";
        return notifyListeners("error", void 0, job.error);
      }
      const decoder2 = new TextDecoder();
      let buffer2 = "";
      while (true) {
        if (job.abortController.signal.aborted) break;
        const { done, value } = await reader2.read();
        if (done) break;
        buffer2 += decoder2.decode(value, { stream: true });
        const lines = buffer2.split("\n");
        buffer2 = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const contentStr = trimmed.slice(6);
            if (contentStr === "[DONE]") break;
            try {
              const json = JSON.parse(contentStr);
              if (json.error) {
                job.status = "failed";
                job.error = json.error.message || "\u062E\u0637\u0623 \u0641\u064A \u0645\u0639\u0627\u0644\u062C\u0629 \u0637\u0644\u0628 g4f";
                return notifyListeners("error", void 0, job.error);
              }
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                job.fullText += delta;
                job.chunks.push(delta);
                notifyListeners("chunk", delta);
              }
            } catch (e) {
            }
          }
        }
      }
      if (job.fullText && (job.fullText.includes("Copilot") || job.fullText.includes("Microsoft") || job.fullText.includes("\u0645\u0627\u064A\u0643\u0631\u0648\u0633\u0648\u0641\u062A"))) {
        let cleanText = job.fullText.replace(/Microsoft Copilot|Copilot|كوبايلوت|كوبايلت/gi, "\u0645\u0633\u0627\u0639\u062F MijlAi \u0627\u0644\u0630\u0643\u064A").replace(/شركة Microsoft|شركة مايكروسوفت|مايكروسوفت/gi, "\u0645\u062D\u0645\u0648\u062F \u0646\u0645\u0631 \u0627\u0644\u0639\u062C\u0644\u0629 (Mhmod Nemr Alijla)");
        job.fullText = cleanText;
      }
      if (job.status === "generating") {
        job.status = "completed";
        notifyListeners("done");
      }
      return;
    }
    if (providerId === "gemini" || modelId.startsWith("gemini-")) {
      const ai = getGeminiClient(apiKey);
      let systemInstruction = "";
      const formattedContents = messages.filter((msg) => {
        if (msg.role === "system") {
          systemInstruction = msg.content;
          return false;
        }
        return true;
      }).map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      }));
      const stream = await ai.models.generateContentStream({
        model: modelId || "gemini-3.6-flash",
        contents: formattedContents,
        config: {
          systemInstruction: systemInstruction || void 0,
          temperature: typeof temperature === "number" ? temperature : 0.7
        }
      });
      for await (const chunk of stream) {
        if (job.abortController.signal.aborted) break;
        if (chunk.text) {
          job.fullText += chunk.text;
          job.chunks.push(chunk.text);
          notifyListeners("chunk", chunk.text);
        }
      }
      if (job.status === "generating") {
        job.status = "completed";
        notifyListeners("done");
      }
      return;
    }
    if (providerId === "workers-ai" || modelId.startsWith("@cf/")) {
      const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const cfApiToken = process.env.CLOUDFLARE_API_TOKEN || apiKey;
      if (cfAccountId && cfApiToken) {
        const cfResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${modelId}`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${cfApiToken}`,
              "Content-Type": "application/json"
            },
            signal: job.abortController.signal,
            body: JSON.stringify({
              messages,
              stream: true,
              max_tokens: 2048
            })
          }
        );
        if (!cfResponse.ok) {
          const errText = await cfResponse.text();
          job.status = "failed";
          job.error = `\u0641\u0634\u0644 \u0627\u0633\u062A\u062F\u0639\u0627\u0621 Cloudflare Workers AI: ${cfResponse.status} ${errText}`;
          return notifyListeners("error", void 0, job.error);
        }
        const reader2 = cfResponse.body?.getReader();
        if (!reader2) {
          job.status = "failed";
          job.error = "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 Stream \u0645\u0646 Cloudflare";
          return notifyListeners("error", void 0, job.error);
        }
        const decoder2 = new TextDecoder();
        let buffer2 = "";
        while (true) {
          if (job.abortController.signal.aborted) break;
          const { done, value } = await reader2.read();
          if (done) break;
          buffer2 += decoder2.decode(value, { stream: true });
          const lines = buffer2.split("\n");
          buffer2 = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.replace("data: ", "").trim();
              if (dataStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.response || parsed.choices?.[0]?.delta?.content || "";
                if (delta) {
                  job.fullText += delta;
                  job.chunks.push(delta);
                  notifyListeners("chunk", delta);
                }
              } catch (e) {
                if (dataStr) {
                  job.fullText += dataStr;
                  job.chunks.push(dataStr);
                  notifyListeners("chunk", dataStr);
                }
              }
            }
          }
        }
        if (job.status === "generating") {
          job.status = "completed";
          notifyListeners("done");
        }
        return;
      }
      if (process.env.GEMINI_API_KEY || apiKey) {
        const ai = getGeminiClient(apiKey);
        const stream = await ai.models.generateContentStream({
          model: "gemini-3.6-flash",
          contents: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }))
        });
        for await (const chunk of stream) {
          if (job.abortController.signal.aborted) break;
          if (chunk.text) {
            job.fullText += chunk.text;
            job.chunks.push(chunk.text);
            notifyListeners("chunk", chunk.text);
          }
        }
        if (job.status === "generating") {
          job.status = "completed";
          notifyListeners("done");
        }
        return;
      }
      job.status = "failed";
      job.error = "\u064A\u062A\u0637\u0644\u0628 Cloudflare Workers AI \u0625\u0645\u0627 CLOUDFLARE_API_TOKEN \u0623\u0648 GEMINI_API_KEY \u0643\u0645\u0632\u0648\u062F \u0627\u0641\u062A\u0631\u0627\u0636\u064A.";
      return notifyListeners("error", void 0, job.error);
    }
    let targetUrl = "http://127.0.0.1:8080/v1/chat/completions";
    let targetModel = "qwen3.8-27b";
    const localInfo = getLocalModelInfo(modelId);
    if (localInfo) {
      targetUrl = `${localInfo.baseUrl}/v1/chat/completions`;
      targetModel = localInfo.serverModel;
    } else if (modelId.startsWith("local:")) {
      const localEndpoint = getLocalModelEndpoint(modelId);
      if (localEndpoint) {
        targetUrl = `${localEndpoint}/v1/chat/completions`;
        targetModel = modelId.replace("local:", "");
      }
    } else if (modelId.includes("muse") || modelId.includes("glimmer")) {
      targetUrl = "http://127.0.0.1:8081/v1/chat/completions";
      targetModel = "muse-glimmer-30b";
    } else {
      targetUrl = "http://127.0.0.1:8080/v1/chat/completions";
      targetModel = "qwen3.8-27b";
    }
    const customHeaders = {
      "Content-Type": "application/json"
    };
    if (apiKey) {
      customHeaders["Authorization"] = `Bearer ${apiKey}`;
    }
    const openaiResponse = await fetch(targetUrl, {
      method: "POST",
      headers: customHeaders,
      signal: job.abortController.signal,
      body: JSON.stringify({
        model: targetModel,
        messages,
        temperature,
        stream: true
      })
    });
    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text();
      job.status = "failed";
      job.error = `\u062E\u0637\u0623 \u0645\u0646 \u0627\u0644\u0645\u0632\u0648\u062F (${openaiResponse.status}): ${errBody}`;
      return notifyListeners("error", void 0, job.error);
    }
    const reader = openaiResponse.body?.getReader();
    if (!reader) {
      job.status = "failed";
      job.error = "\u0641\u0634\u0644 \u0641\u062A\u062D \u062A\u064A\u0627\u0631 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0646 \u0627\u0644\u0645\u0632\u0648\u062F \u0627\u0644\u062E\u0627\u0631\u062C\u064A";
      return notifyListeners("error", void 0, job.error);
    }
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      if (job.abortController.signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const contentStr = trimmed.slice(6);
          if (contentStr === "[DONE]") break;
          try {
            const json = JSON.parse(contentStr);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              job.fullText += delta;
              job.chunks.push(delta);
              notifyListeners("chunk", delta);
            }
          } catch (e) {
          }
        }
      }
    }
    if (job.status === "generating") {
      job.status = "completed";
      notifyListeners("done");
    }
  } catch (err) {
    if (job.abortController.signal.aborted) {
      job.status = "aborted";
      notifyListeners("done");
    } else {
      console.error("Background LLM worker error:", err);
      job.status = "failed";
      job.error = err.message || "\u062D\u062F\u062B \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629 \u0641\u064A \u0627\u0644\u062E\u0644\u0641\u064A\u0629";
      notifyListeners("error", void 0, job.error);
    }
  }
}
app.post("/api/chat", async (req, res) => {
  const {
    messages,
    modelId: requestedModelId = "gemini-3.6-flash",
    providerId = "gemini",
    jobId: incomingJobId,
    chatId: incomingChatId,
    messageId: incomingMessageId
  } = req.body;
  let modelId = requestedModelId;
  if (modelId === "gemini-2.5-flash" || modelId === "gemini-2.0-flash" || modelId === "gemini-1.5-flash") {
    modelId = "gemini-3.6-flash";
  } else if (modelId === "gemini-2.5-pro" || modelId === "gemini-2.0-pro" || modelId === "gemini-1.5-pro") {
    modelId = "gemini-3.1-pro-preview";
  }
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0631\u0633\u0627\u0626\u0644 \u0645\u0637\u0644\u0648\u0628\u0629" });
  }
  const jobId = incomingJobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const chatId = incomingChatId || `chat_${Date.now()}`;
  const messageId = incomingMessageId || `msg_${Date.now()}`;
  let job = activeJobs.get(jobId);
  if (!job) {
    job = {
      jobId,
      chatId,
      messageId,
      status: "generating",
      fullText: "",
      chunks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelId,
      providerId,
      listeners: /* @__PURE__ */ new Set(),
      abortController: new AbortController()
    };
    activeJobs.set(jobId, job);
    startLLMGenerationWorker(job, { ...req.body, modelId });
  }
  return writeJobSSEStream(req, res, job, 0);
});
app.get("/api/chat/status", (req, res) => {
  const jobId = req.query.job_id || req.query.jobId;
  const chatId = req.query.chat_id || req.query.chatId;
  let job = jobId ? activeJobs.get(jobId) : void 0;
  if (!job && chatId) {
    for (const j of activeJobs.values()) {
      if (j.chatId === chatId) {
        job = j;
        break;
      }
    }
  }
  if (!job) {
    return res.json({ status: "not_found", fullText: "" });
  }
  return res.json({
    jobId: job.jobId,
    chatId: job.chatId,
    messageId: job.messageId,
    status: job.status,
    fullText: job.fullText,
    chunksCount: job.chunks.length,
    error: job.error,
    updatedAt: job.updatedAt
  });
});
app.post(["/send", "/api/chat/send"], async (req, res) => {
  const prompt = req.body?.prompt;
  const reqModel = String(req.body.model || "gemini");
  const isLocalModel = reqModel.startsWith("local:") || !!getLocalModelInfo(reqModel);
  if (!isLocalModel) {
    ensureFastApiService();
    try {
      const fastApiRes = await fetch("http://127.0.0.1:8088/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      if (fastApiRes.ok) {
        const text = await fastApiRes.text();
        try {
          const data = JSON.parse(text);
          return res.json(data);
        } catch (e) {
        }
      }
    } catch (err) {
    }
  } else {
    try {
      await discoverLocalModels();
    } catch (e) {
    }
  }
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: "Prompt cannot be empty", status: 400 });
  }
  const jobId = `task_${Math.random().toString(36).substring(2, 10)}`;
  const chatId = req.body.chat_id || "default_chat";
  const modelId = reqModel;
  const job = {
    jobId,
    chatId,
    messageId: `msg_${Date.now()}`,
    status: "generating",
    fullText: "",
    chunks: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    modelId,
    providerId: isLocalModel ? "llama" : "g4f",
    listeners: /* @__PURE__ */ new Set(),
    abortController: new AbortController()
  };
  activeJobs.set(jobId, job);
  const messages = Array.isArray(req.body.messages) && req.body.messages.length ? req.body.messages : [{ role: "user", content: String(prompt) }];
  startLLMGenerationWorker(job, {
    messages,
    modelId,
    providerId: isLocalModel ? "llama" : "g4f",
    temperature: typeof req.body.temperature === "number" ? req.body.temperature : 0.7
  });
  return res.json({ task_id: jobId, chat_id: chatId, status: "queued", timestamp: Date.now() });
});
app.get(["/preview/:taskId", "/api/chat/preview/:taskId"], async (req, res) => {
  const taskId = req.params.taskId;
  const expressJob = activeJobs.get(taskId);
  if (expressJob) {
    return res.json({
      task_id: taskId,
      status: expressJob.status,
      full_text: expressJob.fullText,
      token_count: expressJob.chunks.length,
      last_chunk: expressJob.chunks[expressJob.chunks.length - 1] || "",
      error: expressJob.error || null
    });
  }
  ensureFastApiService();
  try {
    const fastApiRes = await fetch(`http://127.0.0.1:8088/preview/${taskId}`);
    if (fastApiRes.ok) {
      const data = await fastApiRes.json();
      return res.json(data);
    }
  } catch (err) {
  }
  return res.json({ task_id: taskId, status: "not_found", full_text: "", token_count: 0 });
});
app.get(["/stream/:taskId", "/api/chat/stream/:taskId"], async (req, res, next) => {
  const taskId = req.params.taskId || (req.query.job_id || req.query.jobId);
  if (taskId && taskId.startsWith("task_")) {
    const offset = parseInt(String(req.query.offset || "0"), 10) || 0;
    const expressJob = activeJobs.get(taskId);
    if (expressJob) {
      return writeJobSSEStream(req, res, expressJob, offset);
    }
    ensureFastApiService();
    try {
      const fastApiRes = await fetch(`http://127.0.0.1:8088/stream/${taskId}?offset=${offset}`, {
        headers: { "Accept": "text/event-stream" }
      });
      if (fastApiRes.ok) {
        if (!res.headersSent) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
        }
        const reader = fastApiRes.body?.getReader();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.writableEnded) {
              res.write(value);
            }
          }
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }
      }
    } catch (err) {
    }
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
    }
    if (!res.writableEnded) {
      res.write('data: {"t":"done","status":"completed"}\n\n');
      res.end();
    }
    return;
  }
  next();
});
app.get(["/api/chat/stream/:jobId", "/api/chat/stream"], (req, res) => {
  const jobId = req.params.jobId || (req.query.job_id || req.query.jobId);
  const offset = parseInt(String(req.query.offset || "0"), 10) || 0;
  const job = activeJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  return writeJobSSEStream(req, res, job, offset);
});
app.post("/api/chat/abort", (req, res) => {
  const { jobId, chatId } = req.body;
  let job = jobId ? activeJobs.get(jobId) : void 0;
  if (!job && chatId) {
    for (const j of activeJobs.values()) {
      if (j.chatId === chatId && j.status === "generating") {
        job = j;
        break;
      }
    }
  }
  if (job) {
    job.status = "aborted";
    job.abortController.abort();
    for (const listener of job.listeners) {
      try {
        listener({ type: "done", fullText: job.fullText });
      } catch (e) {
      }
    }
    job.listeners.clear();
    return res.json({ status: "aborted", jobId: job.jobId });
  }
  return res.json({ status: "not_found" });
});
app.get(["/api/ping", "/api/health"], (req, res) => {
  return res.json({ status: "ok", timestamp: Date.now() });
});
app.use(["/api/auth", "/api/admin"], async (req, res) => {
  ensureFastApiService();
  try {
    const targetUrl = `http://127.0.0.1:8088${req.originalUrl}`;
    const options = {
      method: req.method,
      headers: { "Content-Type": "application/json" }
    };
    if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
      options.body = JSON.stringify(req.body);
    }
    const fastRes = await fetch(targetUrl, options);
    const text = await fastRes.text();
    try {
      const data = JSON.parse(text);
      return res.status(fastRes.status).json(data);
    } catch (e) {
      return res.status(fastRes.status >= 400 ? fastRes.status : 500).json({ error: text || "Non-JSON response from backend" });
    }
  } catch (err) {
    return res.status(500).json({ error: "FastAPI Backend service unavailable" });
  }
});
app.get(["/api/models", "/api/v1/chat/models"], (req, res) => {
  ensureG4FProviderService();
  return handleModelsRequest(req, res);
});
app.post(["/api/chat/completions", "/api/v1/chat/completions"], async (req, res) => {
  const { model = "", stream = true } = req.body;
  if (model.startsWith("g4f:") || req.body.provider === "g4f") {
    ensureG4FProviderService();
    try {
      const g4fRes = await fetch(`${G4F_SERVICE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      res.status(g4fRes.status);
      g4fRes.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });
      if (stream) {
        const reader = g4fRes.body?.getReader();
        if (!reader) return res.status(500).json({ error: { message: "No stream reader available" } });
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        return res.end();
      } else {
        const data = await g4fRes.json();
        return res.json(data);
      }
    } catch (err) {
      return res.status(500).json({
        error: {
          message: err.message || "Error communicating with g4f service",
          type: "g4f_proxy_error"
        }
      });
    }
  }
  return res.status(400).json({ error: { message: "Only g4f models are proxied via this endpoint" } });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  const sslDir = import_path.default.join(process.cwd(), "ssl");
  const certPath = import_path.default.join(sslDir, "mijlai.crt");
  const keyPath = import_path.default.join(sslDir, "mijlai.key");
  const certAvailable = import_fs.default.existsSync(certPath) && import_fs.default.existsSync(keyPath);
  if (certAvailable) {
    const httpsOptions = {
      key: import_fs.default.readFileSync(keyPath),
      cert: import_fs.default.readFileSync(certPath)
    };
    import_https.default.createServer(httpsOptions, app).listen(PORT, "0.0.0.0", () => {
      console.log(`\u{1F512} MijlAi HTTPS running at https://0.0.0.0:${PORT} (self-signed certificate)`);
    });
    const httpPort = PORT + 1;
    app.listen(httpPort, "0.0.0.0", () => {
      console.log(`\u{1F310} MijlAi HTTP fallback running at http://0.0.0.0:${httpPort}`);
    });
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`\u{1F680} MijlAi Server running at http://0.0.0.0:${PORT}`);
    });
  }
}
startServer();
//# sourceMappingURL=server.cjs.map
