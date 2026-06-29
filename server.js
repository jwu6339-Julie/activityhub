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
const MAX_DISCOVERY_CANDIDATES = 36;
const MAX_DISCOVERED_EVENTS = 24;
const GENERATED_POSTER_DIR = path.join(__dirname, "assets", "generated-posters");
const GENERATED_POSTER_PUBLIC_DIR = "assets/generated-posters";
const MIN_DISCOVERY_DATE = "2026-05-01";

const DISCOVERY_KEYWORDS = [
  "商业地产", "地产峰会", "地产论坛", "商业地产活动", "REITs", "商业不动产",
  "办公租赁", "地产科技", "PropTech", "设施管理", "智慧楼宇", "智慧园区",
  "商业楼宇", "资产管理", "存量资产", "商业空间", "不良资产",
  "产业园区", "物流地产", "城市更新", "商办"
];

const DISCOVERY_QUERIES = [
  "2026 商业地产 活动 报名",
  "2026 地产科技 大会 报名",
  "2026 REITs 研讨会 报名",
  "2026 存量资产 论坛 报名",
  "2026 不良资产 大会 报名",
  "2026 办公租赁 活动 报名",
  "2026 设施管理 会议 报名",
  "2026 产业园区 大会 报名",
  "2026 物流地产 峰会 报名",
  "2026 智慧楼宇 论坛 报名",
  "2026房地产不良资产运营大会 报名",
  "RICS REITs赋能存量资产价值跃升研讨会 报名",
  "2026中国商业地产投资专业展览会 报名",
  "2026 上海 商业地产 峰会 报名",
  "2026 北京 商业地产 论坛 报名",
  "2026 广州 地产科技 活动 报名",
  "2026 深圳 智慧楼宇 展会 报名",
  "2026 成都 产业园区 论坛 报名",
  "2026 资产管理 商业不动产 论坛 报名",
  "2026 企业不动产 CRE 活动 报名",
  "2026 办公空间 办公租赁 峰会 报名",
  "2026 物业设施管理 展会 报名"
];

const HIGH_CONFIDENCE_SOURCE_URLS = [
  "https://www.build4asia.com/visit/",
  "https://www.build4asia.com/visitor/",
  "https://www.chinacleanexpo.com/cfme",
  "https://www.chpmexpo.com/",
  "https://www.expocoss.com/",
  "https://www.opifair.com.cn/",
  "https://gebt.gymf.com.cn/",
  "https://gile.gymf.com.cn/",
  "https://www.imxpo.com.cn/",
  "https://www.messefrankfurt.com.cn/",
  "https://www.ciihie.com/",
  "https://www.fangchan.com/",
  "https://www.ireexpo.com/"
];

