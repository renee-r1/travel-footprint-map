/**
 * 旅游足迹：城市地理编码（Nominatim）、地图标记、本地存储
 * OSM 使用政策：需标识应用；请勿高频请求。
 */

const STORAGE_KEY = "travel_footprint_trips_v1";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const PHOTON = "https://photon.komoot.io/api/";
const GEO_DELAY_MS = 1100;

/** 无外网/接口全挂时的兜底（可自增） */
const CITY_COORD_FALLBACK = {
  北京: [39.9042, 116.4074],
  上海: [31.2304, 121.4737],
  广州: [23.1291, 113.2644],
  深圳: [22.5431, 114.0579],
  杭州: [30.2741, 120.1551],
  湖州: [30.893, 120.088],
  黄山: [29.7147, 118.3373],
  成都: [30.5728, 104.0668],
  西安: [34.3416, 108.9398],
  西宁: [36.6171, 101.7782],
  南京: [32.0603, 118.7969],
  重庆: [29.563, 106.5516],
  武汉: [30.5928, 114.3055],
  九江: [29.7051, 115.9928],
  景德镇: [29.2682, 117.1784],
  苏州: [31.2989, 120.5853],
  镇江: [32.1896, 119.4558],
  扬州: [32.3942, 119.4123],
  厦门: [24.4798, 118.0819],
  青岛: [36.0671, 120.3826],
  天津: [39.3434, 117.3616],
  香港: [22.3193, 114.1694],
  台北: [25.033, 121.5654],
  东京: [35.6762, 139.6503],
  新加坡: [1.3521, 103.8198],
  巴黎: [48.8566, 2.3522],
  伦敦: [51.5074, -0.1278],
  纽约: [40.7128, -74.006],
};

function tryFallbackCoords(city) {
  const k = city.trim();
  if (!k) return null;
  const hit = CITY_COORD_FALLBACK[k] || CITY_COORD_FALLBACK[k.replace(/市$/u, "")];
  if (hit) return { lat: hit[0], lng: hit[1] };
  return null;
}

let mapChina = null;
let layerChina = null;

const state = {
  trips: [],
};

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/** 用于按时间倒序：可解析为日期的用时间戳，否则用 id（新记录更大） */
function tripTimeValue(t) {
  const s = String(t.time || "").trim();
  let ms = Date.parse(s);
  if (!Number.isNaN(ms)) return ms;
  ms = Date.parse(s.replace(/\./g, "-"));
  if (!Number.isNaN(ms)) return ms;
  const m = s.match(/^(\d{4})\s*[年.\-/]\s*(\d{1,2})\s*[月.\-/]\s*(\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const m2 = s.match(/^(\d{4})\s*[年.\-/]\s*(\d{1,2})\s*月?$/);
  if (m2) {
    const d = new Date(Number(m2[1]), Number(m2[2]) - 1, 1);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const id = t.id;
  return typeof id === "number" && !Number.isNaN(id) ? id : 0;
}

function tripCompareTimeDesc(a, b) {
  const va = tripTimeValue(a);
  const vb = tripTimeValue(b);
  if (vb !== va) return vb - va;
  const ida = typeof a.id === "number" ? a.id : 0;
  const idb = typeof b.id === "number" ? b.id : 0;
  return idb - ida;
}

function sortTripsByTimeDesc() {
  state.trips.sort(tripCompareTimeDesc);
}

function loadTrips() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    arr.sort(tripCompareTimeDesc);
    return arr;
  } catch {
    return [];
  }
}

function saveTrips() {
  sortTripsByTimeDesc();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trips));
}

function setStatus(msg, type) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "status" + (type ? " " + type : "");
}

async function geocodeCity(city) {
  const q = city.trim();
  if (!q) throw new Error("请填写城市");

  // 1) 同源代理（须用 python3 server.py 启动，不要用 python -m http.server）
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json();
      if (res.ok && data.lat != null && data.lng != null) {
        return { lat: Number(data.lat), lng: Number(data.lng) };
      }
      if (data.error) {
        throw new Error(data.error);
      }
    }
  } catch (e) {
    const msg = e && e.message;
    if (
      msg &&
      msg !== "Failed to fetch" &&
      !String(msg).includes("NetworkError") &&
      !String(msg).includes("Load failed")
    ) {
      const fb = tryFallbackCoords(q);
      if (fb) {
        setStatus("已用内置坐标（外网地理编码不可用）", "ok");
        return fb;
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
    /* Failed to fetch：无代理或代理未启动 → 尝试直连 */
  }

  // 2) 直连 Photon
  try {
    const pu = new URL(PHOTON);
    pu.searchParams.set("q", q);
    pu.searchParams.set("limit", "1");
    pu.searchParams.set("lang", "zh");
    const pres = await fetch(pu.toString(), {
      headers: { Accept: "application/json" },
    });
    if (pres.ok) {
      const pdata = await pres.json();
      const f = pdata.features && pdata.features[0];
      if (f && f.geometry && f.geometry.coordinates) {
        const [lng, lat] = f.geometry.coordinates;
        return { lat: parseFloat(lat), lng: parseFloat(lng) };
      }
    }
  } catch {
    /* 回退 Nominatim */
  }

  // 3) 直连 Nominatim
  try {
    const url = new URL(NOMINATIM);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": "zh-CN,en",
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.length) {
        const { lat, lon } = data[0];
        return { lat: parseFloat(lat), lng: parseFloat(lon) };
      }
    }
  } catch {
    /* 最后兜底 */
  }

  const fb = tryFallbackCoords(q);
  if (fb) {
    setStatus("已用内置坐标（在线地理编码不可用）", "ok");
    return fb;
  }
  throw new Error(
    "无法解析城市坐标。请用 ./run.sh 或 python3 server.py 启动，并保证本机能访问外网；或改用上方内置城市名。"
  );
}

