/** DARAK — 날씨·분위기 효과 (v1.3.0).
 *
 * Independent of every other module (imports nothing from them). Draws click-through layers: particles above the
 * chat panel (#sheld, z 30) but below drawers (1000+), and the darkening tint behind the chat panel: rain / snow / fog / cloud / thunderstorm plus
 * floating petals, leaves, fireflies, embers, stars. Nothing in the chat data or the SillyTavern settings is touched.
 *
 * v1.5.0: 날씨·분위기는 채팅을 읽어 자동으로 정한다(weather-detect.js). [날씨:…] 표기가 본문 낱말보다 우선이고,
 * 저장값 없이 매번 최근 메시지에서 다시 계산하므로 스와이프·재생성·삭제·채팅 전환에도 맞는다.
 * 사용자 조절은 모듈 ON/OFF와 표기 지시문 ON/OFF뿐이고, 세기·양·농도·속도·번쩍임은 아래 고정값(v1.3 기본값보다 약하게)을 쓴다.
 */
import {detectWeather, TAG_RE} from './weather-detect.js';
export const WEATHERS = [['none', '없음'], ['fog', '흐림·안개'], ['rain', '비'], ['snow', '눈'], ['storm', '뇌우']];
export const MOODS = [['none', '없음'], ['petal', '꽃잎'], ['leaf', '낙엽'], ['firefly', '반딧불'], ['ember', '불똥'], ['star', '별빛']];
export const LEVELS = [['lo', '약'], ['mid', '보통'], ['hi', '강']];
export const DEFAULT_WEATHER = Object.freeze({ prompt: true });
// v1.5.0 고정값. v1.3의 기본값(세기 1 · 양 1 · 농도 35% · 속도 1 · 번쩍임 30%)보다 약하게 둔다.
const FIXED = Object.freeze({ amount: 0.75, opacity: 0.28, speed: 0.85, flashMax: 0.18, boltMin: 12000, boltMax: 25000 });
const LV = { lo: 0.4, mid: 0.8, hi: 1.4 };
const PROMPT_KEY = 'darak_weather';
const PROMPT_TEXT = '[날씨 표기] 장면의 날씨나 분위기가 바뀔 때만 응답 맨 끝에 [날씨:비]처럼 표기를 붙인다. 날씨: 맑음, 흐림, 안개, 비, 폭우, 가랑비, 눈, 폭설, 뇌우. 흩날리는 것이 있으면 [분위기:꽃잎]처럼 붙인다: 꽃잎, 낙엽, 반딧불, 불똥, 별빛, 없음. 바뀌지 않으면 붙이지 않는다.';
// 1920×1080 화면에서 세기 '보통', 양 1.0일 때의 개수. 화면 넓이에 비례해 줄인다.
const BASE = { rain: 220, snow: 140, petal: 70, leaf: 40, firefly: 36, ember: 60, star: 120 };
const MAX_PARTICLES = { pc: 700, mobile: 320 };
const has = (list, v) => list.some(x => x[0] === v);

