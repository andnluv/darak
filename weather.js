/** DARAK — 날씨·분위기 효과 (v1.3.0).
 *
 * Independent of every other module (imports nothing from them). Draws a click-through layer between the
 * SillyTavern background (#bg1) and the chat panel (#sheld): rain / snow / fog / cloud / thunderstorm plus
 * floating petals, leaves, fireflies, embers, stars. Nothing in the chat data or the SillyTavern settings is touched.
 *
 * The choice (weather + mood) is stored per chat in chat metadata (`darak_weather`), so every chat keeps its own sky.
 * Look and amount (세기·양·농도·속도) are global settings of this module.
 */
export const WEATHERS = [['none', '없음'], ['cloudy', '흐림'], ['rain', '비'], ['snow', '눈'], ['fog', '안개'], ['storm', '뇌우']];
export const MOODS = [['none', '없음'], ['petal', '꽃잎'], ['leaf', '낙엽'], ['firefly', '반딧불'], ['ember', '불똥'], ['star', '별빛']];
export const LEVELS = [['lo', '약'], ['mid', '보통'], ['hi', '강']];
export const TONES = [['auto', '자동'], ['light', '밝은 화면'], ['dark', '어두운 화면']];
export const DEFAULT_WEATHER = Object.freeze({ level: 'mid', amount: 1, opacity: 0.35, speed: 1, flash: true, tone: 'auto' });
const META_KEY = 'darak_weather';
const LV = { lo: 0.45, mid: 1, hi: 1.85 };
// 1920×1080 화면에서 세기 '보통', 양 1.0일 때의 개수. 화면 넓이에 비례해 줄인다.
const BASE = { rain: 220, snow: 140, petal: 70, leaf: 40, firefly: 36, ember: 60, star: 120 };
const MAX_PARTICLES = { pc: 700, mobile: 320 };
const clamp = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const has = (list, v) => list.some(x => x[0] === v);

export function normalizeWeather(raw = {}) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
        level: has(LEVELS, r.level) ? r.level : DEFAULT_WEATHER.level,
        amount: clamp(r.amount, 0.3, 2, DEFAULT_WEATHER.amount),
        opacity: clamp(r.opacity, 0.1, 0.6, DEFAULT_WEATHER.opacity),
        speed: clamp(r.speed, 0.4, 1.6, DEFAULT_WEATHER.speed),
        flash: r.flash !== false,
        tone: has(TONES, r.tone) ? r.tone : DEFAULT_WEATHER.tone,
    };
}
/** 채팅에 저장된 값을 허용된 이름만 남기고 읽는다. */
export function normalizeSelection(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { weather: has(WEATHERS, r.weather) ? r.weather : 'none', mood: has(MOODS, r.mood) ? r.mood : 'none' };
}

// ---- Lucide 아이콘 (ISC 라이선스) — 선 굵기 1.5 ----
const ICONS = {
    none: '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
    cloudy: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    rain: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>',
    snow: '<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>',
    fog: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 17H7"/><path d="M17 21H9"/>',
    storm: '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>',
    petal: '<path d="M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1"/><circle cx="12" cy="8" r="2"/><path d="M12 10v12"/><path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z"/><path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z"/>',
    leaf: '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
    firefly: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
    ember: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
};
function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.5'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || ''; // 위 상수만 들어간다
    return s;
}
const el = (tag, cls = '', text = '') => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
const R = (a, b) => a + Math.random() * (b - a);
/** '#rrggbb' / 'rgb(...)' / 'rgba(...)' → [r,g,b] (못 읽으면 null) */
function parseColor(s) {
    s = String(s || '').trim();
    let m = /^#([0-9a-f]{6})$/i.exec(s); if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    m = /^#([0-9a-f]{3})$/i.exec(s); if (m) return [...m[1]].map(c => parseInt(c + c, 16));
    m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s); if (m) return [+m[1], +m[2], +m[3]];
    return null;
}

