import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { chromium } from "playwright";
import slugify from "slugify";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_INPUT_LENGTH = 18000;
const MAX_BODY_SIZE = 1024 * 1024;
const GENERATED_POSTER_DIR = path.join(__dirname, "assets", "generated-posters");
const GENERATED_POSTER_PUBLIC_DIR = "assets/generated-posters";
const MIN_DISCOVERY_DATE = "2026-05-01";

const DISCOVERY_KEYWORDS = [
  "商业地产", "地产峰会", "地产论坛", "商业地产活动", "REITs", "商业不动产",
  "办公租赁", "地产科技", "PropTech", "设施管理", "智慧楼宇", "智慧园区",
  "商业楼宇", "资产管理", "存量资产", "商业空间"
];

const VERIFIED_SOURCE_URLS = [
  "https://www.expocoss.com/",
  "https://boao.guandian.cn/",
  "https://www.guandian.cn/article/20260607/565580.html",
  "https://kpmg.com/cn/zh/campaigns/2026/06/kpmg-china-leading-proptech50-2026-a-series-of-dialogues-on-next-gen-digital-innovation.html",
  "https://www.build4asia.com/visitor/",
  "https://www.build4asia.com/zh/",
  "https://www.chinacleanexpo.com/cfme",
  "https://www.chpmexpo.com/",
  "https://pujiang.sse.com.cn/update/notice/bond/c/c_20260326_10813113.shtml"
];