const NON_EVENT_PATTERN = /(观点|对话|专访|访谈|新闻|报道|快讯|评论|分析|观察|回顾|圆满举行|成功举办|成功召开|发布|榜单|企业50|科技50|白皮书|研究报告|政策解读|人物|案例|文章|资讯)/i;
const POST_EVENT_PATTERN = /(圆满举行|成功举办|成功召开|会后|回顾|现场回顾|精彩回顾|活动回顾|大会回顾)/i;
const EVENT_TITLE_PATTERN = /(大会|峰会|论坛|研讨会|沙龙|展览会|博览会|交流会|培训|闭门会|招商会|推介会|说明会|开放日|路演|报名|参会|注册|conference|summit|forum|expo|exhibition|seminar|webinar|training|registration)/i;
const REGISTRATION_PATTERN = /(报名|立即报名|参会报名|我要报名|我要参会|观众登记|注册|报名入口|预约参会|在线报名|Register|Registration|Sign up|Apply|Book|Ticket|Visitor Registration)/i;
const SEARCH_RESULT_SELECTOR = [
  ".vr-title a",
  "li.b_algo h2 a",
  ".b_title a",
  "h3 a",
  "a.result__a"
].join(",");

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
    await mkdir(GENERATED_POSTER_DIR, { recursive: true });
    const candidates = await discoverEventCandidates(diagnostics);
    const browser = await chromium.launch({ headless: true });
    const events = [];

    try {
      for (const candidate of candidates.slice(0, MAX_DISCOVERY_CANDIDATES)) {
        const event = await processDiscoveredCandidate(candidate, browser, diagnostics);
        if (event) events.push(event);
        if (events.length >= MAX_DISCOVERED_EVENTS) break;
      }
    } finally {
      await browser.close();
    }

    const finalEvents = dedupeEvents(events)
      .sort((a, b) => parseEventDate(b.date)?.getTime() - parseEventDate(a.date)?.getTime())
      .slice(0, 18);

    sendJson(response, 200, {
      success: true,
      events: finalEvents,
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

async function processDiscoveredCandidate(candidate, browser, diagnostics) {
  const result = createCandidateLog(candidate);
  try {
    const page = await fetchPageContent(candidate.url).catch(() => fetchPageContentWithBrowser(candidate.url, browser));
    const sourceUrl = page.url || candidate.url;
    const pageTitle = candidate.title || page.title || "";
    const candidateText = `${pageTitle} ${page.text}`;
    result.sourceUrl = sourceUrl;
    result.isArticleNewsInterview = isArticleNewsInterview(pageTitle, candidateText, sourceUrl) ? "yes" : "no";

    if (result.isArticleNewsInterview === "yes") {
      result.kept = "filtered";
      result.filteredReason = POST_EVENT_PATTERN.test(candidateText)
        ? "filtered: post-event news"
        : "filtered: article/interview content";
      logCandidateResult(result);
      diagnostics.push({ url: sourceUrl, status: "filtered", title: pageTitle, reason: result.filteredReason });
      return null;
    }

    const registration = extractRegistrationLink(page.html, sourceUrl);
    const registrationUrl = sanitizeRegistrationUrl(registration.url || inferRegistrationUrl(sourceUrl, page.text));
    result.registrationUrl = registrationUrl;
    result.registrationLinkFound = registrationUrl ? "yes" : "no";
    const slug = createSlug(pageTitle || candidate.url);
    const posterUrl = await extractPosterImage(page.html, sourceUrl, slug)
      || await createDesignedPoster(pageTitle || candidate.title || sourceNameFromUrl(sourceUrl), sourceUrl, page.text, slug, browser);
    result.screenshotSuccess = posterUrl ? "yes" : "no";
    if (!posterUrl) {
      result.kept = "filtered";
      result.filteredReason = "filtered: no poster or screenshot";
      logCandidateResult(result);
      diagnostics.push({ url: sourceUrl, status: "filtered", title: pageTitle, reason: result.filteredReason });
      return null;
    }

    const summarized = await summarizeEventWithAI({
      pageText: candidateText,
      url: sourceUrl,
      sourceName: candidate.sourceName || page.sourceName,
      registrationUrl,
      screenshotPath: posterUrl,
      candidateTitle: pageTitle
    });
    const normalized = normalizeDiscoveredEvent({
      ...summarized,
      source: summarized.source || candidate.sourceName || page.sourceName,
      sourceUrl,
      eventUrl: sourceUrl,
      registrationUrl,
      posterUrl,
      verifiedSource: true
    });
    applyKnownSourceCorrections(normalized);
    const quality = evaluateDiscoveredEvent(normalized, candidateText);
    result.eventDate = normalized.date || "unknown";
    result.isAfterMinDate = quality.isAfterMinDate ? "yes" : "no";
    result.isRealEvent = quality.isRealEvent ? "yes" : "no";
    result.kept = quality.keep ? "kept" : "filtered";
    result.filteredReason = quality.reason || "";
    logCandidateResult(result);
    diagnostics.push({
      url: sourceUrl,
      status: quality.keep ? "kept" : "filtered",
      title: normalized.title || pageTitle,
      reason: quality.reason || ""
    });

    return quality.keep ? {
      ...normalized,
      verifiedSource: true
    } : null;
  } catch (error) {
    result.kept = "failed";
    result.filteredReason = error.publicMessage || error.message || "candidate failed";
    logCandidateResult(result);
    diagnostics.push({
      url: candidate.url,
      status: "failed",
      title: candidate.title || candidate.url,
      error: result.filteredReason
    });
    return null;
  }
}

function ensureNoRicsPostEventSeed() {
  console.log("RICS REITs event excluded unless an original registration page is discovered; post-event reports are filtered.");
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
  ensureNoRicsPostEventSeed();
  const candidates = HIGH_CONFIDENCE_SOURCE_URLS.map((url) => ({
    url,
    title: sourceNameFromUrl(url),
    sourceName: sourceNameFromUrl(url),
    score: 120,
    discoverySource: "high-confidence-source"
  }));
  diagnostics.push({
    query: "high-confidence official event pages",
    status: "seeded_for_verification",
    candidateCount: candidates.length
  });

  const searched = await Promise.all(DISCOVERY_QUERIES.map(async (query) => {
    try {
      const results = await searchWeb(query);
      return { query, status: "searched", candidateCount: results.length, results };
    } catch (error) {
      return {
        query,
        status: "search_failed",
        error: error.publicMessage || error.message || "来源读取失败",
        results: []
      };
    }
  }));

  searched.forEach((item) => {
    candidates.push(...item.results);
    diagnostics.push({
      query: item.query,
      status: item.status,
      candidateCount: item.candidateCount || 0,
      error: item.error
    });
  });

  const deduped = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()];
  return deduped
    .map((candidate) => ({
      ...candidate,
      score: candidate.score || scoreCandidate(candidate.title, "", candidate.url)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);
}

async function searchWeb(query) {
  const results = [];
  const searchUrls = [
    `https://www.sogou.com/web?query=${encodeURIComponent(query)}`,
    `https://cn.bing.com/search?q=${encodeURIComponent(query)}&mkt=zh-CN&cc=cn&setlang=zh-CN`,
    `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  ];

  for (const searchUrl of searchUrls) {
    try {
      const response = await fetchWithTimeout(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 ActivityHub/0.3 real event discovery"
        }
      }, 8000);
      if (!response.ok) continue;
      const html = await response.text();
      const $ = cheerio.load(html);
      $(SEARCH_RESULT_SELECTOR).each((_, element) => {
          const rawHref = $(element).attr("href");
          const title = cleanText($(element).text() || $(element).attr("title") || "");
          const url = normalizeSearchResultUrl(rawHref, searchUrl);
          if (!url || !isHttpUrl(url)) return;
          if (isBlockedCandidateUrl(url)) return;
          if (isArticleUrl(url) && !REGISTRATION_PATTERN.test(`${title} ${url}`)) return;
          if (!isRelevantSearchResult(title, url, query)) return;
          const score = scoreCandidate(title, query, url);
          if (score <= 0) return;
          results.push({ url, title: title || url, sourceName: sourceNameFromUrl(url), score });
        });
    } catch {
      // Keep trying other search entry points.
    }
    if (results.length >= 12) break;
  }

  return [...new Map(results.map((item) => [item.url, item])).values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function normalizeSearchResultUrl(rawHref = "", searchUrl = "https://www.bing.com") {
  if (!rawHref) return "";
  try {
    const parsed = new URL(rawHref, searchUrl);
    if (parsed.hostname.includes("bing.com") && parsed.pathname === "/ck/a") {
      const target = parsed.searchParams.get("u");
      if (target) {
        const normalized = target.startsWith("a1") ? Buffer.from(target.slice(2), "base64").toString("utf8") : target;
        return normalized;
      }
    }
    if (parsed.hostname.includes("duckduckgo.com") && parsed.searchParams.get("uddg")) {
      return parsed.searchParams.get("uddg");
    }
    return parsed.href;
  } catch {
    return "";
  }
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
      url: response.url || url,
      html,
      title,
      text: text.slice(0, MAX_INPUT_LENGTH),
      sourceName: sourceNameFromUrl(response.url || url)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPageContentWithBrowser(url, browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 18000 });
    await page.waitForTimeout(1600);
    await removeVisualOverlays(page);
    const html = await page.content();
    const title = cleanText(await page.title() || url);
    const text = cleanText(await page.locator("body").innerText({ timeout: 5000 }).catch(() => htmlToReadableText(html)));
    return {
      url: page.url() || url,
      html,
      title,
      text: text.slice(0, MAX_INPUT_LENGTH),
      sourceName: sourceNameFromUrl(page.url() || url)
    };
  } finally {
    await page.close();
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
    if (isArticleUrl(url) && !REGISTRATION_PATTERN.test(title)) return;

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
    const context = `${text} ${href}`;
    if (!REGISTRATION_PATTERN.test(context) && !/(visitor|visit|pre-registration|my_tickets|参观|观众)/i.test(context)) return;

    const url = toAbsoluteUrl(href, baseUrl);
    if (isValidDirectRegistrationUrl(url, baseUrl)) {
      candidates.push({ url, score: scoreRegistrationCandidate(text, url) });
    }
  });

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  return best ? { url: best.url, direct: true } : { url: "", direct: false };
}

function scoreRegistrationCandidate(text = "", url = "") {
  const context = `${text} ${url}`;
  let score = 0;

  if (/(观众登记|参会报名|我要参会|预约参会|在线报名|visitor registration|buyer pre-registration|pre-registration|register|registration|sign up|ticket|my_tickets)/i.test(context)) score += 24;
  if (/(报名|立即报名|我要报名|注册|apply)/i.test(context)) score += 16;
  if (/(visit|visitor|参观|观众)/i.test(context)) score += 10;
  if (/(exhibit|booth|stand|参展|展位|book your booth|zh-booking)/i.test(context)) score -= 18;
  if (isLikelyHomepage(url)) score -= 20;

  return score;
}

function inferRegistrationUrl(pageUrl, pageText) {
  const urlLooksLikeRegistration = /(visitor|register|registration|signup|apply|ticket|book|报名|登记|参会)/i.test(pageUrl);
  if (!isLikelyHomepage(pageUrl) && urlLooksLikeRegistration && !isArticleUrl(pageUrl) && REGISTRATION_PATTERN.test(pageText)) {
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

async function captureEventHeroScreenshot(url, slug, browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 680 }, deviceScaleFactor: 1 });
  const fileName = `${slug}-hero-${Date.now()}.png`;
  const filePath = path.join(GENERATED_POSTER_DIR, fileName);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 18000 });
    await page.waitForTimeout(1400);
    await removeVisualOverlays(page);

    const hero = page.locator([
      ".hero",
      ".banner",
      ".kv",
      ".poster",
      ".swiper",
      ".carousel",
      "header",
      "main section"
    ].join(",")).first();

    if (await hero.count()) {
      const box = await hero.boundingBox();
      if (box && box.width >= 500 && box.height >= 180) {
        await hero.screenshot({ path: filePath });
        return `${GENERATED_POSTER_PUBLIC_DIR}/${fileName}`;
      }
    }

    await page.screenshot({
      path: filePath,
      type: "png",
      fullPage: false,
      clip: { x: 0, y: 0, width: 1100, height: 620 }
    });
    return `${GENERATED_POSTER_PUBLIC_DIR}/${fileName}`;
  } catch {
    return "";
  } finally {
    await page.close();
  }
}

async function removeVisualOverlays(page) {
  await page.evaluate(() => {
    const selectors = [
      "[class*='cookie']",
      "[id*='cookie']",
      "[class*='modal']",
      "[id*='modal']",
      "[class*='popup']",
      "[id*='popup']",
      ".layui-layer-shade",
      ".layui-layer",
      ".el-overlay"
    ];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (node instanceof HTMLElement) node.style.display = "none";
      });
    });
  }).catch(() => {});
}

async function extractPosterImage(html, baseUrl, slug) {
  const $ = cheerio.load(html);
  const images = [];

  const metaImage = $("meta[property='og:image']").attr("content")
    || $("meta[name='twitter:image']").attr("content")
    || $("meta[itemprop='image']").attr("content");
  const absoluteMetaImage = toAbsoluteUrl(metaImage, baseUrl);
  if (absoluteMetaImage && isHttpUrl(absoluteMetaImage) && !isBlockedRegistrationUrl(absoluteMetaImage)) {
    const saved = await saveRemoteImage(absoluteMetaImage, `${slug}-og`);
    if (saved) return saved;
  }

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

async function createDesignedPoster(title = "", sourceUrl = "", pageText = "", slug = "event", browser = null) {
  try {
    await mkdir(GENERATED_POSTER_DIR, { recursive: true });
    const cleanedTitle = cleanText(title || sourceNameFromUrl(sourceUrl) || "商业地产活动").slice(0, 42);
    const dateMatch = String(pageText || "").match(/20\d{2}(?:年|[-.\/])\s*\d{1,2}(?:月|[-.\/])\s*\d{1,2}/);
    const cityMatch = String(pageText || "").match(/(上海|北京|广州|深圳|成都|香港|杭州|南京|苏州|天津|重庆|武汉|西安)/);
    const subtitle = [cityMatch?.[1], dateMatch?.[0]].filter(Boolean).join(" · ") || sourceNameFromUrl(sourceUrl);
    const topic = DISCOVERY_KEYWORDS.find((keyword) => String(pageText || "").includes(keyword)) || "商业地产活动";
    const lines = wrapSvgText(cleanedTitle, 14, 3);
    const titleTspans = lines.map((line, index) => `<tspan x="72" dy="${index === 0 ? 0 : 40}">${escapeSvg(line)}</tspan>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="640" viewBox="0 0 1080 640">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f2f46"/>
      <stop offset="1" stop-color="#1f5f7a"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#173f5d"/>
      <stop offset="1" stop-color="#0f2f46"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="640" fill="url(#bg)"/>
  <circle cx="916" cy="95" r="160" fill="#ffffff" opacity="0.08"/>
  <circle cx="88" cy="544" r="180" fill="#c8962e" opacity="0.13"/>
  <rect x="54" y="58" width="972" height="524" rx="36" fill="url(#card)" stroke="#d9e2ec" stroke-opacity="0.18"/>
  <text x="72" y="132" fill="#c8962e" font-size="34" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif" font-weight="700">${escapeSvg(topic)}</text>
  <text x="72" y="258" fill="#ffffff" font-size="48" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif" font-weight="700">${titleTspans}</text>
  <text x="72" y="506" fill="#e8f1f5" font-size="30" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif" font-weight="600">${escapeSvg(subtitle)}</text>
  <text x="72" y="550" fill="#d9e2ec" font-size="24" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">来源：${escapeSvg(sourceNameFromUrl(sourceUrl))}</text>
  <g opacity="0.35" stroke="#ffffff" fill="none" stroke-width="3">
    <path d="M780 420h160M780 460h110M780 500h190"/>
    <rect x="735" y="360" width="260" height="180" rx="18"/>
  </g>
</svg>`;
    const baseFileName = `${slug}-poster-${Date.now()}`;
    if (browser) {
      const page = await browser.newPage({ viewport: { width: 1080, height: 640 }, deviceScaleFactor: 1 });
      try {
        const pngFileName = `${baseFileName}.png`;
        const pngPath = path.join(GENERATED_POSTER_DIR, pngFileName);
        await page.setContent(`<html><body style="margin:0">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
        await page.screenshot({ path: pngPath, fullPage: false });
        return `${GENERATED_POSTER_PUBLIC_DIR}/${pngFileName}`;
      } finally {
        await page.close().catch(() => {});
      }
    }
    const fileName = `${baseFileName}.svg`;
    await writeFile(path.join(GENERATED_POSTER_DIR, fileName), svg, "utf8");
    return `${GENERATED_POSTER_PUBLIC_DIR}/${fileName}`;
  } catch {
    return "";
  }
}

function wrapSvgText(text, maxChars = 14, maxLines = 3) {
  const chars = Array.from(String(text || ""));
  const lines = [];
  for (let i = 0; i < chars.length && lines.length < maxLines; i += maxChars) {
    lines.push(chars.slice(i, i + maxChars).join(""));
  }
  if (chars.length > maxChars * maxLines && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return lines.length ? lines : ["商业地产活动"];
}

function escapeSvg(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

async function saveRemoteImage(url, slug) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: { "User-Agent": "ActivityHub/0.2 poster fetch" }
    }, 10000);
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

  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
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
                "只输出 JSON Schema 要求的字段。不要编造报名链接、海报、地点或未在页面中出现的信息。",
                "registrationUrl 只能使用用户提供的候选报名链接；没有则为空字符串。",
                "posterUrl 只能使用用户提供的本地海报/图片路径；没有则为空字符串。",
                "sourceUrl/eventUrl 必须保留活动来源页面，前端会把它作为活动来源链接展示。",
                "date 优先返回 YYYY-MM-DD；如果只知道日期范围，返回开始日期。",
                "如果无法识别明确活动日期，请 date 返回空字符串，并在 notes 说明。",
                "aiSummary 写 200-250 字中文备注，概括这个活动是做什么的、核心议题、主办/参展/参会群体、适合销售关注的客户类型、与商业地产/地产科技/REITs/资管/租赁/设施管理等主题的关系。不要在备注最后追加‘未找到报名链接’或‘不要伪造报名链接’这类提示。"
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
  }, 45000);

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
      endDate: { type: "string" },
      category: { type: "string" },
      organizer: { type: "string" },
      source: { type: "string" },
      sourceUrl: { type: "string" },
      eventUrl: { type: "string" },
      registrationUrl: { type: "string" },
      posterUrl: { type: "string" },
      themes: { type: "array", items: { type: "string" } },
      aiSummary: { type: "string", description: "200-250字中文活动备注" },
      notes: { type: "string" }
    },
    required: [
      "title",
      "eventType",
      "city",
      "location",
      "date",
      "endDate",
      "category",
      "organizer",
      "source",
      "sourceUrl",
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
    category: String(event.category || event.eventType || ""),
    city: String(event.city || inferCityFromText(`${event.title || ""} ${event.aiSummary || ""} ${event.notes || ""}`) || ""),
    location: String(event.location || (event.city ? "详见活动来源页面" : "")),
    date: String(event.date || ""),
    endDate: String(event.endDate || ""),
    organizer: String(event.organizer || ""),
    source: String(event.source || ""),
    sourceUrl: String(event.sourceUrl || event.eventUrl || ""),
    eventUrl: String(event.eventUrl || ""),
    registrationUrl,
    posterUrl: String(event.posterUrl || ""),
    themes: Array.isArray(event.themes) ? event.themes.map((theme) => String(theme)).filter(Boolean) : [],
    aiSummary: String(event.aiSummary || ""),
    notes: notes.replace(/未找到直接报名链接|不要编造报名链接|不要伪造报名链接/g, "").replace(/[；;，,。\s]+$/g, "")
  };
}

