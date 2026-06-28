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

const sampleEvents = [
  {
    id: createId(),
    name: "2026中国商业地产投资专业展览会暨第八届商业地产产品品牌价值论坛",
    type: "展会",
    city: "北京",
    location: "北京歌华开元大酒店",
    date: "2026-06-26",
    organizer: "CORC 中国商业地产投资专业展览会",
    source: "展会官网",
    link: "http://www.corc.com.cn/",
    posterUrl: "assets/corc-event-card.jpg",
    tags: "商业地产, 商办运营, 投资展会",
    salesType: "开发商、业主方、商业地产投资机构、品牌方",
    summaryNote: "这是一个围绕商业地产投资、品牌价值和项目资源对接的展会型活动。它与商业地产招商、资产运营和品牌合作高度相关，适合销售关注开发商、业主方和商业运营客户。",
    description: "围绕商业地产投资、品牌价值、项目招商和行业资源对接展开，适合观察商业地产行业新项目和潜在客户机会。",
    recommendationLevel: "高",
    recommendReason: "展会主题与商业地产投资和品牌价值高度相关，适合销售触达开发商、业主方、商业运营和品牌客户。",
    status: "待评估",
    selectedForReport: true,
    favorite: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: createId(),
    name: "2026零行资产运营大会",
    type: "大会",
    city: "北京",
    location: "北京厦航嘉年华酒店",
    date: "2026-06-12",
    organizer: "零行资产运营大会组委会",
    source: "行业活动信息入口",
    link: "https://www.guandian.cn/",
    posterUrl: "",
    tags: "资产管理, 存量资产, 商业地产",
    salesType: "资管方、金融机构、地产企业、专业服务机构",
    summaryNote: "该活动关注存量资产运营和房地产资产盘活，是典型的资管与商业地产交叉场景。对销售来说，活动可能聚集资管方、金融机构和地产企业，是寻找资产运营需求的线索入口。",
    description: "聚焦存量资产运营、资产盘活、地产企业转型和专业服务机构协同。",
    recommendationLevel: "高",
    recommendReason: "议题与资管和存量资产运营直接相关，适合拓展资管方、金融机构和地产企业客户。",
    status: "待评估",
    selectedForReport: true,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: createId(),
    name: "赢商机·创未来——2026年广州安居商业存量资产盘活专场推介会",
    type: "推介会",
    city: "广州",
    location: "广州安居集团项目现场",
    date: "2026-06-12",
    organizer: "广州安居集团",
    source: "活动信息页",
    link: "https://www.winshang.com/",
    posterUrl: "assets/corc-platform-home.jpg",
    tags: "存量资产, 商业地产, 资产盘活",
    salesType: "业主方、国企平台、资管方、商业运营方",
    summaryNote: "这是一场围绕商业存量资产盘活的项目推介活动。它和商业地产资管、国资平台资产运营有关，适合销售观察业主方、运营方和潜在合作项目。",
    description: "面向商业存量资产盘活和项目资源推介，适合寻找国资平台、业主方和运营合作机会。",
    recommendationLevel: "中",
    recommendReason: "活动聚焦存量资产盘活，适合销售触达国企平台、业主方和商业运营相关客户。",
    status: "待评估",
    selectedForReport: false,
    favorite: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: createId(),
    name: "全球智能家居展暨深圳国际智能家居展",
    type: "展会",
    city: "深圳",
    location: "深圳会展中心（福田）",
    date: "2026-06-24",
    organizer: "全球智能家居展组委会",
    source: "展会官网",
    link: "https://www.smarthomeexpo.com.cn/",
    posterUrl: "assets/favorites-reference.jpg",
    tags: "智慧楼宇, 智能家居, 地产科技",
    salesType: "智慧楼宇服务商、地产科技企业、物业及设施管理方",
    summaryNote: "该展会聚焦智能家居、智慧楼宇和空间智能化产品。它与地产科技、楼宇数字化和设施管理相关，适合销售寻找楼宇科技、物业运营和空间服务客户。",
    description: "展示智能家居、智能建筑和智慧空间相关产品，适合观察楼宇科技和空间智能化供应链。",
    recommendationLevel: "中",
    recommendReason: "主题与智慧楼宇和地产科技相关，可作为楼宇数字化客户拓展线索。",
    status: "待评估",
    selectedForReport: false,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: createId(),
    name: "RICS REITs赋能存量资产价值跃升研讨会",
    type: "研讨会",
    city: "北京",
    location: "北京正大中心",
    date: "2026-06-17",
    organizer: "RICS 皇家特许测量师学会",
    source: "RICS 官方网站",
    link: "https://www.rics.org.cn/",
    posterUrl: "",
    tags: "REITs, 存量资产, 资产管理",
    salesType: "资管方、券商、基金、商业不动产业主",
    summaryNote: "该研讨会围绕 REITs、估值体系和存量资产价值提升展开。它与商业不动产金融化和资产管理强相关，适合销售关注资管方、券商基金和业主方。",
    description: "围绕 REITs 政策、估值体系和存量资产价值提升展开交流。",
    recommendationLevel: "高",
    recommendReason: "RICS 是专业机构，议题聚焦 REITs 和存量资产，适合触达金融机构与业主方。",
    status: "待评估",
    selectedForReport: false,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: createId(),
    name: "IFMA 设施管理与办公空间运营交流会",
    type: "沙龙",
    city: "上海",
    location: "上海浦东新区",
    date: "2026-07-09",
    organizer: "IFMA",
    source: "IFMA 官方网站",
    link: "https://ifma.org/",
    posterUrl: "",
    tags: "设施管理, 办公运营, 企业不动产",
    salesType: "企业行政、设施管理方、办公空间运营方",
    summaryNote: "该交流会关注设施管理、办公空间运营和企业不动产管理。它与办公运营、企业客户服务和设施管理采购有关，适合销售触达企业行政和 FM 负责人。",
    description: "交流设施管理、办公空间运营、企业不动产管理和服务商协作。",
    recommendationLevel: "高",
    recommendReason: "参会人群与企业客户和设施管理方高度相关，适合销售寻找办公运营机会。",
    status: "待评估",
    selectedForReport: false,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: createId(),
    name: "APREA 中国不动产投资与 REITs 圆桌",
    type: "闭门会",
    city: "上海",
    location: "上海陆家嘴",
    date: "2026-08-20",
    organizer: "APREA",
    source: "APREA 官方网站",
    link: "https://www.aprea.asia/",
    posterUrl: "",
    tags: "REITs, 不动产投资, 产业金融",
    salesType: "投资机构、资管方、REITs 相关机构",
    summaryNote: "该圆桌关注亚太不动产投资和 REITs 市场趋势。它和产业金融、资产配置和不动产投资相关，适合销售关注投资机构和 REITs 生态客户。",
    description: "关注亚太不动产投资、REITs 市场趋势和资产配置策略。",
    recommendationLevel: "高",
    recommendReason: "适合触达投资机构、资管方和 REITs 生态客户。",
    status: "待评估",
    selectedForReport: false,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: createId(),
    name: "CoreNet 企业不动产与办公战略论坛",
    type: "论坛",
    city: "上海",
    location: "上海市中心商务区",
    date: "2026-09-03",
    organizer: "CoreNet Global",
    source: "CoreNet 官方网站",
    link: "https://www.corenetglobal.org/",
    posterUrl: "",
    tags: "企业不动产, CRE, 办公租赁",
    salesType: "企业客户、CRE 部门、办公租赁决策人",
    summaryNote: "该论坛聚焦企业不动产、办公策略和租赁决策。它与办公租赁、企业客户选址和 CRE 部门需求相关，适合销售寻找企业端决策人。",
    description: "围绕企业不动产、办公策略、职场体验和租赁决策展开讨论。",
    recommendationLevel: "中",
    recommendReason: "适合销售触达企业不动产部门和办公租赁相关决策人。",
    status: "待评估",
    selectedForReport: false,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: createId(),
    name: "BOMA 楼宇运营与资产价值提升论坛",
    type: "论坛",
    city: "深圳",
    location: "深圳福田 CBD",
    date: "2026-10-15",
    organizer: "BOMA China",
    source: "BOMA 官方网站",
    link: "https://www.boma.org/",
    posterUrl: "",
    tags: "楼宇运营, 资产管理, 设施管理",
    salesType: "楼宇业主、物业管理方、设施管理方",
    summaryNote: "该论坛关注楼宇运营、资产价值提升和设施管理标准。它与智慧楼宇、物业管理和资产运营相关，适合销售触达楼宇业主、物业和设施管理客户。",
    description: "关注楼宇运营效率、资产价值提升和设施管理服务标准。",
    recommendationLevel: "中",
    recommendReason: "楼宇运营和设施管理主题清晰，适合触达业主和物业管理客户。",
    status: "待评估",
    selectedForReport: false,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleEvents));
    return sampleEvents;
  }

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return sampleEvents;
    if (isOldDemoSeed(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleEvents));
      return sampleEvents;
    }
    return parsed.map(normalizeEvent);
  } catch {
    return sampleEvents;
  }
}