const NON_EVENT_PATTERN = /(观点|对话|专访|访谈|快讯|新闻|报道|评论|分析文章|白皮书|榜单|企业50|科技50|政策解读|研究报告)/i;
const EVENT_TITLE_PATTERN = /(活动|大会|峰会|论坛|沙龙|展会|展览会|博览会|研讨会|培训|闭门会|推介会|交流会|会议|conference|summit|forum|expo|exhibition|seminar|webinar|registration)/i;
const REGISTRATION_PATTERN = /(报名|立即报名|参会报名|观众登记|注册|报名入口|我要参会|预约参会|Register|Registration|Visitor Registration|Book Now|Apply Now)/i;

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

  if (request.method === "POST" && request.url === "/api/discover-events") {
    await handleDiscoverEvents(response);
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

async function handleDiscoverEvents(response) {
  const diagnostics = [];

  try {
    const candidates = await discoverEventCandidates(diagnostics);
    if (!candidates.length) {
      sendJson(response, 200, { success: true, events: [], sources: diagnostics });
      return;
    }

    await mkdir(GENERATED_POSTER_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const discovered = [];

    try {
      for (const candidate of candidates.slice(0, 8)) {
        const result = createCandidateLog(candidate);
        try {
          const page = await fetchPageContent(candidate.url);
          const pageTitle = candidate.title || page.title || "";
          const candidateText = `${pageTitle} ${page.text}`;

          if (isObviousNonEvent(pageTitle, candidate.url)) {
            result.isRealEvent = "no";
            result.kept = "filtered";
            result.filteredReason = "标题或链接显示为新闻、访谈、观点、榜单或研究内容";
            logCandidateResult(result);
            continue;
          }

          const registration = extractRegistrationLink(page.html, candidate.url);
          const registrationUrl = sanitizeRegistrationUrl(registration.url || inferRegistrationUrl(candidate.url, page.text));
          result.registrationLinkFound = registrationUrl ? "yes" : "no";
          if (!registrationUrl) {
            result.kept = "filtered";
            result.filteredReason = "未找到直接报名链接";
            logCandidateResult(result);
            continue;
          }

          const slug = createSlug(candidate.title || page.title || candidate.url);
          const posterPath = await extractPosterImage(page.html, candidate.url, slug)
            || await captureEventScreenshot(registrationUrl || candidate.url, slug, browser);
          result.screenshotSuccess = posterPath ? "yes" : "no";
          const summarized = await summarizeEventWithAI({
            pageText: candidateText,
            url: candidate.url,
            sourceName: candidate.sourceName || page.sourceName,
            registrationUrl,
            screenshotPath: posterPath,
            candidateTitle: candidate.title
          });

          const normalized = normalizeDiscoveredEvent({
            ...summarized,
            eventUrl: candidate.url,
            registrationUrl,
            posterUrl: posterPath,
            source: summarized.source || candidate.sourceName || page.sourceName,
            notes: mergePlainNotes(
              summarized.notes,
              registration.direct && registrationUrl ? "已识别直接报名链接" : "未找到直接报名链接"
            )
          });
          const quality = evaluateDiscoveredEvent(normalized, candidateText);
          result.eventDate = normalized.date || "unknown";
          result.isAfterMinDate = quality.isAfterMinDate ? "yes" : "no";
          result.isRealEvent = quality.isRealEvent ? "yes" : "no";
          result.kept = quality.keep ? "kept" : "filtered";
          result.filteredReason = quality.reason || "";
          logCandidateResult(result);

          if (quality.keep) {
            discovered.push(normalized);
          }
        } catch (error) {
          result.kept = "failed";
          result.filteredReason = error.publicMessage || error.message || "候选活动处理失败";
          logCandidateResult(result);
          diagnostics.push({
            url: candidate.url,
            status: "failed",
            error: error.publicMessage || error.message || "候选活动处理失败"
          });
        }
      }
    } finally {
      await browser.close();
    }

    sendJson(response, 200, {
      success: true,
      events: dedupeEvents(discovered),
      sources: diagnostics
    });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      success: false,
      error: error.publicMessage || error.message || "真实活动发现失败，请稍后重试",
      sources: diagnostics
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

async function discoverEventCandidates(diagnostics) {
  const candidates = [];

  for (const sourceUrl of VERIFIED_SOURCE_URLS) {
    try {
      const page = await fetchPageContent(sourceUrl);
      const links = extractCandidateLinks(page.html, sourceUrl, page.sourceName);

      candidates.push({
        url: sourceUrl,
        title: page.title,
        sourceName: page.sourceName,
        score: scoreCandidate(page.title, page.text, sourceUrl)
      });
      candidates.push(...links);

      diagnostics.push({
        url: sourceUrl,
        status: "ok",
        candidateCount: links.length + 1
      });
    } catch (error) {
      diagnostics.push({
        url: sourceUrl,
        status: "failed",
        error: error.publicMessage || error.message || "来源读取失败"
      });
    }
  }

  const deduped = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()];
  return deduped
    .map((candidate) => ({
      ...candidate,
      score: candidate.score || scoreCandidate(candidate.title, "", candidate.url)
    }))
    .filter((candidate) => candidate.score > 0 || VERIFIED_SOURCE_URLS.includes(candidate.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, 14);
}

async function fetchPageContent(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ActivityHub/0.2 public event discovery"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/") && !contentType.includes("html")) {
      throw new Error("Unsupported content type");
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const title = cleanText($("title").first().text() || $("h1").first().text() || url);
    const text = cleanText($("body").text() || htmlToReadableText(html));

    return {
      html,
      title,
      text: text.slice(0, MAX_INPUT_LENGTH),
      sourceName: sourceNameFromUrl(url)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractCandidateLinks(html, baseUrl, sourceName) {
  const $ = cheerio.load(html);
  const links = [];

  $("a[href]").each((_, element) => {
    const rawHref = $(element).attr("href");
    const text = cleanText($(element).text());
    const title = text || cleanText($(element).attr("title") || "");
    const url = toAbsoluteUrl(rawHref, baseUrl);
    if (!url || !isHttpUrl(url)) return;
    if (url.includes("#") && new URL(url).pathname === new URL(baseUrl).pathname) return;

    const context = cleanText(`${title} ${rawHref}`);
    const score = scoreCandidate(title, context, url);
    if (score <= 0) return;
    if (isBlockedCandidateUrl(url)) return;

    links.push({ url, title, sourceName, score });
  });

  return links
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function extractRegistrationLink(html, baseUrl) {
  const $ = cheerio.load(html);
  const blockedPattern = /(javascript:|mailto:|tel:|#)/i;

  const candidates = [];
  $("a[href], button, [onclick]").each((_, element) => {
    const text = cleanText($(element).text() || $(element).attr("aria-label") || $(element).attr("title") || "");
    const href = $(element).attr("href") || extractUrlFromOnclick($(element).attr("onclick") || "");
    if (!href || blockedPattern.test(href)) return;
    if (!REGISTRATION_PATTERN.test(text) && !REGISTRATION_PATTERN.test(href)) return;

    const url = toAbsoluteUrl(href, baseUrl);
    if (url && isHttpUrl(url) && !isLikelyHomepage(url) && !isBlockedRegistrationUrl(url) && !isFileDownload(url)) {
      candidates.push(url);
    }
  });

  return candidates.length ? { url: candidates[0], direct: true } : { url: "", direct: false };
}

function inferRegistrationUrl(pageUrl, pageText) {
  const urlLooksLikeRegistration = /(visitor|register|registration|signup|apply|报名|登记)/i.test(pageUrl);
  if (!isLikelyHomepage(pageUrl) && urlLooksLikeRegistration && REGISTRATION_PATTERN.test(pageText)) {
    return pageUrl;
  }
  return "";
}

async function captureEventScreenshot(url, slug, browser) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 680 }, deviceScaleFactor: 1 });
  const fileName = `${slug}-${Date.now()}.png`;
  const filePath = path.join(GENERATED_POSTER_DIR, fileName);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 18000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: filePath,
      type: "png",
      fullPage: false
    });
    return `${GENERATED_POSTER_PUBLIC_DIR}/${fileName}`;
  } catch {
    return "";
  } finally {
    await page.close();
  }
}

