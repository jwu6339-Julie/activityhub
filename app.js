const STORAGE_KEY = "activityhub_events_v1";
const SUBSCRIBE_KEY = "activityhub_subscribe_note_v1";
let activeDetailId = null;

const coreTopicKeywords = [
  "商业地产", "REITs", "办公租赁", "地产科技", "智慧楼宇", "设施管理",
  "资管", "资产管理", "产业园", "智慧园区", "商办", "办公运营",
  "空间科技", "企业不动产", "CRE", "occupier"
];

const organizerKeywords = [
  "协会", "学会", "联盟", "研究院", "媒体", "中心", "APREA",
  "BOMA", "IFMA", "RICS", "CoreNet", "楼促会"
];

const keyCities = ["上海", "北京", "广州", "深圳", "成都"];

const salesKeywords = [
  "开发商", "业主", "业主方", "资管", "资产管理", "企业客户", "园区",
  "运营方", "商办", "金融机构", "REITs", "设施管理", "租赁", "办公"
];

const sampleEvents = [];

let events = loadEvents();
let activeView = "home";

const elements = {
  navLinks: document.querySelectorAll("[data-nav]"),
  pageViews: document.querySelectorAll(".page-view"),
  adminTabs: document.querySelectorAll("[data-admin-tab]"),
  adminPanels: document.querySelectorAll(".admin-panel"),
  form: document.getElementById("eventForm"),
  eventId: document.getElementById("eventId"),
  summaryNote: document.getElementById("summaryNote"),
  name: document.getElementById("name"),
  type: document.getElementById("type"),
  city: document.getElementById("city"),
  location: document.getElementById("location"),
  date: document.getElementById("date"),
  organizer: document.getElementById("organizer"),
  source: document.getElementById("source"),
  link: document.getElementById("link"),
  posterUrl: document.getElementById("posterUrl"),
  tags: document.getElementById("tags"),
  description: document.getElementById("description"),
  recommendationLevel: document.getElementById("recommendationLevel"),
  recommendReason: document.getElementById("recommendReason"),
  status: document.getElementById("status"),
  aiExtractInput: document.getElementById("aiExtractInput"),
  aiExtractButton: document.getElementById("aiExtractButton"),
  aiExtractStatus: document.getElementById("aiExtractStatus"),
  discoverEventsButton: document.getElementById("discoverEventsButton"),
  discoverStatus: document.getElementById("discoverStatus"),
  resetFormButton: document.getElementById("resetFormButton"),
  clearDataButton: document.getElementById("clearDataButton"),
  resetSampleButton: document.getElementById("resetSampleButton"),
  searchInput: document.getElementById("searchInput"),
  cityFilter: document.getElementById("cityFilter"),
  tagFilter: document.getElementById("tagFilter"),
  eventList: document.getElementById("eventList"),
  favoriteList: document.getElementById("favoriteList"),
  adminTableBody: document.getElementById("adminTableBody"),
  adminTotalCount: document.getElementById("adminTotalCount"),
  adminPendingCount: document.getElementById("adminPendingCount"),
  soonCount: document.getElementById("soonCount"),
  averageScore: document.getElementById("averageScore"),
  clearFavoritesButton: document.getElementById("clearFavoritesButton"),
  exportWordButton: document.getElementById("exportWordButton"),
  subscribeDialog: document.getElementById("subscribeDialog"),
  openSubscribeButton: document.getElementById("openSubscribeButton"),
  subscribeInput: document.getElementById("subscribeInput"),
  saveSubscribeButton: document.getElementById("saveSubscribeButton"),
  eventDetailDialog: document.getElementById("eventDetailDialog"),
  closeDetailButton: document.getElementById("closeDetailButton"),
  detailTitle: document.getElementById("detailTitle"),
  detailContent: document.getElementById("detailContent"),
  detailFavoriteButton: document.getElementById("detailFavoriteButton"),
  detailRegisterLink: document.getElementById("detailRegisterLink"),
  toast: document.getElementById("toast")
};

