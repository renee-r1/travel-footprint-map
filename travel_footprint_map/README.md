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

本目录已包含部署文件：

- `render.yaml`
- `Procfile`
- `requirements.txt`

### 方式 A：用 `render.yaml`

1. 把项目推到 GitHub。
2. 在 Render 选择 **New +** -> **Blueprint**。
3. 选择仓库并部署（Render 会读取 `render.yaml`）。

### 方式 B：手动建 Web Service

1. 在 Render 选择 **New +** -> **Web Service**。
2. 连接你的仓库。
3. 配置：
   - Runtime: `Python`
   - Build Command: `echo "No build step required"`
   - Start Command: `python3 server.py`
4. 点击 Deploy。

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