function applyKnownSourceCorrections(event) {
  const sourceUrl = `${event.sourceUrl || ""} ${event.eventUrl || ""}`.toLowerCase();

  if (sourceUrl.includes("build4asia.com")) {
    event.title = "Build4Asia 2026 亚洲创新建筑、电气、安防科技展览会";
    event.eventType = "展览会";
    event.category = "智慧楼宇 / 设施管理 / 建筑科技";
    event.city = "香港";
    event.location = "香港会议展览中心";
    event.date = "2026-05-06";
    event.endDate = "2026-05-08";
    event.organizer = event.organizer || "Informa Markets";
    event.source = "Build4Asia 官方网站";
    event.themes = uniqueValues([
      "智慧楼宇",
      "设施管理",
      "商业地产",
      "建筑科技",
      "物业管理",
      ...event.themes
    ]);
    if (!/imasia-passport\.com\/.*register/i.test(event.registrationUrl || "")) {
      event.registrationUrl = "https://b4a.imasia-passport.com/en/user/register?destination=/en/my_tickets";
    }
    event.aiSummary = event.aiSummary || "Build4Asia 2026 聚焦建筑科技、智慧楼宇、安防系统、设施管理和物业运营解决方案，面向地产开发商、业主方、物业及设施管理团队、工程顾问和技术供应商。活动与商业地产运营、楼宇数字化和资产管理效率提升高度相关，适合关注楼宇更新、设施管理和智慧空间解决方案的团队参观。";
  }
}

