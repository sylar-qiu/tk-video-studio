# TK Video Studio

本机版 TK 视频素材管理 + 镜头拆解 + 拼接导出工具。支持 **macOS / Linux / Windows**。

## 功能

- 素材上传、分镜拆解、素材库筛选
- 独立脚本 / 批量脚本编辑与成片导出

## 配置（重要）

**基础设施**（数据目录、端口、FFmpeg）→ 部署时编辑项目根目录 **`studio.config.json`**（不提交 git）。

**业务设置**（类目、标签）→ Web **设置** 页面。

详见 **[DEPLOY.md](./DEPLOY.md)**。

```bash
# 本地开发
cp studio.config.example.json studio.config.json

# Ubuntu 服务器
cp studio.config.server.example.json studio.config.json
# 或 ./deploy/init-server-config.sh
```

## 快速启动

```bash
python start.py --check
python start.py
```

浏览器：**http://127.0.0.1:5173**（端口以 `studio.config.json` 为准）

## 目录结构

```
tk-video-studio/
├── studio.config.json       # 本机配置（gitignore）
├── studio.config.example.json
├── backend/
├── frontend/
├── deploy/
└── start.py
```

## 数据目录

| 情况 | 路径 |
|------|------|
| Linux，未配置 | `/data/tk-video-studio` |
| Windows，未配置 | `C:/data/tk-video-studio` |
| macOS，未配置 | 项目内 `data/` |
| 部署显式配置 | `studio.config.json` → `data_dir` 或 `TK_DATA_DIR` |

Web **设置 → 系统信息** 仅只读查看，不可修改。

## 生产部署（Ubuntu 长期运行）

单端口 **8000**（页面 + API）：

```bash
chmod +x deploy/start-prod.sh
./deploy/start-prod.sh
```

开机自启见 `deploy/tk-video-studio.service.example` 与 [DEPLOY.md](./DEPLOY.md)。
