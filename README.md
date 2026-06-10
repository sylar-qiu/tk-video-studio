# TK Video Studio

本机版 TK 视频素材管理 + 镜头拆解 + 拼接导出工具（Phase 1 MVP）。支持 **macOS / Linux / Windows** 本地部署。

## 功能

- **素材上传**：Web 拖拽上传原片
- **镜头拆解**：播放器标记入出点，提取分镜并打标签
- **素材库**：按产品 / 分镜 / 标签筛选
- **脚本编辑**：独立脚本拼接导出，或批量脚本笛卡尔积生成成片

## 环境要求

- Python 3.9+
- Node.js 18+
- FFmpeg（含 `ffprobe`，需在 PATH 中）

详细安装与 Windows 说明见 **[DEPLOY.md](./DEPLOY.md)**。

## 快速启动

```bash
cd tk-video-studio
python start.py --check   # 可选：检查依赖
python start.py           # 启动前后端
```

| 平台 | 等价命令 |
|------|----------|
| macOS / Linux | `./start.sh` |
| Windows | 双击 `start.bat` 或 `python start.py` |

浏览器打开：**http://127.0.0.1:5173**

## 目录结构

```
tk-video-studio/
├── backend/          # FastAPI + FFmpeg
├── frontend/         # React + Vite
├── data/             # 本地存储（自动生成，已 gitignore）
│   ├── raw/          # 原片
│   ├── clips/        # 分镜
│   ├── thumbs/       # 缩略图
│   ├── exports/      # 成片
│   ├── previews/     # 脚本预览
│   └── bgm/          # 背景音乐
├── start.py          # 跨平台启动入口
├── start.sh          # macOS / Linux
├── start.bat         # Windows
└── DEPLOY.md         # 部署规范
```

## 数据目录（可选）

默认使用项目内 `data/`。Windows 可放到其他盘：

```powershell
setx TK_DATA_DIR "D:\tk-video-data"
```

## 手动启动

```bash
# 后端
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows:     .venv\Scripts\activate
pip install -r backend/requirements.txt
cd backend && python -m uvicorn main:app --reload --port 8000

# 前端（新终端）
cd frontend && npm install && npm run dev
```

## 后续扩展

- 内网对象存储、分片上传
- 导出 orphan 文件定期清理
- 多 Worker 任务队列