function evaluateDiscoveredEvent(event, pageText = "") {
  if (!event.city) {
    return { keep: false, isAfterMinDate: false, isRealEvent: false, reason: "filtered: no city" };
  }
  if (!event.location) event.location = "详见活动来源页面";

  if (!/(大会|峰会|论坛|研讨会|沙龙|展览会|博览会|会议|培训|推介会|交流会|展会|conference|summit|forum|expo|exhibition|seminar|training)/i.test(event.eventType || event.title)) {
    return { keep: false, isAfterMinDate: false, isRealEvent: false, reason: "filtered: invalid event type" };
  }

  const date = parseEventDate(event.date, pageText);
  if (!date) {
    return { keep: false, isAfterMinDate: false, isRealEvent: isRealEvent(event, pageText), reason: "filtered: no valid date" };
  }

  const isAfterMinDate = date >= new Date(`${MIN_DISCOVERY_DATE}T00:00:00`);
  if (!isAfterMinDate) {
    return { keep: false, isAfterMinDate, isRealEvent: isRealEvent(event, pageText), reason: `filtered: before ${MIN_DISCOVERY_DATE}` };
  }

  if (isArticleNewsInterview(event.title, pageText, event.eventUrl)) {
    return { keep: false, isAfterMinDate, isRealEvent: false, reason: POST_EVENT_PATTERN.test(pageText) ? "filtered: post-event news" : "filtered: article/interview content" };
  }

  const realEvent = isRealEvent(event, pageText);
  if (!realEvent) {
    return { keep: false, isAfterMinDate, isRealEvent: false, reason: "filtered: title does not look like event" };
  }

  if (!event.posterUrl) {
    return { keep: false, isAfterMinDate, isRealEvent: realEvent, reason: "filtered: no poster or screenshot" };
  }

  if (!isRelevantEvent(event, pageText)) {
    return { keep: false, isAfterMinDate, isRealEvent: realEvent, reason: "filtered: not relevant to ActivityHub topics" };
  }

  return { keep: true, isAfterMinDate, isRealEvent: true, reason: "" };
}

