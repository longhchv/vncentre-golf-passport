// Giao diện mới app Handicap (hdcp.vncentre.net) · giai đoạn 1 · Minh · 27/11/2026
// Theo tài liệu "App Handicap – Đánh giá giao diện & đề xuất cải thiện" (anh Long duyệt 27/11/2026):
//   • Thanh dưới 4 mục: Trang chủ · Nhập điểm · Tiến bộ · Tôi
//   • Chưa đăng nhập: bản demo chỉ còn là nút "Xem thử"
//   • Trang chủ: 4 thẻ chỉ số (thẻ đậm: Junior cho các bạn nhỏ, Sân thật cho người lớn) + nút lớn Nhập điểm
//   • Nhập điểm: một đường chung cho Sân thật / Junior / SNAG / Golf 3D; nhập từng hố bằng bàn số và nút −/+
//   • Trang quản trị riêng cho HLV và ban tổ chức: Hội đồng, điểm trẻ em, Golf 3D, nhập điểm giải
// Không thay luồng gửi điểm: dùng lại các màn hình máy chủ cũ (index.html, golf3d.js, plus.js) qua SV.view.
(function () {
  const W = window.WHSrv; if (!W) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fx = x => x == null || isNaN(x) ? '–' : (x < 0 ? '+' + Math.abs(x).toFixed(1) : Number(x).toFixed(1));
  const dmy = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const SV = () => window.SV || {};
  const ctx = () => SV().ctx;
  const PL = () => window.PLUS || {};
  const isStaff = () => { const c = ctx(); return !!(c && (c.admin || (c.staff && c.staff.length))); };
  const isRoomAdmin = () => { const c = ctx(); return !!(c && c.roomAdmin && c.roomAdmin.length); };
  const canImport = () => { const c = ctx(); return !!(c && (c.admin || (c.staff || []).some(s => s.role !== 'club_admin'))); };
  const isMember = () => { const c = ctx(); return !!(c && c.me && c.me.status === 'active'); };
  const tr = () => { if (window.applyLang) { try { window.applyLang(); } catch (e) { } } };
  const KIND = { whs: 'Sân thật', junior: 'Junior', snag: 'SNAG', sim: 'Golf 3D' };
  const PAGES = { 'trang-chu': 'home', 'nhap-diem': 'post', 'tien-bo': 'prog', 'toi': 'me', 'quan-tri': 'admin' };
  const HASH = Object.fromEntries(Object.entries(PAGES).map(([k, v]) => [v, k]));
  const A = window.APP2 = { page: 'home', kind: null, meSub: 'rounds', meKind: null, admTab: null, home: null, full: !!store.get('hdcp-full-card'), wz: {} };

  // ---------- Biểu tượng ----------
  const I = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    post: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    prog: '<path d="M4 19h16"/><path d="M5 15l4-4 3 3 6-7"/><path d="M14 7h4v4"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  };
  const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;

  // ---------- Khung: thanh dưới, thanh trên, các trang ----------
  function build() {
    if ($('nav2')) return;
    const nav = $('nav');
    nav.insertAdjacentHTML('afterend', `<nav id="nav2" aria-label="Điều hướng">
      <button data-p="home">${svg('home')}<span>Trang chủ</span><i class="nb hide" id="v2nbHome"></i></button>
      <button data-p="post" class="v2plus">${svg('post')}<span>Nhập điểm</span></button>
      <button data-p="prog">${svg('prog')}<span>Tiến bộ</span></button>
      <button data-p="me">${svg('me')}<span>Tôi</span></button></nav>`);
    const main = document.querySelector('main');
    main.insertAdjacentHTML('beforeend', ['home', 'post', 'prog', 'me', 'admin'].map(p => `<section id="v2${p}" class="v2 hide"><div class="v2top"></div><div class="v2slot"></div><div class="v2bot"></div></section>`).join(''));
    const bar = document.querySelector('.bar');
    bar.insertAdjacentHTML('beforeend', `<div class="v2tb"><select class="lang" id="v2lang" aria-label="Ngôn ngữ"></select>
      <button class="v2ic" data-go="me:notes" aria-label="Thông báo">${svg('bell')}<i class="nb hide" id="v2nbBell"></i></button>
      <button class="v2av" data-go="me" aria-label="Tài khoản" id="v2av"></button></div>`);
    document.body.insertAdjacentHTML('afterbegin', `<div id="v2demoBar"><span>Bạn đang xem bản thử với dữ liệu mẫu, không lưu lên máy chủ.</span><button class="btn sm" data-v2="undemo">Thoát bản thử</button></div>`);
    $('nav2').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b) go(b.dataset.p); });
    $('v2lang').addEventListener('change', e => { const ls = $('langSel'); if (!ls) return; ls.value = e.target.value; ls.dispatchEvent(new Event('change')); syncLang(); });
  }
  function syncLang() {
    const ls = $('langSel'), v = $('v2lang'); if (!ls || !v) return;
    v.innerHTML = ls.innerHTML; v.value = ls.value;
  }

  // ---------- Chế độ: giao diện mới / bản thử ----------
  const demo = () => sessionStorage.getItem('hdcp-demo') === '1';
  function setDemo(on) {
    try { on ? sessionStorage.setItem('hdcp-demo', '1') : sessionStorage.removeItem('hdcp-demo'); } catch (e) { }
    applyMode();
    if (on) {
      const srv = $('srv'), body = $('srvBody'); if (srv && body && body.parentNode !== srv) srv.appendChild(body);
      SV().view = null;
      if (window.showSec) window.showSec('home'); else { const b = document.querySelector('#nav button[data-t="home"]'); if (b) b.click(); }
      window.scrollTo(0, 0);
    } else route();
  }
  function applyMode() {
    document.body.classList.toggle('v2on', !demo());
    document.body.classList.toggle('v2demo', demo());
  }

  // ---------- Điều hướng ----------
  function go(page, sub) {
    if (page === 'me' && sub) A.meSub = sub;
    const h = '#' + HASH[page] + (page === 'me' && sub ? '/' + sub : '');
    if (location.hash !== h) location.hash = h; else route();
  }
  function parseHash() {
    const raw = (location.hash || '').replace(/^#/, '');
    if (raw === 'srv') return ['me', 'att'];
    const [p, sub] = raw.split('/');
    return [PAGES[p] || 'home', sub || null];
  }
  async function route() {
    if (demo()) return;
    const [page, sub] = parseHash();
    if (page === 'me' && sub) A.meSub = sub;
    A.page = page;
    document.querySelectorAll('main > section.v2').forEach(s => s.classList.toggle('hide', s.id !== 'v2' + page));
    document.querySelectorAll('#nav2 button').forEach(b => b.classList.toggle('on', b.dataset.p === page));
    document.body.classList.toggle('v2adm', page === 'admin');
    document.body.dataset.v2page = page;
    window.scrollTo(0, 0);
    PL().bell = false;
    await enter();
  }
  const slot = () => document.querySelector('#v2' + A.page + ' .v2slot');
  const top = () => document.querySelector('#v2' + A.page + ' .v2top');
  const bot = () => document.querySelector('#v2' + A.page + ' .v2bot');
  function hostSrv(show) {
    const body = $('srvBody'), s = slot(); if (!body || !s) return;
    if (body.parentNode !== s) s.appendChild(body);
    s.classList.toggle('hide', !show);
  }

  // Vào trang: chọn phần máy chủ cần hiện rồi vẽ phần của giao diện mới
  async function enter() {
    const u = W.user();
    if (!u) { hostSrv(true); SV().view = null; SV().tab = 'me'; drawTop(); if (window.srvPaint) window.srvPaint(); return; }
    if (!ctx()) { drawTop(); hostSrv(false); if (window.srvShow) await window.srvShow(); }
    const go2 = (tab, view, show) => { hostSrv(show !== false); drawTop(); return window.srvGo(tab, view); };
    const p = A.page;
    if (p === 'home') { drawTop(); hostSrv(!isMember() && !isStaff() && !isRoomAdmin()); SV().view = 'home'; SV().tab = 'me'; window.srvPaint(); return loadHome(); }
    if (p === 'post') {
      if (!A.kind || A.kindFor !== SV().cur) { A.kind = store.get('hdcp-kind-' + SV().cur) || heroKind(); A.kindFor = SV().cur; }
      if (!isMember() && !isStaff() && !isRoomAdmin()) return go2('me', null);
      const t = { whs: 'play', junior: 'kid', snag: 'kid', sim: 'sim' }[A.kind];
      if (t === 'kid' && window.YS) { window.YS.kind = A.kind; window.YS.cur = null; }
      return go2(t, 'post');
    }
    if (p === 'prog') return go2('prog', 'prog');
    if (p === 'me') {
      if (A.meSub === 'notes') { hostSrv(false); SV().view = 'notes'; drawTop(); PL().loadNotes && PL().loadNotes(true).then(drawTop); return; }
      if (A.meSub === 'account') { hostSrv(false); SV().view = 'account'; drawTop(); return; }
      if (A.meSub === 'att') return go2('att', 'att');
      if (!isMember()) return go2('me', null);
      if (!A.meKind || A.meKindFor !== SV().cur) { A.meKind = heroKind() === 'junior' ? 'youth' : 'whs'; A.meKindFor = SV().cur; }
      return go2({ whs: 'me', youth: 'kid', sim: 'sim' }[A.meKind] || 'me', 'mine');
    }
    if (p === 'admin') {
      const tabs = adminTabs();
      if (!tabs.length) { hostSrv(false); SV().view = 'admin'; drawTop(); return; }
      if (!tabs.some(t => t[0] === A.admTab)) A.admTab = tabs[0][0];
      return go2(A.admTab, 'admin');
    }
  }

  // ---------- Phần trên mỗi trang ----------
  function golferChips() {
    const c = ctx(); if (!c || !c.golfers || c.golfers.length < 2) return '';
    return `<div class="v2chips v2who" role="group" aria-label="Golfer">${c.golfers.map(g => `<button class="v2chip${g.student_id === SV().cur ? ' on' : ''}" data-v2g="${esc(g.student_id)}">${g.is_self ? '<span>Tôi</span>' : esc(shortName(g.full_name))}</button>`).join('')}</div>`;
  }
  const shortName = n => { const p = String(n || '').trim().split(/\s+/); return p.length > 2 ? p.slice(-2).join(' ') : p.join(' '); };
  function loggedOut() {
    return `<div class="card v2wel"><div class="v2wel-h"><div class="v2wel-i">${svg('prog')}</div><div><h1>Chỉ số golf của bạn, ở một nơi</h1>
      <p class="sub">Sân thật, Junior, SNAG và Golf 3D. Bạn chơi cùng xác nhận điểm, máy chủ tính chỉ số, phụ huynh theo dõi tiến bộ của các con.</p></div></div>
      <div class="acts"><button class="btn ghost" data-v2="demo">Xem thử với dữ liệu mẫu</button></div></div>`;
  }
  function drawTop() {
    syncLang(); badges(); document.body.classList.toggle('v2out', !W.user());
    const u = W.user(), c = ctx();
    const av = $('v2av'); if (av) { const n = c && (c.me ? c.me.full_name : c.golfer ? c.golfer.full_name : ''); av.textContent = n ? n.trim().split(/\s+/).pop().slice(0, 1).toUpperCase() : '?'; }
    const T = top(), B = bot(); if (!T) return;
    const p = A.page;
    if (!u) {
      T.innerHTML = p === 'admin' ? adminHead() + '<p class="sub">Đăng nhập bằng tài khoản có quyền quản trị.</p>' : loggedOut();
      B.innerHTML = ''; tr(); return;
    }
    if (p === 'home') { T.innerHTML = ''; drawHome(); return; }
    if (p === 'post') {
      T.innerHTML = `<div class="ph v2ph"><h1>Nhập điểm</h1><p>Chọn loại vòng, rồi nhập điểm từng hố.</p></div>${golferChips()}
        <div class="v2q">Bạn chơi gì?</div><div class="v2kinds">${['whs', 'junior', 'snag', 'sim'].map(k => `<button class="v2kind${A.kind === k ? ' on' : ''}" data-v2k="${k}" aria-pressed="${A.kind === k}"><b>${KIND[k]}</b><span>${{ whs: 'Chỉ số WHS', junior: 'Tee theo tuổi', snag: 'Bóng mềm, sân ngắn', sim: 'Phòng mô phỏng' }[k]}</span></button>`).join('')}</div>`;
      B.innerHTML = ''; tr(); return;
    }
    if (p === 'prog') {
      T.innerHTML = `<div class="ph v2ph"><h1>Tiến bộ</h1><p>Chỉ số càng thấp là chơi càng tốt.</p></div>${golferChips()}`;
      const lk = (window.srvExtraTabs || []).find(t => t.key === 'look');
      B.innerHTML = lk ? lk.render() : ''; tr(); return;
    }
    if (p === 'me') {
      const m = c && c.me, g = c && c.golfer;
      const subs = [['rounds', 'Vòng của tôi'], ['att', 'Xác nhận'], ['notes', 'Thông báo'], ['account', 'Tài khoản']];
      const nAtt = confirmCount();
      T.innerHTML = `<div class="card v2prof"><div class="v2prof-a">${esc(($('v2av') || {}).textContent || '')}</div><div><b>${esc(m ? m.full_name : g ? g.full_name : (u.email || u.phone || ''))}</b>
        <span>${g ? '<span>Mã VNC</span> ' + esc(g.student_code) : ''}${m ? ' · ' + esc((m.fed && m.fed.short) || '') + (m.club ? ' · ' + esc(m.club.name) : '') : ''}</span></div></div>${golferChips()}
        <div class="seg v2seg" role="tablist">${subs.map(([k, l]) => `<button role="tab" data-v2s="${k}" class="${A.meSub === k ? 'on' : ''}">${l}${k === 'att' && nAtt ? ` <i class="nb">${nAtt}</i>` : ''}${k === 'notes' && PL().unread ? ` <i class="nb">${PL().unread}</i>` : ''}</button>`).join('')}</div>
        ${A.meSub === 'rounds' && isMember() ? `<div class="v2chips">${[['whs', 'Sân thật'], ['youth', 'Junior · SNAG'], ['sim', 'Golf 3D']].map(([k, l]) => `<button class="v2chip${A.meKind === k ? ' on' : ''}" data-v2mk="${k}">${l}</button>`).join('')}</div>` : ''}`;
      B.innerHTML = A.meSub === 'notes' ? (PL().bellPanel ? PL().bellPanel() : '') : A.meSub === 'account' ? accountCard() : '';
      tr(); return;
    }
    if (p === 'admin') {
      const tabs = adminTabs();
      T.innerHTML = adminHead() + (tabs.length ? `<div class="seg v2seg" role="tablist">${tabs.map(([k, l, n]) => `<button role="tab" data-v2a="${k}" class="${A.admTab === k ? 'on' : ''}">${l}${n ? ` <i class="nb">${n}</i>` : ''}</button>`).join('')}</div>`
        : '<div class="card"><div class="empty">Tài khoản này chưa có quyền quản trị. Liên hệ VN Centre nếu anh/chị là HLV hoặc ban tổ chức.</div></div>');
      B.innerHTML = ''; tr();
    }
  }
  const adminHead = () => `<div class="v2admh"><button class="btn ghost sm" data-v2="back">‹ Về app</button><div><h1>Trang quản trị</h1><p class="sub">Dành cho HLV, Hội đồng handicap và ban tổ chức giải.</p></div></div>`;
  function adminTabs() {
    const c = ctx(); if (!c) return [];
    const T = [];
    if (isStaff()) T.push(['com', 'Hội đồng', (c.queue || []).length + (c.pending || []).length]);
    if (isStaff()) T.push(['kid', 'Điểm trẻ em', c.youthPend || 0]);
    if (isStaff() || isRoomAdmin()) T.push(['sim', 'Golf 3D', c.simPend || 0]);
    if (canImport()) T.push(['imp', 'Nhập điểm giải', 0]);
    return T;
  }
  function accountCard() {
    const P = PL(), staffy = isStaff() || isRoomAdmin();
    const push = !('Notification' in window) ? '' : Notification.permission === 'granted' ? '<span class="bd">Đã bật</span>'
      : Notification.permission === 'denied' ? '<span class="bd m">Bị chặn trong trình duyệt</span>' : '<button class="btn sm" data-pl="push">Bật thông báo</button>';
    const inst = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ? '<span class="bd">Đã cài</span>' : '<button class="btn ghost sm" data-v2="install">Cài app</button>';
    return `<div class="card v2acc">
      <div class="svitem"><div><b>Ngôn ngữ</b><span>Đổi ngôn ngữ hiển thị của app.</span></div><div class="svia"><select class="lang" data-v2lang aria-label="Ngôn ngữ">${($('langSel') || {}).innerHTML || ''}</select></div></div>
      <div class="svitem"><div><b>Thông báo trên máy</b><span>Báo khi vòng được xác nhận, có người nhờ xác nhận hoặc chỉ số thay đổi.</span></div><div class="svia">${push}</div></div>
      <div class="svitem"><div><b>Cài app lên điện thoại</b><span>Mở nhanh từ màn hình chính như một app.</span></div><div class="svia">${inst}</div></div>
      ${staffy ? `<div class="svitem"><div><b>Trang quản trị</b><span>Hội đồng, duyệt điểm trẻ em và Golf 3D, nhập điểm giải.</span></div><div class="svia"><button class="btn sm" data-v2="admin">Mở trang quản trị</button></div></div>` : ''}
      <div class="svitem"><div><b>Bản thử</b><span>Xem app với dữ liệu mẫu, không ảnh hưởng tài khoản.</span></div><div class="svia"><button class="btn ghost sm" data-v2="demo">Xem thử</button></div></div>
      <div class="svitem"><div><b>Đăng xuất</b><span>${esc((W.user() || {}).email || (W.user() || {}).phone || '')}</span></div><div class="svia"><button class="btn ghost sm" data-v2="logout">Đăng xuất</button></div></div></div>`;
  }

  // ---------- Trang chủ ----------
  function heroKind() {
    const c = ctx(), g = c && c.golfer, y = new Date().getFullYear();
    if (g && g.birth_year) return y - g.birth_year < 18 ? 'junior' : 'whs';
    const h = A.home;
    if (h && h.cards && h.cards.junior.v != null && h.cards.whs.v == null) return 'junior';
    return 'whs';
  }
  let homeSeq = 0;
  async function loadHome() {
    const c = ctx(); if (!c) return drawHome();
    const m = c.me, key = SV().cur + '|' + (m ? m.id : '');
    if (A.home && A.home.key === key && Date.now() - A.home.at < 30000) return drawHome();
    if (!m || m.status !== 'active') { A.home = { key, at: Date.now(), none: true }; return drawHome(); }
    if (A.homeP && A.homeK === key) return A.homeP;
    const seq = ++homeSeq;
    if (!A.home || A.home.key !== key) { A.home = { key, at: 0, loading: true }; drawHome(); }
    A.homeK = key; A.homeP = loadHome2(m, key, seq).finally(() => { if (A.homeK === key) A.homeP = null; });
    return A.homeP;
  }
  async function loadHome2(m, key, seq) {
    const xt = (window.srvExtraTabs || []).find(t => t.key === 'prog');
    const [, yi, si] = await Promise.all([
      xt && xt.load ? xt.load().catch(() => null) : null,
      W.select('whs_youth_index', 'select=*&member_id=eq.' + m.id).catch(() => []),
      W.select('whs_sim_index', 'select=*&member_id=eq.' + m.id + '&order=brand').catch(() => []),
    ]);
    if (seq !== homeSeq) return;
    const pr = PL().prog && PL().prog.member === m.id ? PL().prog : { p: {}, rec: [] };
    A.home = { key, at: Date.now(), cards: cards(pr.p || {}, yi || [], si || []), rec: pr.rec || [] };
    drawHome();
  }
  // Biến chuỗi điểm thành thay đổi trong khoảng 3 tháng gần nhất
  function trend(pts) {
    const L = (pts || []).filter(p => p && p.v != null).map(p => ({ t: Date.parse(p.d), v: +p.v })).sort((a, b) => a.t - b.t);
    if (!L.length) return null;
    const last = L[L.length - 1];
    if (L.length < 2) return { first: true };
    const cut = last.t - 92 * 864e5;
    let base = L[0], since = false;
    for (const p of L) if (p.t <= cut) { base = p; since = true; }
    if (!since) base = L[0];
    const d = Math.round((last.v - base.v) * 10) / 10;
    return { d, since };
  }
  function cards(p, yi, si) {
    const c = ctx(), ix = c.idx, h = (c.hi || [])[0];
    let whsV = null;
    if (ix && ix.handicap_index != null) whsV = +ix.handicap_index;
    else if (!ix && h && !h.withdrawn && h.hi != null) whsV = +h.hi;
    let whsNeed = '';
    if (whsV == null) whsNeed = ix && ix.min_holes_required ? `Chơi thêm ${Math.max(0, ix.min_holes_required - (ix.holes_posted || 0))} hố để có chỉ số` : 'Nhập điểm để bắt đầu có chỉ số';
    const y = k => yi.find(x => x.kind === k);
    const yv = k => { const x = y(k); return x && x.idx != null ? +x.idx : null; };
    const yneed = (k, unit) => { const x = y(k); return x && x.idx == null && x.need ? `Chơi thêm ${x.need} ${unit} để có chỉ số` : 'Nhập điểm để bắt đầu có chỉ số'; };
    const sim = (si || []).filter(x => x.idx != null).sort((a, b) => String(b.as_of || '').localeCompare(String(a.as_of || '')))[0] || (si || [])[0];
    const simV = sim && sim.idx != null ? +sim.idx : null;
    const simNeed = sim && sim.idx == null ? (sim.need_scores ? `Chơi thêm ${sim.need_scores} vòng để có chỉ số` : 'Nhập điểm để bắt đầu có chỉ số') : 'Nhập điểm để bắt đầu có chỉ số';
    return {
      whs: { v: whsV, need: whsNeed, tr: trend(p.whs) },
      junior: { v: yv('junior'), need: yneed('junior', 'vòng'), tr: trend(p.junior) },
      snag: { v: yv('snag'), need: yneed('snag', 'hố'), tr: trend(p.snag) },
      sim: { v: simV, need: simNeed, tr: sim ? trend((p.sim || {})[sim.brand]) : null, brand: sim ? sim.brand : '' },
    };
  }
  function trendHtml(t) {
    if (!t) return '';
    if (t.first) return '<span class="v2d">Chỉ số đầu tiên</span>';
    if (Math.abs(t.d) < 0.05) return `<span class="v2d">Giữ nguyên ${t.since ? 'trong 3 tháng' : 'từ khi bắt đầu'}</span>`;
    const dn = t.d < 0;
    return `<span class="v2d ${dn ? 'up' : 'dn'}">${dn ? '▼' : '▲'} ${Math.abs(t.d).toFixed(1)} <span>${t.since ? 'trong 3 tháng' : 'từ khi bắt đầu'}</span></span>`;
  }
  function confirmCount() { const c = ctx(); return (PL().queue || []).length + ((c && c.inbox) || []).length; }
  function drawHome() {
    if (A.page !== 'home' || !W.user()) return;
    const T = top(), B = bot(); if (!T) return;
    const c = ctx();
    if (!c) { T.innerHTML = '<div class="card"><p class="note">Đang tải…</p></div>'; B.innerHTML = ''; return; }
    const m = c.me, g = c.golfer;
    const name = (m && m.full_name) || (g && g.full_name) || '';
    let h = `<div class="ph v2ph"><h1><span>Chào</span> ${esc(shortName(name))}</h1><p>Chỉ số của bạn · càng thấp càng giỏi</p></div>${golferChips()}`;
    if (!m || m.status !== 'active') {
      if (isStaff() || isRoomAdmin()) h += `<div class="card"><h2>Tài khoản quản trị</h2><p class="sub">Tài khoản này đang dùng để quản trị. Duyệt điểm, Hội đồng và nhập điểm giải nằm ở trang quản trị.</p><div class="acts"><button class="btn" data-v2="admin">Mở trang quản trị</button></div></div>`;
      T.innerHTML = h; B.innerHTML = ''; tr(); return;
    }
    const H = A.home;
    if (!H || H.loading || !H.cards) h += '<div class="card"><p class="note">Đang tải chỉ số…</p></div>';
    else {
      const hero = heroKind(), order = [hero].concat(['junior', 'snag', 'sim', 'whs'].filter(k => k !== hero));
      h += `<div class="v2grid">${order.map(k => {
        const x = H.cards[k], lab = k === 'sim' && x.brand ? 'Golf 3D · ' + x.brand : KIND[k];
        return `<button class="v2tile${k === hero ? ' hero' : ''}${x.v == null ? ' empty' : ''}" data-v2="tile" data-v="${k}"><span class="k">${esc(lab)}</span>${x.v != null ? `<b class="v n">${fx(x.v)}</b>${trendHtml(x.tr)}` : `<span class="need">${esc(x.need)}</span>`}</button>`;
      }).join('')}</div><p class="v2hint">Bấm vào thẻ để xem diễn biến.</p>`;
    }
    const o = c.openRound;
    if (o) h += `<div class="card v2open"><div><b>Bạn đang có vòng chưa nộp điểm</b><span>${esc(o.course ? o.course.name : '')} · ${dmy(o.played_on || o.registered_at)}</span></div><button class="btn" data-v2="kind" data-v="whs">Nhập điểm tiếp</button></div>`;
    h += `<button class="v2cta" data-v2="kind" data-v="${heroKind()}">＋ <span>Nhập điểm vòng mới</span></button>`;
    T.innerHTML = h;
    // Cần xác nhận + vòng gần đây
    const Q = (PL().queue || []).map(q => ({ who: q.golfer, sub: `${KIND[q.kind === 'sim' ? 'sim' : q.sub] || ''} · ${dmy(q.played_on)} · ${q.ref_name || ''}` }))
      .concat(((c.inbox) || []).map(r => ({ who: r.member ? r.member.full_name : '', sub: `${KIND.whs} · ${dmy(r.played_on)} · ${r.course ? r.course.name : ''}` })));
    let b = '';
    if (Q.length) b += `<div class="card v2list"><h2><span>Cần bạn xác nhận</span> <i class="nb">${Q.length}</i></h2>${Q.slice(0, 4).map(q => `<div class="v2it"><div><b>${esc(q.who)}</b><span>${esc(q.sub)}</span></div><button class="btn sm" data-go="me:att">Xem</button></div>`).join('')}${Q.length > 4 ? `<button class="more" data-go="me:att">Xem tất cả ${Q.length}</button>` : ''}</div>`;
    const R = H && H.rec ? H.rec.slice(0, 3) : [];
    b += `<div class="card v2list"><h2>Vòng gần đây</h2>${R.length ? R.map(r => `<div class="v2it"><div><b>${esc(KIND[r.kind] || '')} · ${esc(r.name || '')}</b><span>${dmy(r.d)}</span></div>${r.has ? '<span class="bd">Có thống kê</span>' : ''}</div>`).join('') + `<button class="more" data-go="me:rounds">Xem tất cả vòng</button>` : '<div class="empty">Chưa có vòng nào. Bấm "Nhập điểm vòng mới" để bắt đầu.</div>'}</div>`;
    B.innerHTML = b; tr();
  }
  function badges() {
    const n = confirmCount(), a = $('v2nbHome'); if (a) { a.textContent = n; a.classList.toggle('hide', !n); }
    const u = PL().unread || 0, b = $('v2nbBell'); if (b) { b.textContent = u; b.classList.toggle('hide', !u); }
  }

  // ---------- Nhập điểm từng hố: bàn số + nút −/+ ----------
  function wizard() {
    const box = document.querySelector('#v2post #srvBody'); const old = document.querySelector('#v2post .wz');
    const grid = box && box.querySelector('.svholes');
    if (!grid) { if (old) old.remove(); return; }
    const ins = [...grid.querySelectorAll('input')]; if (!ins.length) return;
    const cls = ins[0].className, kind = /\byin\b/.test(cls) ? 'youth' : /\bg3in\b/.test(cls) ? 'sim' : 'whs';
    const holes = ins.map((inp, i) => {
      const lab = inp.closest('.hole'), n = lab && lab.querySelector('span') ? parseInt((lab.querySelector('span').textContent.match(/\d+/) || [])[0]) : i + 1;
      const par = inp.dataset.par ? +inp.dataset.par : lab && lab.querySelector('small') ? parseInt((lab.querySelector('small').textContent.match(/\d+/) || [])[0]) : null;
      return { inp, n: n || i + 1, par: par || null };
    });
    const key = kind + '|' + holes.map(h => h.n + ':' + h.par).join(',');
    if (!A.wz[key]) A.wz = { [key]: { i: 0 } };
    const st = A.wz[key];
    if (st.i >= holes.length) st.i = holes.length - 1;
    grid.classList.toggle('wz-hide', !A.full);
    let w = old;
    if (!w || w.nextElementSibling !== grid) { if (w) w.remove(); w = document.createElement('div'); w.className = 'wz'; grid.parentNode.insertBefore(w, grid); }
    w.dataset.key = key;
    const val = h => { const v = h.inp.value.trim().toUpperCase(); return v === '' ? null : v === 'X' ? 'X' : +v; };
    const draw = () => {
      const h = holes[st.i], v = val(h);
      let tot = 0, par = 0, n = 0;
      holes.forEach(x => { const y = val(x); if (typeof y === 'number' && !isNaN(y)) { tot += y; par += x.par || 0; n++; } else if (y === 'X') n++; });
      const rel = v == null ? '<span>Chưa nhập</span>' : v === 'X' ? '<span>Nhặt bóng</span>' : !h.par ? '' : v === h.par ? '<span>Bằng par</span>' : v < h.par ? `<span>Dưới par</span> ${h.par - v} <span>gậy</span>` : `<span>Hơn par</span> ${v - h.par} <span>gậy</span>`;
      const pad = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button type="button" class="wz-k${v === k ? ' sel' : ''}${h.par === k ? ' par' : ''}" data-wz="set" data-v="${k}">${k}</button>`).join('')
        + `<button type="button" class="wz-k${typeof v === 'number' && v >= 10 ? ' sel' : ''}" data-wz="set" data-v="10">10+</button>`
        + (kind === 'youth' ? `<button type="button" class="wz-k wz-w${v === 'X' ? ' sel' : ''}" data-wz="set" data-v="X"><span>Nhặt bóng</span></button>` : `<button type="button" class="wz-k wz-w" data-wz="set" data-v=""><span>Xoá</span></button>`);
      const diff = n ? tot - par : 0;
      w.innerHTML = `<div class="wz-h"><div class="wz-n"><span>Hố</span> <b class="n">${h.n}</b> <small>/ ${holes.length} <span>hố</span></small></div>
          <div class="wz-t"><small>${n}/${holes.length} <span>hố đã nhập</span></small><b class="n">${tot} <span>gậy</span>${par ? ` · ${diff > 0 ? '+' : ''}${diff}` : ''}</b></div></div>
        <div class="wz-dots" role="group" aria-label="Chọn hố">${holes.map((x, i) => `<button type="button" class="${i === st.i ? 'cur' : val(x) != null ? 'done' : ''}" data-wz="go" data-v="${i}" aria-label="Hố ${x.n}"></button>`).join('')}</div>
        ${h.par ? `<div class="wz-par">Par ${h.par}</div>` : ''}
        <div class="wz-big"><button type="button" class="wz-pm" data-wz="dec" aria-label="Bớt một gậy">−</button><div><b class="n">${v == null ? '–' : esc(v)}</b><small class="wz-rel">${rel}</small></div><button type="button" class="wz-pm" data-wz="inc" aria-label="Thêm một gậy">+</button></div>
        <div class="wz-pad">${pad}</div>
        <div class="wz-nav"><button type="button" class="btn ghost" data-wz="prev"${st.i ? '' : ' disabled'}>‹ <span>Hố trước</span></button><button type="button" class="btn" data-wz="next">${st.i < holes.length - 1 ? '<span>Hố sau</span> ›' : '<span>Xong</span> ✓'}</button></div>
        <button type="button" class="wz-all" data-wz="all">${A.full ? 'Ẩn thẻ điểm đầy đủ' : 'Xem cả thẻ điểm'}</button>`;
      tr();
    };
    const write = (h, v) => { h.inp.value = v == null ? '' : String(v); h.inp.dispatchEvent(new Event('input', { bubbles: true })); };
    w.onclick = e => {
      const b = e.target.closest('[data-wz]'); if (!b) return;
      const a = b.dataset.wz, h = holes[st.i], v = val(h);
      if (a === 'set') {
        const nv = b.dataset.v === '' ? null : b.dataset.v === 'X' ? 'X' : +b.dataset.v;
        write(h, nv); draw();
        if (nv != null && nv !== 10 && st.i < holes.length - 1) { clearTimeout(w._t); w._t = setTimeout(() => { st.i++; draw(); }, 280); }
        return;
      }
      if (a === 'inc' || a === 'dec') { const base = typeof v === 'number' ? v : (h.par || 4) + (a === 'inc' ? -1 : 1); write(h, Math.max(1, Math.min(20, base + (a === 'inc' ? 1 : -1)))); return draw(); }
      if (a === 'go') { st.i = +b.dataset.v; return draw(); }
      if (a === 'prev') { if (st.i) st.i--; return draw(); }
      if (a === 'next') {
        if (st.i < holes.length - 1) { st.i++; return draw(); }
        const sb = document.querySelector('#v2post [data-a="ysend"],#v2post [data-a="g3send"],#v2post [data-a="submit"],#v2post [data-a="post"]');
        if (sb) sb.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
      }
      if (a === 'all') { A.full = !A.full; store.set('hdcp-full-card', A.full); grid.classList.toggle('wz-hide', !A.full); return draw(); }
    };
    // Gõ trực tiếp vào thẻ đầy đủ thì bàn số cập nhật theo
    if (!grid.dataset.wzb) { grid.dataset.wzb = 1; grid.addEventListener('input', () => { const cur = document.querySelector('#v2post .wz'); if (cur && cur.dataset.key === key) draw(); }); }
    draw();
  }

  // ---------- Sau mỗi lần màn hình máy chủ vẽ lại ----------
  const prevBind = window.srvPlusBind;
  window.srvPlusBind = function () {
    if (prevBind) prevBind.apply(this, arguments);
    if (demo()) return;
    try { after(); } catch (e) { console.error(e); }
  };
  let lastKey = '';
  function after() {
    badges();
    const p = A.page, c = ctx(), k = (W.user() ? W.user().id : '') + '|' + (SV().cur || '') + '|' + (c ? 1 : 0) + '|' + (c && c.me ? c.me.status : '');
    const changed = k !== lastKey; lastKey = k;
    if (p === 'home') { if (changed) { drawTop(); hostSrv(!!W.user() ? (!isMember() && !isStaff() && !isRoomAdmin()) : true); } if (W.user() && c) loadHome(); else drawTop(); }
    else if (p === 'post') { if (changed) drawTop(); wizard(); }
    else if (p === 'prog') { const lk = (window.srvExtraTabs || []).find(t => t.key === 'look'); const B = bot(); if (B && lk && W.user()) { B.innerHTML = lk.render(); tr(); } if (changed) drawTop(); }
    else drawTop();
    if (changed && W.user() && c && !SV().view) enter();
  }

  // ---------- Thao tác ----------
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-v2],[data-go],[data-v2k],[data-v2g],[data-v2s],[data-v2mk],[data-v2a]'); if (!b || demo() && !b.matches('[data-v2="undemo"]')) return;
    const d = b.dataset;
    if (d.go) { const [p, s] = d.go.split(':'); return go(p, s); }
    if (d.v2k) { A.kind = d.v2k; A.kindFor = SV().cur; store.set('hdcp-kind-' + SV().cur, A.kind); A.wz = {}; return enter(); }
    if (d.v2g) { if (d.v2g === SV().cur) return; A.home = null; await window.srvSetGolfer(d.v2g); return enter(); }
    if (d.v2s) return go('me', d.v2s);
    if (d.v2mk) { A.meKind = d.v2mk; return enter(); }
    if (d.v2a) { A.admTab = d.v2a; return enter(); }
    const a = d.v2;
    if (a === 'demo') return setDemo(true);
    if (a === 'undemo') return setDemo(false);
    if (a === 'admin') return go('admin');
    if (a === 'back') return go('home');
    if (a === 'logout') { A.home = null; window.srvLogout(); return go('home'); }
    if (a === 'install') { const P = PL(); if (P.install) P.install(); return; }
    if (a === 'kind') { A.kind = d.v; A.kindFor = SV().cur; store.set('hdcp-kind-' + SV().cur, A.kind); return go('post'); }
    if (a === 'tile') return go('prog');
  });
  document.addEventListener('change', e => { const t = e.target; if (t && t.matches && t.matches('select[data-v2lang]')) { const ls = $('langSel'); if (ls) { ls.value = t.value; ls.dispatchEvent(new Event('change')); syncLang(); } } });
  // Trang Thông báo: vẽ lại sau thao tác (đánh dấu đã đọc, bật thông báo)
  document.addEventListener('click', e => { if (A.page === 'me' && A.meSub === 'notes' && e.target.closest('#v2me [data-pl]')) setTimeout(drawTop, 700); });
  window.addEventListener('hashchange', route);
  // Thẻ điểm được vẽ lại mà không qua srvPaint (chọn sân, đổi tee/layout) → gắn lại bàn số
  function watchPost() {
    const sec = $('v2post'); if (!sec || sec.dataset.mo) return; sec.dataset.mo = 1;
    new MutationObserver(ms => {
      if (A.page !== 'post') return;
      const hit = ms.some(m => m.type === 'childList' && !(m.target.closest && m.target.closest('.wz')) &&
        [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches('.svholes') || (n.querySelector && n.querySelector('.svholes')))));
      if (hit) requestAnimationFrame(wizard);
    }).observe(sec, { childList: true, subtree: true });
  }

  // ---------- Kiểu dáng ----------
  const css = document.createElement('style');
  css.textContent = `
body.v2on .tstrip,body.v2on .bar .bsel,body.v2on #nav,body.v2on main>section:not(.v2){display:none!important}
body.v2out .v2tb .v2ic,body.v2out .v2tb .v2av,body:not(.v2on) #nav2,body:not(.v2on) main>section.v2,body:not(.v2on) .v2tb{display:none!important}
#v2demoBar{display:none}body.v2demo #v2demoBar{display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;background:#fff1e0;color:#7a4a10;font-size:14px;padding:8px 14px;border-bottom:1px solid var(--line)}
body.v2adm #nav2{display:none!important}body.v2adm .shell{grid-template-columns:1fr}body.v2adm main{margin:0 auto}
.v2tb{margin-left:auto;display:flex;align-items:center;gap:8px}.v2tb .lang{min-height:36px}
.v2ic,.v2av{width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--card);display:grid;place-items:center;position:relative;padding:0}
.v2ic svg{width:19px;height:19px}.v2ic .nb{position:absolute;top:-4px;right:-4px;margin:0}
.v2av{background:var(--g);color:var(--gold,#f1ab50);font-weight:700;font-size:16px;border-color:var(--g)}
#nav2 button span{white-space:nowrap}#nav2 .nb{margin-left:auto}
@media(min-width:900px){#nav2 .v2plus{background:var(--gold,#f1ab50);color:var(--g);font-weight:700}#nav2 .v2plus.on{background:var(--g);color:#fff}}
@media(max-width:899px){#nav2 .nb{position:absolute;top:2px;right:calc(50% - 22px);margin:0}#nav2 .v2plus svg{background:var(--gold,#f1ab50);color:var(--g);border-radius:10px;width:40px;height:28px;padding:3px 9px;box-sizing:border-box}}
.v2ph{margin-bottom:12px}.v2ph h1{margin-bottom:2px}
#v2home .v2slot,#v2post .v2slot,#v2prog .v2slot,#v2me .v2slot,#v2admin .v2slot{margin-top:4px}
section.v2 #srvBody .svhead,section.v2 #srvBody .svwho,section.v2 #srvBody .svtabs{display:none!important}
.v2chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.v2chip{border:1px solid var(--line);background:var(--card);border-radius:99px;padding:8px 14px;font-size:14px;font-weight:500;min-height:40px}
.v2chip.on{background:var(--g);border-color:var(--g);color:#fff}
.v2grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media(min-width:700px){.v2grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
.v2tile{text-align:left;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:13px 14px;display:flex;flex-direction:column;gap:2px;min-height:112px;cursor:pointer}
.v2tile .k{font-size:13px;color:var(--mute);font-weight:500}
.v2tile .v{font-size:34px;font-weight:700;line-height:1.1;color:var(--ink)}
.v2tile .need{font-size:14px;color:var(--mute);font-weight:600;margin-top:8px;line-height:1.35}
.v2tile.hero{background:var(--g);border-color:var(--g)}.v2tile.hero .k{color:rgba(255,255,255,.8)}.v2tile.hero .v{color:var(--gold,#f1ab50)}.v2tile.hero .need{color:rgba(255,255,255,.85)}
.v2d{font-size:12.5px;font-weight:600;color:var(--mute)}.v2d.up{color:var(--good,#065f46)}.v2d.dn{color:var(--bad,#b42318)}
.v2tile.hero .v2d{color:rgba(255,255,255,.8)}.v2tile.hero .v2d.up{color:#9fe0bd}.v2tile.hero .v2d.dn{color:#ffb4a8}
.v2hint{font-size:12.5px;color:var(--mute);margin:8px 4px 14px}
.v2cta{display:block;width:100%;border:0;border-radius:18px;padding:17px;font-size:19px;font-weight:700;background:var(--gold,#f1ab50);color:var(--g);box-shadow:0 4px 0 rgba(0,0,0,.12);margin:2px 0 14px;min-height:60px}
.v2open{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border:2px solid var(--gold,#f1ab50)}.v2open b{display:block}.v2open span{font-size:13px;color:var(--mute)}
.v2list h2{display:flex;align-items:center;gap:8px}.v2list .nb{margin-left:0}
.v2it{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line)}.v2it:first-of-type{border-top:0}
.v2it b{display:block}.v2it span{font-size:13px;color:var(--mute)}
.v2q{font-weight:700;font-size:16px;margin:4px 2px 8px}
.v2kinds{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:14px}
@media(min-width:700px){.v2kinds{grid-template-columns:repeat(4,minmax(0,1fr))}}
.v2kind{text-align:left;background:var(--card);border:2px solid var(--line);border-radius:16px;padding:12px 13px;min-height:64px}
.v2kind b{display:block;font-size:16px}.v2kind span{font-size:12.5px;color:var(--mute)}
.v2kind.on{border-color:var(--gold,#f1ab50);background:#fff8ec}
.v2seg{margin-bottom:14px;max-width:none}.v2seg button{min-height:42px}
@media(max-width:640px){.v2seg{overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none}.v2seg button{flex:none;white-space:nowrap;padding-left:12px;padding-right:12px}}
.v2prof{display:flex;align-items:center;gap:14px}.v2prof b{display:block;font-size:17px}.v2prof span{font-size:13px;color:var(--mute)}
.v2prof-a{width:52px;height:52px;border-radius:50%;background:var(--g);color:var(--gold,#f1ab50);font-weight:700;font-size:22px;display:grid;place-items:center;flex:none}
.v2wel-h{display:flex;gap:14px;align-items:flex-start}.v2wel h1{font-size:24px;margin:0 0 6px}
.v2wel-i{width:48px;height:48px;border-radius:14px;background:var(--g);color:var(--gold,#f1ab50);display:grid;place-items:center;flex:none}.v2wel-i svg{width:26px;height:26px}
.v2admh .btn{white-space:nowrap;flex:none}.v2admh{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}.v2admh h1{margin:0}.v2admh .sub{margin:2px 0 0}
#v2me .pl-bellp [data-pl="bell"]{display:none}
.svholes.wz-hide{display:none}
.wz{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:14px;margin:12px 0}
.wz-h{display:flex;justify-content:space-between;align-items:flex-end;gap:10px}
.wz-n{font-size:15px;color:var(--mute)}.wz-n b{font-size:30px;color:var(--ink)}
.wz-t{text-align:right;font-size:12.5px;color:var(--mute)}.wz-t b{display:block;font-size:18px;color:var(--ink)}
.wz-dots{display:flex;gap:4px;margin:10px 0}.wz-dots button{flex:1;height:8px;border:0;border-radius:4px;background:var(--line);padding:0;min-height:0}
.wz-dots button.done{background:var(--g)}.wz-dots button.cur{background:var(--gold,#f1ab50)}
.wz-par{text-align:center;font-weight:600;color:var(--mute);font-size:14px}
.wz-big{display:grid;grid-template-columns:64px 1fr 64px;align-items:center;gap:10px;margin:6px 0 12px}
.wz-big>div{text-align:center}.wz-big b{display:block;font-size:56px;line-height:1.05}
.wz-rel{display:inline-block;font-size:13px;font-weight:600;color:#7a4a10;background:#fde7c7;border-radius:99px;padding:2px 10px}
.wz-pm{height:64px;border-radius:18px;border:1px solid var(--line);background:var(--bg);font-size:30px;font-weight:700}
.wz-pad{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.wz-k{height:58px;border-radius:16px;border:1px solid var(--line);background:var(--card);font-size:23px;font-weight:700}
.wz-k.par{background:#e3f4ea;border-color:#bfe3cf;color:#0f7a4f}.wz-k.sel{background:var(--g);border-color:var(--g);color:var(--gold,#f1ab50)}
.wz-k.wz-w{grid-column:span 2;font-size:15px}
.wz-nav{display:flex;gap:10px;margin-top:12px}.wz-nav .btn{flex:1;min-height:52px;white-space:nowrap;padding-left:10px;padding-right:10px}.wz-nav .btn:last-child{flex:1.4}
.wz-all{display:block;margin:10px auto 0;border:0;background:none;color:var(--bronze,#9a5518);font-weight:600;text-decoration:underline;min-height:40px}
`;
  document.head.appendChild(css);

  // ---------- Khởi động ----------
  build(); watchPost(); applyMode();
  if (!demo()) {
    if (!location.hash || location.hash === '#') history.replaceState(null, '', '#trang-chu');
    route();
  }
  window.APP2.go = go; window.APP2.route = route;
})();
