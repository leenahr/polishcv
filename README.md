# PolishCV – AI Resume Optimizer

## 项目结构

```
polishcv/
├── frontend/
│   └── index.html          # 前端页面（上传 → 分析 → 付费 → 下载）
└── worker/
    ├── index.js             # Cloudflare Worker 后端
    └── wrangler.toml        # Worker 配置
```

## 部署步骤

### 第一步：部署 Cloudflare Worker

1. 安装 Wrangler CLI：
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. 进入 worker 目录，设置 Secrets（敏感信息不能写在代码里）：
   ```bash
   cd worker
   wrangler secret put AI_API_KEY
   # 输入: sk-6V4XgwIrlr7wF7KhS3DExZWYP5NQhRPUDo2ZSoaIEKiygigw

   wrangler secret put PAYPAL_CLIENT_ID
   # 输入: AUjkEJsVUMpNmcj-tWC-Pmjn22fYq942z1XIR_tzaYVGy6WEXVVSg-JifPc9oj_wEx9vwmr4wtk76blw

   wrangler secret put PAYPAL_CLIENT_SECRET
   # 输入: 你的 PayPal Client Secret（在 developer.paypal.com 同一个 App 里）
   ```

3. 发布 Worker：
   ```bash
   wrangler deploy
   ```
   发布成功后会显示 Worker URL，格式类似：
   `https://polishcv.YOUR_SUBDOMAIN.workers.dev`

4. **复制这个 URL**，更新 frontend/index.html 第一行 JS 里的 `WORKER_URL`：
   ```js
   const WORKER_URL = 'https://polishcv.YOUR_SUBDOMAIN.workers.dev';
   ```

### 第二步：部署 Cloudflare Pages

1. 将 frontend/index.html 推送到 GitHub：
   ```bash
   # 在项目根目录
   git add .
   git commit -m "Initial PolishCV implementation"
   git push origin main
   ```

2. Cloudflare Dashboard → Pages → polishcv 项目 → 自动重新部署

3. 绑定自定义域名 polishcv.xyz（已在 GoDaddy 购买）：
   - Cloudflare Pages → Custom domains → Add domain → polishcv.xyz
   - 按提示在 GoDaddy DNS 添加 CNAME 记录

### 第三步：Worker CORS 更新（可选）

生产环境建议把 Worker 里的 CORS 改为只允许你的域名：
```js
'Access-Control-Allow-Origin': 'https://polishcv.xyz'
```

## 需要补充的信息

- [ ] PayPal Client **Secret**（去 developer.paypal.com 获取）
- [ ] 更新 Worker URL 到 frontend/index.html

## 功能说明

1. **上传简历** — 支持 PDF、DOC、DOCX，纯浏览器解析，不存储文件
2. **AI 分析** — 给出评分、内容建议、格式问题、ATS 关键词
3. **AI 改写** — 全面优化简历内容
4. **付费下载** — PayPal $7.99，验证后生成 Word 文件下载