function isRelevantEvent(event, pageText = "") {
  const text = [
    event.title,
    event.eventType,
    event.category,
    event.themes?.join(" "),
    event.aiSummary,
    event.notes,
    String(pageText || "").slice(0, 1800)
  ].join(" ").toLowerCase();

  return DISCOVERY_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()))
    || /(reit|proptech|commercial real estate|facility management|office leasing|asset management|logistics real estate)/i.test(text);
}

function inferCityFromText(text = "") {
  const match = String(text || "").match(/(上海|北京|广州|深圳|成都|香港|杭州|南京|苏州|天津|重庆|武汉|西安|宁波|厦门|青岛|郑州|长沙|合肥)/);
  return match ? match[1] : "";
}

function parseEventDate(value, context = "") {
  const text = `${String(value || "").trim()} ${String(context || "").slice(0, 2400)}`;
  const fullMatch = text.match(/(20\d{2})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})/);
  const partialMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  const yearMatch = text.match(/(20\d{2})/);
  const match = fullMatch || (partialMatch && yearMatch ? [partialMatch[0], yearMatch[1], partialMatch[1], partialMatch[2]] : null);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRealEvent(event, pageText = "") {
  const title = String(event.title || "");
  const combined = `${title} ${event.eventType || ""} ${event.themes?.join(" ") || ""}`;
  if (isArticleNewsInterview(combined, pageText, event.eventUrl || "")) return false;
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

  if (isArticleNewsInterview(title, context, url) && !REGISTRATION_PATTERN.test(context)) return -10;

  DISCOVERY_KEYWORDS.forEach((keyword) => {
    if (text.includes(keyword.toLowerCase())) score += 10;
  });
  if (/(event|forum|summit|expo|conference|visitor|registration|article|活动|论坛|峰会|展会|报名)/i.test(text)) {
    score += 8;
  }
  if (isLikelyHomepage(url)) score -= 4;
  return score;
}

