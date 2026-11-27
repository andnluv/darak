/** DARAK — 테마 이미지 교체.
 *
 * Lists every image url() found in the active theme's custom CSS and lets you swap each one for a file
 * from your device, without editing the CSS. Replacements are stored per theme in the browser (IndexedDB),
 * so they follow the theme, survive theme updates, and never touch the theme file itself.
 * Replacements can be saved as named presets and cleaned up when a theme is gone.
 *
 * How a swap is applied: a copy of the custom CSS with the chosen urls replaced is appended as its own
 * <style>, after the original, so it wins the cascade. Turning the module off removes that style.
 */
import { confirmAsk, inputAsk } from './dialogs.js';
const DB_NAME = 'ttk_theme_images', OVERRIDES = 'overrides', PRESETS = 'presets';
const STYLE_ID = 'ttk-themeimg-style';
const SKIP_URL = /\.(woff2?|ttf|otf|eot|css)(\?|#|$)/i;

export const DEFAULT_THEME_IMAGES = Object.freeze({ advanced: false });
export function normalizeThemeImages(raw = {}) { return { advanced: raw?.advanced === true }; }

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const mb = b => (b?.size ? b.size / 1048576 : 0);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 사람이 알아볼 이름: 테마가 변수 옵션으로 적어 둔 라벨 > 쓰이는 규칙의 선택자 > 파일 이름. */
function describeUse(text, before, url) {
    const tail = before.slice(-400);
    // 테마 변수 옵션: {"label": "말랑1", "value": "url(...)"}
    const opt = /"label"\s*:\s*"([^"]{1,40})"\s*,\s*"value"\s*:\s*"\s*$/.exec(tail);
    if (opt) return `${opt[1]} (선택지)`;
    // 테마 변수 기본값: {"displayText": "프사 모양", ... "default": "url(...)"}
    const def = /"displayText"\s*:\s*"([^"]{1,40})"[^{}]*"default"\s*:\s*"\s*$/.exec(tail);
    if (def) return `${def[1]} (기본값)`;
    const open = before.lastIndexOf('{');
    if (open !== -1 && before.lastIndexOf('}') < open) {
        const head = before.slice(0, open), b = Math.max(head.lastIndexOf('}'), head.lastIndexOf('{'));
        const sel = head.slice(b + 1).trim().replace(/\s+/g, ' ');
        // 선택자처럼 보이는 것만 사용(따옴표·쉼표만 남은 조각 등은 제외)
        if (sel && sel.length <= 140 && !/["\[\]]\s*:|^[,;)\]]|"/.test(sel)) return sel;
    }
    const file = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || '').slice(0, 40);
    return file || '(알 수 없음)';
}
/** Every image url() in the css with the selectors that use it. Fonts, stylesheets and @import are skipped. */
export function extractImageUrls(css) {
    const text = String(css || '').replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
    const found = new Map(), re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let m;
    while ((m = re.exec(text))) {
        const url = m[2].trim();
        if (!url || SKIP_URL.test(url) || /googleapis|gstatic/i.test(url)) continue;
        const before = text.slice(0, m.index);
        if (/@import\s*$/i.test(before.trimEnd())) continue;
        const selector = describeUse(text, before, url);
        const e = found.get(url) || { url, selectors: [] };
        if (!e.selectors.includes(selector)) e.selectors.push(selector);
        found.set(url, e);
    }
    return [...found.values()];
}
/** css with each overridden url replaced; `resolve(url)` gives the replacement address. */
export function rewriteCss(css, overrides, resolve) {
    let out = css, changed = false;
    for (const url of Object.keys(overrides)) {
        const re = new RegExp(`url\\(\\s*(['"]?)${escRe(url)}\\1\\s*\\)`, 'g');
        if (re.test(out)) { changed = true; out = out.replace(re, () => `url("${resolve(url)}")`); }
    }
    return changed ? out : null;
}