function tooltipHtml(t) {
  return (
    `<div class="trip-tip-inner">` +
    `<strong>${escapeHtml(t.city)}</strong><br/>` +
    `<span>时间：${escapeHtml(t.time)}</span><br/>` +
    `<span>谁：${escapeHtml(t.who)}</span>` +
    `</div>`
  );
}

/** 根据「谁」选打点颜色：和妈妈→红，全家→绿，其它→蓝；城市名显示在水滴上方 */
function tripMarkerIcon(who, city) {
  const w = (who || "").trim();
  let fill = "#3388ff";
  if (w === "和妈妈") {
    fill = "#e53935";
  } else if (w === "全家") {
    fill = "#2e7d32";
  }
  const label = escapeHtml((city || "").trim() || "·");
  return L.divIcon({
    className: "trip-marker-divicon",
    html:
      `<div class="trip-marker-root">` +
      `<span class="trip-marker-city">${label}</span>` +
      `<div class="trip-marker-pin" style="--pin-fill:${fill}"></div>` +
      `</div>`,
    iconSize: [120, 52],
    iconAnchor: [60, 52],
  });
}

function clearLayers() {
  if (layerChina) layerChina.clearLayers();
}

function renderMarkers() {
  if (!layerChina || !mapChina || typeof L === "undefined") {
    return;
  }
  clearLayers();
  state.trips.forEach((t) => {
    if (t.lat == null || t.lng == null) return;
    const latlng = [t.lat, t.lng];
    const html = tooltipHtml(t);

    const m = L.marker(latlng, { icon: tripMarkerIcon(t.who, t.city) }).bindTooltip(html, {
      permanent: false,
      direction: "top",
      offset: [0, -10],
      opacity: 1,
      className: "trip-tooltip",
    });
    m.addTo(layerChina);
  });

  const valid = state.trips.filter((t) => t.lat != null && t.lng != null);
  if (valid.length === 0) return;

  const bounds = L.latLngBounds(valid.map((t) => [t.lat, t.lng]));
  mapChina.fitBounds(bounds.pad(0.15), { maxZoom: 8 });
}

function initMaps() {
  if (typeof L === "undefined") {
    throw new Error("地图库 Leaflet 未加载，请刷新或检查网络/CDN");
  }
  const chinaEl = document.getElementById("map-china");

  mapChina = L.map(chinaEl, {
    worldCopyJump: true,
  }).setView([35.86, 104.2], 4);

  /**
   * 底图：Carto Voyager（OSM 数据）。国内网络下 OSM 官方 tile.openstreetmap.org 常加载不全。
   */
  const cartoAttribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';
  const carto = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      subdomains: "abcd",
      maxZoom: 20,
      attribution: cartoAttribution,
    }
  );
  carto.addTo(mapChina);

  layerChina = L.layerGroup().addTo(mapChina);

  function invalidateMaps() {
    if (mapChina) mapChina.invalidateSize();
  }
  requestAnimationFrame(() => {
    invalidateMaps();
    setTimeout(invalidateMaps, 100);
    setTimeout(invalidateMaps, 400);
    setTimeout(invalidateMaps, 1000);
  });
}

function renderTripList() {
  const ul = document.getElementById("trip-list-body");
  if (!ul) return;
  ul.innerHTML = "";
  if (state.trips.length === 0) {
    ul.innerHTML =
      '<div class="trip-item"><small>暂无记录，请添加或上传 CSV。</small></div>';
    return;
  }
  state.trips.forEach((t, i) => {
    const div = document.createElement("div");
    div.className = "trip-item";
    div.innerHTML = `
      <div>
        <strong>${escapeHtml(t.city)}</strong>
        <small>${escapeHtml(t.time)} · ${escapeHtml(t.who)}</small>
      </div>
      <button type="button" class="remove" data-i="${i}" aria-label="删除">删除</button>
    `;
    ul.appendChild(div);
  });
  ul.querySelectorAll("button.remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.getAttribute("data-i"), 10);
      state.trips.splice(i, 1);
      saveTrips();
      renderTripList();
      renderMarkers();
      setStatus("已删除", "ok");
    });
  });
}

