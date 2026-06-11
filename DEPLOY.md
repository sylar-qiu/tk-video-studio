# TK Video Studio — 部署与配置

## 配置放在哪？

| 类型 | 方式 | 示例 |
|------|------|------|
| **基础设施**（数据目录、端口、FFmpeg） | 部署时：`studio.config.json` | `data_dir: /data/tk-video-studio` |
| **业务设置**（类目、标签） | Web → 设置 | 已在应用内 |

**建议：数据目录等在服务器部署时配置，不要放进 Web 可编辑设置。**

原因：应用启动就要读写 SQLite 和媒体文件；路径若可在 Web 里改，存在安全风险，且数据库本身就在数据目录里，形成「鸡生蛋」问题。Web 里提供 **设置 → 系统信息** 只读展示，便于核对是否生效。

---

## 配置文件

项目根目录（与 `start.py` 同级）：

```
studio.config.json          # 实际配置（不提交 git，每台机器一份）
studio.config.example.json  # 本地开发模板（data_dir: "data"）
studio.config.server.example.json  # Ubuntu 服务器模板
```

加载顺序：

1. `studio.config.local.json`（可选，机器级覆盖，不提交 git）
2. `studio.config.json`
3. 环境变量覆盖同名项（容器 / systemd 用）

也可指定：`STUDIO_CONFIG=/path/to/config.json`

### 本地开发（Mac / Windows）

```bash
cp studio.config.example.json studio.config.json
# 默认 data_dir 为 "data" → 项目内 data/ 目录
python3 start.py --check
```

### Ubuntu 服务器

```bash
cd /projects/tk-video-studio
chmod +x deploy/init-server-config.sh
./deploy/init-server-config.sh
# 会复制 studio.config.server.example.json → studio.config.json
# 并创建 /data/tk-video-studio

# 可按需编辑
nano studio.config.json

python3 start.py --check
python3 start.py
```

`studio.config.server.example.json` 内容要点：

```json
{
  "data_dir": "/data/tk-video-studio",
  "backend": { "host": "0.0.0.0", "port": 8000 },
  "frontend": { "host": "0.0.0.0", "port": 8000 }
}
```

## 数据目录 `data_dir` 优先级

1. 环境变量 `TK_DATA_DIR`
2. `studio.config.json` 里的 `data_dir`
3. **未配置时的平台默认：**
   - Linux → `/data/tk-video-studio`
   - Windows → `C:/data/tk-video-studio`
   - macOS → 项目内 `data/`（相对路径）

部署时可显式写进 `studio.config.json` 覆盖默认值。

---

## 环境变量（可选覆盖）

| 变量 | 对应配置 |
|------|----------|
| `TK_DATA_DIR` | `data_dir` |
| `TK_BACKEND_HOST` / `TK_BACKEND_PORT` | `backend.*` |
| `TK_FRONTEND_HOST` / `TK_FRONTEND_PORT` | `frontend.*` |
| `TK_FFMPEG` / `TK_FFPROBE` | `ffmpeg.*` |
| `STUDIO_CONFIG` | 配置文件路径 |

---

## 环境要求

| 组件 | 版本 |
|------|------|
| Python | 3.9+ |
| Node.js | 18+ |
| FFmpeg | 含 ffprobe |

Ubuntu：

```bash
sudo apt install -y python3 python3-venv python3-pip git ffmpeg nodejs npm
```

---

## 验证

```bash
python3 start.py --check
curl http://127.0.0.1:8000/api/system/info
```

Web：**设置 → 系统信息** 查看当前 `data_dir`、配置文件路径、FFmpeg 是否解析成功。

---

## 数据目录结构

```
{data_dir}/
├── studio.db
├── raw/
├── clips/
├── thumbs/
├── exports/
├── previews/
└── bgm/
```

Mac 的 `data/` 拷到服务器 `/data/tk-video-studio/` 即可迁移，库内为相对路径，无需改库。

---

## 生产环境长期运行（单端口 8000）

构建前端静态资源，由 FastAPI 在同一端口同时提供 Web 页面与 `/api`：

```bash
chmod +x deploy/start-prod.sh
./deploy/start-prod.sh
```

浏览器访问：**http://\<服务器IP\>:8000/**

### 本地开发（同样单端口 8000）

```bash
python3 start.py
```

访问 **http://127.0.0.1:8000/**，与生产环境一致。后端改代码自动重载；前端改代码后需重新构建（或 `python3 start.py` 重启）。仅调试 UI 热更新时，可另开 `cd frontend && npm run dev`（5173，高级用法）。

### systemd 开机自启

```bash
sudo cp deploy/tk-video-studio.service.example /etc/systemd/system/tk-video-studio.service
# 编辑 User、路径（默认 /projects/tk-video-studio）
sudo systemctl daemon-reload
sudo systemctl enable tk-video-studio
sudo systemctl start tk-video-studio
sudo systemctl status tk-video-studio
```

更新代码后：

```bash
cd /projects/tk-video-studio && git pull
sudo systemctl restart tk-video-studio
```

---

## 常见问题

**未创建 studio.config.json**  
仍可使用内置默认：`data_dir = 项目/data/`，仅适合本地开发。

**修改配置后不生效**  
重启 `python start.py` 或 systemd 服务；`--reload` 不监听配置文件变更。

**Windows 数据盘**  
`"data_dir": "D:/tk-video-data"` 或 `"D:\\\\tk-video-data"`（JSON 内转义）。
