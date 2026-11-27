/**
 * v1.3.4 — 효과 진단. 화면에 실제로 깔린 효과 층(그레인·비네트·날씨)의 상태를 읽어 짧은 글로 돌려준다.
 * 아무것도 바꾸지 않는다. 휴대폰에서 효과가 안 보일 때 이 글을 붙여 넣어 원인을 찾는 용도.
 */
function layer(id) {
    const n = document.getElementById(id);
    if (!n) return `${id}: 없음`;
    const c = getComputedStyle(n), r = n.getBoundingClientRect();
    const parent = n.parentElement ? (n.parentElement.id ? '#' + n.parentElement.id : n.parentElement.tagName.toLowerCase()) : '-';
    return `${id}: 부모 ${parent} · ${c.display}/${c.visibility} · 투명도 ${c.opacity} · z ${c.zIndex} · ${c.position} · ${Math.round(r.width)}×${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}` +
        (n.dataset.p != null ? ` · 입자 ${n.dataset.p} · 프레임 ${n.dataset.f || 0}` : '') + (n.dataset.why ? ` · ${n.dataset.why}` : '');
}
function box(sel) {
    const n = document.querySelector(sel); if (!n) return `${sel}: 없음`;
    const c = getComputedStyle(n);
    return `${sel}: z ${c.zIndex} · ${c.position} · 배경 ${c.backgroundColor} · 흐림 ${c.backdropFilter || c.webkitBackdropFilter || '-'} · 변형 ${c.transform} · 투명도 ${c.opacity}`;
}
export function fxReport() {
    const h = document.documentElement, b = document.body, hc = getComputedStyle(h), bc = getComputedStyle(b);
    const canvas = document.querySelector('#ttk-wx-top canvas');
    const lines = [
        `다락방 효과 진단 · ${new Date().toISOString()}`,
        navigator.userAgent,
        `화면 ${innerWidth}×${innerHeight} · DPR ${devicePixelRatio} · 동작 줄이기 ${matchMedia('(prefers-reduced-motion: reduce)').matches ? '켬' : '끔'} · 최적화 ${h.dataset.ttkOpt || '-'}`,
        `html 표지: ${['ttk-theme', 'ttk-scheme', 'ttk-grain', 'ttk-vignette', 'ttk-enter'].map(k => k + '=' + (h.getAttribute('data-' + k) ?? '-')).join(' ')}`,
        `html: ${hc.position} 변형 ${hc.transform} 필터 ${hc.filter} · body: ${bc.position} 변형 ${bc.transform} 필터 ${bc.filter} contain ${bc.contain} overflow ${bc.overflow}`,
        layer('ttk-fx-grain'), layer('ttk-fx-vig'), layer('ttk-wx'), layer('ttk-wx-top'), layer('ttk-wx-flash'),
        `캔버스: ${canvas ? canvas.width + '×' + canvas.height + ' (표시 ' + Math.round(canvas.getBoundingClientRect().width) + '×' + Math.round(canvas.getBoundingClientRect().height) + ')' : '없음'}`,
        box('#bg1'), box('#sheld'), box('#chat'), box('#top-bar'),
    ];
    // 화면 가운데에 실제로 그려진 맨 위 요소들(클릭 통과 층은 여기 안 잡힌다)
    try { lines.push('가운데 위 요소: ' + document.elementsFromPoint(innerWidth / 2, innerHeight / 2).slice(0, 5).map(n => n.id ? '#' + n.id : n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : '')).join(' > ')); } catch { /* ignore */ }
    return lines.join('\n');
}
/** 진단 버튼 줄: 누르면 결과를 보여 주고 복사한다. */
export function fxDiagRow(el, btn) {
    const wrap = el('div', 'ttk-field ttk-fx-diag'), out = el('textarea'); out.readOnly = true; out.rows = 6; out.hidden = true; out.setAttribute('aria-label', '효과 진단 결과');
    const note = el('small', 'ttk-note', '');
    const b = btn('효과 진단 (결과 복사)', async () => {
        const text = fxReport(); out.value = text; out.hidden = false;
        try { await navigator.clipboard.writeText(text); note.textContent = '복사했습니다. 대화에 붙여 넣어 주세요.'; }
        catch { out.focus(); out.select(); note.textContent = '자동 복사가 막혀 있습니다. 칸 안의 글을 길게 눌러 복사해 주세요.'; }
    });
    wrap.append(b, note, out); return wrap;
}