async function extractPosterImage(html, baseUrl, slug) {
  const $ = cheerio.load(html);
  const images = [];

  $("img[src]").each((_, element) => {
    const src = $(element).attr("src");
    const alt = cleanText($(element).attr("alt") || "");
    const title = cleanText($(element).attr("title") || "");
    const className = cleanText($(element).attr("class") || "");
    const width = Number($(element).attr("width") || 0);
    const height = Number($(element).attr("height") || 0);
    const url = toAbsoluteUrl(src, baseUrl);
    if (!url || !isHttpUrl(url) || isBlockedRegistrationUrl(url)) return;

    const descriptor = `${alt} ${title} ${className} ${url}`;
    let score = 0;
    if (/(poster|banner|kv|hero|海报|主视觉|活动|峰会|论坛|展会|大会)/i.test(descriptor)) score += 8;
    if (width >= 500 || height >= 260) score += 4;
    if (/\.(png|jpg|jpeg|webp)(\?|$)/i.test(url)) score += 2;
    if (score > 0) images.push({ url, score });
  });

  const best = images.sort((a, b) => b.score - a.score)[0];
  if (!best) return "";
  return saveRemoteImage(best.url, `${slug}-poster`);
}

async function saveRemoteImage(url, slug) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "ActivityHub/0.2 poster fetch" }
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return "";

    const ext = contentType.includes("png") ? "png"
      : contentType.includes("webp") ? "webp"
        : "jpg";
    const fileName = `${slug}-${Date.now()}.${ext}`;
    const filePath = path.join(GENERATED_POSTER_DIR, fileName);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, bytes);
    return `${GENERATED_POSTER_PUBLIC_DIR}/${fileName}`;
  } catch {
    return "";
  }
}

async function summarizeEventWithAI({ pageText, url, sourceName, registrationUrl, screenshotPath, candidateTitle }) {
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
                "你是 ActivityHub 的真实活动发现助手。",
                "请判断页面是否包含商业地产、地产科技、REITs、办公租赁、智慧楼宇、设施管理、资产管理、存量资产或商业空间相关活动。",
                "只提取真实活动、会议、展会、峰会、论坛、沙龙、研讨会或培训。",
                "不要把新闻报道、访谈、观点文章、榜单、白皮书、政策解读或研究报告提取为活动。",
                "只输出 JSON Schema 要求的字段。不要编造报名链接、海报或地点。",
                "registrationUrl 只能使用用户提供的候选报名链接；没有则为空字符串。",
                "posterUrl 只能使用用户提供的本地截图路径；没有则为空字符串。",
                "date 优先返回 YYYY-MM-DD；如果只知道日期范围，返回开始日期。",
                "如果无法识别明确活动日期，请 date 返回空字符串，并在 notes 说明。",
                "aiSummary 写 100-150 字中文备注，说明活动内容、主题、适合关注原因。"
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
                `候选标题：${candidateTitle || ""}`,
                `活动详情页：${url}`,
                `来源网站：${sourceName}`,
                `候选直接报名链接：${registrationUrl || ""}`,
                `本地截图路径：${screenshotPath || ""}`,
                "页面正文：",
                pageText.slice(0, MAX_INPUT_LENGTH)
              ].join("\n")
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "activityhub_discovered_event",
          strict: true,
          schema: discoveredEventSchema()
        }
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "AI 总结失败");
    error.statusCode = response.status;
    error.publicMessage = "AI 总结失败，请检查 OpenAI API 配置";
    throw error;
  }

  const outputText = data.output_text || findOutputText(data);
  if (!outputText) throw new Error("AI 未返回可解析内容");
  return JSON.parse(outputText);
}

function discoveredEventSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      eventType: { type: "string", description: "峰会/论坛/沙龙/展会/研讨会/培训/其他" },
      city: { type: "string" },
      location: { type: "string" },
      date: { type: "string" },
      organizer: { type: "string" },
      source: { type: "string" },
      eventUrl: { type: "string" },
      registrationUrl: { type: "string" },
      posterUrl: { type: "string" },
      themes: { type: "array", items: { type: "string" } },
      aiSummary: { type: "string", description: "100-150字中文活动简介" },
      notes: { type: "string" }
    },
    required: [
      "title",
      "eventType",
      "city",
      "location",
      "date",
      "organizer",
      "source",
      "eventUrl",
      "registrationUrl",
      "posterUrl",
      "themes",
      "aiSummary",
      "notes"
    ]
  };
}

function normalizeDiscoveredEvent(event) {
  const registrationUrl = sanitizeRegistrationUrl(event.registrationUrl || "");
  const notes = String(event.notes || "");

  return {
    title: String(event.title || "").trim(),
    eventType: String(event.eventType || "其他"),
    city: String(event.city || ""),
    location: String(event.location || ""),
    date: String(event.date || ""),
    organizer: String(event.organizer || ""),
    source: String(event.source || ""),
    eventUrl: String(event.eventUrl || ""),
    registrationUrl,
    posterUrl: String(event.posterUrl || ""),
    themes: Array.isArray(event.themes) ? event.themes.map((theme) => String(theme)).filter(Boolean) : [],
    aiSummary: String(event.aiSummary || ""),
    notes: registrationUrl
      ? notes
      : notes.includes("未找到直接报名链接") ? notes : mergePlainNotes(notes, "未找到直接报名链接")
  };
}

function evaluateDiscoveredEvent(event, pageText = "") {
  if (!event.registrationUrl) {
    return { keep: false, isAfterMinDate: false, isRealEvent: false, reason: "未找到直接报名链接" };
  }

  const date = parseEventDate(event.date);
  if (!date) {
    return { keep: false, isAfterMinDate: false, isRealEvent: isRealEvent(event, pageText), reason: "无法识别活动日期" };
  }

  const isAfterMinDate = date >= new Date(`${MIN_DISCOVERY_DATE}T00:00:00`);
  if (!isAfterMinDate) {
    return { keep: false, isAfterMinDate, isRealEvent: isRealEvent(event, pageText), reason: `活动日期早于 ${MIN_DISCOVERY_DATE}` };
  }

  const realEvent = isRealEvent(event, pageText);
  if (!realEvent) {
    return { keep: false, isAfterMinDate, isRealEvent: false, reason: "页面属于新闻、访谈、观点、榜单或标题不像活动" };
  }

  return { keep: true, isAfterMinDate, isRealEvent: true, reason: "" };
}

function parseEventDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRealEvent(event, pageText = "") {
  const title = String(event.title || "");
  const combined = `${title} ${event.eventType || ""} ${event.themes?.join(" ") || ""}`;
  if (isObviousNonEvent(combined, event.eventUrl || "")) return false;
  if (EVENT_TITLE_PATTERN.test(combined)) return true;

  const firstText = String(pageText || "").slice(0, 1600);
  return EVENT_TITLE_PATTERN.test(firstText) && !NON_EVENT_PATTERN.test(title);
}