function isOldDemoSeed(items) {
  return items.length <= 3 && items.some((event) => String(event.link || "").includes("example.com"));
}

function normalizeEvent(event) {
  return {
    ...event,
    salesType: event.salesType || "",
    summaryNote: event.summaryNote || event.aiSummary || "",
    favorite: Boolean(event.favorite),
    selectedForReport: Boolean(event.selectedForReport)
  };
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
  elements.detailTitle.textContent = event.name;
  elements.detailRegisterLink.href = event.link || "#";
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
        <div class="detail-row"><strong>报名链接：</strong><span>${event.link ? `<a href="${escapeAttribute(event.link)}" target="_blank" rel="noreferrer">${escapeHtml(event.name)}</a>` : "暂无报名链接"}</span></div>
        <div class="detail-row detail-summary"><strong>AI 摘要 / 活动简介：</strong><span>${escapeHtml(event.summaryNote || event.aiSummary || event.description || "暂无活动简介。")}</span></div>
      </div>
    </div>
  `;

  if (elements.eventDetailDialog.open) {
    return;
  }

  if (typeof elements.eventDetailDialog.showModal === "function") {
    elements.eventDetailDialog.showModal();
  } else {
    window.alert(`${event.name}\n\n时间：${formatDate(event.date)}\n地点：${event.city} ${event.location}\n报名：${event.link}`);
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
  const confirmed = window.confirm("确定恢复内置示例数据吗？当前本地活动会被示例数据替换。");
  if (!confirmed) return;

  events = sampleEvents.map((event) => ({ ...event, id: createId() }));
  saveEvents();
  resetForm();
  render();
  showToast("已恢复示例数据");
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
    elements.eventList.innerHTML = `<p class="empty-state">暂无匹配活动。你可以新增活动，或调整筛选条件。</p>`;
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

  const topicBlocks = favorites.map((event, index) => `
    <h2>TOPIC ${index + 1}：${escapeHtml(event.name)}</h2>
    ${event.posterUrl ? `<p><img src="${escapeAttribute(event.posterUrl)}" alt="${escapeAttribute(event.name)} 活动海报"></p>` : ""}
    <p><strong>地点：</strong>${escapeHtml(event.city)} ${escapeHtml(event.location)}</p>
    <p><strong>时间：</strong>${formatDate(event.date)}</p>
    <p><strong>报名链接：</strong>${event.link ? `<a href="${escapeAttribute(event.link)}">${escapeHtml(event.name)}</a>` : "暂无报名链接"}</p>
    <p><strong>备注：</strong>${escapeHtml(event.summaryNote || event.description || "暂无备注。")}</p>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>ActivityHub 收藏活动报告</title>
  <style>
    body { font-family: Georgia, "Times New Roman", "Songti SC", serif; max-width: 780px; margin: 40px auto; line-height: 1.65; color: #111827; }
    h2 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; margin-top: 32px; font-size: 20px; }
    img { max-width: 420px; max-height: 520px; object-fit: contain; border: 1px solid #d7dee8; }
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
elements.resetSampleButton.addEventListener("click", resetSampleData);
elements.clearFavoritesButton.addEventListener("click", clearFavorites);
elements.exportWordButton.addEventListener("click", exportWordReport);
elements.aiExtractButton.addEventListener("click", extractEventWithAi);
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
