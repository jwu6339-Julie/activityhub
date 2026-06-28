import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_INPUT_LENGTH = 18000;
const MAX_BODY_SIZE = 1024 * 1024;

loadEnv();

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "POST" && request.url === "/api/extract-event") {
    await handleExtractEvent(request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    await serveStaticFile(request, response);
    return;
  }

  sendJson(response, 405, { success: false, error: "Method not allowed" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ActivityHub API server running at http://127.0.0.1:${PORT}`);
});

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) return;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

async function handleExtractEvent(request, response) {
  try {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const input = String(payload.input || "").trim();

    if (!input) {
      sendJson(response, 400, { success: false, error: "请先粘贴活动链接或活动原文" });
      return;
    }

    const source = await prepareSourceText(input);
    const event = await extractEventWithOpenAI(source.text, source.originalInput, source.type);
    sendJson(response, 200, { success: true, event });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, status, {
      success: false,
      error: error.publicMessage || error.message || "AI 提取失败，请检查输入内容"
    });
  }
}

async function prepareSourceText(input) {
  if (!isHttpUrl(input)) {
    return {
      type: "text",
      originalInput: "",
      text: input.slice(0, MAX_INPUT_LENGTH)
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const pageResponse = await fetch(input, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ActivityHub/0.1 event extraction"
      }
    });
    clearTimeout(timeout);

    if (!pageResponse.ok) {
      throw new Error(`HTTP ${pageResponse.status}`);
    }

    const contentType = pageResponse.headers.get("content-type") || "";
    if (!contentType.includes("text/") && !contentType.includes("json") && !contentType.includes("html")) {
      throw new Error("Unsupported content type");
    }

    const html = await pageResponse.text();
    const text = htmlToReadableText(html);
    if (text.length < 80) {
      throw new Error("Page text is too short");
    }

    return {
      type: "url",
      originalInput: input,
      text: text.slice(0, MAX_INPUT_LENGTH)
    };
  } catch {
    const error = new Error("链接内容无法读取，请粘贴活动原文后重试");
    error.statusCode = 422;
    error.publicMessage = "链接内容无法读取，请粘贴活动原文后重试";
    throw error;
  }
}

async function extractEventWithOpenAI(sourceText, originalInput, sourceType) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here" || apiKey === "your_openai_api_key_here") {
    const error = new Error("请先在 .env 中配置 OPENAI_API_KEY");
    error.statusCode = 500;
    error.publicMessage = "请先在 .env 中配置 OPENAI_API_KEY";
    throw error;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "你是 ActivityHub 的活动信息提取助手。",
                "请从用户提供的活动网页正文或活动原文中提取商业地产、地产科技、REITs、办公租赁、智慧楼宇、设施管理相关活动信息。",
                "只返回符合 JSON Schema 的结构化数据，不要输出解释。",
                "如果字段无法确认，请返回空字符串；themes 返回数组。",
                "date 优先返回 YYYY-MM-DD；如果只知道日期范围，请返回开始日期 YYYY-MM-DD。",
                "aiSummary 使用 100-150 字中文自然语言，说明活动内容、行业关联和为什么值得业务团队关注。"
              ].join("\n")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `来源类型：${sourceType}`,
                originalInput ? `原始链接：${originalInput}` : "",
                "活动内容：",
                sourceText
              ].filter(Boolean).join("\n")
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "activityhub_event_extraction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", description: "活动名称" },
              eventType: { type: "string", description: "活动类型，如 峰会/论坛/沙龙/展会/研讨会/招商会" },
              city: { type: "string", description: "城市" },
              location: { type: "string", description: "具体地点" },
              date: { type: "string", description: "活动时间，优先 YYYY-MM-DD" },
              organizer: { type: "string", description: "主办方" },
              source: { type: "string", description: "活动来源" },
              registrationUrl: { type: "string", description: "报名链接" },
              posterUrl: { type: "string", description: "活动海报链接，如果没有则为空字符串" },
              themes: {
                type: "array",
                description: "主题标签",
                items: { type: "string" }
              },
              aiSummary: {
                type: "string",
                description: "100-150字活动简介，说明活动内容及其与商业地产、地产科技、REITs、办公租赁或设施管理的关系"
              },
              notes: { type: "string", description: "补充备注" }
            },
            required: [
              "title",
              "eventType",
              "city",
              "location",
              "date",
              "organizer",
              "source",
              "registrationUrl",
              "posterUrl",
              "themes",
              "aiSummary",
              "notes"
            ]
          }
        }
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = data.error?.message || "AI 提取失败，请检查输入内容";
    const error = new Error(errorMessage);
    error.statusCode = response.status;
    error.publicMessage = "AI 提取失败，请检查输入内容";
    throw error;
  }

  const outputText = data.output_text || findOutputText(data);
  if (!outputText) {
    throw new Error("AI 未返回可解析内容");
  }

  const parsed = JSON.parse(outputText);
  return normalizeExtractedEvent(parsed);
}

function normalizeExtractedEvent(event) {
  return {
    title: String(event.title || ""),
    eventType: String(event.eventType || ""),
    city: String(event.city || ""),
    location: String(event.location || ""),
    date: String(event.date || ""),
    organizer: String(event.organizer || ""),
    source: String(event.source || ""),
    registrationUrl: String(event.registrationUrl || ""),
    posterUrl: String(event.posterUrl || ""),
    themes: Array.isArray(event.themes) ? event.themes.map((theme) => String(theme)).filter(Boolean) : [],
    aiSummary: String(event.aiSummary || ""),
    notes: String(event.notes || "")
  };
}

function findOutputText(data) {
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part.text === "string") return part.text;
    }
  }
  return "";
}

function htmlToReadableText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > MAX_BODY_SIZE) {
      const error = new Error("请求内容过长");
      error.statusCode = 413;
      throw error;
    }
  }
  return body;
}

async function serveStaticFile(request, response) {
  const requestUrl = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
  const safePath = path.normalize(path.join(__dirname, pathname));

  if (!safePath.startsWith(__dirname)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(safePath);
    response.writeHead(200, { "Content-Type": contentTypeFor(safePath) });
    if (request.method !== "HEAD") {
      response.end(content);
    } else {
      response.end();
    }
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".svg": "image/svg+xml"
  };
  return types[ext] || "application/octet-stream";
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