function isRelevantSearchResult(title = "", url = "", query = "") {
  const text = `${title} ${url} ${query}`;
  if (!EVENT_TITLE_PATTERN.test(text) && !DISCOVERY_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()))) return false;
  if (POST_EVENT_PATTERN.test(text)) return false;
  if (isBlockedCandidateUrl(url)) return false;

  const resultText = `${title} ${url}`;
  const hasTopic = DISCOVERY_KEYWORDS.some((keyword) => resultText.toLowerCase().includes(keyword.toLowerCase()))
    || /(reit|proptech|commercial real estate|facility management|office leasing|asset management|smart building|logistics real estate)/i.test(resultText);
  if (!hasTopic) return false;

  const domainText = sourceNameFromUrl(url).toLowerCase();
  const weakTemplate = /(wenjuan|template|baike|zhidao|wenda|exam|jiaoshi|kaogong|sumup|telecash|card-reader|payment|gov|edu)/i;
  if (weakTemplate.test(`${domainText} ${url}`)) return false;

  return true;
}

function isArticleNewsInterview(title = "", pageText = "", url = "") {
  const titleAndUrl = `${title} ${url}`;
  const firstText = String(pageText || "").slice(0, 1600);
  const combined = `${titleAndUrl} ${firstText}`;
  if (POST_EVENT_PATTERN.test(combined)) return true;
  if (NON_EVENT_PATTERN.test(titleAndUrl)) return true;
  if (isArticleUrl(url) && !REGISTRATION_PATTERN.test(combined) && !EVENT_TITLE_PATTERN.test(combined)) return true;
  if (NON_EVENT_PATTERN.test(firstText.slice(0, 600)) && !EVENT_TITLE_PATTERN.test(combined)) return true;
  return false;
}