export class Weather {
    constructor({ getSettings, save } = {}) {
        this.getSettings = getSettings; this.save = save || (() => {});
        this.enabled = false; this.sel = { weather: 'none', mood: 'none' };
        this.onChange = null; this.onMessage = null;
        this.P = []; this.fog = []; this.W = 0; this.H = 0; this.DPR = 1; this.T = 0;
        this.raf = 0; this.last = 0; this.acc = 0; this.nextBolt = 0; this.dark = false; this.tick = 0; this.accent = [90, 106, 160];
        this.mqMobile = window.matchMedia('(max-width: 1000px), (pointer: coarse)');
        this.mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.onMedia = () => { this.resize(); this.rebuild(); };
        this.onVisible = () => { if (!document.hidden) { this.last = performance.now(); this.acc = 0; this.ensureLoop(); } };
        this.onFrame = now => this.frame(now);
    }
    ctx() { return window.SillyTavern?.getContext?.(); }
    mobile() { return this.mqMobile.matches; }
    /** 동작 줄이기: 기기 설정이거나 다락방 모바일 최적화의 '애니메이션 줄이기'가 켜진 경우. 이때는 멈춘 한 장면만 그린다. */
    reduced() { return this.mqMotion.matches || (document.documentElement.dataset.ttkOpt || '').split(' ').includes('motion'); }

    // ---- 켜기 / 끄기 ----
    start() {
        if (this.enabled) return; this.enabled = true;
        this.layer = el('div'); this.layer.id = 'ttk-wx'; this.layer.setAttribute('aria-hidden', 'true');
        this.canvas = el('canvas'); this.cx = this.canvas.getContext('2d'); this.tint = el('div', 'ttk-wx-tint');
        this.layer.append(this.canvas, this.tint);
        this.flashEl = el('div'); this.flashEl.id = 'ttk-wx-flash'; this.flashEl.setAttribute('aria-hidden', 'true');
        const bg = document.getElementById('bg1'); // 같은 z-index(-1)에서 배경 바로 뒤에 놓여 배경 위에 그려진다.
        if (bg?.parentNode) bg.after(this.layer); else document.body.prepend(this.layer);
        document.body.append(this.flashEl);
        const c = this.ctx(), ev = c?.eventSource, T = c?.eventTypes || {};
        this.handlers = [[T.CHAT_CHANGED, () => this.loadChat()]].filter(h => h[0]);
        for (const [t, f] of this.handlers) ev?.on?.(t, f);
        this.mqMobile.addEventListener('change', this.onMedia); this.mqMotion.addEventListener('change', this.onMedia);
        document.addEventListener('visibilitychange', this.onVisible);
        this.onResize = () => { clearTimeout(this.rt); this.rt = setTimeout(() => { this.resize(); this.rebuild(); }, 200); };
        window.addEventListener('resize', this.onResize);
        this.optObs = new MutationObserver(() => this.rebuild()); this.optObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ttk-opt'] });
        this.sel = this.readChat(); this.resize(); this.rebuild();
    }
    stop() {
        if (!this.enabled) return; this.enabled = false;
        cancelAnimationFrame(this.raf); this.raf = 0; clearTimeout(this.rt); clearTimeout(this.ft);
        const ev = this.ctx()?.eventSource; for (const [t, f] of this.handlers || []) ev?.removeListener?.(t, f);
        this.mqMobile.removeEventListener('change', this.onMedia); this.mqMotion.removeEventListener('change', this.onMedia);
        document.removeEventListener('visibilitychange', this.onVisible); window.removeEventListener('resize', this.onResize);
        this.optObs?.disconnect(); this.optObs = null;
        this.layer?.remove(); this.flashEl?.remove(); this.layer = this.flashEl = this.canvas = this.cx = this.tint = null;
        this.P = []; this.fog = [];
    }
    /** 설정(세기·양·농도·속도·밝기)이 바뀌었을 때 */
    refresh() { if (this.enabled) this.rebuild(); }

    // ---- 채팅별 선택 ----
    readChat() { return normalizeSelection(this.ctx()?.chatMetadata?.[META_KEY]); }
    loadChat() { this.sel = this.readChat(); this.rebuild(); this.onChange?.(this.sel); }
    select(patch) {
        this.sel = normalizeSelection({ ...this.sel, ...patch });
        const c = this.ctx();
        if (c?.chatMetadata) {
            if (this.sel.weather === 'none' && this.sel.mood === 'none') delete c.chatMetadata[META_KEY]; else c.chatMetadata[META_KEY] = { ...this.sel };
            try { c.saveMetadata?.(); } catch { /* 저장 실패해도 화면 효과는 유지 */ }
        }
        if (this.enabled) this.rebuild();
        this.onChange?.(this.sel);
    }