async function addTripFromForm(e) {
  e.preventDefault();
  e.stopPropagation();
  const time = document.getElementById("field-time").value.trim();
  const city = document.getElementById("field-city").value.trim();
  const who = document.getElementById("field-who").value.trim();
  if (!time || !city || !who) {
    setStatus("请填写时间、城市、谁", "error");
    return;
  }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  setStatus("正在解析城市坐标…");
  try {
    const { lat, lng } = await geocodeCity(city);
    state.trips.push({
      id: Date.now() + Math.random(),
      time,
      city,
      who,
      lat,
      lng,
    });
    saveTrips();
    renderTripList();
    renderMarkers();
    document.getElementById("add-form").reset();
    setStatus("已添加并标注", "ok");
  } catch (err) {
    setStatus(err.message || "添加失败", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function detectColumns(headers) {
  const h = headers.map((x) => String(x).trim().toLowerCase());
  const find = (patterns) => {
    for (let i = 0; i < h.length; i++) {
      for (const p of patterns) {
        if (h[i] === p || h[i].includes(p)) return i;
      }
    }
    return -1;
  };
  let ti = find(["时间", "time", "date", "日期"]);
  let ci = find(["城市", "city", "地点", "place"]);
  let wi = find(["谁", "who", "人物", "人", "name"]);
  if (ti < 0 || ci < 0 || wi < 0) {
    if (h.length >= 3) {
      ti = ti >= 0 ? ti : 0;
      ci = ci >= 0 ? ci : 1;
      wi = wi >= 0 ? wi : 2;
    }
  }
  return { ti, ci, wi };
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV 至少需要表头一行与一行数据");
  const header = lines[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const { ti, ci, wi } = detectColumns(header);
  if (ti < 0 || ci < 0 || wi < 0) {
    throw new Error("表头需包含：时间、城市、谁（或 time, city, who）三列");
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (parts.length < Math.max(ti, ci, wi) + 1) continue;
    rows.push({
      time: parts[ti] || "",
      city: parts[ci] || "",
      who: parts[wi] || "",
    });
  }
  return rows.filter((r) => r.city);
}

async function handleCsvFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  setStatus("读取文件中…");
  const text = await file.text();
  let rows;
  try {
    rows = parseCsvText(text);
  } catch (err) {
    setStatus(err.message, "error");
    e.target.value = "";
    return;
  }
  if (rows.length === 0) {
    setStatus("没有有效数据行", "error");
    e.target.value = "";
    return;
  }
  setStatus(`共 ${rows.length} 行，正在地理编码（请勿关闭页面）…`);
  let ok = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const { lat, lng } = await geocodeCity(r.city);
      state.trips.push({
        id: Date.now() + Math.random() + i,
        time: r.time,
        city: r.city,
        who: r.who,
        lat,
        lng,
      });
      ok++;
      setStatus(`地理编码 ${i + 1}/${rows.length}…`);
    } catch {
      setStatus(`第 ${i + 1} 行「${r.city}」未找到坐标，已跳过`, "error");
    }
    if (i < rows.length - 1) await new Promise((res) => setTimeout(res, GEO_DELAY_MS));
  }
  saveTrips();
  renderTripList();
  renderMarkers();
  setStatus(`完成：成功 ${ok} 条`, "ok");
  e.target.value = "";
}

function exportCsv() {
  if (state.trips.length === 0) {
    setStatus("没有数据可导出", "error");
    return;
  }
  const header = "时间,城市,谁,纬度,经度\n";
  const body = state.trips
    .map((t) =>
      [t.time, t.city, t.who, t.lat, t.lng]
        .map((x) => {
          const s = String(x ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob(["\ufeff" + header + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "travel_footprint.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("已下载 CSV", "ok");
}

function clearAll() {
  if (!confirm("确定清空所有足迹？")) return;
  state.trips = [];
  saveTrips();
  renderTripList();
  renderMarkers();
  setStatus("已清空", "ok");
}

document.addEventListener("DOMContentLoaded", () => {
  state.trips = loadTrips();

  // 必须先绑定：若地图初始化抛错，添加/上传仍可用
  const form = document.getElementById("add-form");
  if (form) {
    form.addEventListener("submit", addTripFromForm);
  }
  document.getElementById("csv-file").addEventListener("change", handleCsvFile);
  document.getElementById("btn-export").addEventListener("click", exportCsv);
  document.getElementById("btn-clear").addEventListener("click", clearAll);

  renderTripList();

  try {
    initMaps();
    renderMarkers();
  } catch (err) {
    console.error(err);
    setStatus(
      (err && err.message) || "地图初始化失败：请检查网络能否访问 jsDelivr（Leaflet）",
      "error"
    );
  }

  window.addEventListener("resize", () => {
    if (mapChina) mapChina.invalidateSize();
  });
});