class Store {
    constructor() { this.db = null; }
    open() {
        if (this.db) return Promise.resolve(this.db);
        if (typeof indexedDB === 'undefined') return Promise.reject(Error('IndexedDB unavailable'));
        return new Promise((res, rej) => {
            let r;
            try { r = indexedDB.open(DB_NAME, 1); } catch (e) { rej(e); return; }
            r.onupgradeneeded = () => { const d = r.result; for (const n of [OVERRIDES, PRESETS]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); };
            r.onsuccess = () => { this.db = r.result; res(this.db); };
            r.onerror = () => rej(r.error);
        });
    }
    async get(store, key, fallback) { const db = await this.open(); return new Promise(res => { const q = db.transaction(store).objectStore(store).get(key); q.onsuccess = () => res(q.result ?? fallback); q.onerror = () => res(fallback); }); }
    async put(store, key, value) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(value, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
    async del(key) { const db = await this.open(); return new Promise(res => { const t = db.transaction([OVERRIDES, PRESETS], 'readwrite'); t.objectStore(OVERRIDES).delete(key); t.objectStore(PRESETS).delete(key); t.oncomplete = () => res(); }); }
    async all() {
        const db = await this.open();
        return new Promise(res => {
            const t = db.transaction([OVERRIDES, PRESETS]), o = t.objectStore(OVERRIDES), p = t.objectStore(PRESETS), ok = o.getAllKeys(), ov = o.getAll(), pk = p.getAllKeys(), pv = p.getAll();
            t.oncomplete = () => {
                const map = new Map();
                (ok.result || []).forEach((k, i) => map.set(k, { size: Object.values(ov.result[i] || {}).reduce((s, b) => s + mb(b), 0), presets: 0 }));
                (pk.result || []).forEach((k, i) => { const e = map.get(k) || { size: 0, presets: 0 }; e.presets = (pv.result[i] || []).length; map.set(k, e); });
                res([...map].map(([theme, v]) => ({ theme, ...v })));
            };
            t.onerror = () => res([]);
        });
    }
    close() { this.db?.close(); this.db = null; }
}

export class ThemeImages {
    constructor({ getSettings, save } = {}) {
        this.getSettings = getSettings; this.save = save; this.store = new Store(); this.enabled = false; this.blobUrls = new Map(); this.tab = 'images'; this.dialog = null;
        this.onWake = () => this.apply();
    }
    ctx() { return window.SillyTavern?.getContext?.(); }
    css() { return document.getElementById('customCSS') || document.getElementById('CustomCSS'); }
    theme() {
        const v = document.getElementById('themes')?.value || this.ctx()?.powerUserSettings?.theme || '';
        return String(v).replace(/\.(css|less)$/i, '') || 'default';
    }
    themeNames() { return [...document.querySelectorAll('#themes option')].map(o => o.value.replace(/\.(css|less)$/i, '')).filter(Boolean); }
    blobUrl(b) { let u = this.blobUrls.get(b); if (!u) { u = URL.createObjectURL(b); this.blobUrls.set(b, u); } return u; }

