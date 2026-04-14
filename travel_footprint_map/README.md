# 旅游足迹地图

一个可视化旅游足迹的小应用：输入或上传 `时间 / 城市 / 谁`，在地图上打点并悬停查看详情。

## 本地运行

```bash
cd travel_footprint_map
python3 server.py
```

打开：`http://127.0.0.1:8765/`

> 不要用 `python -m http.server`，因为它不包含 `/api/geocode` 代理接口。

## 一键部署到 Render

部署文件：

- 仓库**根目录**的 `render.yaml`（已设置 `rootDir: travel_footprint_map`）
- 本目录内：`Procfile`、`requirements.txt`

### 方式 A：Blueprint（推荐）

1. 确保 GitHub 上**仓库根目录**有 `render.yaml`（与 `travel_footprint_map/` 同级），并已 push。
2. 打开 [Render Dashboard](https://dashboard.render.com) → **New +** → **Blueprint**。
3. 选中仓库 `renee-r1/travel-footprint-map`，连接并部署。

### 方式 B：手动 Web Service

1. **New +** → **Web Service** → 连接同一仓库。
2. **Root Directory** 填：`travel_footprint_map`（必填，否则找不到 `server.py`）。
3. Runtime：**Python**
4. Build Command：`echo "No build step required"`
5. Start Command：`python3 server.py`
6. **Deploy**。

部署成功后，用 Render 提供的 `https://xxx.onrender.com` 打开即可（与本地一样走 `/api/geocode`）。

## 最短发布命令（GitHub）

在 `travel_footprint_map` 目录执行（把 `<YOUR_REPO_URL>` 换成你自己的仓库地址）：

```bash
cd "/Users/ruanying/Desktop/my first cursor/travel_footprint_map"
git init
git add .
git commit -m "init travel footprint map"
git branch -M main
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```

然后到 Render：

- 选 **New + -> Blueprint**（会自动读取 `render.yaml`），或
- 选 **New + -> Web Service**，`Start Command` 填 `python3 server.py`。

## 说明

- 地图底图：OSM / CARTO。
- 地理编码：优先走本地 `/api/geocode` 代理，代理会请求 Nominatim/Photon。
- 请遵守服务使用条款，避免高频批量请求。
