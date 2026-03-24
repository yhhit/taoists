# 修炼记录系统（Xiulian Tracker）

> 道友日常修炼追踪 —— 打坐、凡俗心、作息记录与评分排行

## 功能概览

- 📝 **用户注册/登录** — JWT 认证，30 天有效期
- 🧘 **打坐记录** — 每日时长，满 30 分钟得满分（50 分）
- 💭 **凡俗心记录** — 原因、内容、心路轨迹
- ⏰ **作息记录** — 起床/睡觉时间，超时需填写备注
- 📊 **每日评分** — 打坐分 + 起床分 + 睡觉分（总分 100）
- 🏆 **排行榜** — 日/周/月/半年维度
- ⚠️ **缺卡提醒** — 当日未记录自动警告

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite（sql.js，纯 JS 实现，无需编译） |
| 认证 | JWT（jsonwebtoken + bcryptjs） |
| 前端 | 原生 HTML / CSS / JS 单页应用 |

## 项目结构

```
taoists/
├── server.js          # Express 服务器 & 全部 API 路由
├── db.js              # sql.js 数据库初始化 & 辅助函数
├── package.json
├── xiulian.db          # SQLite 数据库文件（运行后自动生成）
├── public/
│   ├── index.html      # SPA 主页面
│   ├── style.css       # 暗色玻璃态主题样式
│   └── app.js          # 前端业务逻辑
└── .note/              # 项目笔记
```

## 部署指南

### 环境要求

- **Node.js** >= 16.x
- **npm** >= 8.x
- 无需安装 Python 或 C++ 编译工具（sql.js 是纯 JS 实现）

### 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/yhhit/taoists.git
cd taoists

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
```

服务启动后访问 **http://localhost:9192**。

> 首次运行会自动创建 `xiulian.db` 数据库文件，无需手动初始化。

### 生产环境部署

#### 方式一：使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start server.js --name xiulian-tracker

# 设置开机自启
pm2 startup
pm2 save

# 常用命令
pm2 status           # 查看状态
pm2 logs xiulian-tracker  # 查看日志
pm2 restart xiulian-tracker  # 重启服务
```

#### 方式二：使用 systemd（Linux）

创建 `/etc/systemd/system/xiulian.service`：

```ini
[Unit]
Description=Xiulian Tracker
After=network.target

[Service]
Type=simple
User=www
WorkingDirectory=/opt/taoists
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable xiulian
sudo systemctl start xiulian
```

#### 方式三：Docker

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 9192
CMD ["node", "server.js"]
```

```bash
docker build -t xiulian-tracker .
docker run -d -p 9192:9192 -v ./data:/app --name xiulian xiulian-tracker
```

### Nginx 反向代理（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:9192;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 配置说明

| 配置项 | 位置 | 默认值 | 说明 |
|--------|------|--------|------|
| PORT | `server.js:8` | `9192` | 服务端口 |
| JWT_SECRET | `server.js:9` | `xiulian_secret_key_2024` | JWT 签名密钥，**生产环境务必修改** |
| JWT 有效期 | `server.js:37,47` | `30d` | Token 过期时间 |
| DB_PATH | `db.js:5` | `./xiulian.db` | 数据库文件路径 |

> [!IMPORTANT]
> 生产环境部署前，**必须修改 `JWT_SECRET`** 为随机强密码，避免 Token 被伪造。

## 数据库表结构

| 表名 | 用途 |
|------|------|
| `users` | 用户账号（id, username, password_hash） |
| `meditations` | 打坐记录（日期、时长、备注） |
| `worldly_thoughts` | 凡俗心记录（日期、原因、内容、心路轨迹） |
| `schedules` | 作息记录（日期、起床/睡觉时间及备注） |

## 数据备份

```bash
# 直接拷贝数据库文件即可
cp xiulian.db xiulian.db.bak

# 或定时备份（crontab）
0 3 * * * cp /opt/taoists/xiulian.db /backup/xiulian-$(date +\%Y\%m\%d).db
```

## API 概览

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | ✗ | 注册 |
| POST | `/api/auth/login` | ✗ | 登录 |
| GET/POST/DELETE | `/api/meditations` | ✓ | 打坐记录 CRUD |
| GET/POST/DELETE | `/api/thoughts` | ✓ | 凡俗心记录 CRUD |
| GET/POST | `/api/schedules` | ✓ | 作息记录（同日自动更新） |
| GET | `/api/scores?date=` | ✓ | 每日评分 |
| GET | `/api/leaderboard?range=` | ✓ | 排行榜 |
| GET | `/api/warnings?date=` | ✓ | 缺卡提醒 |

## 评分规则

- **打坐分（50 分）**：≥ 30 分钟满分，不足按比例计算
- **起床分（25 分）**：≤ 9:00 满分，每超 20 分钟扣剩余的 30%
- **睡觉分（25 分）**：≤ 0:30 满分，每超 20 分钟扣剩余的 30%