function loadEvents() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    if (isOldDemoSeed(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    const normalized = parsed.map(normalizeEvent);
    const filtered = normalized.filter(isAllowedStoredEvent);
    if (filtered.length !== normalized.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch {
    return [];
  }
}

function isOldDemoSeed(items) {
  return items.some((event) => String(event.link || "").includes("example."))
    || items.some((event) => event.source === "展会官网" && String(event.posterUrl || "").startsWith("assets/"));
}

function normalizeEvent(event) {
  return {
    ...event,
    salesType: event.salesType || "",
    summaryNote: event.summaryNote || event.aiSummary || "",
    eventUrl: event.eventUrl || "",
    sourceUrl: event.sourceUrl || event.eventUrl || "",
    registrationUrl: event.registrationUrl || event.link || "",
    registrationType: event.registrationType || "",
    verifiedSource: Boolean(event.verifiedSource),
    favorite: Boolean(event.favorite),
    selectedForReport: Boolean(event.selectedForReport)
  };
}

function isAllowedStoredEvent(event) {
  if (!event.verifiedSource) return true;
  const titleText = `${event.name || ""} ${event.type || ""}`;
  const nonEventPattern = /(观点|对话|专访|访谈|新闻|报道|快讯|评论|分析|观察|回顾|圆满举行|成功举办|成功召开|发布|榜单|企业50|科技50|白皮书|研究报告|政策解读|人物|案例|文章|资讯)/i;
  const eventTitlePattern = /(大会|峰会|论坛|研讨会|沙龙|展览会|博览会|交流会|培训|闭门会|招商会|推介会|说明会|开放日|路演|报名|参会|注册|conference|summit|forum|expo|exhibition|seminar|webinar|training|registration)/i;
  const date = normalizeExtractedDate(event.date);
  return (Boolean(event.link) || Boolean(event.registrationType))
    && Boolean(event.posterUrl)
    && Boolean(date)
    && date >= "2026-05-01"
    && eventTitlePattern.test(titleText)
    && !nonEventPattern.test(titleText);
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function getFormData() {
  const now = new Date().toISOString();
  const existing = events.find((event) => event.id === elements.eventId.value);

  return {
    id: elements.eventId.value || createId(),
    name: elements.name.value.trim(),
    type: elements.type.value,
    city: elements.city.value.trim(),
    location: elements.location.value.trim(),
    date: elements.date.value,
    organizer: elements.organizer.value.trim(),
    source: elements.source.value.trim(),
    link: elements.link.value.trim(),
    posterUrl: elements.posterUrl.value.trim(),
    tags: elements.tags.value.trim(),
    salesType: existing?.salesType || "",
    summaryNote: elements.summaryNote.value.trim() || existing?.summaryNote || "",
    description: elements.description.value.trim(),
    recommendationLevel: elements.recommendationLevel.value,
    recommendReason: elements.recommendReason.value.trim(),
    status: elements.status.value,
    selectedForReport: existing?.selectedForReport || false,
    favorite: existing?.favorite || false,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function handleSubmit(event) {
  event.preventDefault();
  const data = getFormData();

  if (elements.eventId.value) {
    events = events.map((item) => item.id === data.id ? data : item);
    showToast("活动已更新");
  } else {
    events.unshift(data);
    showToast("活动已新增");
  }

  saveEvents();
  resetForm();
  showAdminTab("manage");
  render();
}

function resetForm() {
  elements.form.reset();
  elements.eventId.value = "";
  elements.summaryNote.value = "";
  elements.aiExtractStatus.textContent = "";
  elements.aiExtractStatus.className = "ai-status";
  elements.recommendationLevel.value = "高";
  elements.status.value = "待评估";
}

function editEvent(id) {
  const event = events.find((item) => item.id === id);
  if (!event) return;

  [
    "name", "city", "location", "date", "organizer", "source", "link",
    "posterUrl", "tags", "description", "recommendationLevel",
    "recommendReason", "status"
  ].forEach((key) => {
    elements[key].value = event[key] || "";
  });

  setSelectValue(elements.type, event.type || "");
  elements.eventId.value = event.id;
  elements.summaryNote.value = event.summaryNote || event.aiSummary || "";
  showView("admin");
  showAdminTab("add");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteEvent(id) {
  const event = events.find((item) => item.id === id);
  if (!event) return;

  const confirmed = window.confirm(`确定删除「${event.name}」吗？`);
  if (!confirmed) return;

  events = events.filter((item) => item.id !== id);
  saveEvents();
  render();
  showToast("活动已删除");
}

function toggleFavorite(id) {
  let isFavorite = false;
  events = events.map((event) => {
    if (event.id !== id) return event;
    isFavorite = !event.favorite;
    return { ...event, favorite: isFavorite };
  });
  saveEvents();
  render();
  showToast(isFavorite ? "已加入收藏" : "已取消收藏");
}

function openEventDetail(id) {
  const event = events.find((item) => item.id === id);
  if (!event) return;

  activeDetailId = id;
  const tags = splitTags(event.tags);
  const actionUrl = event.link || event.sourceUrl || event.eventUrl || "#";
  const registrationMarkup = event.link
    ? `<div class="detail-row"><strong>报名链接：</strong><span><a href="${escapeAttribute(event.link)}" target="_blank" rel="noreferrer">${escapeHtml(event.name)}</a></span></div>`
    : `<div class="detail-row"><strong>报名方式：</strong><span>${escapeHtml(event.registrationType || "人工确认报名")}${actionUrl !== "#" ? `，<a href="${escapeAttribute(actionUrl)}" target="_blank" rel="noreferrer">查看来源页面</a>` : ""}</span></div>`;
  elements.detailTitle.textContent = event.name;
  elements.detailRegisterLink.href = actionUrl;
  elements.detailRegisterLink.textContent = event.link ? "立即报名" : "查看来源页面";
  elements.detailFavoriteButton.textContent = event.favorite ? "取消收藏" : "收藏";

  elements.detailContent.innerHTML = `
    <div class="detail-layout">
      ${renderPoster(event)}
      <div class="detail-info">
        <div class="detail-row"><strong>时间：</strong><span>${formatDate(event.date)}</span></div>
        <div class="detail-row"><strong>地点：</strong><span>${escapeHtml(event.city)} ${escapeHtml(event.location)}</span></div>
        <div class="detail-row"><strong>主题：</strong><span>${tags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</span></div>
        <div class="detail-row"><strong>活动类型：</strong><span>${escapeHtml(event.type || "未填写")}</span></div>
        <div class="detail-row"><strong>主办方：</strong><span>${escapeHtml(event.organizer || "未填写")}</span></div>
        ${registrationMarkup}
        <div class="detail-row detail-summary"><strong>备注：</strong><span>${escapeHtml(event.summaryNote || event.aiSummary || event.description || "暂无备注。")}</span></div>
      </div>
    </div>
  `;

  if (elements.eventDetailDialog.open) {
    return;
  }

  if (typeof elements.eventDetailDialog.showModal === "function") {
    elements.eventDetailDialog.showModal();
  } else {
    window.alert(`${event.name}\n\n时间：${formatDate(event.date)}\n地点：${event.city} ${event.location}\n报名方式：${event.link || event.registrationType || "人工确认报名"}`);
  }
}

function closeEventDetail() {
  elements.eventDetailDialog.close();
  activeDetailId = null;
}

function toggleDetailFavorite() {
  if (!activeDetailId) return;
  toggleFavorite(activeDetailId);
  openEventDetail(activeDetailId);
}

async function extractEventWithAi() {
  const input = elements.aiExtractInput.value.trim();
  if (!input) {
    setAiStatus("请先粘贴活动链接或活动原文", "error");
    return;
  }

  setAiLoading(true);
  setAiStatus("AI 正在提取活动信息...", "");

  try {
    const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:3000" : "";
    const response = await fetch(`${apiBase}/api/extract-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success || !data.event) {
      throw new Error(data.error || "AI 提取失败，请检查输入内容");
    }

    fillFormFromExtractedEvent(data.event);
    setAiStatus("已提取并填入表单，请检查后保存。", "success");
    showToast("AI 提取完成");
  } catch (error) {
    setAiStatus(error.message || "AI 提取失败，请检查输入内容", "error");
  } finally {
    setAiLoading(false);
  }
}

async function discoverRealEvents() {
  setDiscoverLoading(true);
  setDiscoverStatus("正在发现真实活动，请稍候", "");

  try {
    const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:3000" : "";
    const response = await fetch(`${apiBase}/api/discover-events`, { method: "POST" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(data.error || "真实活动发现失败，请稍后重试");
    }

    const discovered = Array.isArray(data.events) ? data.events.map(mapDiscoveredEvent).filter(Boolean) : [];
    if (!discovered.length) {
      const message = "未找到符合条件的活动。原因可能是：没有直接报名链接、活动日期早于 2026 年 5 月、或页面属于新闻报道而非活动。";
      setDiscoverStatus(message, "error");
      showToast("未找到符合条件的活动");
      return;
    }

    const result = mergeDiscoveredEvents(discovered);
    saveEvents();
    render();
    setDiscoverStatus(`发现 ${discovered.length} 条符合条件的真实活动，已过滤无报名链接/过期/资讯类内容。新增 ${result.added} 条，更新 ${result.updated} 条。`, "success");
    showToast("真实活动已刷新");
  } catch (error) {
    setDiscoverStatus(error.message || "真实活动发现失败，请稍后重试", "error");
  } finally {
    setDiscoverLoading(false);
  }
}

function mapDiscoveredEvent(event) {
  const title = String(event.title || "").trim();
  if (!title) return null;

  const now = new Date().toISOString();
  const registrationUrl = String(event.registrationUrl || "").trim();
  const eventUrl = String(event.eventUrl || event.sourceUrl || "").trim();
  const sourceUrl = String(event.sourceUrl || event.eventUrl || "").trim();

  return {
    id: createId(),
    name: title,
    type: event.eventType || "其他",
    city: event.city || "",
    location: event.location || "",
    date: normalizeExtractedDate(event.date) || "",
    organizer: event.organizer || "",
    source: event.source || "Verified source",
    link: registrationUrl,
    registrationUrl,
    registrationType: event.registrationType || "",
    sourceUrl,
    eventUrl,
    posterUrl: event.posterUrl || "",
    tags: Array.isArray(event.themes) ? event.themes.join(", ") : "",
    salesType: "",
    summaryNote: event.aiSummary || "",
    description: event.aiSummary || "",
    recommendationLevel: "中",
    recommendReason: event.notes || "",
    status: "待评估",
    selectedForReport: false,
    favorite: false,
    verifiedSource: true,
    createdAt: now,
    updatedAt: now
  };
}

function mergeDiscoveredEvents(discovered) {
  let added = 0;
  let updated = 0;

  discovered.forEach((incoming) => {
    const existingIndex = events.findIndex((event) => eventIdentity(event) === eventIdentity(incoming));
    if (existingIndex === -1) {
      events.unshift(incoming);
      added += 1;
      return;
    }

    const existing = events[existingIndex];
    events[existingIndex] = {
      ...incoming,
      id: existing.id,
      favorite: existing.favorite,
      selectedForReport: existing.selectedForReport,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      notes: mergeNotes(existing.notes, incoming.notes),
      recommendReason: mergeNotes(existing.recommendReason, incoming.recommendReason)
    };
    updated += 1;
  });

  return { added, updated };
}

function eventIdentity(event) {
  return [
    String(event.name || "").trim().toLowerCase(),
    String(event.date || "").trim(),
    String(event.city || "").trim()
  ].join("|");
}

function mergeNotes(current, next) {
  return unique([current, next].filter(Boolean)).join("；");
}

function fillFormFromExtractedEvent(event) {
  const normalizedDate = normalizeExtractedDate(event.date);
  const summary = event.aiSummary || "";
  const notes = event.notes || "";

  elements.name.value = event.title || "";
  setSelectValue(elements.type, event.eventType || "");
  elements.city.value = event.city || "";
  elements.location.value = event.location || "";
  elements.date.value = normalizedDate;
  elements.organizer.value = event.organizer || "";
  elements.source.value = event.source || "AI 提取";
  elements.link.value = event.registrationUrl || "";
  elements.posterUrl.value = event.posterUrl || "";
  elements.tags.value = Array.isArray(event.themes) ? event.themes.join(", ") : "";
  elements.summaryNote.value = summary;
  elements.description.value = [summary, notes].filter(Boolean).join("\n\n");
  elements.recommendationLevel.value = "中";
  elements.recommendReason.value = notes;
  elements.status.value = "待评估";
}

function setSelectValue(select, value) {
  if (!value) {
    select.value = "";
    return;
  }

  const hasOption = [...select.options].some((option) => option.value === value || option.textContent === value);
  if (!hasOption) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = value;
}

function normalizeExtractedDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  const isoMatch = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const zhMatch = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日?/);
  const match = isoMatch || zhMatch;
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function setAiLoading(isLoading) {
  elements.aiExtractButton.disabled = isLoading;
  elements.aiExtractButton.textContent = isLoading ? "提取中..." : "AI 提取活动信息";
}

function setAiStatus(message, type) {
  elements.aiExtractStatus.textContent = message;
  elements.aiExtractStatus.className = `ai-status${type ? ` ${type}` : ""}`;
}

function setDiscoverLoading(isLoading) {
  elements.discoverEventsButton.disabled = isLoading;
  elements.discoverEventsButton.textContent = isLoading ? "刷新中..." : "刷新真实活动";
}

function setDiscoverStatus(message, type) {
  elements.discoverStatus.textContent = message;
  elements.discoverStatus.className = `ai-status${type ? ` ${type}` : ""}`;
}

function clearFavorites() {
  if (!events.some((event) => event.favorite)) {
    showToast("收藏夹已经是空的");
    return;
  }

  const confirmed = window.confirm("确定清空收藏夹吗？活动本身不会被删除。");
  if (!confirmed) return;

  events = events.map((event) => ({ ...event, favorite: false }));
  saveEvents();
  render();
  showToast("收藏夹已清空");
}

function clearData() {
  const confirmed = window.confirm("确定清空所有本地测试数据吗？此操作只影响当前浏览器。");
  if (!confirmed) return;

  events = [];
  saveEvents();
  resetForm();
  render();
  showToast("测试数据已清空");
}

function resetSampleData() {
  const confirmed = window.confirm("确定清空本地活动池吗？V2 不再恢复假示例数据。");
  if (!confirmed) return;

  events = [];
  saveEvents();
  resetForm();
  render();
  showToast("本地活动池已清空");
}

function scoreEvent(event) {
  let score = 0;
  const matchedTags = [];
  const reasons = [];
  const text = [
    event.name, event.type, event.city, event.location, event.organizer,
    event.source, event.tags, event.salesType, event.description, event.recommendReason
  ].join(" ");

  const topicMatches = coreTopicKeywords.filter((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
  if (topicMatches.length) {
    score += Math.min(30, topicMatches.length * 6);
    matchedTags.push(...topicMatches);
    reasons.push(`命中核心主题：${topicMatches.slice(0, 4).join("、")}`);
  }

  const organizerMatches = organizerKeywords.filter((keyword) => event.organizer.toLowerCase().includes(keyword.toLowerCase()));
  if (organizerMatches.length) {
    score += 15;
    matchedTags.push("重要主办方");
    reasons.push("主办方包含协会、学会、研究院或专业组织特征");
  }

  if (keyCities.includes(event.city)) {
    score += 15;
    matchedTags.push("重点城市");
    reasons.push(`位于重点城市：${event.city}`);
  }

  const salesMatches = salesKeywords.filter((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
  if (salesMatches.length) {
    score += Math.min(20, salesMatches.length * 4);
    matchedTags.push("销售获客相关");
    reasons.push(`可能触达：${salesMatches.slice(0, 4).join("、")}`);
  }

  const completenessFields = [
    ["活动时间", event.date],
    ["活动地点", event.location],
    ["报名链接", event.link],
    ["主办方", event.organizer],
    ["活动简介", event.description]
  ];
  const completed = completenessFields.filter(([, value]) => Boolean(value));
  score += completed.length * 4;
  if (completed.length >= 4) {
    matchedTags.push("信息完整");
    reasons.push("时间、地点、链接等核心信息较完整");
  }

  if (isUpcoming(event.date)) {
    score += 10;
    matchedTags.push("未过期");
    reasons.push("活动日期尚未过期");
  } else {
    score -= 20;
    matchedTags.push("已过期");
    reasons.push("活动日期已过期，不建议进入报告");
  }

  if (event.recommendationLevel === "高") {
    score += 8;
    matchedTags.push("人工标记高推荐");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    matchedTags: [...new Set(matchedTags)].slice(0, 8),
    reasons
  };
}

function isUpcoming(dateString) {
  if (!dateString) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateString}T00:00:00`);
  return date >= today;
}

function isStartingSoon(dateString) {
  if (!dateString || !isUpcoming(dateString)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateString}T00:00:00`);
  const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
  return diffDays <= 30;
}

function getFilteredEvents() {
  const keyword = elements.searchInput.value.trim().toLowerCase();
  const city = elements.cityFilter.value;
  const tag = elements.tagFilter.value;

  return events
    .filter((event) => {
      const searchText = [
        event.name, event.type, event.city, event.location, event.organizer,
        event.source, event.tags, event.salesType, event.description, event.recommendReason, event.status
      ].join(" ").toLowerCase();
      const eventTags = splitTags(event.tags);

      return (!keyword || searchText.includes(keyword))
        && (!city || event.city === city)
        && (!tag || eventTags.includes(tag));
    })
    .sort(sortByDate);
}

function sortByDate(a, b) {
  const dateA = new Date(`${a.date || "9999-12-31"}T00:00:00`).getTime();
  const dateB = new Date(`${b.date || "9999-12-31"}T00:00:00`).getTime();
  return dateA - dateB;
}

function render() {
  renderAdminStats();
  renderFilters();
  renderEventList();
  renderFavorites();
  renderAdminTable();
}

function renderAdminStats() {
  const scores = events.map((event) => scoreEvent(event).score);
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;

  elements.adminTotalCount.textContent = events.length;
  elements.adminPendingCount.textContent = events.filter((event) => event.status === "待评估").length;
  elements.soonCount.textContent = events.filter((event) => isStartingSoon(event.date)).length;
  elements.averageScore.textContent = average;
}

function renderFilters() {
  preserveSelectOptions(elements.cityFilter, ["全部城市", ...unique(events.map((event) => event.city).filter(Boolean))]);
  preserveSelectOptions(elements.tagFilter, ["全部主题", ...unique(events.flatMap((event) => splitTags(event.tags)))]);
}

function preserveSelectOptions(select, labels) {
  const current = select.value;
  select.innerHTML = "";
  labels.forEach((label, index) => {
    const option = document.createElement("option");
    option.value = index === 0 ? "" : label;
    option.textContent = label;
    select.appendChild(option);
  });
  select.value = [...select.options].some((option) => option.value === current) ? current : "";
}

function renderEventList() {
  const filtered = getFilteredEvents();

  if (!filtered.length) {
    elements.eventList.innerHTML = `<p class="empty-state">暂无符合条件的真实可报名活动。你可以点击“刷新真实活动”，或在后台手动添加已确认的活动。</p>`;
    return;
  }

  elements.eventList.innerHTML = filtered.map(renderEventCard).join("");
}

function renderFavorites() {
  const favorites = events.filter((event) => event.favorite).sort(sortByDate);

  if (!favorites.length) {
    elements.favoriteList.innerHTML = `<p class="empty-state">收藏夹暂无活动。回到首页点击“收藏”即可保存感兴趣的活动。</p>`;
    return;
  }

  elements.favoriteList.innerHTML = favorites.map(renderEventCard).join("");
}

function renderEventCard(event) {
  const tags = splitTags(event.tags);

  return `
    <article class="event-card ${event.recommendationLevel === "高" ? "high-priority" : ""}">
      <div class="card-poster-wrap">
        ${renderPoster(event)}
        <span class="image-tag">${escapeHtml(tags[0] || event.type || "活动")}</span>
      </div>
      <div class="event-card-body">
        <h3 class="event-title">${escapeHtml(event.name)}</h3>
        <div class="simple-meta">
          <span>📅 ${formatDate(event.date)}</span>
          <span>📍 ${escapeHtml(event.city)} / ${escapeHtml(event.location)}</span>
        </div>
        <div class="card-footer compact-footer">
          <button class="primary-button" type="button" data-action="detail" data-id="${event.id}">查看详情</button>
          <button class="heart-button ${event.favorite ? "favorited" : ""}" type="button" data-action="favorite" data-id="${event.id}" aria-label="收藏活动">
            ${event.favorite ? "♥" : "♡"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderCompactEventCard(event) {
  const tags = splitTags(event.tags);

  return `
    <article class="compact-card">
      <div class="card-poster-wrap">
        ${renderPoster(event)}
        <span class="image-tag">${escapeHtml(tags[0] || event.type || "活动")}</span>
      </div>
      <div class="compact-body">
        <h3>${escapeHtml(event.name)}</h3>
        <p>📅 ${formatDate(event.date)}</p>
        <p>📍 ${escapeHtml(event.city)} / ${escapeHtml(event.location)}</p>
        <div class="compact-actions">
          <button class="primary-button" type="button" data-action="detail" data-id="${event.id}">查看详情</button>
          <button class="heart-button ${event.favorite ? "favorited" : ""}" type="button" data-action="favorite" data-id="${event.id}" aria-label="收藏活动">
            ${event.favorite ? "♥" : "♡"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderPoster(event) {
  if (event.posterUrl) {
    return `
      <div class="poster">
        <img src="${escapeAttribute(event.posterUrl)}" alt="${escapeAttribute(event.name)} 活动海报" onerror="this.parentElement.innerHTML='<div class=&quot;poster-placeholder&quot;>海报链接无法加载</div>'">
      </div>
    `;
  }

  return `
    <div class="poster">
      <div class="poster-placeholder">
        <span>${escapeHtml(event.type || "活动")}</span>
        <strong>${escapeHtml(event.city || "城市待定")}</strong>
      </div>
    </div>
  `;
}

function renderAdminTable() {
  if (!events.length) {
    elements.adminTableBody.innerHTML = `<tr><td colspan="7">暂无活动数据。</td></tr>`;
    return;
  }

  elements.adminTableBody.innerHTML = [...events].sort(sortByDate).map((event) => {
    const scoring = scoreEvent(event);
    return `
      <tr>
        <td>${escapeHtml(event.name)}</td>
        <td>${escapeHtml(event.city)}</td>
        <td>${formatDate(event.date)}</td>
        <td>${escapeHtml(event.recommendationLevel)}</td>
        <td>${escapeHtml(event.status)}</td>
        <td>${scoring.score}</td>
        <td>
          <button class="table-button" type="button" data-action="edit" data-id="${event.id}">编辑</button>
          <button class="table-button danger-text" type="button" data-action="delete" data-id="${event.id}">删除</button>
        </td>
      </tr>
    `;
  }).join("");
}

function buildPlainTextReport() {
  const selected = events
    .filter((event) => event.favorite)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`));

  if (!selected.length) {
    return "收藏夹暂无活动。";
  }

  const body = selected.map((event, index) => [
    `TOPIC ${index + 1}：${event.name}`,
    event.posterUrl ? `[活动海报] ${event.posterUrl}` : "[活动海报] 未填写",
    `地点：${event.city} ${event.location}`,
    `时间：${formatDate(event.date)}`,
    `报名链接：${event.link || "未填写"}`,
    `备注：${event.summaryNote || event.description || "暂无备注。"}`
  ].join("\n")).join("\n\n");

  return [
    "Dear all,",
    "",
    "Please find below recent updates related to commercial real estate, REITs, workplace, facility management, and real estate technology. Please feel free to review the information at your convenience.",
    "",
    body,
    "",
    "Best regards,",
    "Julie Wu"
  ].join("\n");
}

function exportWordReport() {
  const favorites = events.filter((event) => event.favorite).sort(sortByDate);
  if (!favorites.length) {
    showToast("收藏夹暂无活动，无法导出");
    return;
  }

  const topicBlocks = favorites.map((event, index) => {
    const posterUrl = documentPosterUrl(event.posterUrl);
    const registrationHtml = reportRegistrationHtml(event);
    return `
    <h2>TOPIC ${index + 1}：${escapeHtml(event.name)}</h2>
    ${posterUrl ? `<p><img src="${escapeAttribute(posterUrl)}" alt="${escapeAttribute(event.name)} 活动海报"></p>` : "<p>[活动海报] 未填写</p>"}
    <p><strong>地点：</strong>${escapeHtml(event.city)} ${escapeHtml(event.location)}</p>
    <p><strong>时间：</strong>${formatDate(event.date)}</p>
    <p><strong>报名方式 / 报名链接：</strong>${registrationHtml}</p>
    <p><strong>备注：</strong>${escapeHtml(event.summaryNote || event.description || "暂无备注。")}</p>
  `;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>ActivityHub 收藏活动报告</title>
  <style>
    body { font-family: Georgia, "Times New Roman", "Songti SC", serif; max-width: 780px; margin: 40px auto; line-height: 1.65; color: #111827; }
    h2 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; margin-top: 32px; font-size: 20px; }
    img { display: block; width: 420px; max-width: 100%; max-height: 520px; object-fit: contain; border: 1px solid #d7dee8; margin: 10px 0 16px; }
    strong { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }
  </style>
</head>
<body>
  <p>Dear all,</p>
  <p>Please find below recent updates related to commercial real estate, REITs, workplace, facility management, and real estate technology. Please feel free to review the information at your convenience.</p>
  ${topicBlocks}
  <p style="margin-top: 32px;">Best regards,</p>
  <p>Julie Wu</p>
</body>
</html>`;

  downloadFile(`activityhub-favorites-${todayString()}.doc`, html, "application/msword;charset=utf-8");
}

function documentPosterUrl(posterUrl) {
  if (!posterUrl) return "";
  try {
    return new URL(posterUrl, window.location.href).href;
  } catch {
    return posterUrl;
  }
}

function reportRegistrationHtml(event) {
  if (event.link) {
    return `报名链接：<a href="${escapeAttribute(event.link)}">${escapeHtml(event.name)}</a>`;
  }

  const sourceUrl = event.sourceUrl || event.eventUrl || "";
  if (event.registrationType === "二维码报名") {
    return `报名方式：请通过活动海报二维码报名${sourceUrl ? `，来源页面：<a href="${escapeAttribute(sourceUrl)}">${escapeHtml(sourceUrl)}</a>` : ""}`;
  }

  return `报名方式：${escapeHtml(event.registrationType || "人工确认报名")}${sourceUrl ? `，来源页面：<a href="${escapeAttribute(sourceUrl)}">${escapeHtml(sourceUrl)}</a>` : ""}`;
}

function buildScoreReason(event) {
  const scoring = scoreEvent(event);
  return scoring.reasons.slice(0, 2).join("；") || "系统暂无评分原因，请人工补充。";
}

function inferSalesType(event) {
  const text = [event.tags, event.description, event.recommendReason].join(" ");
  const matches = salesKeywords.filter((keyword) => text.includes(keyword));
  return matches.length ? unique(matches).slice(0, 4).join("、") : "待人工判断";
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    showToast(successMessage);
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("文件已导出");
}

function showView(viewName) {
  activeView = viewName;
  elements.pageViews.forEach((view) => view.classList.toggle("active", view.id === `${viewName}View`));
  elements.navLinks.forEach((link) => {
    if (!link.classList.contains("brand")) {
      link.classList.toggle("active", link.dataset.nav === viewName);
    }
  });
  render();
}

function showAdminTab(tabName) {
  elements.adminTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.adminTab === tabName));
  elements.adminPanels.forEach((panel) => panel.classList.toggle("active", panel.id === `${tabName}Tab`));
}

function openSubscribeDialog() {
  elements.subscribeInput.value = localStorage.getItem(SUBSCRIBE_KEY) || "";
  if (typeof elements.subscribeDialog.showModal === "function") {
    elements.subscribeDialog.showModal();
  } else {
    const value = window.prompt("V1 暂不自动发送提醒。可填写邮箱或备注作为占位：", elements.subscribeInput.value);
    if (value !== null) {
      localStorage.setItem(SUBSCRIBE_KEY, value);
      showToast("订阅提醒占位信息已保存");
    }
  }
}

function saveSubscribeNote() {
  localStorage.setItem(SUBSCRIBE_KEY, elements.subscribeInput.value.trim());
  elements.subscribeDialog.close();
  showToast("订阅提醒占位信息已保存，V1 暂不发送邮件");
}

function splitTags(tags) {
  return (tags || "")
    .split(/[,，、]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function formatDate(dateString) {
  if (!dateString) return "未填写";
  const date = new Date(`${dateString}T00:00:00`);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function shortenUrl(url) {
  if (!url) return "未填写";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

elements.form.addEventListener("submit", handleSubmit);
elements.resetFormButton.addEventListener("click", resetForm);
elements.clearDataButton.addEventListener("click", clearData);
if (elements.resetSampleButton) {
  elements.resetSampleButton.addEventListener("click", resetSampleData);
}
elements.clearFavoritesButton.addEventListener("click", clearFavorites);
elements.exportWordButton.addEventListener("click", exportWordReport);
elements.aiExtractButton.addEventListener("click", extractEventWithAi);
elements.discoverEventsButton.addEventListener("click", discoverRealEvents);
elements.openSubscribeButton.addEventListener("click", openSubscribeDialog);
elements.saveSubscribeButton.addEventListener("click", saveSubscribeNote);
elements.closeDetailButton.addEventListener("click", closeEventDetail);
elements.detailFavoriteButton.addEventListener("click", toggleDetailFavorite);

elements.navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showView(link.dataset.nav);
  });
});

elements.adminTabs.forEach((tab) => {
  tab.addEventListener("click", () => showAdminTab(tab.dataset.adminTab));
});

[
  elements.searchInput,
  elements.cityFilter,
  elements.tagFilter
].forEach((element) => element.addEventListener("input", render));

document.body.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;

  if (action === "edit") editEvent(id);
  if (action === "delete") deleteEvent(id);
  if (action === "favorite") toggleFavorite(id);
  if (action === "detail") openEventDetail(id);
});

render();