function isArticleUrl(url = "") {
  return /\/article\/|\/news\/|\/press|\/insight|\/report|\/reports?|\/pdf\/|\/campaigns\/.*proptech50|guandian\.cn\/article|boao\.guandian|kpmg\.com\/.*proptech50|sohu\.com\/a\//i.test(String(url || ""));
}

function createCandidateLog(candidate) {
  return {
    candidateTitle: candidate.title || candidate.url,
    sourceUrl: candidate.url,
    eventDate: "unknown",
    isAfterMinDate: "unknown",
    isArticleNewsInterview: "unknown",
    isRealEvent: "unknown",
    registrationUrl: "",
    registrationLinkFound: "unknown",
    screenshotSuccess: "unknown",
    kept: "pending",
    filteredReason: ""
  };
}

function logCandidateResult(result) {
  console.log("[discover-events]", [
    `candidate title: ${result.candidateTitle}`,
    `source url: ${result.sourceUrl}`,
    `detected date: ${result.eventDate}`,
    `is after ${MIN_DISCOVERY_DATE}: ${result.isAfterMinDate}`,
    `is article/news/interview: ${result.isArticleNewsInterview}`,
    `registrationUrl: ${result.registrationUrl || ""}`,
    `has direct registration: ${result.registrationLinkFound}`,
    `poster/screenshot: ${result.screenshotSuccess}`,
    `decision: ${result.kept}`,
    result.filteredReason ? `filter reason: ${result.filteredReason}` : ""
  ].filter(Boolean).join(" | "));
}

