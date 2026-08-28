// =====================================================================
// BPD Doskasi — umumiy yordamchi funksiyalar
// =====================================================================
import { monthName, localeCode, t } from "./i18n.js";

export const MM = ["01","02","03","04","05","06","07","08","09","10","11","12"];

export function escapeHtml(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

export function currentMonth(){
  const d = new Date();
  return d.getFullYear() + "-" + MM[d.getMonth()];
}
export function monthYear(ym){
  const [y,m] = ym.split("-");
  return monthName(parseInt(m,10)-1) + " " + y;
}
export function shiftMonth(ym, delta){
  let [y,m] = ym.split("-").map(Number); m -= 1; m += delta;
  while(m<0){ m+=12; y--; } while(m>11){ m-=12; y++; }
  return y + "-" + MM[m];
}
// So'nggi n oyni (jorii oy bilan tugaydigan), eskisidan yangisiga qarab tartiblab qaytaradi.
export function lastNMonths(n){
  const cur = currentMonth();
  const out = [];
  for (let i = n-1; i >= 0; i--) out.push(shiftMonth(cur, -i));
  return out;
}

export function fmtDateTime(tsOrDate){
  if (!tsOrDate) return "";
  const d = tsOrDate.toDate ? tsOrDate.toDate() : new Date(tsOrDate);
  return d.toLocaleString(localeCode(), { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
export function fmtDate(dateStr){
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(localeCode(), { day:"2-digit", month:"2-digit", year:"numeric" });
}
export function todayStr(){
  const d = new Date();
  return d.getFullYear() + "-" + MM[d.getMonth()] + "-" + String(d.getDate()).padStart(2,"0");
}
export function daysUntil(dateStr){
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((target - now) / 86400000);
}

/* Rasmni siqib, kichik base64 data-URI ga aylantiradi (Firestore hujjat
   hajmi cheklovi ~1MB bo'lgani uchun; maqsad ~ 150-400KB atrofida). */
export function compressImageFile(file, maxDim, quality){
  maxDim = maxDim || 1000; quality = quality || 0.62;
  return new Promise((resolve, reject) => {
    if (!file) { resolve(null); return; }
    if (!file.type || !file.type.startsWith("image/")) { reject(new Error(t("err.notImage"))); return; }
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t("err.cantReadFile")));
    reader.onload = () => {
      img.onerror = () => reject(new Error(t("err.cantOpenImage")));
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
        else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

let toastTimer = null;
export function toast(msg, isErr){
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = "toast show" + (isErr ? " toast-err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("show"); }, 3200);
}

export function initials(name){
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0,2).map(p => p[0]).join("").toUpperCase();
}

export const ICONS = {
  shield: '<polygon points="12,2 19,5.2 19,12 12,22 5,12 5,5.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><polyline points="8.7,12.3 11,14.6 15.5,9.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  people: '<circle cx="8.5" cy="7.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="12" width="9" height="7" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="16.5" cy="8.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M13.5 19v-2.2c0-2 1.6-3.3 4-3.3s4 1.3 4 3.3V19" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  target: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="12" y1="12" x2="12" y2="6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="12" y1="12" x2="16" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  coin: '<line x1="5" y1="19" x2="5" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="19" x2="12" y2="8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="19" y1="19" x2="19" y2="4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  leaf: '<polygon points="12,3 19,18 5,18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><line x1="12" y1="18" x2="12" y2="21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  users: '<circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 19v-1.5c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4V19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="17" cy="9" r="2.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M14.8 19v-1.2c0-1.6 1.3-2.9 3-3.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  board: '<rect x="3.5" y="4" width="17" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="3.5" y1="9" x2="20.5" y2="9" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="4" x2="8" y2="9" stroke="currentColor" stroke-width="1.5"/>',
  link: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  check: '<path d="M4 12.5l5 5L20 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  bell: '<path d="M6 10a6 6 0 0112 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 18.5a2 2 0 004 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  warn: '<path d="M12 3.5 21 19.5H3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><line x1="12" y1="9.5" x2="12" y2="14.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/>',
  chart: '<rect x="4" y="13" width="3.4" height="7" rx="1" fill="currentColor"/><rect x="10.3" y="8.3" width="3.4" height="11.7" rx="1" fill="currentColor"/><rect x="16.6" y="4.3" width="3.4" height="15.7" rx="1" fill="currentColor"/>'
};
export function iconSvg(name, size){
  size = size || 16;
  return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" aria-hidden="true">' + (ICONS[name] || ICONS.target) + '</svg>';
}

/* ============================================================
   CHARTS — bog'liqlik (kutubxona)siz, sof SVG orqali chiziladi
   ============================================================ */
const CHART_COLOR = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" };

// Oylik holat "chizig'i" — har bir oy uchun bitta rangli katakcha (element qatorida).
export function statusStripSvg(statuses, monthLabels, opts){
  opts = opts || {};
  const cell = opts.cell || 11, gap = opts.gap || 3;
  const n = statuses.length;
  const w = n * cell + (n - 1) * gap, h = cell;
  const cells = statuses.map((s, i) => {
    const x = i * (cell + gap);
    const color = s ? CHART_COLOR[s] : "var(--none-soft)";
    const label = monthLabels && monthLabels[i] ? escapeHtml(monthLabels[i]) : "";
    return '<rect x="'+x.toFixed(1)+'" y="0" width="'+cell+'" height="'+h+'" rx="2.5" fill="'+color+'">' +
      (label ? '<title>'+label+'</title>' : '') + '</rect>';
  }).join("");
  return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" style="display:block;">' + cells + '</svg>';
}

// Donut/ring diagramma — foiz ko'rsatkichi markazida yozuv bilan.
export function donutSvg(percent, opts){
  opts = opts || {};
  const size = opts.size || 84, stroke = opts.stroke || 9;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = percent == null ? 0 : Math.max(0, Math.min(1, percent));
  const dash = c * pct;
  const color = percent == null ? "var(--none)" : (opts.color || (pct >= 1 ? "var(--good)" : pct > 0 ? "var(--warn)" : "var(--bad)"));
  const label = percent == null ? "–" : Math.round(pct * 100) + "%";
  return '<svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'">'
    + '<circle cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" fill="none" stroke="var(--none-soft)" stroke-width="'+stroke+'"/>'
    + (percent != null ? '<circle cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="'+stroke+'" stroke-linecap="round" stroke-dasharray="'+dash.toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 '+(size/2)+' '+(size/2)+')"/>' : '')
    + '<text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" font-size="'+Math.round(size*0.22)+'" font-weight="800" fill="var(--ink)" font-family="IBM Plex Mono, monospace">'+label+'</text>'
    + '</svg>';
}

// Gorizontal ustunli diagramma (masalan: bo'limlar bo'yicha taqqoslash).
export function hBarChartSvg(rows, opts){
  opts = opts || {};
  const w = opts.width || 440, rowH = 24, gap = 12, labelW = opts.labelW || 116;
  const barMax = w - labelW - 46;
  const h = rows.length * (rowH + gap) - gap;
  const bars = rows.map((r, i) => {
    const y = i * (rowH + gap);
    const v = Math.max(0, Math.min(1, r.value || 0));
    const bw = Math.max(2, Math.round(v * barMax));
    const color = v >= 1 ? "var(--good)" : v > 0 ? "var(--warn)" : "var(--none)";
    return '<g>'
      + '<text x="0" y="'+(y+rowH/2+4)+'" font-size="11.5" font-weight="600" fill="var(--ink)">'+escapeHtml(r.label)+'</text>'
      + '<rect x="'+labelW+'" y="'+(y+4)+'" width="'+barMax+'" height="'+(rowH-8)+'" rx="5" fill="var(--none-soft)"/>'
      + '<rect x="'+labelW+'" y="'+(y+4)+'" width="'+bw+'" height="'+(rowH-8)+'" rx="5" fill="'+color+'"/>'
      + '<text x="'+(labelW+barMax+8)+'" y="'+(y+rowH/2+4)+'" font-size="11" font-family=\'IBM Plex Mono, monospace\' fill="var(--muted)">'+escapeHtml(r.sub||"")+'</text>'
      + '</g>';
  }).join("");
  return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'" style="max-width:'+w+'px;">' + bars + '</svg>';
}

// Trend (chiziqli/maydonli) diagramma — masalan oxirgi 6 oylik umumiy bajarilish foizi.
export function lineChartSvg(points, opts){
  opts = opts || {};
  const w = opts.width || 520, h = opts.height || 150, pad = 26, padBottom = 22;
  const n = points.length || 1;
  const stepX = n > 1 ? (w - pad*2) / (n-1) : 0;
  const usableH = h - pad - padBottom;
  const coords = points.map((p,i) => {
    const x = pad + i*stepX;
    const y = p.v == null ? null : pad + (1 - p.v) * usableH;
    return { x, y, label: p.label };
  });
  const valid = coords.filter(c => c.y != null);
  let linePath = "", areaPath = "";
  if (valid.length) {
    linePath = valid.map((c,i) => (i===0?"M":"L") + c.x.toFixed(1) + "," + c.y.toFixed(1)).join(" ");
    areaPath = "M" + valid[0].x.toFixed(1) + "," + (h-padBottom).toFixed(1)
      + " " + valid.map(c => "L" + c.x.toFixed(1) + "," + c.y.toFixed(1)).join(" ")
      + " L" + valid[valid.length-1].x.toFixed(1) + "," + (h-padBottom).toFixed(1) + " Z";
  }
  const dots = valid.map(c => '<circle cx="'+c.x.toFixed(1)+'" cy="'+c.y.toFixed(1)+'" r="3.4" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.5"/>').join("");
  const labels = coords.map(c => '<text x="'+c.x.toFixed(1)+'" y="'+(h-5)+'" font-size="10.5" text-anchor="middle" fill="var(--muted)">'+escapeHtml(c.label)+'</text>').join("");
  return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'" style="max-width:'+w+'px;">'
    + (areaPath ? '<path d="'+areaPath+'" fill="var(--accent-soft)" opacity="0.65"/>' : '')
    + (linePath ? '<path d="'+linePath+'" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' : '')
    + dots + labels
    + '</svg>';
}