    // ---- 화면 크기 · 입자 ----
    resize() {
        if (!this.canvas) return;
        this.DPR = Math.min(window.devicePixelRatio || 1, this.mobile() ? 1 : 1.5);
        this.W = window.innerWidth; this.H = window.innerHeight;
        this.canvas.width = Math.round(this.W * this.DPR); this.canvas.height = Math.round(this.H * this.DPR);
        this.cx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    }
    detectDark() {
        const s = this.getSettings();
        if (s.tone === 'dark') return true; if (s.tone === 'light') return false;
        // 자동: 글자색이 밝으면 어두운 화면으로 본다(SillyTavern 테마의 본문 글자색 기준).
        const cs = getComputedStyle(document.documentElement);
        const rgb = parseColor(cs.getPropertyValue('--SmartThemeBodyColor')) || parseColor(getComputedStyle(document.body).color) || [220, 220, 220];
        return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.5;
    }
    count(kind) {
        const s = this.getSettings(), area = (this.W * this.H) / (1920 * 1080), lv = kind === 'star' ? 1 : LV[s.level];
        return Math.max(3, Math.round(BASE[kind] * area * lv * s.amount * (this.mobile() ? 0.5 : 1)));
    }
    spawn(kind, fresh) {
        const { W, H } = this, p = { k: kind, x: R(0, W), y: fresh ? R(-H * 0.1, H) : R(-40, -5), ph: R(0, 6.28) };
        switch (kind) {
            case 'rain': p.len = R(14, 30); p.v = R(430, 650); p.a = R(0.6, 1); break;
            case 'snow': p.r = [1.4, 2.2, 3.2][Math.floor(R(0, 3))]; p.v = R(28, 70) * (p.r / 2); p.sw = R(10, 26); p.f = R(0.4, 1.1); break;
            case 'petal': p.rx = R(5, 8); p.ry = p.rx * 0.55; p.v = R(35, 70); p.sw = R(20, 45); p.f = R(0.5, 1.2); p.rot = R(0, 6.28); p.vr = R(-2, 2); p.c = Math.random() < 0.5 ? 'A' : 'B'; break;
            case 'leaf': p.s = R(8, 13); p.v = R(45, 90); p.sw = R(25, 55); p.f = R(0.4, 0.9); p.rot = R(0, 6.28); p.vr = R(-2.5, 2.5); p.c = ['#c9783b', '#b5542e', '#d9a441', '#8a5a2b'][Math.floor(R(0, 4))]; break;
            case 'firefly': p.y = R(H * 0.35, H); p.vx = R(-12, 12); p.vy = R(-8, 8); p.f = R(0.6, 1.6); p.r = R(1.4, 2.2); break;
            case 'ember': p.y = fresh ? R(H * 0.3, H + 10) : H + R(5, 30); p.v = R(30, 80); p.sw = R(8, 20); p.f = R(1, 2.4); p.r = R(0.9, 2); p.life = R(0.6, 1); break;
            case 'star': p.y = R(0, H * 0.6); p.r = Math.random() < 0.85 ? R(0.5, 1.1) : R(1.2, 1.7); p.f = R(0.5, 1.8); break;
        }
        return p;
    }
    rebuild() {
        if (!this.enabled || !this.canvas) return;
        if (!this.W) this.resize();
        const { weather, mood } = this.sel; this.P = []; this.fog = [];
        this.dark = this.detectDark();
        const kinds = [];
        if (weather === 'rain' || weather === 'storm') kinds.push('rain');
        if (weather === 'snow') kinds.push('snow');
        if (mood !== 'none') kinds.push(mood);
        const limit = this.mobile() ? MAX_PARTICLES.mobile : MAX_PARTICLES.pc;
        for (const k of kinds) { const n = Math.min(limit, Math.round(this.count(k) * (weather === 'storm' && k === 'rain' ? 1.3 : 1))); for (let i = 0; i < n; i++) this.P.push(this.spawn(k, true)); }
        if (weather === 'fog') for (let i = 0; i < 8; i++) this.fog.push({ x: R(-0.3, 1) * this.W, y: R(0.35, 1) * this.H, w: R(0.6, 1.1) * this.W, h: R(0.22, 0.4) * this.H, v: R(8, 18) * (Math.random() < 0.5 ? -1 : 1) });
        const aRaw = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeQuoteColor');
        this.accent = parseColor(aRaw) || [90, 106, 160];
        this.applyTint();
        this.nextBolt = performance.now() + R(8000, 20000);
        this.cx.clearRect(0, 0, this.W, this.H);
        if (this.reduced()) { this.draw(0); cancelAnimationFrame(this.raf); this.raf = 0; return; } // 멈춘 한 장면
        this.ensureLoop();
    }
    /** 흐림·뇌우의 화면 어둡힘 */
    applyTint() {
        if (!this.tint) return;
        const s = this.getSettings(), w = this.sel.weather, cl = w === 'cloudy' ? LV[s.level] : w === 'storm' ? 1.2 : 0;
        this.tint.style.background = cl ? (this.dark ? `rgba(6,8,14,${Math.min(0.6, (0.28 * cl * s.opacity) / 0.35)})` : `rgba(70,78,92,${Math.min(0.5, (0.2 * cl * s.opacity) / 0.35)})`) : 'transparent';
    }
    ensureLoop() {
        if (!this.enabled || this.raf || document.hidden || this.reduced()) return;
        if (!this.P.length && !this.fog.length && this.sel.weather !== 'storm') return; // 그릴 것이 없으면 돌지 않는다
        this.last = performance.now(); this.acc = 0; this.raf = requestAnimationFrame(this.onFrame);
    }
    frame(now) {
        this.raf = 0;
        if (!this.enabled || document.hidden || this.reduced()) return;
        if (!this.P.length && !this.fog.length && this.sel.weather !== 'storm') return;
        this.raf = requestAnimationFrame(this.onFrame);
        const cap = this.mobile() ? 1000 / 30 : 1000 / 60;
        this.acc += now - this.last; this.last = now; if (this.acc < cap - 1) return;
        const dt = Math.min(this.acc, 50) / 1000; this.acc = 0; this.T += dt;
        if (++this.tick % 180 === 0) { const d = this.detectDark(); if (d !== this.dark) { this.dark = d; this.applyTint(); } }
        this.draw(dt);
        if (this.sel.weather === 'storm' && now > this.nextBolt) { this.strike(); this.nextBolt = now + R(8000, 20000); }
    }
    /** 번개: 8초 이상 간격, 밝기 30% 이하, 동작 줄이기에서는 쓰지 않는다. */
    strike() {
        const s = this.getSettings(); if (!s.flash || this.reduced() || !this.flashEl) return false;
        const f = this.flashEl; f.style.transition = 'none'; f.style.opacity = String(Math.min(0.3, s.opacity * 0.85));
        clearTimeout(this.ft); this.ft = setTimeout(() => { f.style.transition = 'opacity .35s ease-out'; f.style.opacity = '0'; }, 120);
        return true;
    }
    previewBolt() { return this.sel.weather === 'storm' && this.strike(); }

