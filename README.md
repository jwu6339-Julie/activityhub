# ActivityHub

ActivityHub 是一个用于整理商业地产、地产科技、REITs、办公租赁、智慧楼宇、设施管理等行业活动的轻量网页工具。

当前版本是在本地 demo 基础上升级的 **固定 verified 活动库 + append-only 刷新版**：页面打开后会先读取 `data/verified-events.json`，直接展示已经确认的真实活动；点击“刷新真实活动”不会清空或覆盖已确认活动。

## 当前状态

- 已实现纯前端活动浏览 demo。
- 已实现固定 verified 活动库：`data/verified-events.json`。
- 已实现 localStorage 保存用户侧状态，例如收藏。
- 已实现首页搜索、城市筛选、主题筛选、活动卡片、详情弹窗、收藏夹、Word 风格导出。
- 已实现后台添加、编辑、删除活动。
- 已新增 Node.js 后端接口 `POST /api/extract-event`。
- 已新增 Node.js 后端接口 `GET /api/verified-events`。
- 已新增 Node.js 后端接口 `POST /api/discover-events`，当前以 append-only 安全模式返回固定库，避免随机抓取污染活动池。
- 已新增 OpenAI API 提取和总结能力。
- 已新增本地固定海报生成能力，SVG 海报保存到 `assets/generated-posters/`。

## 重要边界

- 不做自动公众号抓取。
- 不做全网实时爬虫。
- 首页默认读取固定 verified 活动库，不依赖随机刷新。
- “刷新真实活动”当前只保留并返回固定 verified 活动库；实时随机发现已关闭。
- 已确认并锁定的 verified 活动不会被后续刷新删除或覆盖。
- 不做登录、数据库、多人协作或权限系统。
- 不自动发送给销售。
- 不编造报名链接；没有明确报名 / 注册链接的候选不会进入 verified 活动库。
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

## 测试固定活动库与增量更新

1. 启动本地服务并打开 `http://127.0.0.1:3000`。
2. 首页会自动读取 `data/verified-events.json`，不用点击刷新也会显示固定 verified 活动。
3. 在首页搜索区右侧点击“刷新真实活动”。
4. 后端会返回固定库，并给出 `totalVerified`、`addedCount`、`updatedCount`、`keptExistingCount`。
5. 当前实时随机发现已关闭，避免无关活动、新闻报道或弱相关展会进入首页。

也可以直接测试接口：

```bash
curl -s http://127.0.0.1:3000/api/verified-events
```

```bash
curl -s -X POST http://127.0.0.1:3000/api/discover-events
```

固定活动海报文件会生成在：

```text
assets/generated-posters/
```

当前版本不使用数据库。固定活动库保存在 `data/verified-events.json`，前端收藏等用户状态保存在 localStorage。

## 活动字段

活动记录主要包含：

- 活动名称
- 活动类型
- 城市
- 具体地点
- 活动日期
- 主办方
- 活动来源
- 活动来源链接
- 报名链接
- 活动海报链接
- 主题标签
- 备注 / 活动摘要
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
- 报名链接
- 备注
- Best regards, Julie Wu

## API

### `GET /api/verified-events`

读取固定 verified 活动库。首页默认调用这个接口。

```bash
curl -s http://127.0.0.1:3000/api/verified-events
```

响应：

```json
{
  "success": true,
  "events": [
    {
      "title": "活动名称",
      "date": "2026-09-25",
      "city": "上海",
      "location": "上海世博展览馆",
      "registrationUrl": "直接报名或注册链接",
      "posterUrl": "assets/generated-posters/verified-event.svg"
    }
  ]
}
```

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

刷新接口当前为 append-only 安全模式：返回 fixed verified 活动库，不删除、不覆盖、不减少已有活动。

- 返回活动日期不早于 `2026-05-01`
- 返回活动来自 `data/verified-events.json`
- 已确认并锁定的五六月活动会固定保留
- 实时随机发现默认关闭，避免新闻、报道、访谈、榜单、观点文章进入首页

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
  "added": 1,
  "updated": 0,
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