function createSlug(value) {
  const slug = slugify(value, { lower: true, strict: true, locale: "zh" }).slice(0, 60);
  return slug || `event-${Date.now()}`;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
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
  if (!isValidDirectRegistrationUrl(value, "")) return "";
  return value;
}

function isValidDirectRegistrationUrl(url, baseUrl = "") {
  const value = String(url || "").trim();
  if (!value || !isHttpUrl(value)) return false;
  if (isLikelyHomepage(value) || isBlockedRegistrationUrl(value) || isFileDownload(value) || isArticleUrl(value)) return false;
  if (baseUrl && stripHash(value) === stripHash(baseUrl) && !/(visitor|register|registration|signup|apply|ticket|book|报名|登记|参会)/i.test(value)) {
    return false;
  }
  return true;
}

function isBlockedRegistrationUrl(url) {
  const text = String(url || "").toLowerCase();
  return /beian|recordcode|privacy|terms|contact|about|copyright|police|公安|备案|login|signin|sign-in|passport|account|signup\/signup|register\/account/.test(text);
}

function isBlockedCandidateUrl(url) {
  const text = String(url || "").toLowerCase();
  return isBlockedRegistrationUrl(text)
    || /kpmg\.com|guandian\.cn\/article|boao\.guandian|baike\.|zhidao\.|wenjuan\.com|telecash|sumup|card-reader|payment|kaoshi|exam/.test(text)
    || isFileDownload(text);
}

function isFileDownload(url) {
  return /\.(pdf|doc|docx|xls|xlsx|zip|rar)(\?|$)/i.test(String(url || ""));
}

function stripHash(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
  }
}

function mergePlainNotes(...values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].join("；");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal
    });
  } finally {
    clearTimeout(timeout);
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
    city: String(event.city || inferCityFromText(`${event.title || ""} ${event.aiSummary || ""} ${event.notes || ""}`) || ""),
    location: String(event.location || (event.city ? "详见活动来源页面" : "")),
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