function dedupeEvents(items) {
  const byKey = new Map();

  items.forEach((item) => {
    if (!item.title) return;
    const key = [item.title.trim().toLowerCase(), item.date, item.city].join("|");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      return;
    }

    const winner = completenessScore(item) > completenessScore(existing) ? item : existing;
    const loser = winner === item ? existing : item;
    byKey.set(key, {
      ...winner,
      notes: mergePlainNotes(winner.notes, `合并来源：${loser.source || loser.eventUrl || "未知来源"}`)
    });
  });

  return [...byKey.values()];
}

function completenessScore(event) {
  return [
    event.title,
    event.eventType,
    event.city,
    event.location,
    event.date,
    event.organizer,
    event.registrationUrl,
    event.posterUrl,
    event.aiSummary
  ].filter(Boolean).length;
}

function scoreCandidate(title = "", context = "", url = "") {
  const text = `${title} ${context} ${url}`.toLowerCase();
  let score = 0;

  if (isObviousNonEvent(title, url)) return -10;

  DISCOVERY_KEYWORDS.forEach((keyword) => {
    if (text.includes(keyword.toLowerCase())) score += 10;
  });
  if (/(event|forum|summit|expo|conference|visitor|registration|article|活动|论坛|峰会|展会|报名)/i.test(text)) {
    score += 8;
  }
  if (isLikelyHomepage(url)) score -= 4;
  return score;
}

function isObviousNonEvent(title = "", url = "") {
  const text = `${title} ${url}`.toLowerCase();
  if (NON_EVENT_PATTERN.test(text)) return true;
  if (/\/article\/|\/news\/|\/press|\/insight|\/report|\/pdf\//i.test(text) && !EVENT_TITLE_PATTERN.test(title)) return true;
  return false;
}

function createCandidateLog(candidate) {
  return {
    candidateTitle: candidate.title || candidate.url,
    eventDate: "unknown",
    isAfterMinDate: "unknown",
    isRealEvent: "unknown",
    registrationLinkFound: "unknown",
    screenshotSuccess: "unknown",
    kept: "pending",
    filteredReason: ""
  };
}

function logCandidateResult(result) {
  console.log("[discover-events]", [
    `candidate title=${result.candidateTitle}`,
    `event date=${result.eventDate}`,
    `is after ${MIN_DISCOVERY_DATE}=${result.isAfterMinDate}`,
    `is real event=${result.isRealEvent}`,
    `registration link found=${result.registrationLinkFound}`,
    `screenshot success=${result.screenshotSuccess}`,
    `kept or filtered=${result.kept}`,
    result.filteredReason ? `filtered reason=${result.filteredReason}` : ""
  ].filter(Boolean).join(" | "));
}

function createSlug(value) {
  const slug = slugify(value, { lower: true, strict: true, locale: "zh" }).slice(0, 60);
  return slug || `event-${Date.now()}`;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sourceNameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "公开网页";
  }
}

function toAbsoluteUrl(href, baseUrl) {
  if (!href) return "";
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return "";
  }
}

function extractUrlFromOnclick(value) {
  const match = String(value || "").match(/https?:\/\/[^'")\s]+/i);
  return match ? match[0] : "";
}

function isLikelyHomepage(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const pathName = parsed.pathname.replace(/\/+$/, "");
    return pathName === "" || pathName === "/zh" || pathName === "/cn";
  } catch {
    return false;
  }
}

function sanitizeRegistrationUrl(url) {
  const value = String(url || "").trim();
  if (!value || isLikelyHomepage(value) || isBlockedRegistrationUrl(value) || isFileDownload(value)) return "";
  return value;
}

function isBlockedRegistrationUrl(url) {
  const text = String(url || "").toLowerCase();
  return /beian|recordcode|privacy|terms|contact|about|copyright|police|公安|备案/.test(text);
}

function isBlockedCandidateUrl(url) {
  const text = String(url || "").toLowerCase();
  return isBlockedRegistrationUrl(text)
    || isFileDownload(text);
}

function isFileDownload(url) {
  return /\.(pdf|doc|docx|xls|xlsx|zip|rar)(\?|$)/i.test(String(url || ""));
}

function mergePlainNotes(...values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].join("；");
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