    draw(dt) {
        const cx = this.cx; if (!cx) return;
        const { W, H, T } = this, s = this.getSettings(), dark = this.dark, O = s.opacity, sp = s.speed, lvl = LV[s.level], weather = this.sel.weather;
        cx.clearRect(0, 0, W, H);
        // 안개: 아래로 갈수록 짙은 옅은 막 + 천천히 흐르는 덩어리
        if (this.fog.length) {
            const c = dark ? '170,180,196' : '232,234,238', k = O * lvl;
            const hz = cx.createLinearGradient(0, 0, 0, H);
            hz.addColorStop(0, `rgba(${c},${Math.min(0.5, k * (dark ? 0.5 : 0.8))})`); hz.addColorStop(1, `rgba(${c},${Math.min(0.75, k * (dark ? 1.2 : 1.8))})`);
            cx.fillStyle = hz; cx.fillRect(0, 0, W, H);
            const a = O * (dark ? 1.3 : 1.9) * lvl;
            for (const f of this.fog) {
                f.x += f.v * dt * sp; if (f.x > W * 1.1) f.x = -f.w; if (f.x < -f.w) f.x = W * 1.1;
                const mx = f.x + f.w / 2, g = cx.createRadialGradient(mx, f.y, 0, mx, f.y, f.w / 2);
                g.addColorStop(0, `rgba(${c},${Math.min(0.85, a)})`); g.addColorStop(1, `rgba(${c},0)`);
                cx.fillStyle = g; cx.save(); cx.translate(mx, f.y); cx.scale(1, f.h / (f.w / 2)); cx.translate(-mx, -f.y); cx.beginPath(); cx.arc(mx, f.y, f.w / 2, 0, 6.29); cx.fill(); cx.restore();
            }
        }
        const angle = s.level === 'hi' || weather === 'storm' ? 0.32 : s.level === 'lo' ? 0.14 : 0.22, tan = Math.tan(angle);
        const ink = dark ? '255,255,255' : '30,38,52';
        cx.lineCap = 'round';
        for (const p of this.P) {
            switch (p.k) {
                case 'rain': {
                    p.y += p.v * dt * sp; p.x += p.v * dt * sp * tan;
                    if (p.y - p.len > H || p.x > W + 40) { Object.assign(p, this.spawn('rain')); p.x = R(-H * tan, W); }
                    cx.strokeStyle = `rgba(${ink},${O * p.a * (dark ? 1 : 0.85)})`; cx.lineWidth = dark ? 1 : 1.1; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.len * tan, p.y - p.len); cx.stroke(); break;
                }
                case 'snow': {
                    p.y += p.v * dt * sp; const x = p.x + Math.sin(T * p.f * sp + p.ph) * p.sw; if (p.y > H + 5) Object.assign(p, this.spawn('snow'));
                    if (!dark) { cx.shadowColor = `rgba(30,40,60,${Math.min(0.7, O * 1.8)})`; cx.shadowBlur = 4; }
                    cx.beginPath(); cx.arc(x, p.y, p.r * (dark ? 1 : 1.25), 0, 6.29); cx.fillStyle = `rgba(255,255,255,${Math.min(1, O * 2.8)})`; cx.fill(); cx.shadowBlur = 0; cx.shadowColor = 'transparent'; break;
                }
                case 'petal': case 'leaf': {
                    p.y += p.v * dt * sp; p.rot += p.vr * dt * sp; const x = p.x + Math.sin(T * p.f * sp + p.ph) * p.sw; if (p.y > H + 12) Object.assign(p, this.spawn(p.k));
                    cx.save(); cx.translate(x, p.y); cx.rotate(p.rot); cx.globalAlpha = Math.min(1, O * 2.4);
                    cx.fillStyle = p.k === 'petal' ? (dark ? (p.c === 'A' ? '#f7c6d0' : '#fbe0e6') : (p.c === 'A' ? '#e2849b' : '#eea7b8')) : p.c;
                    if (p.k === 'petal') { cx.scale(1, Math.abs(Math.cos(T * 2 + p.ph)) * 0.6 + 0.4); cx.beginPath(); cx.ellipse(0, 0, p.rx, p.ry, 0, 0, 6.29); cx.fill(); }
                    else { const r = p.s; cx.scale(1, Math.abs(Math.cos(T * 1.6 + p.ph)) * 0.5 + 0.5); cx.beginPath(); cx.moveTo(-r, 0); cx.quadraticCurveTo(0, -r * 0.7, r, 0); cx.quadraticCurveTo(0, r * 0.7, -r, 0); cx.fill(); cx.strokeStyle = 'rgba(0,0,0,.18)'; cx.lineWidth = 0.6; cx.beginPath(); cx.moveTo(-r, 0); cx.lineTo(r, 0); cx.stroke(); }
                    cx.restore(); cx.globalAlpha = 1; break;
                }
                case 'firefly': {
                    p.vx += R(-20, 20) * dt; p.vy += R(-20, 20) * dt; p.vx = Math.max(-14, Math.min(14, p.vx)); p.vy = Math.max(-10, Math.min(10, p.vy));
                    p.x += p.vx * dt * sp; p.y += p.vy * dt * sp;
                    if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10; if (p.y < H * 0.3) p.vy = Math.abs(p.vy); if (p.y > H) p.vy = -Math.abs(p.vy);
                    const tw = Math.max(0, Math.sin(T * p.f * sp * 2 + p.ph)), a = O * (0.25 + 2 * tw), c = dark ? '226,245,140' : '150,150,10', rr = p.r * 5;
                    const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr); g.addColorStop(0, `rgba(${c},${Math.min(1, a)})`); g.addColorStop(1, `rgba(${c},0)`);
                    cx.fillStyle = g; cx.beginPath(); cx.arc(p.x, p.y, rr, 0, 6.29); cx.fill(); break;
                }
                case 'ember': {
                    p.y -= p.v * dt * sp; p.life -= dt * 0.18 * sp; const x = p.x + Math.sin(T * p.f * sp + p.ph) * p.sw; if (p.y < -10 || p.life <= 0) Object.assign(p, this.spawn('ember'));
                    const fl = 0.6 + 0.4 * Math.sin(T * 9 + p.ph), a = Math.min(1, O * 2.4 * p.life * fl);
                    const g = cx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 3.2); g.addColorStop(0, `rgba(255,196,120,${a})`); g.addColorStop(0.4, `rgba(255,120,40,${a * 0.7})`); g.addColorStop(1, 'rgba(255,90,20,0)');
                    cx.fillStyle = g; cx.beginPath(); cx.arc(x, p.y, p.r * 3.2, 0, 6.29); cx.fill(); break;
                }
                case 'star': {
                    const tw = 0.55 + 0.45 * Math.sin(T * p.f * sp + p.ph);
                    if (dark) { cx.fillStyle = `rgba(255,255,255,${Math.min(1, O * 2.6 * tw)})`; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.29); cx.fill(); }
                    else { const r = p.r * 4; cx.fillStyle = `rgba(${this.accent[0]},${this.accent[1]},${this.accent[2]},${Math.min(1, O * 2.8 * tw)})`; cx.beginPath(); cx.moveTo(p.x, p.y - r); cx.lineTo(p.x + r * 0.28, p.y - r * 0.28); cx.lineTo(p.x + r, p.y); cx.lineTo(p.x + r * 0.28, p.y + r * 0.28); cx.lineTo(p.x, p.y + r); cx.lineTo(p.x - r * 0.28, p.y + r * 0.28); cx.lineTo(p.x - r, p.y); cx.lineTo(p.x - r * 0.28, p.y - r * 0.28); cx.closePath(); cx.fill(); }
                    break;
                }
            }
        }
    }

    // ---- 설정 화면 ----
    buildPanel(btn) {
        const root = el('div', 'ttk-controls'), self = this, S = () => this.getSettings();
        root.append(el('p', 'ttk-note', '배경 위, 채팅 칸 아래에 날씨와 분위기 효과를 깝니다. 고른 날씨와 분위기는 채팅마다 따로 저장되어, 다른 채팅을 열면 그 채팅의 하늘로 바뀝니다. 세기·양·농도·속도는 모든 채팅에 공통입니다. 채팅 내용과 실리태번 설정은 바꾸지 않으며, 끄면 바로 사라집니다.'));
        const state = el('p', 'ttk-note ttk-wx-state'); state.setAttribute('aria-live', 'polite'); root.append(state);
        const group = (title, items, get, set) => {
            const box = el('div', 'ttk-field'); box.append(el('strong', '', title));
            const g = el('div', 'ttk-wx-grid'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', title); const map = {};
            for (const [v, label] of items) { const b = el('button', 'ttk-wx-btn'); b.type = 'button'; b.append(icon(v), el('span', '', label)); b.addEventListener('click', () => set(v)); map[v] = b; g.append(b); }
            box.append(g); root.append(box);
            return () => { for (const [v, b] of Object.entries(map)) b.setAttribute('aria-pressed', String(get() === v)); };
        };
        const paintW = group('날씨', WEATHERS, () => this.sel.weather, v => this.select({ weather: v }));
        const paintM = group('분위기', MOODS, () => this.sel.mood, v => this.select({ mood: v }));
        const lvBox = el('div', 'ttk-field'); lvBox.append(el('strong', '', '세기'));
        const lvSeg = el('div', 'ttk-seg'); lvSeg.setAttribute('role', 'group'); lvSeg.setAttribute('aria-label', '세기'); const lvMap = {};
        for (const [v, label] of LEVELS) { const b = el('button', 'ttk-seg-btn', label); b.type = 'button'; b.addEventListener('click', () => { S().level = v; this.save(); this.refresh(); paint(); }); lvMap[v] = b; lvSeg.append(b); }
        lvBox.append(lvSeg); root.append(lvBox);
        const sliders = el('div', 'ttk-slider-grid'); const outs = [];
        const slider = (label, key, min, max, step, fmt) => {
            const row = el('label', 'ttk-slider'), line = el('span', 'ttk-slider-label'), out = el('output'), input = el('input');
            input.type = 'range'; Object.assign(input, { min, max, step }); line.append(el('strong', '', label), out); row.append(line, input); sliders.append(row);
            input.addEventListener('input', () => { S()[key] = Number(input.value); out.textContent = fmt(S()[key]); this.save(); this.refresh(); });
            outs.push(() => { input.value = S()[key]; out.textContent = fmt(S()[key]); });
        };
        slider('양', 'amount', 0.3, 2, 0.05, v => `${Number(v).toFixed(2)}×`);
        slider('농도', 'opacity', 0.1, 0.6, 0.01, v => `${Math.round(v * 100)}%`);
        slider('속도', 'speed', 0.4, 1.6, 0.05, v => `${Number(v).toFixed(2)}×`);
        root.append(sliders);
        const toneRow = el('label', 'ttk-field'); toneRow.append(el('strong', '', '화면 밝기'));
        const tone = el('select'); for (const [v, label] of TONES) { const o = el('option', '', label); o.value = v; tone.append(o); }
        tone.addEventListener('change', () => { S().tone = tone.value; this.save(); this.refresh(); });
        toneRow.append(tone, el('small', 'ttk-font-status', '효과 색을 밝은 배경용·어두운 배경용 중에서 고릅니다. 자동은 테마의 글자색으로 판단하니, 배경 그림 때문에 효과가 잘 안 보이면 직접 고르세요.'));
        root.append(toneRow);
        const flashRow = el('label', 'ttk-module-row'); const fl = el('span', 'ttk-option-label'); fl.append(el('strong', '', '번개 화면 번쩍임'), el('small', '', '뇌우에서 8초 이상 간격으로, 밝기 30% 이하로 한 번씩 번쩍입니다. 기기의 "동작 줄이기"가 켜져 있으면 쓰지 않습니다.'));
        const flBox = el('input'); flBox.type = 'checkbox'; flBox.addEventListener('change', () => { S().flash = flBox.checked; this.save(); }); flashRow.append(fl, flBox); root.append(flashRow);
        const msg = el('small', 'ttk-font-status'); msg.setAttribute('aria-live', 'polite');
        const actions = el('div', 'ttk-actions');
        actions.append(btn('번개 한 번 보기', () => { msg.textContent = this.previewBolt() ? '' : (this.sel.weather !== 'storm' ? '날씨를 뇌우로 고른 뒤 눌러 주세요.' : this.reduced() ? '"동작 줄이기"가 켜져 있어 번쩍임을 보여 주지 않습니다.' : '"번개 화면 번쩍임"이 꺼져 있습니다.'); }));
        root.append(actions, msg);
        root.append(el('small', 'ttk-font-status', '효과는 휴대폰에서 초당 30장, PC에서 60장까지만 그리고 화면 넓이에 맞춰 개수를 줄입니다. 탭이 가려지면 멈추고, "동작 줄이기"가 켜져 있으면 멈춘 장면만 보여 줍니다.'));
        function paint() {
            paintW(); paintM(); for (const [v, b] of Object.entries(lvMap)) b.setAttribute('aria-pressed', String(S().level === v));
            for (const f of outs) f(); tone.value = S().tone; flBox.checked = S().flash !== false;
            const w = WEATHERS.find(x => x[0] === self.sel.weather)[1], m = MOODS.find(x => x[0] === self.sel.mood)[1];
            state.textContent = self.sel.weather === 'none' && self.sel.mood === 'none' ? '이 채팅은 효과가 없습니다. 아래에서 날씨나 분위기를 고르세요.' : `이 채팅: 날씨 ${w} · 분위기 ${m}`;
        }
        this.onChange = paint; paint();
        return root;
    }
}
