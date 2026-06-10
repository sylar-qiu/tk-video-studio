# TK Video Studio — 跨平台部署规范

本文件描述在 **macOS** 与 **Windows** 上部署与运维的统一约定。两端使用同一套代码，差异仅来自操作系统与可选环境变量。

## 环境要求

| 组件 | 版本 | macOS | Windows |
|------|------|-------|---------|
| Python | 3.9+ | `brew install python` 或系统自带 | [python.org](https://www.python.org/downloads/) 安装时勾选 **Add to PATH** |
| Node.js | 18+ | `brew install node` | [nodejs.org](https://nodejs.org/) LTS |
| FFmpeg | 含 ffprobe | `brew install ffmpeg` | `winget install Gyan.FFmpeg` 或 `choco install ffmpeg` |

安装后在新终端验证：

```bash
python start.py --check
```

或访问 `http://127.0.0.1:8000/api/health`，应返回 `ffmpeg` / `ffprobe` 路径及 `platform` 字段。

## 一键启动

| 平台 | 命令 |
|------|------|
| 任意 | `python start.py` |
| macOS / Linux | `./start.sh` |
| Windows 双击 | `start.bat` |
| Windows PowerShell | `.\start.ps1` |

默认地址：

- 前端：http://127.0.0.1:5173
- 后端：http://127.0.0.1:8000

## 目录与数据存储

所有媒体与数据库均在项目下的 `data/`（可通过环境变量改位置）：

```
data/
├── studio.db      # SQLite 元数据
├── raw/           # 原片上传
├── clips/         # 分镜片段
├── thumbs/        # 缩略图
├── exports/       # 导出成片（占用最大）
├── previews/      # 脚本预览缓存
├── bgm/           # 背景音乐
└── proxy/         # 历史预览代理（可忽略）
```

### 路径规范（代码层）

1. **磁盘路径**：一律使用 `pathlib.Path`，禁止手写 `\` 或 `/` 拼接。
2. **入库相对路径**：相对 `data/` 且 **始终用正斜杠**，例如 `clips/shot_12.mp4`（见 `backend/paths.py`）。
3. **SQLite URL**：使用 `DB_PATH.as_posix()`，避免 Windows 反斜杠破坏连接串。
4. **FFmpeg concat 列表**：使用 `ffmpeg_safe_path()` / `as_posix()`，Windows 盘符路径写成 `C:/...` 形式。

Mac 上开发的 `data/` **可直接拷贝**到 Windows 同路径下使用（或设置 `TK_DATA_DIR` 指向拷贝目录），无需改库内路径。

## 环境变量（可选）

| 变量 | 说明 | 示例 |
|------|------|------|
| `TK_DATA_DIR` | 数据根目录（库 + 所有媒体） | `D:\tk-video-data` |
| `TK_ROOT` | 项目根（一般无需设置） | — |
| `TK_FFMPEG` | ffmpeg 可执行文件路径 | `C:\ffmpeg\bin\ffmpeg.exe` |
| `TK_FFPROBE` | ffprobe 可执行文件路径 | `C:\ffmpeg\bin\ffprobe.exe` |
| `TK_BACKEND_HOST` / `TK_BACKEND_PORT` | 后端监听 | 默认 `127.0.0.1:8000` |
| `TK_FRONTEND_HOST` / `TK_FRONTEND_PORT` | 前端 dev 端口 | 默认 `127.0.0.1:5173` |

Windows 若数据盘与系统盘分离，推荐：

```powershell
setx TK_DATA_DIR "D:\tk-video-studio\data"
```

重启终端后再 `python start.py`。

## 手动启动（生产 / 调试）

**后端**

```bash
# macOS / Linux
source .venv/bin/activate
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000

# Windows
.venv\Scripts\activate
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

**前端开发**

```bash
cd frontend && npm install && npm run dev
```

**前端生产构建**（仅静态资源，仍需后端 API）

```bash
cd frontend && npm run build
# 将 dist/ 用任意静态服务器托管，并反向代理 /api → 后端
```

## Mac ↔ Windows 迁移清单

1. 复制整个 `data/` 目录（或设置相同的 `TK_DATA_DIR`）。
2. 在新机器安装 Python、Node、FFmpeg，执行 `python start.py --check`。
3. 首次启动会自动跑数据库迁移（`backend/migrate.py`）。
4. 确认 `/api/health` 中 `ffmpeg` 非 null。

## 存储占用说明

- 成片目录 `data/exports/` 通常占绝大部分空间；删除导出任务时会删对应文件，但历史 orphan 文件需定期清理。
- 原片 + 分镜相对较小；批量生成会快速增大 `exports/`。

## 常见问题

**Windows：ffmpeg 找不到**  
将 FFmpeg 的 `bin` 加入系统 PATH，或设置 `TK_FFMPEG` / `TK_FFPROBE`。

**Windows：时区 / 相对时间异常**  
项目已依赖 `tzdata`（见 `requirements.txt`）；重新 `pip install -r backend/requirements.txt`。

**拼接/export 失败且路径含中文或空格**  
媒体文件名在入库时已 UUID 化；若仍失败，检查 concat 日志，确保路径为 POSIX 形式（已在 `paths.py` 处理）。

**端口被占用**  
修改 `TK_BACKEND_PORT` / `TK_FRONTEND_PORT`，并同步改 `frontend/vite.config.ts` 中 proxy 目标（或通过环境配置）。