    // ---- applying ----
    async apply() {
        if (!this.enabled) return;
        const ta = this.css(); document.getElementById(STYLE_ID)?.remove(); if (!ta) return;
        let ov; try { ov = await this.store.get(OVERRIDES, this.theme(), {}); } catch { return; }
        if (!this.enabled) return;
        const out = rewriteCss(ta.value, ov, url => (ov[url] instanceof Blob ? this.blobUrl(ov[url]) : String(ov[url])));
        document.getElementById(STYLE_ID)?.remove();
        if (out) {
            const s = el('style'); s.id = STYLE_ID; s.textContent = `/* DARAK — 테마 이미지 교체 */\n${out}`;
            // Sit right behind the original custom-CSS style so the cascade order against the other styles stays what it was.
            const want = ta.value.trim(), src = document.getElementById('custom-style') || [...document.head.querySelectorAll('style')].find(n => n.id !== STYLE_ID && n.textContent.trim() === want);
            if (src?.parentNode) src.after(s); else document.head.append(s);
        }
        this.stamp = `${this.theme()}\u0000${ta.value.length}`;
    }
    start() {
        if (this.enabled) return; this.enabled = true;
        const c = this.ctx(); this.evName = c?.eventTypes?.SETTINGS_UPDATED; if (this.evName) c.eventSource.on(this.evName, this.onWake);
        document.getElementById('themes')?.addEventListener('change', this.onWake);
        this.css()?.addEventListener('input', this.onWake);
        this.timer = setInterval(() => { const ta = this.css(); if (ta && this.stamp !== `${this.theme()}\u0000${ta.value.length}`) this.apply(); }, 2000);
        // v1.7.2: 요술봉 메뉴에는 「다락방」만 둡니다. 이 기능은 설정 창의 도구에서 엽니다.
        document.getElementById('ttk_themeimg_menu')?.remove();
        this.apply();
    }
    stop() {
        if (!this.enabled) return; this.enabled = false;
        const c = this.ctx(); if (this.evName) c?.eventSource?.removeListener?.(this.evName, this.onWake);
        document.getElementById('themes')?.removeEventListener('change', this.onWake);
        this.css()?.removeEventListener('input', this.onWake);
        clearInterval(this.timer); document.getElementById(STYLE_ID)?.remove(); document.getElementById('ttk_themeimg_menu')?.remove();
        this.dialog?.remove(); this.dialog = null;
        for (const u of this.blobUrls.values()) URL.revokeObjectURL(u); this.blobUrls.clear(); this.store.close();
    }