/** v1.3의 세기·양·농도·속도·화면 밝기·번쩍임 값은 더 쓰지 않으므로 버린다. */
export function normalizeWeather(raw = {}) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { prompt: r.prompt !== false };
}
export function normalizeSelection(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { weather: has(WEATHERS, r.weather) ? r.weather : 'none', level: has(LEVELS, r.level) ? r.level : 'mid', mood: has(MOODS, r.mood) ? r.mood : 'none' };
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
        this.enabled = false; this.sel = { weather: 'none', level: 'mid', mood: 'none' }; this.why = { weather: null, mood: null };
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
        this.layer.append(this.tint);
        // v1.3.3: 입자는 채팅 칸(#sheld, z-index 30) 위로 지나가고, 어둡힘(tint)만 채팅 칸 뒤에 둔다(글씨가 흐려지지 않게).
        this.top = el('div'); this.top.id = 'ttk-wx-top'; this.top.setAttribute('aria-hidden', 'true'); this.top.append(this.canvas);
        this.flashEl = el('div'); this.flashEl.id = 'ttk-wx-flash'; this.flashEl.setAttribute('aria-hidden', 'true');
        const bg = document.getElementById('bg1'); // 같은 z-index(-1)에서 배경 바로 뒤에 놓여 배경 위에 그려진다.
        if (bg?.parentNode) bg.after(this.layer); else document.body.prepend(this.layer);
        document.body.append(this.top, this.flashEl);
        const c = this.ctx(), ev = c?.eventSource, T = c?.eventTypes || {};
        const later = () => this.schedule();
        this.handlers = [[T.CHAT_CHANGED, () => this.loadChat()], ...['CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'MORE_MESSAGES_LOADED'].map(k => [T[k], later])].filter(h => h[0]);
        // 채팅 화면의 [날씨:…] 표기 숨기기. 번역 표시처럼 나중에 붙는 글도 잡도록 채팅 칸만 지켜본다(잠깐 모아서 한 번에).
        const chat = document.getElementById('chat');
        if (chat) { this.tagObs = new MutationObserver(() => { clearTimeout(this.ht); this.ht = setTimeout(() => this.hideTags(), 300); }); this.tagObs.observe(chat, { childList: true, subtree: true, characterData: true }); }
        for (const [t, f] of this.handlers) ev?.on?.(t, f);
        this.mqMobile.addEventListener('change', this.onMedia); this.mqMotion.addEventListener('change', this.onMedia);
        document.addEventListener('visibilitychange', this.onVisible);
        this.onResize = () => { clearTimeout(this.rt); this.rt = setTimeout(() => { this.resize(); this.rebuild(); }, 200); };
        window.addEventListener('resize', this.onResize);
        this.optObs = new MutationObserver(() => this.rebuild()); this.optObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ttk-opt'] });
        this.sel = this.readChat(); this.resize(); this.rebuild(); this.hideTags(); this.syncPrompt(); this.onChange?.(this.sel);
    }
    stop() {
        if (!this.enabled) return; this.enabled = false;
        cancelAnimationFrame(this.raf); this.raf = 0; clearTimeout(this.rt); clearTimeout(this.ft); clearTimeout(this.dt); clearTimeout(this.ht);
        this.tagObs?.disconnect(); this.tagObs = null; this.showTags(); this.syncPrompt();
        const ev = this.ctx()?.eventSource; for (const [t, f] of this.handlers || []) ev?.removeListener?.(t, f);
        this.mqMobile.removeEventListener('change', this.onMedia); this.mqMotion.removeEventListener('change', this.onMedia);
        document.removeEventListener('visibilitychange', this.onVisible); window.removeEventListener('resize', this.onResize);
        this.optObs?.disconnect(); this.optObs = null;
        this.layer?.remove(); this.top?.remove(); this.flashEl?.remove(); this.layer = this.top = this.flashEl = this.canvas = this.cx = this.tint = null;
        this.P = []; this.fog = []; this.onChange?.(this.sel);
    }
    refresh() { if (this.enabled) this.rebuild(); }

    // ---- 채팅을 읽어 날씨 정하기 (v1.5.0) ----
    generating() { const b = document.getElementById('mes_stop'); return !!b && getComputedStyle(b).display !== 'none'; }
    /** 스트리밍 중에는 기다렸다가 응답이 끝난 뒤 한 번만 다시 계산한다. */
    schedule(ms = 300) { if (!this.enabled) return; clearTimeout(this.dt); this.dt = setTimeout(() => { if (this.generating()) { this.schedule(1200); return; } this.loadChat(); }, ms); }
    readChat() {
        const chat = this.ctx()?.chat;
        const list = Array.isArray(chat) ? chat.filter(m => m && !m.is_system && typeof m.mes === 'string').slice(-40).map(m => ({ text: m.mes })) : [];
        const r = detectWeather(list); this.why = r.why;
        return normalizeSelection(r);
    }
    loadChat() {
        const next = this.readChat(), same = next.weather === this.sel.weather && next.level === this.sel.level && next.mood === this.sel.mood;
        this.sel = next; if (!same) this.rebuild(); else this.ensureLoop();
        this.hideTags(); this.onChange?.(this.sel);
    }
    /** AI에게 날씨가 바뀔 때만 표기를 붙여 달라는 한 줄(화자 표기와 같은 방식). 끄거나 모듈이 꺼지면 비운다. */
    syncPrompt() {
        const c = this.ctx(); if (!c?.setExtensionPrompt) return;
        const text = this.enabled && this.getSettings().prompt !== false ? PROMPT_TEXT : '';
        try { c.setExtensionPrompt(PROMPT_KEY, text, c.extension_prompt_types?.IN_CHAT ?? 1, 1, false, c.extension_prompt_roles?.SYSTEM ?? 0); } catch (e) { console.warn('[DARAK] 날씨 표기 지시문 설정 실패', e); }
    }
    /** 채팅 화면에서만 [날씨:…]·[분위기:…]를 숨긴다(span.ttk-wtag). 채팅 데이터는 그대로다. */
    hideTags() {
        const chat = document.getElementById('chat'); if (!chat || !this.enabled) return;
        const hosts = chat.querySelectorAll('.mes_text, .ttk-tr-text');
        for (const host of hosts) {
            if (!host.textContent.includes('[')) continue;
            const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement?.closest('code, pre, .ttk-wtag') ? NodeFilter.FILTER_REJECT : /\[\s*(날씨|weather|분위기|mood)\s*[:：]/i.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
            const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
            for (const node of nodes) {
                const text = node.nodeValue, frag = document.createDocumentFragment(); let at = 0, hit = false;
                for (const m of text.matchAll(new RegExp(TAG_RE.source, 'gi'))) {
                    hit = true; if (m.index > at) frag.append(text.slice(at, m.index));
                    const span = el('span', 'ttk-wtag', m[0]); frag.append(span); at = m.index + m[0].length;
                }
                if (!hit) continue; if (at < text.length) frag.append(text.slice(at));
                node.replaceWith(frag);
            }
        }
    }
    showTags() { for (const s of document.querySelectorAll('#chat .ttk-wtag')) s.replaceWith(document.createTextNode(s.textContent)); }

    // ---- 화면 크기 · 입자 ----
    resize() {
        if (!this.canvas) return;
        this.DPR = Math.min(window.devicePixelRatio || 1, this.mobile() ? 2 : 1.5); // 휴대폰도 2배까지: 1배면 고해상도 화면에서 가는 빗줄기가 뭉개져 거의 안 보인다
        this.W = window.innerWidth; this.H = window.innerHeight;
        this.canvas.width = Math.round(this.W * this.DPR); this.canvas.height = Math.round(this.H * this.DPR);
        this.cx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    }
    detectDark() {
        // 자동: 글자색이 밝으면 어두운 화면으로 본다(SillyTavern 테마의 본문 글자색 기준).
        const cs = getComputedStyle(document.documentElement);
        const rgb = parseColor(cs.getPropertyValue('--SmartThemeBodyColor')) || parseColor(getComputedStyle(document.body).color) || [220, 220, 220];
        return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.5;
    }
    count(kind) {
        // v1.3.4: 면적 비례만 쓰면 휴대폰(1920×1080의 약 14%)에 몇 개밖에 안 남아 효과가 안 보였다 → 작은 화면은 0.55를 바닥으로 둔다.
        const area = Math.max(0.55, (this.W * this.H) / (1920 * 1080)), lv = kind === 'star' ? 1 : LV[this.sel.level];
        return Math.max(3, Math.round(BASE[kind] * area * lv * FIXED.amount));
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
        if (weather === 'fog') for (let i = 0, n = Math.max(3, Math.min(16, Math.round(8 * FIXED.amount * (this.mobile() ? 0.75 : 1)))); i < n; i++) this.fog.push({ x: R(-0.3, 1) * this.W, y: R(0.35, 1) * this.H, w: R(0.6, 1.1) * this.W, h: R(0.22, 0.4) * this.H, v: R(8, 18) * (Math.random() < 0.5 ? -1 : 1) });
        const aRaw = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeQuoteColor');
        this.accent = parseColor(aRaw) || [90, 106, 160];
        this.applyTint();
        this.nextBolt = performance.now() + R(FIXED.boltMin, FIXED.boltMax);
        this.cx.clearRect(0, 0, this.W, this.H);
        if (this.reduced()) { this.draw(0); cancelAnimationFrame(this.raf); this.raf = 0; return; } // 멈춘 한 장면
        this.ensureLoop();
    }
    /** 흐림·뇌우의 화면 어둡힘 */
    applyTint() {
        if (!this.tint) return;
        const w = this.sel.weather, cl = w === 'fog' ? LV[this.sel.level] : w === 'storm' ? 1 : 0, O = FIXED.opacity;
        this.tint.style.background = cl ? (this.dark ? `rgba(6,8,14,${Math.min(0.6, (0.28 * cl * O) / 0.35)})` : `rgba(70,78,92,${Math.min(0.5, (0.2 * cl * O) / 0.35)})`) : 'transparent';
    }
    ensureLoop() {
        if (this.top) { this.top.dataset.p = this.P.length + this.fog.length; this.top.dataset.why = `자동 날씨 ${this.sel.weather}(${this.sel.level})/${this.sel.mood}` + (this.reduced() ? ' · 동작 줄이기로 정지 화면' : '') + (document.hidden ? ' · 탭 숨김' : ''); }
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
        if (this.top && this.tick % 15 === 0) { this.top.dataset.p = this.P.length + this.fog.length; this.top.dataset.f = this.tick; }
        if (this.sel.weather === 'storm' && now > this.nextBolt) { this.strike(); this.nextBolt = now + R(FIXED.boltMin, FIXED.boltMax); }
    }
    /** 번개: 12초 이상 간격, 밝기 18% 이하, 동작 줄이기에서는 쓰지 않는다. */
    strike() {
        if (this.reduced() || !this.flashEl) return false;
        const f = this.flashEl; f.style.transition = 'none'; f.style.opacity = String(FIXED.flashMax);
        clearTimeout(this.ft); this.ft = setTimeout(() => { f.style.transition = 'opacity .35s ease-out'; f.style.opacity = '0'; }, 120);
        return true;
    }

    draw(dt) {
        const cx = this.cx; if (!cx) return;
        const { W, H, T } = this, dark = this.dark, O = FIXED.opacity, sp = FIXED.speed, lvl = LV[this.sel.level], weather = this.sel.weather;
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
        const angle = this.sel.level === 'hi' || weather === 'storm' ? 0.32 : this.sel.level === 'lo' ? 0.14 : 0.22, tan = Math.tan(angle);
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

    // ---- 설정 화면 (v1.5.0: 자동 날씨 · ON/OFF만) ----
    buildPanel() {
        const root = el('div', 'ttk-controls'), S = () => this.getSettings();
        root.append(el('p', 'ttk-note', '채팅을 읽어 날씨(흐림·안개, 비, 눈, 뇌우)와 분위기(꽃잎, 낙엽, 반딧불, 불똥, 별빛)를 자동으로 정합니다. 최근 메시지의 [날씨:비] 같은 표기를 먼저 보고, 표기가 없으면 본문의 날씨 구절("비가 내리고", "눈이 쌓인")로 추정합니다. "비가 그쳤다", "하늘이 갰다"는 날씨 없음으로 봅니다. 날씨는 최근 30개, 분위기는 최근 12개 메시지까지 읽고, 그 안에 단서가 없으면 효과를 끕니다. 세기는 폭우·폭설이면 강, 가랑비면 약으로 자동이고 따로 조절하지 않습니다.'));
        const state = el('p', 'ttk-note ttk-wx-state'); state.setAttribute('aria-live', 'polite'); root.append(state);
        const row = el('label', 'ttk-module-row'); const lab = el('span', 'ttk-option-label');
        lab.append(el('strong', '', 'AI에게 날씨 표기 요청'), el('small', '', '장면의 날씨·분위기가 바뀔 때만 응답 끝에 [날씨:…] 표기를 붙이라는 한 줄을 보냅니다. 표기는 채팅 화면에서 숨기고 채팅 내용에는 남습니다. 끄면 봇이 스스로 쓴 표기와 본문 구절만 읽습니다.'));
        const box = el('input'); box.type = 'checkbox'; box.addEventListener('change', () => { S().prompt = box.checked; this.save(); this.syncPrompt(); });
        row.append(lab, box); root.append(row);
        root.append(el('small', 'ttk-font-status', '효과는 휴대폰에서 초당 30장, PC에서 60장까지만 그리고 화면 넓이에 맞춰 개수를 줄입니다. 탭이 가려지면 멈추고, "동작 줄이기"가 켜져 있으면 멈춘 장면만 보여 주며 번개 번쩍임도 쓰지 않습니다.'));
        const label = (list, v) => list.find(x => x[0] === v)?.[1] || v;
        const why = r => !r ? '' : `${r.back === 0 ? '마지막' : `${r.back}개 전`} 메시지의 ${r.by === 'tag' ? '표기' : '구절'} "${String(r.text).trim().slice(0, 24)}"`;
        const paint = () => {
            box.checked = S().prompt !== false;
            const { weather, level, mood } = this.sel, w = this.why || {};
            if (!this.enabled) { state.textContent = '날씨·분위기 모듈이 꺼져 있습니다.'; return; }
            const parts = [weather === 'none' ? '날씨 없음' : `날씨 ${label(WEATHERS, weather)}(${label(LEVELS, level)})`, mood === 'none' ? '분위기 없음' : `분위기 ${label(MOODS, mood)}`];
            const reasons = [w.weather && `날씨: ${why(w.weather)}`, w.mood && `분위기: ${why(w.mood)}`].filter(Boolean);
            state.textContent = `이 채팅: ${parts.join(' · ')}${reasons.length ? ` · 근거 — ${reasons.join(' / ')}` : ' · 최근 메시지에 날씨 단서가 없습니다.'}`;
        };
        this.onChange = paint; paint();
        return root;
    }
}
