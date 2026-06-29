# ActivityHub

ActivityHub 是一个用于整理商业地产、地产科技、REITs、办公租赁、智慧楼宇、设施管理等行业活动的轻量网页工具。

当前版本是在本地 demo 基础上升级的 **API V2**：用户可以手动维护活动，也可以粘贴活动链接/原文让 AI 提取字段，还可以点击“刷新真实活动”从一组 verified public source URL 中发现公开活动、生成网页截图并保存为活动卡片。

## 当前状态

- 已实现纯前端活动浏览 demo。
- 已实现 localStorage 本地保存。
- 已实现首页搜索、城市筛选、主题筛选、活动卡片、详情弹窗、收藏夹、Word 风格导出。
- 已实现后台添加、编辑、删除活动。
- 已新增 Node.js 后端接口 `POST /api/extract-event`。
- 已新增 Node.js 后端接口 `POST /api/discover-events`。
- 已新增 OpenAI API 提取和总结能力。
- 已新增 Playwright 网页截图能力，截图保存到 `assets/generated-posters/`。

## 重要边界

- 不做自动公众号抓取。
- 不做全网实时爬虫。
- 只读取项目中配置的少量公开 verified source URL。
- 不做登录、数据库、多人协作或权限系统。
- 不自动发送给销售。
- 不编造报名链接；找不到直接报名入口时，`registrationUrl` 留空，前端使用活动来源页面作为“活动来源链接”。
- 优先读取官方海报/OG 图片；页面无合适海报时，生成一张统一风格的本地活动视觉图，避免直接截取凌乱网页。
- OpenAI API key 只放在后端 `.env`，不要写入 `index.html` 或 `app.js`。
- AI 只辅助提取和填表，最终保存、收藏和导出仍由用户人工确认。

## 本地运行

确保你的电脑已经安装 Node.js 18 或更高版本。

1. 安装依赖

```bash
npm install
```

项目依赖包括 `playwright`、`cheerio` 和 `slugify`。

安装 Playwright Chromium：

```bash
npx playwright install chromium
```

2. 配置环境变量

```bash
cp .env.example .env
```

然后编辑 `.env`：

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
PORT=3000
```

不要把真实 `.env` 提交或分享出去。

3. 启动本地服务

```bash
npm start
```

4. 打开网页

访问：

```text
http://127.0.0.1:3000
```

## 测试 AI 提取

1. 打开 `http://127.0.0.1:3000`。
2. 点击顶部导航的“后台管理”。
3. 切换到“添加活动”。
4. 在“AI 提取活动信息”区域粘贴公开活动链接，或粘贴公众号/网页中的活动原文。
5. 点击“AI 提取活动信息”。
6. 等待 AI 将活动名称、类型、城市、地点、日期、主办方、报名链接、主题标签、AI 摘要等字段填入表单。
7. 人工检查并修改后，点击“保存活动”。

如果链接内容无法读取，页面会提示：`链接内容无法读取，请粘贴活动原文后重试`。

## 测试真实活动发现

1. 启动本地服务并打开 `http://127.0.0.1:3000`。
2. 在首页搜索区右侧点击“刷新真实活动”。
3. 页面会显示“正在发现真实活动，请稍候”。
4. 后端会读取 verified source URL、提取候选活动链接、优先识别直接报名入口，同时保留活动来源链接，生成/保存合适的活动视觉图，并调用 OpenAI 生成 200-250 字中文备注。
5. 成功后，真实活动会写入 localStorage 并显示在首页卡片中。

也可以直接测试接口：

```bash
curl -s -X POST http://127.0.0.1:3000/api/discover-events
```

截图文件会生成在：

```text
assets/generated-posters/
```

V2 仍然使用 localStorage 保存前端活动数据，不使用数据库。

## 活动字段

活动记录主要包含：

- 活动名称
- 活动类型
- 城市
- 具体地点
- 活动日期
- 主办方
- 活动来源
- 活动链接 / 报名链接
- 活动海报链接
- 主题标签
- 活动简介 / AI 摘要
- 推荐级别
- 推荐理由
- 活动状态
- 收藏状态

## 收藏夹与报告

首页点击爱心即可收藏活动。收藏夹只展示已收藏活动。

“导出为 Word”当前导出的是 Word 可打开的 `.doc` 风格 HTML 文档，内容基于收藏夹活动生成，包括：

- Dear all 开头说明
- TOPIC 1 / 2 / 3
- 活动海报
- 地点
- 时间
- 活动来源链接 / 报名入口
- 200-250 字备注 / 活动简介
- Best regards, Julie Wu

## API

### `POST /api/extract-event`

请求：

```json
{
  "input": "用户粘贴的活动链接或活动原文"
}
```

响应：

```json
{
  "success": true,
  "event": {
    "title": "活动名称",
    "eventType": "峰会",
    "city": "上海",
    "location": "具体地点",
    "date": "2026-07-01",
    "organizer": "主办方",
    "source": "活动来源",
    "registrationUrl": "https://activity-registration-url",
    "posterUrl": "",
    "themes": ["商业地产", "REITs"],
    "aiSummary": "100-150字活动简介",
    "notes": "补充备注"
  }
}
```

### `POST /api/discover-events`

真实活动发现接口会搜索公开活动页和官方活动站点，并只返回通过质量过滤的活动：

- 活动日期不早于 `2026-05-01`
- 必须是会议、展会、论坛、研讨会等真实活动
- 必须有明确可点击的报名 / 注册链接
- 必须有标题、日期、城市、地点和海报
- 新闻、报道、访谈、榜单、观点文章、会后报道会被过滤

请求：

```bash
curl -s -X POST http://127.0.0.1:3000/api/discover-events
```

响应：

```json
{
  "success": true,
  "events": [
    {
      "title": "活动名称",
      "eventType": "峰会",
      "city": "上海",
      "location": "具体地点",
      "date": "2026-08-11",
      "organizer": "主办方",
      "source": "来源网站",
      "eventUrl": "活动详情页",
      "registrationUrl": "直接报名或注册链接",
      "posterUrl": "assets/generated-posters/event.png",
      "themes": ["商业地产"],
      "aiSummary": "专业活动备注",
      "notes": "补充说明"
    }
  ],
  "sources": [
    {
      "url": "活动来源页",
      "status": "kept",
      "title": "活动名称"
    }
  ]
}
```

## 产品文档

详见 [PRD.md](./PRD.md)。