    // ---- dialog ----
    async open() {
        if (!this.dialog) {
            this.dialog = el('dialog'); this.dialog.id = 'ttk-themeimg'; this.dialog.setAttribute('aria-label', '테마 이미지 교체');
            this.dialog.addEventListener('click', e => { if (e.target === this.dialog) this.dialog.close(); });
            document.body.append(this.dialog);
        }
        if (!this.dialog.open) this.dialog.showModal();
        await this.render();
    }
    async render() {
        const dlg = this.dialog; if (!dlg) return;
        const my = this.rid = (this.rid || 0) + 1, stale = () => this.rid !== my || this.dialog !== dlg; // a newer render replaces this one
        const theme = this.theme(), ta = this.css(), urls = extractImageUrls(ta?.value || '');
        let ov;
        try { ov = await this.store.get(OVERRIDES, theme, {}); } catch { ov = null; }
        if (stale()) return;
        if (ov === null) { // private window / blocked site data: IndexedDB cannot be opened
            dlg.replaceChildren(); const h = el('div', 'ttk-inv-head'), t = el('div', 'ttk-inv-title'); t.append(el('strong', '', '테마 이미지 교체'));
            const x = el('button', 'ttk-inv-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '닫기'); x.addEventListener('click', () => dlg.close()); h.append(t, x);
            const b = el('div', 'ttk-inv-body'); b.append(el('p', 'ttk-inv-note', '이 브라우저에서는 교체한 이미지를 저장할 수 없습니다. 사생활 보호(시크릿) 창이거나 사이트 데이터를 막아 둔 경우입니다. 일반 창에서 사이트 데이터를 허용한 뒤 다시 열어 주세요.'));
            dlg.append(h, b); return;
        }
        dlg.replaceChildren();
        const head = el('div', 'ttk-inv-head'), title = el('div', 'ttk-inv-title'); title.append(el('strong', '', '테마 이미지 교체'), el('small', '', `현재 테마: ${theme}`));
        const acts = el('div', 'ttk-inv-head-actions'), x = el('button', 'ttk-inv-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '닫기'); x.addEventListener('click', () => dlg.close());
        acts.append(x); head.append(title, acts);
        const tabs = el('div', 'ttk-inv-tabs'); tabs.setAttribute('role', 'tablist');
        for (const [id, label] of [['images', '이미지'], ['presets', '프리셋'], ['clean', '정리']]) {
            const b = el('button', 'ttk-inv-tab', label); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(this.tab === id));
            b.addEventListener('click', () => { this.tab = id; this.render(); }); tabs.append(b);
        }
        const body = el('div', 'ttk-inv-body');
        dlg.append(head, tabs, body);
        if (this.tab === 'images') this.renderImages(body, theme, urls, ov);
        else if (this.tab === 'presets') await this.renderPresets(body, theme, ov, stale);
        else await this.renderClean(body, theme, urls, ov, stale);
    }
    renderImages(body, theme, urls, ov) {
        const S = this.getSettings();
        const bar = el('div', 'ttk-inv-tools'), adv = el('label', 'ttk-ti-adv'), box = el('input'); box.type = 'checkbox'; box.checked = S.advanced;
        box.addEventListener('change', () => { S.advanced = box.checked; this.save(); this.render(); });
        adv.append(box, el('span', '', ' 고급 도구 (CSS 링크 직접 바꾸기 · 원본 내려받기)'));
        const reset = el('button', 'ttk-inv-btn', '이 테마 전부 되돌리기'); reset.type = 'button'; reset.disabled = !Object.keys(ov).length;
        reset.addEventListener('click', async () => { if (!(await confirmAsk(`"${theme}" 테마의 이미지 교체를 모두 되돌립니다. 프리셋은 그대로 둡니다.`, { ok: '되돌리기' }))) return; await this.store.put(OVERRIDES, theme, {}); await this.apply(); this.render(); });
        bar.append(adv, reset); body.append(bar);
        const used = Object.values(ov).reduce((n, b) => n + mb(b), 0);
        if (used) body.append(el('small', 'ttk-inv-foot', `이 테마에 교체한 파일 ${Object.keys(ov).length}개 · ${used.toFixed(2)}MB (이 브라우저에 저장)`));
        if (!urls.length) { body.append(el('p', 'ttk-inv-ok', '현재 테마의 사용자 CSS에서 이미지 주소를 찾지 못했습니다. 테마를 고른 뒤 다시 열어 보세요.')); return; }
        const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true; let target = '';
        file.addEventListener('change', async () => {
            const f = file.files[0]; file.value = ''; if (!f || !target) return;
            const cur = await this.store.get(OVERRIDES, theme, {}); cur[target] = f; await this.store.put(OVERRIDES, theme, cur); await this.apply(); this.render();
        });
        body.append(file);
        const list = el('div', 'ttk-ti-list');
        for (const it of [...urls].sort((a, b) => (ov[b.url] !== undefined) - (ov[a.url] !== undefined))) {
            const done = ov[it.url] !== undefined, card = el('div', `ttk-ti-item${done ? ' ttk-ti-on' : ''}`);
            const prev = el('div', 'ttk-ti-prev'), img = el('img'); img.alt = ''; img.loading = 'lazy';
            img.src = done ? (ov[it.url] instanceof Blob ? this.blobUrl(ov[it.url]) : String(ov[it.url])) : it.url; img.addEventListener('error', () => { img.hidden = true; }); prev.append(img);
            const info = el('div', 'ttk-ti-info'); info.append(el('strong', '', it.selectors.slice(0, 3).join(', ') + (it.selectors.length > 3 ? ` 외 ${it.selectors.length - 3}곳` : '')));
            const u = el('small', '', done ? `교체됨 · ${ov[it.url] instanceof Blob ? `${mb(ov[it.url]).toFixed(2)}MB` : '주소'}` : (it.url.startsWith('data:') ? '내장 이미지 데이터' : it.url)); u.setAttribute('aria-label', it.url.startsWith('data:') ? '' : it.url); info.append(u);
            const btns = el('div', 'ttk-ti-btns');
            const pick = el('button', 'ttk-inv-btn', done ? '다른 이미지' : '이미지 선택'); pick.type = 'button'; pick.addEventListener('click', () => { target = it.url; file.click(); }); btns.append(pick);
            if (done) { const back = el('button', 'ttk-inv-btn', '되돌리기'); back.type = 'button'; back.addEventListener('click', async () => { const cur = await this.store.get(OVERRIDES, theme, {}); delete cur[it.url]; await this.store.put(OVERRIDES, theme, cur); await this.apply(); this.render(); }); btns.append(back); }
            if (S.advanced) {
                const link = el('button', 'ttk-inv-btn', '링크 바꾸기'); link.type = 'button';
                link.addEventListener('click', async () => { const next = await inputAsk(`CSS 안의 이 주소를 새 주소로 바꿉니다.\n\n${it.url}`, it.url); if (!next || !next.trim() || next.trim() === it.url) return; const ta = this.css(); ta.value = ta.value.split(it.url).join(next.trim()); ta.dispatchEvent(new Event('input', { bubbles: true })); window.toastr?.info?.('CSS를 고쳤습니다. 테마 저장은 직접 해 주세요.'); this.render(); });
                const dl = el('button', 'ttk-inv-btn', '원본 받기'); dl.type = 'button';
                dl.addEventListener('click', async () => { if (it.url.startsWith('data:')) { window.toastr?.warning?.('내장 이미지 데이터는 내려받을 수 없습니다.'); return; } try { const r = await fetch(it.url); if (!r.ok) throw Error(); const b = await r.blob(), a = el('a'); a.href = URL.createObjectURL(b); a.download = it.url.split('/').pop().split('?')[0] || 'image'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch { window.open(it.url, '_blank', 'noopener'); } });
                btns.append(link, dl);
            }
            card.append(prev, info, btns); list.append(card);
        }
        body.append(list);
    }
    async renderPresets(body, theme, ov, stale) {
        const presets = await this.store.get(PRESETS, theme, []);
        if (stale()) return;
        const add = el('button', 'ttk-inv-btn', '지금 설정을 프리셋으로 저장'); add.type = 'button'; add.disabled = !Object.keys(ov).length;
        add.addEventListener('click', async () => { const name = await inputAsk('프리셋 이름'); if (!name?.trim()) return; presets.push({ id: uid(), name: name.trim().slice(0, 40), data: { ...ov } }); await this.store.put(PRESETS, theme, presets); this.render(); });
        body.append(add);
        if (!Object.keys(ov).length) body.append(el('small', 'ttk-inv-foot', '교체한 이미지가 있어야 저장할 수 있습니다.'));
        const total = presets.reduce((n, p) => n + Object.values(p.data || {}).reduce((m, b) => m + mb(b), 0), 0);
        body.append(el('small', 'ttk-inv-foot', `프리셋은 이미지 파일의 복사본을 따로 저장하므로 프리셋을 만들 때마다 용량이 늘어납니다.${presets.length ? ` 이 테마의 프리셋 합계 ${total.toFixed(2)}MB` : ''}`));
        if (!presets.length) { body.append(el('p', 'ttk-inv-ok', '이 테마에 저장된 프리셋이 없습니다.')); return; }
        const list = el('div', 'ttk-inv-list');
        for (const p of presets) {
            const row = el('div', 'ttk-inv-row'), main = el('div', 'ttk-inv-row-main'); main.append(el('strong', '', p.name), el('small', '', `이미지 ${Object.keys(p.data || {}).length}개 · ${Object.values(p.data || {}).reduce((n, b) => n + mb(b), 0).toFixed(2)}MB`));
            const b = el('div', 'ttk-inv-badges');
            const use = el('button', 'ttk-inv-btn', '적용'), ren = el('button', 'ttk-inv-btn', '이름'), del = el('button', 'ttk-inv-btn', '삭제'); for (const x of [use, ren, del]) x.type = 'button';
            use.addEventListener('click', async () => { if (!(await confirmAsk(`프리셋 "${p.name}"을 적용합니다. 지금의 교체 설정은 덮어씁니다.`, { ok: '적용' }))) return; await this.store.put(OVERRIDES, theme, { ...p.data }); await this.apply(); this.tab = 'images'; this.render(); });
            ren.addEventListener('click', async () => { const n = await inputAsk('새 이름', p.name); if (!n?.trim()) return; p.name = n.trim().slice(0, 40); await this.store.put(PRESETS, theme, presets); this.render(); });
            del.addEventListener('click', async () => { if (!(await confirmAsk(`프리셋 "${p.name}"을 지웁니다.`, { ok: '지우기', danger: true }))) return; await this.store.put(PRESETS, theme, presets.filter(x => x !== p)); this.render(); });
            b.append(use, ren, del); row.append(main, b); list.append(row);
        }
        body.append(list);
    }
    async renderClean(body, theme, urls, ov, isStale) {
        const live = new Set(urls.map(u => u.url)), stale = Object.keys(ov).filter(k => !live.has(k)), staleMb = stale.reduce((s, k) => s + mb(ov[k]), 0);
        const a = el('section', 'ttk-ti-card'); a.append(el('strong', '', '현재 테마의 쓰지 않는 교체 데이터'), el('p', 'ttk-ti-p', 'CSS에서 이미지 주소가 사라졌는데 교체 파일만 남은 항목입니다.'), el('p', 'ttk-ti-p', `${stale.length}개 · ${staleMb.toFixed(2)}MB`));
        const go = el('button', 'ttk-inv-btn', '정리하기'); go.type = 'button'; go.disabled = !stale.length;
        go.addEventListener('click', async () => { const cur = await this.store.get(OVERRIDES, theme, {}); for (const k of stale) delete cur[k]; await this.store.put(OVERRIDES, theme, cur); await this.apply(); this.render(); });
        a.append(go); body.append(a);
        const st = el('section', 'ttk-ti-card'); st.append(el('strong', '', '브라우저 저장소'));
        const stat = el('p', 'ttk-ti-p', '확인 중…'); st.append(stat); body.append(st);
        navigator.storage?.estimate?.().then(e => { stat.textContent = e?.quota ? `이 사이트가 쓰는 공간 ${(e.usage / 1048576).toFixed(1)}MB / 허용 약 ${(e.quota / 1048576).toFixed(0)}MB (교체 이미지 외 다른 데이터 포함)` : '사용량을 알 수 없습니다.'; }).catch(() => { stat.textContent = '사용량을 알 수 없습니다.'; });
        if (!navigator.storage?.estimate) stat.textContent = '이 브라우저는 사용량을 알려 주지 않습니다.';
        const names = new Set([...this.themeNames(), theme]), all = await this.store.all();
        if (isStale()) return;
        const ghosts = all.filter(x => !names.has(x.theme));
        const g = el('section', 'ttk-ti-card'); g.append(el('strong', '', '지워진 테마의 남은 데이터'), el('p', 'ttk-ti-p', '테마 목록에서 사라졌는데 교체 이미지나 프리셋이 남은 테마입니다.'));
        if (!ghosts.length) g.append(el('p', 'ttk-ti-p', '남은 데이터가 없습니다.'));
        for (const x of ghosts) {
            const row = el('div', 'ttk-inv-row'), main = el('div', 'ttk-inv-row-main'); main.append(el('strong', '', x.theme), el('small', '', `${x.size.toFixed(2)}MB · 프리셋 ${x.presets}개`));
            const del = el('button', 'ttk-inv-btn', '지우기'); del.type = 'button';
            del.addEventListener('click', async () => { if (!(await confirmAsk(`"${x.theme}"의 교체 이미지와 프리셋을 모두 지웁니다. 되돌릴 수 없습니다.`, { ok: '지우기', danger: true }))) return; await this.store.del(x.theme); this.render(); });
            row.append(main, del); g.append(row);
        }
        body.append(g);
    }
}
