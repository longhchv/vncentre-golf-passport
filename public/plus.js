// ===== App Handicap · Ưu tiên 1 + 2 (anh Long duyệt 26/11/2026) =====
// Minh · 26/11/2026. Máy chủ: migration 20261126000001_whs_plus (repo vncentre-golf-passport).
//   • Cài app lên điện thoại (PWA: manifest.webmanifest + sw.js)
//   • Thông báo: chuông trong app, báo trên máy khi app đang mở; thông báo đẩy khi máy chủ có khoá VAPID
//   • Chấm chéo: bạn chơi xác nhận điểm Junior / SNAG / Golf 3D (vòng sân thật đã có marker)
//   • Tra cứu golfer theo mã VNC hoặc tên
//   • Nâng cao (không bắt buộc): fairway / trái / phải / ngắn, GIR, putt, phạt, OB từng hố
//   • Tiến bộ: biểu đồ các chỉ số + thống kê theo tháng (cho phụ huynh, HLV)
//   • Nhập điểm giải hàng loạt (ban tổ chức / nhân sự liên đoàn)
// Gắn vào lõi qua window.srvExtraTabs, srvHeadExtra, srvPlusBind và bọc WHSrv.rpc (không sửa luồng nộp điểm cũ).
(function () {
  const W = window.WHSrv;
  if (!W) return;
  const $s = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fx = x => x == null ? '–' : (x < 0 ? '+' + Math.abs(x).toFixed(1) : Number(x).toFixed(1));
  const dmy = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const ago = t => { const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? '<span>vừa xong</span>' : m < 60 ? `${m} <span>phút trước</span>` : m < 1440 ? `${Math.round(m / 60)} <span>giờ trước</span>` : dmy(t); };
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const toast = m => (window.srvToast ? window.srvToast(m) : null);
  const SV = () => window.SV || {};
  const ctx = () => SV().ctx || {};
  const isStaff = () => { const c = ctx(); return !!(c.admin || (c.staff && c.staff.length)); };
  const repaint = () => window.srvPaint && window.srvPaint();

  const ERR = {
    peer_cannot_be_self: 'Bạn chơi xác nhận không được là chính golfer hoặc người cùng tài khoản.', peer_not_found: 'Không tìm thấy bạn chơi với mã VNC này trong liên đoàn.',
    peer_disabled: 'Liên đoàn chưa bật chấm chéo cho loại vòng này – điểm chờ admin xác nhận.', not_peer: 'Anh/chị không phải bạn chơi được nhờ xác nhận vòng này.',
    cannot_attest_own_round: 'Không tự xác nhận vòng của mình hoặc của con.', dispute_needs_reason: 'Ghi lý do không đồng ý.', not_pending: 'Vòng này đã được xử lý.',
    scores_required: 'Vòng chỉ có ảnh, chưa có điểm – cần admin nhập điểm.', not_your_round: 'Vòng này không thuộc tài khoản của anh/chị.',
    stats_length: 'Số hố thống kê không khớp vòng.', stats_bad_value: 'Giá trị thống kê không hợp lệ.', stats_bad_key: 'Giá trị thống kê không hợp lệ.',
    forbidden: 'Anh/chị không có quyền làm việc này.', event_required: 'Nhập tên giải.', rows_required: 'Chưa có dòng điểm nào.', too_many_rows: 'Tối đa 500 dòng mỗi lần.',
    member_not_found: 'Không có mã VNC này trong liên đoàn.', code_required: 'Thiếu mã VNC.', bad_date: 'Ngày không hợp lệ.', ref_required: 'Chưa chọn tee / layout / sân.',
    duplicate_in_file: 'Trùng dòng trong file.', duplicate_round: 'Vòng này đã có trên hệ thống.', not_active_member: 'Hội viên chưa được duyệt.', member_inactive: 'Hội viên không còn hoạt động.',
    course_or_tee_not_found: 'Không tìm thấy sân hoặc tee.', bad_holes: 'Số hố không hợp lệ.', gross_length: 'Số hố điểm không khớp.', gross_range: 'Số gậy mỗi hố phải từ 1 đến 20.',
    scores_length: 'Số hố điểm không khớp.', scores_bad_value: 'Điểm có giá trị không hợp lệ.', scores_missing_hole: 'SNAG cần đủ điểm mọi hố.', junior_min_6_holes: 'Junior cần ít nhất 6 hố.',
    ref_not_found: 'Không tìm thấy tee / layout.', bad_endpoint: 'Trình duyệt này chưa hỗ trợ thông báo đẩy.', not_authenticated: 'Cần đăng nhập.',
  };
  const errMsg = e => { const raw = (e && (e.code || e.message)) || String(e); const k = Object.keys(ERR).find(x => raw === x || raw.indexOf(x) === 0 || raw.indexOf(x) >= 0); return k ? ERR[k] : raw; };
  const rpc = async (fn, args) => { try { return await W.rpc(fn, args); } catch (e) { throw new Error(errMsg(e)); } };
  const sel = async (t, q) => { try { return await W.select(t, q); } catch (e) { return []; } };

  const P = window.PLUS = { notes: [], unread: 0, bell: false, queue: [], lk: { q: '', res: null }, prog: null, imp: { kind: 'junior', rows: null, text: '', res: null },
    peer: {}, adv: {}, recent: null, deferred: null, vapid: null, busy: false };

  // =====================================================================
  // 1. Cài app (PWA)
  // =====================================================================
  const standalone = () => window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let swReg = null;
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(() => { });
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); P.deferred = e; installBtn(); });
  window.addEventListener('appinstalled', () => { P.deferred = null; installBtn(); toast('Đã cài app Handicap lên máy.'); });
  function installBtn() {
    let b = $s('plInstall');
    const show = !standalone() && (P.deferred || isIOS());
    if (!show) { if (b) b.remove(); return; }
    if (!b) {
      const host = document.querySelector('.bsel') || document.body;
      b = document.createElement('button'); b.id = 'plInstall'; b.className = 'btn ghost sm pl-inst'; b.type = 'button';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg><span>Cài app</span>';
      b.addEventListener('click', install); host.appendChild(b);
    }
  }
  async function install() {
    if (P.deferred) { P.deferred.prompt(); try { await P.deferred.userChoice; } catch (e) { } P.deferred = null; installBtn(); return; }
    modal(`<h2>Cài app Handicap lên iPhone / iPad</h2>
      <ol class="pl-steps"><li><span>Mở trang này bằng Safari.</span></li><li><span>Bấm nút Chia sẻ</span> <b aria-hidden="true">⬆</b> <span>ở thanh dưới.</span></li>
      <li><span>Chọn "Thêm vào MH chính" (Add to Home Screen).</span></li><li><span>Mở app từ biểu tượng Handicap trên màn hình chính.</span></li></ol>
      <p class="note">Thông báo trên iPhone chỉ chạy khi mở app từ biểu tượng ngoài màn hình chính (iOS 16.4 trở lên).</p>
      <div class="acts"><button class="btn" data-pl="mclose">Đã hiểu</button></div>`);
  }
  document.addEventListener('DOMContentLoaded', installBtn); setTimeout(installBtn, 0);
  // Mở từ thông báo (…/#srv): vào thẳng mục Tài khoản
  setTimeout(() => { if (location.hash === '#srv') { const nb = document.querySelector('#nav button[data-t="srv"]'); if (nb) nb.click(); } }, 300);

  // =====================================================================
  // 2. Thông báo
  // =====================================================================
  const NK = {
    attest_request: 'nhờ xác nhận điểm', peer_request: 'nhờ xác nhận điểm',
    round_attested: 'Vòng đã được xác nhận', round_disputed: 'Marker không đồng ý điểm', round_rejected: 'Vòng bị từ chối', round_void: 'Vòng bị huỷ',
    youth_confirmed: 'Vòng đã được xác nhận', youth_rejected: 'Vòng bị từ chối', sim_confirmed: 'Vòng đã được xác nhận', sim_rejected: 'Vòng bị từ chối', sim_void: 'Vòng bị huỷ',
    peer_disputed: 'Bạn chơi không đồng ý điểm', index_first: 'Đã có chỉ số', index_change: 'Chỉ số thay đổi',
  };
  const TYPE = { whs: 'Sân thật', junior: 'Junior', snag: 'SNAG', youth: 'Junior / SNAG', sim: 'Golf 3D' };
  function noteHtml(n) {
    const d = n.data || {}, k = n.kind;
    let main;
    if (k === 'attest_request' || k === 'peer_request') main = `<b>${esc(d.golfer || '')}</b> <span>${NK[k]}</span>`;
    else if (k === 'index_first') main = `<b>${esc(d.label || '')}</b> <span>${NK[k]}</span> <b class="n">${fx(+d.new)}</b>`;
    else if (k === 'index_change') main = `<b>${esc(d.label || '')}</b> <span>${NK[k]}</span> <b class="n">${fx(+d.old)} → ${fx(+d.new)}</b>`;
    else main = `<span>${NK[k] || esc(n.title)}</span>`;
    const sub = [d.kind ? TYPE[d.kind] : d.type ? TYPE[d.type] : '', d.course || d.brand || '', d.date ? dmy(d.date) : ''].filter(Boolean).map(x => `<span>${esc(x)}</span><span> · </span>`);
    const who = k.startsWith('index') ? '' : (n.body && k !== 'attest_request' ? `<em>${esc(n.body)}</em>` : '');
    return `<div class="pl-n${n.read_at ? '' : ' un'}"><div>${main}</div><small>${sub.join('')}${ago(n.created_at)}</small>${who}</div>`;
  }
  async function loadNotes(silent) {
    if (!W || !W.user()) return;
    let L; try { L = await W.rpc('whs_notif_list', { p_limit: 40 }); } catch (e) { return; }
    P.notes = Array.isArray(L) ? L : [];
    P.unread = P.notes.filter(n => !n.read_at).length;
    const b = document.querySelector('[data-pl="bell"] .nb');
    if (b) { b.textContent = P.unread; b.classList.toggle('hide', !P.unread); }
    // Báo trên máy cho thông báo mới (khi đã cho phép) – lần đầu chỉ ghi mốc, không báo dồn
    const key = 'whs-plus-last-note-' + W.user().id, last = store.get(key);
    const top = P.notes.length ? P.notes[0].id : 0;
    if (last != null && !silent && 'Notification' in window && Notification.permission === 'granted') {
      P.notes.filter(n => n.id > last && !n.read_at).slice(0, 3).reverse().forEach(n => sysNotify(n));
    }
    if (top) store.set(key, Math.max(top, last || 0));
  }
  function sysNotify(n) {
    const opts = { body: n.body || '', tag: 'whs-' + n.id, icon: 'icons/icon-192.png', badge: 'icons/badge-72.png', data: { url: '/#srv' } };
    try { if (swReg && swReg.showNotification) swReg.showNotification(n.title, opts); else new Notification(n.title, opts); } catch (e) { }
  }
  async function markRead() {
    try { await W.rpc('whs_notif_read', { p_ids: null }); } catch (e) { }
    P.notes.forEach(n => { if (!n.read_at) n.read_at = new Date().toISOString(); }); P.unread = 0;
  }
  const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map(c => c.charCodeAt(0))); };
  async function enablePush() {
    if (!('Notification' in window)) throw new Error('Trình duyệt này chưa hỗ trợ thông báo.');
    if (isIOS() && !standalone()) { install(); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Anh/chị chưa cho phép thông báo. Mở cài đặt trình duyệt để bật lại.');
    if (P.vapid == null) { const r = await sel('whs_settings', 'select=value&key=eq.vapidPublicKey'); P.vapid = r[0] && typeof r[0].value === 'string' ? r[0].value : ''; }
    if (P.vapid && swReg && swReg.pushManager) {
      const sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(P.vapid) });
      const j = sub.toJSON();
      await rpc('whs_push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
      toast('Đã bật thông báo trên máy này.');
    } else {
      toast('Đã bật thông báo khi app đang mở.');
    }
    repaint();
  }
  const pushState = () => !('Notification' in window) ? 'none' : Notification.permission;
  function bellPanel() {
    const st = pushState();
    const tip = st === 'granted' ? '' : st === 'denied'
      ? '<p class="note">Thông báo đang bị chặn trong cài đặt trình duyệt.</p>'
      : `<div class="svitem"><div><b>Bật thông báo trên máy này</b><span>Báo ngay khi vòng được xác nhận, có người nhờ xác nhận hoặc chỉ số thay đổi.</span></div><div class="svia"><button class="btn sm" data-pl="push">Bật thông báo</button></div></div>`;
    return `<div class="card pl-bellp" id="plBell"><div class="pl-h"><h2>Thông báo</h2><div class="svia">${P.unread ? '<button class="btn ghost sm" data-pl="readall">Đánh dấu đã đọc</button>' : ''}<button class="btn ghost sm" data-pl="bell" aria-label="Đóng">✕</button></div></div>
      ${tip}${P.notes.length ? '<div class="pl-nl">' + P.notes.map(noteHtml).join('') + '</div>' : '<div class="empty">Chưa có thông báo nào.</div>'}</div>`;
  }
  setInterval(() => { if (document.visibilityState === 'visible') loadNotes().then(() => { if (P.bell) inject(); }); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadNotes(); });

  // =====================================================================
  // 3. Chấm chéo (Junior / SNAG / Golf 3D)
  // =====================================================================
  async function loadQueue() { try { const q = await W.rpc('whs_peer_queue'); P.queue = Array.isArray(q) ? q : []; } catch (e) { P.queue = []; } }
  function queueCard() {
    if (!Array.isArray(P.queue) || !P.queue.length) return '';
    return `<div class="card pl-q" id="plQueue"><h2>Nhờ anh/chị xác nhận điểm</h2><p class="sub">Bạn chơi cùng nhóm nhờ xác nhận. Xác nhận xong là điểm được tính ngay; không đúng thì ghi lý do để admin xem.</p>
      <div class="pl-list">${P.queue.map(q => {
        const sc = Array.isArray(q.scores) ? q.scores : [], par = Array.isArray(q.par) ? q.par : [];
        const tot = sc.reduce((a, x) => a + (typeof x === 'number' ? x : 0), 0);
        return `<div class="svitem"><div><b>${esc(q.golfer)} · ${dmy(q.played_on)}</b><span>${esc(TYPE[q.kind === 'sim' ? 'sim' : q.sub] || '')} · ${esc(q.ref_name || '')}</span>
          <div class="pl-sc" role="table">${sc.map((x, i) => `<span role="cell"><small>${i + 1}</small><i>${par[i] != null ? 'P' + par[i] : ''}</i><b>${x == null ? '–' : esc(x)}</b></span>`).join('')}<span role="cell" class="t"><small>Σ</small><i></i><b>${tot}</b></span></div></div>
          <div class="svia"><button class="btn sm" data-pl="pok" data-v="${q.kind}|${q.round_id}">Đúng điểm</button><button class="btn ghost sm" data-pl="pno" data-v="${q.kind}|${q.round_id}">Không đúng</button></div>
          <div class="f pl-why hide" id="plWhy-${q.round_id}"><label for="plWhyI-${q.round_id}">Lý do không đồng ý</label><input id="plWhyI-${q.round_id}" placeholder="Ví dụ: hố 5 bạn đánh 6 gậy"><div class="acts"><button class="btn sm" data-pl="pno2" data-v="${q.kind}|${q.round_id}">Gửi cho admin</button></div></div></div>`;
      }).join('')}</div></div>`;
  }
  // Ô "bạn chơi xác nhận" + "Nâng cao" chèn vào form gửi điểm Junior / SNAG / Golf 3D; "Nâng cao" cho form sân thật
  function formExtras(kind) {
    const pv = P.peer[kind] || {}, adv = !!P.adv[kind];
    const peer = kind === 'whs' ? '' : `<div class="f pl-peer"><label for="plPeer-${kind}">Bạn chơi xác nhận (mã VNC) <span class="note">– không bắt buộc</span></label>
      <div class="svia"><input id="plPeer-${kind}" data-plk="${kind}" placeholder="VNC-000123" value="${esc(pv.code || '')}" autocomplete="off" autocapitalize="characters"><span class="note" id="plPeerN-${kind}">${pv.name ? '✓ ' + esc(pv.name) : pv.err ? esc(pv.err) : ''}</span></div>
      <p class="note">Có bạn chơi xác nhận thì điểm được tính ngay, không phải chờ admin.</p></div>`;
    return `<div class="pl-x" data-plx="${kind}">${peer}<label class="chk pl-adv"><input type="checkbox" data-pladv="${kind}"${adv ? ' checked' : ''}> <span>Nâng cao: ghi thêm driver, số gậy on, GIR, putt, phạt, OB, bunker từng hố</span></label></div>`;
  }
  async function resolvePeer(kind) {
    const pv = P.peer[kind] || (P.peer[kind] = {});
    const code = (pv.code || '').trim();
    if (!code) { pv.id = null; pv.name = null; pv.err = null; return null; }
    if (pv.id && pv.for === code) return pv;
    const fed = ctx().me && ctx().me.federation_id;
    const r = await rpc('whs_find_peer', { p_fed: fed, p_code: code });
    const x = Array.isArray(r) ? r[0] : r;
    if (!x) { pv.id = null; pv.name = null; pv.err = 'Không tìm thấy mã VNC này.'; throw new Error(ERR.peer_not_found); }
    Object.assign(pv, { id: x.member_id, name: x.full_name, for: code, err: null });
    return pv;
  }
  // Bọc WHSrv.rpc: trước khi gửi điểm kiểm tra mã bạn chơi; gửi xong thì nhờ xác nhận và mở bảng "Nâng cao" nếu đã chọn
  function wrap() {
    if (W.__plus) return;
    const orig = W.rpc.bind(W);
    const KIND = { whs_youth_submit: 1, whs_sim_submit: 1, whs_post_unregistered: 1, whs_submit_round: 1 };
    W.rpc = async function (fn, args) {
      const kf = KIND[fn];
      if (!kf) return orig(fn, args);
      const fk = fn === 'whs_youth_submit' ? 'youth' : fn === 'whs_sim_submit' ? 'sim' : 'whs';
      const pv = fk !== 'whs' ? await resolvePeer(fk) : null;
      const res = await orig(fn, args);
      const rid = fn === 'whs_submit_round' ? args.p_round : (Array.isArray(res) ? res[0] : res);
      if (pv && pv.id && rid) {
        try { await orig('whs_peer_request', { p_kind: fk, p_round: rid, p_attester: pv.id }); toast('Đã nhờ bạn chơi xác nhận.'); }
        catch (e) { setTimeout(() => toast(errMsg(e)), 2800); }
        P.peer[fk] = {};
      }
      if (P.adv[fk] && rid) {
        const sk = fk === 'youth' ? args.p_kind : fk;
        setTimeout(() => openStats(sk, rid), 50);
      }
      return res;
    };
    W.__plus = true;
  }
  wrap(); P.wrap = wrap; P.install = install; P.openStats = openStats;

  // =====================================================================
  // 4. Nâng cao: thống kê từng hố
  // =====================================================================
  const FW = [['hit', 'Trúng'], ['left', 'Trái'], ['right', 'Phải'], ['short', 'Ngắn']];
  const ST = { kind: null, round: null, par: [], rows: [], title: '' };
  async function roundInfo(kind, id) {
    if (kind === 'whs') {
      const r = (await sel('whs_rounds', 'select=holes,played_on,course:whs_courses(name,data)&id=eq.' + id))[0];
      if (!r) throw new Error('Không tìm thấy vòng.');
      let par = (r.course && r.course.data && r.course.data.par) || [];
      if (r.holes === 'F') par = par.slice(0, 9); else if (r.holes === 'B') par = par.slice(9, 18);
      return { n: r.holes === '18' ? 18 : 9, par, title: (r.course ? r.course.name : '') + ' · ' + dmy(r.played_on) };
    }
    if (kind === 'junior' || kind === 'snag') {
      const r = (await sel('whs_youth_rounds', 'select=played_on,scores,tee:whs_youth_tees(name,par),lay:whs_youth_layouts(name,holes)&id=eq.' + id))[0];
      if (!r) throw new Error('Không tìm thấy vòng.');
      const par = r.tee ? r.tee.par : (r.lay ? r.lay.holes.map(h => h.par) : []);
      return { n: par.length, par, title: (r.tee ? r.tee.name : r.lay ? r.lay.name : '') + ' · ' + dmy(r.played_on) };
    }
    const r = (await sel('whs_sim_rounds', 'select=holes,played_on,course:whs_sim_courses(name,tee_name,holes,par)&id=eq.' + id))[0];
    if (!r) throw new Error('Không tìm thấy vòng.');
    let par = r.course.par; if (r.course.holes === 18 && r.holes === 'F') par = par.slice(0, 9); else if (r.course.holes === 18 && r.holes === 'B') par = par.slice(9, 18);
    return { n: r.holes === '18' ? 18 : 9, par, title: r.course.name + ' · ' + dmy(r.played_on) };
  }
  async function openStats(kind, id) {
    try {
      const info = await roundInfo(kind, id);
      const ex = (await sel('whs_round_stats', 'select=stats&kind=eq.' + kind + '&round_id=eq.' + id))[0];
      Object.assign(ST, { kind, round: id, par: info.par, title: info.title,
        rows: Array.from({ length: info.n }, (_, i) => Object.assign({}, (ex && ex.stats && ex.stats[i]) || {})) });
      drawStats();
    } catch (e) { toast(errMsg(e)); }
  }
  const chip = (h, k, v, lab, on) => `<button type="button" class="pl-c${on ? ' on' : ''}" data-pl="st" data-v="${h}|${k}|${v}" aria-pressed="${on}">${lab}</button>`;
  function drawStats() {
    const rows = ST.rows.map((r, i) => {
      const p = ST.par[i];
      const fw = p === 3 ? '<span class="note">Par 3</span>' : FW.map(([v, l]) => chip(i, 'fw', v, `<span>${l}</span>`, r.fw === v)).join('');
      return `<div class="pl-sr"><div class="pl-hn"><b>${i + 1}</b><small>${p != null ? 'Par ' + p : ''}</small></div>
        <div class="pl-g"><small>Phát bóng</small><div>${fw}</div></div>
        <div class="pl-g"><small>Số gậy on</small><div>${[1, 2, 3, 4, 5, 6].map(n => chip(i, 'on', n, n === 6 ? '6+' : n, r.on === n || (n === 6 && r.on >= 6))).join('')}</div></div>
        <div class="pl-g"><small>GIR</small><div>${chip(i, 'gir', 'true', '<span>Có</span>', r.gir === true)}${chip(i, 'gir', 'false', '<span>Không</span>', r.gir === false)}</div></div>
        <div class="pl-g"><small>Putt</small><div>${[0, 1, 2, 3, 4].map(n => chip(i, 'putts', n, n === 4 ? '4+' : n, r.putts === n || (n === 4 && r.putts >= 4))).join('')}</div></div>
        <div class="pl-g"><small>Phạt</small><div class="pl-step">${chip(i, 'pen', '-', '−', false)}<b>${r.pen || 0}</b>${chip(i, 'pen', '+', '+', false)}</div></div>
        <div class="pl-g"><small>OB</small><div class="pl-step">${chip(i, 'ob', '-', '−', false)}<b>${r.ob || 0}</b>${chip(i, 'ob', '+', '+', false)}</div></div>
        <div class="pl-g"><small>Bunker</small><div class="pl-step">${chip(i, 'bunker', '-', '−', false)}<b>${r.bunker || 0}</b>${chip(i, 'bunker', '+', '+', false)}</div></div></div>`;
    }).join('');
    modal(`<div class="pl-h"><h2>Nâng cao</h2><button class="btn ghost sm" data-pl="mclose" aria-label="Đóng">✕</button></div>
      <p class="sub"><span>${esc(ST.title)}</span> · <span>Không bắt buộc, không ảnh hưởng chỉ số. Bấm để chọn, bấm lại để bỏ.</span></p>
      <div class="pl-st">${rows}</div>
      <div class="acts"><button class="btn" data-pl="stsave">Lưu thống kê</button><button class="btn ghost" data-pl="stdel">Xoá thống kê</button><button class="btn ghost" data-pl="mclose">Đóng</button></div>`, 'wide');
  }
  function statTap(v) {
    const [h, k, val] = v.split('|'), r = ST.rows[+h];
    if (k === 'fw') r.fw = r.fw === val ? undefined : val;
    else if (k === 'gir') { const b = val === 'true'; r.gir = r.gir === b ? undefined : b; }
    else if (k === 'putts') r.putts = r.putts === +val ? undefined : +val;
    else if (k === 'on') {
      r.on = r.on === +val ? undefined : +val;
      // On tiêu chuẩn: lên green trong (par − 2) gậy; vẫn sửa tay được ở dòng GIR
      const p = ST.par[+h]; if (r.on !== undefined && p) r.gir = r.on <= p - 2;
    }
    else { r[k] = Math.max(0, Math.min(9, (r[k] || 0) + (val === '+' ? 1 : -1))); if (!r[k]) delete r[k]; }
    const sc = document.querySelector('.pl-st') ? document.querySelector('.pl-st').scrollTop : 0;
    drawStats(); const el = document.querySelector('.pl-st'); if (el) el.scrollTop = sc;
  }
  async function saveStats(del) {
    const clean = ST.rows.map(r => { const o = {}; ['fw', 'on', 'gir', 'putts', 'pen', 'ob', 'bunker'].forEach(k => { if (r[k] !== undefined && r[k] !== null) o[k] = r[k]; }); return Object.keys(o).length ? o : null; });
    const payload = del || !clean.some(Boolean) ? null : clean;
    await rpc('whs_set_round_stats', { p_kind: ST.kind, p_round: ST.round, p_stats: payload });
    closeModal(); toast(payload ? 'Đã lưu thống kê.' : 'Đã xoá thống kê.');
    if (SV().tab === 'prog') { await loadProg(); repaint(); }
  }

  // =====================================================================
  // 5. Tiến bộ
  // =====================================================================
  async function loadProg() {
    const m = ctx().me; if (!m) { P.prog = null; return; }
    const [p, w, y, s, st] = await Promise.all([
      rpc('whs_progress', { p_member: m.id }),
      sel('whs_rounds', 'select=id,played_on,holes,status,course:whs_courses(name)&member_id=eq.' + m.id + '&status=in.(submitted,attested)&order=played_on.desc&limit=12'),
      sel('whs_youth_rounds', 'select=id,kind,played_on,status,tee:whs_youth_tees(name),lay:whs_youth_layouts(name)&member_id=eq.' + m.id + '&status=neq.rejected&order=played_on.desc&limit=12'),
      sel('whs_sim_rounds', 'select=id,played_on,holes,status,brand,course:whs_sim_courses(name)&member_id=eq.' + m.id + '&status=in.(pending,confirmed)&order=played_on.desc&limit=12'),
      sel('whs_round_stats', 'select=kind,round_id&member_id=eq.' + m.id),
    ]);
    const has = new Set(st.map(x => x.kind + x.round_id));
    const rec = [].concat(
      w.map(r => ({ kind: 'whs', id: r.id, d: r.played_on, name: r.course ? r.course.name : '' })),
      y.map(r => ({ kind: r.kind, id: r.id, d: r.played_on, name: r.tee ? r.tee.name : r.lay ? r.lay.name : '' })),
      s.map(r => ({ kind: 'sim', id: r.id, d: r.played_on, name: (r.course ? r.course.name : '') + ' · ' + r.brand }))
    ).sort((a, b) => a.d < b.d ? 1 : -1).slice(0, 15).map(r => Object.assign(r, { has: has.has(r.kind + r.id) }));
    P.prog = { p, rec, member: m.id };
  }
  const SERIES_COL = ['#3a1f0c', '#c2410c', '#1d6b4f', '#2563eb', '#9a5518', '#7c3aed'];
  function chartSvg(series) {
    const all = series.flatMap(s => s.pts.map(p => ({ t: Date.parse(p.d), v: +p.v })));
    if (all.length < 1) return '';
    const W0 = 640, H0 = 230, L = 40, R = 12, T = 14, B = 28;
    const t0 = Math.min(...all.map(p => p.t)), t1 = Math.max(...all.map(p => p.t)) || t0 + 1;
    let v0 = Math.min(...all.map(p => p.v)), v1 = Math.max(...all.map(p => p.v)); if (v1 - v0 < 2) { v0 -= 1; v1 += 1; }
    const X = t => L + (t1 === t0 ? (W0 - L - R) / 2 : (t - t0) / (t1 - t0) * (W0 - L - R)), Y = v => T + (v - v0) / (v1 - v0) * (H0 - T - B);
    const ticks = [v0, (v0 + v1) / 2, v1].map(v => `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${fx(v)}</text><line x1="${L}" x2="${W0 - R}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('');
    const lines = series.map((s, i) => {
      const pts = s.pts.map(p => [X(Date.parse(p.d)), Y(+p.v)]);
      return `<polyline fill="none" stroke="${SERIES_COL[i % 6]}" stroke-width="2.5" points="${pts.map(p => p.join(',')).join(' ')}"/>` +
        pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${SERIES_COL[i % 6]}"/>`).join('');
    }).join('');
    return `<svg class="pl-chart" viewBox="0 0 ${W0} ${H0}" role="img" aria-label="Diễn biến chỉ số"><g class="ax">${ticks}<text x="${L}" y="${H0 - 8}">${dmy(new Date(t0).toISOString())}</text><text x="${W0 - R}" y="${H0 - 8}" text-anchor="end">${dmy(new Date(t1).toISOString())}</text></g>${lines}</svg>
      <div class="pl-leg">${series.map((s, i) => `<span><i style="background:${SERIES_COL[i % 6]}"></i><span>${esc(s.label)}</span> <b class="n">${fx(+s.pts[s.pts.length - 1].v)}</b></span>`).join('')}</div>`;
  }
  const pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '–';
  function progTab() {
    const m = ctx().me, g = ctx().golfer;
    if (!m) return `<div class="card"><h2>Tiến bộ</h2><div class="empty">Golfer này chưa là hội viên nên chưa có dữ liệu.</div></div>`;
    if (!P.prog || P.prog.member !== m.id) {
      if (!P.progLoading) { P.progLoading = true; loadProg().catch(e => { SV().err = errMsg(e); }).then(() => { P.progLoading = false; repaint(); }); }
      return '<div class="card"><p class="note">Đang tải…</p></div>';
    }
    const p = P.prog.p || {};
    const series = [];
    if ((p.whs || []).length) series.push({ label: 'Handicap Index', pts: p.whs });
    if ((p.junior || []).length) series.push({ label: 'Junior Handicap', pts: p.junior });
    if ((p.snag || []).length) series.push({ label: 'SNAG Handicap', pts: p.snag });
    Object.entries(p.sim || {}).forEach(([b, pts]) => pts.length && series.push({ label: 'Golf 3D · ' + b, pts }));
    const S = p.stats || [];
    const sum = S.reduce((a, x) => { Object.keys(x).forEach(k => { if (k !== 'month') a[k] = (a[k] || 0) + (+x[k] || 0); }); return a; }, {});
    const tiles = S.length ? `<div class="pl-tiles">
        <div><small>Fairway trúng</small><b class="n">${pct(sum.fw_hit, sum.fw_att)}</b><span><span>trái</span> ${sum.fw_left || 0} · <span>phải</span> ${sum.fw_right || 0} · <span>ngắn</span> ${sum.fw_short || 0}</span></div>
        <div><small>GIR</small><b class="n">${pct(sum.gir, sum.gir_att)}</b><span>${sum.gir || 0}/${sum.gir_att || 0} <span>hố</span></span></div>
        <div><small>Putt mỗi hố</small><b class="n">${sum.putt_holes ? (sum.putts / sum.putt_holes).toFixed(2) : '–'}</b><span>${sum.putts || 0} <span>putt</span></span></div>
        <div><small>Số gậy on TB</small><b class="n">${sum.on_holes ? (sum.on_sum / sum.on_holes).toFixed(1) : '–'}</b><span>${sum.on_holes || 0} <span>hố</span></span></div>
        <div><small>Phạt · OB · Bunker</small><b class="n">${sum.pen || 0} · ${sum.ob || 0} · ${sum.bunker || 0}</b><span>${sum.rounds || 0} <span>vòng có thống kê</span></span></div></div>
      <div class="pl-tw"><table class="tb pl-mt"><thead><tr><th>Tháng</th><th>Vòng</th><th>Fairway</th><th>Trái / phải / ngắn</th><th>GIR</th><th>Gậy on TB</th><th>Putt/hố</th><th>Phạt</th><th>OB</th><th>Bunker</th></tr></thead><tbody>
        ${S.slice().reverse().map(x => `<tr><td>${esc(x.month.slice(5) + '/' + x.month.slice(0, 4))}</td><td class="n">${x.rounds}</td><td class="n">${pct(x.fw_hit, x.fw_att)}</td><td class="n">${x.fw_left}/${x.fw_right}/${x.fw_short}</td><td class="n">${pct(x.gir, x.gir_att)}</td><td class="n">${x.on_holes ? (x.on_sum / x.on_holes).toFixed(1) : '–'}</td><td class="n">${x.putt_holes ? (x.putts / x.putt_holes).toFixed(2) : '–'}</td><td class="n">${x.pen}</td><td class="n">${x.ob}</td><td class="n">${x.bunker || 0}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Chưa có vòng nào ghi thống kê nâng cao. Bấm "Nâng cao" ở một vòng bên dưới để ghi.</div>';
    const rec = P.prog.rec.length ? `<div class="pl-list">${P.prog.rec.map(r => `<div class="svitem"><div><b>${esc(TYPE[r.kind])} · ${dmy(r.d)}</b><span>${esc(r.name)}</span></div><div class="svia">${r.has ? '<span class="bd">Có thống kê</span>' : ''}<button class="btn ghost sm" data-pl="stopen" data-v="${r.kind}|${r.id}">Nâng cao</button></div></div>`).join('')}</div>` : '<div class="empty">Chưa có vòng nào.</div>';
    return `<div class="card"><h2><span>Tiến bộ của</span> ${esc(g ? g.full_name : m.full_name)}</h2><p class="sub">Mỗi điểm là chỉ số sau một vòng được tính. Chỉ số càng thấp là chơi càng tốt.</p>
        ${series.length ? chartSvg(series) : '<div class="empty">Chưa có chỉ số nào để vẽ biểu đồ.</div>'}</div>
      <div class="card"><h2>Thống kê kỹ thuật</h2><p class="sub">Từ các vòng có ghi Nâng cao. Giúp phụ huynh và HLV thấy cần tập phần nào.</p>${tiles}</div>
      <div class="card"><h2>Vòng gần đây</h2><p class="sub">Ghi hoặc sửa thống kê nâng cao cho từng vòng.</p>${rec}</div>`;
  }

  // =====================================================================
  // 6. Tra cứu
  // =====================================================================
  async function doLookup() {
    const q = ($s('plLq') && $s('plLq').value || '').trim(); P.lk.q = q;
    if (q.length < 2) throw new Error('Nhập ít nhất 2 ký tự.');
    P.lk.res = await rpc('whs_lookup_plus', { p_q: q });
  }
  function lookTab() {
    const R = P.lk.res;
    const res = R == null ? '' : !R.length ? '<div class="empty">Không tìm thấy golfer nào. Trẻ em chỉ tra được bằng đúng mã VNC.</div>'
      : `<div class="pl-list">${R.map(x => {
        const idx = [['Handicap Index', x.hi], ['Junior', x.junior], ['SNAG', x.snag]].filter(i => i[1] != null)
          .concat((x.sims || []).map(s => ['Golf 3D · ' + s.brand, s.idx])).map(([l, v]) => `<div><small>${esc(l)}</small><b class="n">${fx(+v)}</b></div>`).join('');
        const rec = (x.recent || []).map(r => `<li>${dmy(r.date)} · ${esc(r.course || '')} · <span>differential</span> <b class="n">${fx(+r.diff)}</b></li>`).join('');
        return `<div class="svitem pl-lk"><div><b>${esc(x.full_name)}</b><span>${esc(x.vnc_code)}${x.club ? ' · ' + esc(x.club) : ''}${x.is_minor ? ' · <span>Trẻ em</span>' : ''}</span>
          <div class="pl-tiles sm">${idx || '<span class="note">Chưa có chỉ số.</span>'}</div>${rec ? `<ol class="pl-rec">${rec}</ol>` : ''}</div></div>`;
      }).join('')}</div>`;
    return `<div class="card"><h2>Tra cứu golfer</h2><p class="sub">Gõ tên hoặc mã VNC. Người lớn: xem đủ chỉ số và 5 vòng gần nhất. Trẻ em: chỉ tra bằng đúng mã VNC, chỉ hiện chỉ số.</p>
      <div class="svia pl-lq"><input id="plLq" type="search" placeholder="Ví dụ: Nguyễn Văn A hoặc VNC-000123" value="${esc(P.lk.q)}" aria-label="Tên hoặc mã VNC"><button class="btn sm" data-pl="look">Tra cứu</button></div>${res}</div>`;
  }

  // =====================================================================
  // 7. Nhập điểm giải hàng loạt (nhân sự liên đoàn)
  // =====================================================================
  const I = P.imp;
  async function loadImp() {
    const c = ctx();
    const feds = c.admin ? c.feds : c.feds.filter(f => c.staff.some(s => s.federation_id === f.id && s.role !== 'club_admin'));
    I.feds = feds; if (!I.fed || !feds.some(f => f.id === I.fed)) I.fed = feds[0] ? feds[0].id : null;
    if (!I.fed) return;
    const [tees, lays] = await Promise.all([
      sel('whs_youth_tees', 'select=id,name,age_group,yd&archived=is.false&federation_id=eq.' + I.fed + '&order=name'),
      sel('whs_youth_layouts', 'select=id,name,holes&archived=is.false&federation_id=eq.' + I.fed + '&order=name'),
    ]);
    Object.assign(I, { tees, lays });
    if (!I.courses) I.courses = await sel('whs_courses', 'select=id,name,province,data->tees&status=eq.active&order=name');
  }
  function refOpts() {
    if (I.kind === 'junior') return (I.tees || []).map(t => `<option value="${t.id}"${I.ref === t.id ? ' selected' : ''}>${esc(t.name)} · ${t.age_group} · ${t.yd.length} <span>hố</span></option>`).join('');
    if (I.kind === 'snag') return (I.lays || []).map(l => `<option value="${l.id}"${I.ref === l.id ? ' selected' : ''}>${esc(l.name)} · ${l.holes.length} <span>hố</span></option>`).join('');
    return (I.courses || []).flatMap(c => Object.entries(c.tees || {}).map(([k, t]) => `<option value="${esc(c.id + '|' + k)}"${I.ref === c.id + '|' + k ? ' selected' : ''}>${esc(c.name)} · ${esc(t.name || k)}</option>`)).join('');
  }
  function parseRows(text) {
    const out = [];
    text.split(/\r?\n/).forEach((ln, i) => {
      const s = ln.trim(); if (!s || s.startsWith('#')) return;
      const t = s.split(/[,;\t:]+|\s+/).map(x => x.trim()).filter(x => x !== '');
      if (!t.length) return;
      if (!/\d/.test(t[0]) && !t.slice(1).some(x => /^\d+$/.test(x))) return;     // dòng tiêu đề
      let code = t[0], ref = null, rest = t.slice(1);
      if (rest.length && /^[A-Za-z]/.test(rest[0]) && rest[0].toUpperCase() !== 'X') { ref = rest[0]; rest = rest.slice(1); }
      const scores = rest.map(x => /^\d+$/.test(x) ? +x : x.toUpperCase() === 'X' ? 'X' : null);
      out.push({ line: i + 1, code, ref, scores });
    });
    return out;
  }
  async function impRun(commit) {
    I.text = $s('plImpT') ? $s('plImpT').value : I.text;
    I.event = $s('plImpE') ? $s('plImpE').value.trim() : I.event;
    I.date = $s('plImpD') ? $s('plImpD').value : I.date;
    I.ref = $s('plImpR') ? $s('plImpR').value : I.ref;
    I.holes = $s('plImpH') ? $s('plImpH').value : I.holes;
    const rows = parseRows(I.text || '');
    if (!rows.length) throw new Error('Chưa có dòng điểm nào.');
    const send = commit ? rows.filter(r => (I.res && I.res.rows || []).some(x => x.ok && x.line === r.line)) : rows;
    if (commit && !send.length) throw new Error('Không có dòng hợp lệ để ghi.');
    const body = send.map(r => { const o = { line: r.line, code: r.code, scores: r.scores }; if (r.ref) o.ref = r.ref; return o; });
    const res = await rpc('whs_bulk_import', { p_fed: I.fed, p_kind: I.kind, p_event: I.event || '', p_date: I.date || today(), p_ref: I.ref || null, p_holes: I.kind === 'whs' ? (I.holes || '18') : null, p_rows: body, p_commit: !!commit });
    I.res = res; I.rows = rows;
    if (commit) { toast(`Đã ghi ${res.ok} vòng.`); I.done = res; I.res = null; I.text = ''; }
  }
  function impTab() {
    if (!I.feds) {
      if (!I.loading) { I.loading = true; loadImp().catch(e => { SV().err = errMsg(e); }).then(() => { I.loading = false; repaint(); }); }
      return '<div class="card"><p class="note">Đang tải…</p></div>';
    }
    if (!I.fed) return '<div class="card"><div class="empty">Anh/chị chưa là nhân sự liên đoàn nào.</div></div>';
    const R = I.res;
    const prev = R ? `<div class="pl-imp-r"><p><b class="n">${R.ok}</b> <span>dòng hợp lệ</span> · <b class="n">${R.err}</b> <span>dòng lỗi</span></p>
      <div class="pl-tw"><table class="tb"><thead><tr><th>Dòng</th><th>Mã VNC</th><th>Golfer</th><th>Kết quả</th></tr></thead><tbody>${R.rows.map(x => `<tr class="${x.ok ? '' : 'bad'}"><td class="n">${x.line}</td><td>${esc(x.code)}</td><td>${esc(x.name || '')}</td><td>${x.ok ? '<span>Hợp lệ</span>' : esc(errMsg(x.error))}</td></tr>`).join('')}</tbody></table></div>
      ${R.ok ? `<div class="acts"><button class="btn" data-pl="impgo">Ghi ${R.ok} vòng hợp lệ</button></div>` : ''}</div>` : '';
    const done = I.done ? `<p class="pl-ok"><span>Lần nhập gần nhất:</span> <b class="n">${I.done.ok}</b> <span>vòng đã ghi và được tính.</span></p>` : '';
    return `<div class="card"><h2>Nhập điểm giải</h2><p class="sub">Ban tổ chức dán bảng điểm sau giải: mỗi dòng một golfer. Vòng nhập ở đây được xác nhận luôn và tính vào chỉ số của mọi bạn tham gia.</p>
      <div class="pl-fg">
        <div class="f"><label for="plImpF">Liên đoàn</label><select id="plImpF" data-plc="fed">${I.feds.map(f => `<option value="${f.id}"${f.id === I.fed ? ' selected' : ''}>${esc(f.short || f.name)}</option>`).join('')}</select></div>
        <div class="f"><label>Loại điểm</label><div class="seg">${[['junior', 'Junior'], ['snag', 'SNAG'], ['whs', 'Sân thật']].map(([k, l]) => `<button type="button" data-pl="impk" data-v="${k}" class="${I.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="f"><label for="plImpE">Tên giải</label><input id="plImpE" value="${esc(I.event || '')}" placeholder="Ví dụ: SNAG Golf League – Chặng 3"></div>
        <div class="f"><label for="plImpD">Ngày thi đấu</label><input id="plImpD" type="date" value="${esc(I.date || today())}" max="${today()}"></div>
        <div class="f"><label for="plImpR">${I.kind === 'snag' ? 'Layout SNAG' : I.kind === 'junior' ? 'Tee junior mặc định' : 'Sân · tee'}</label><select id="plImpR">${refOpts()}</select></div>
        ${I.kind === 'whs' ? `<div class="f"><label for="plImpH">Số hố</label><select id="plImpH">${[['18', '18 hố'], ['F', '9 hố đầu'], ['B', '9 hố sau']].map(([k, l]) => `<option value="${k}"${I.holes === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
      </div>
      <div class="f"><label for="plImpT">Bảng điểm</label><textarea id="plImpT" rows="8" spellcheck="false" placeholder="VNC-000123, 5, 4, 6, 3, 5, 4, 5, 6, 4&#10;VNC-000456, 6, 5, 5, 4, 6, 5, 5, 7, 5">${esc(I.text || '')}</textarea>
        <p class="note">Mỗi dòng: mã VNC rồi điểm từng hố (X = nhặt bóng, - = không chơi). Junior nhiều tee: ghi mã tee ngay sau mã VNC. Có thể chọn file CSV.</p>
        <input type="file" id="plImpFile" accept=".csv,.txt,text/csv,text/plain" aria-label="Chọn file CSV"></div>
      <div class="acts"><button class="btn" data-pl="impchk">Kiểm tra</button></div>${prev}${done}</div>`;
  }

  // =====================================================================
  // Tab, chuông, chèn vào form, sự kiện
  // =====================================================================
  window.srvExtraTabs = [
    { key: 'look', label: () => 'Tra cứu', show: () => true, render: lookTab },
    { key: 'prog', label: () => 'Tiến bộ', show: c => !!(c.golfers && c.golfers.length), render: progTab, load: loadProg },
    { key: 'imp', label: () => 'Nhập điểm giải', show: c => !!(c.admin || (c.staff || []).some(s => s.role !== 'club_admin')), render: impTab, load: loadImp },
  ];
  window.srvHeadExtra = () => `<button class="btn ghost sm pl-bell" data-pl="bell" aria-label="Thông báo" aria-expanded="${P.bell}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></svg><i class="nb${P.unread ? '' : ' hide'}">${P.unread}</i></button>`;

  let lastUser = null;
  function inject() {
    const body = $s('srvBody'); if (!body || !W.user()) return;
    // Chuông + hàng chờ chấm chéo ngay dưới phần đầu
    const head = body.querySelector('.svhead');
    const anchor = body.querySelector('.svtabs') || body.querySelector('.svwho') || head;
    ['plBell', 'plQueue'].forEach(id => { const x = $s(id); if (x) x.remove(); });
    if (anchor) {
      const tab = SV().tab;
      const html = (P.bell ? bellPanel() : '') + (tab !== 'com' && tab !== 'imp' ? queueCard() : '');
      if (html) anchor.insertAdjacentHTML('afterend', html);
    }
    // Ô bổ sung trong các form gửi điểm
    [['ysend', 'youth'], ['g3send', 'sim'], ['submit', 'whs'], ['post', 'whs']].forEach(([a, k]) => {
      const b = body.querySelector(`[data-a="${a}"]`); if (!b) return;
      const acts = b.closest('.acts') || b.parentNode;
      if (acts.previousElementSibling && acts.previousElementSibling.dataset && acts.previousElementSibling.dataset.plx) return;
      acts.insertAdjacentHTML('beforebegin', formExtras(k));
    });
    if (window.applyLang) { try { window.applyLang(); } catch (e) { } }
  }
  window.srvPlusBind = function () {
    const u = W.user();
    if (u && lastUser !== u.id) { lastUser = u.id; P.bell = false; loadNotes(true).then(() => { inject(); }); loadQueue().then(() => { if (P.queue.length) inject(); }); }
    if (!u) { lastUser = null; P.notes = []; P.unread = 0; P.queue = []; }
    inject();
  };
  async function guard(fn) {
    if (P.busy) return; P.busy = true;
    try { await fn(); if (SV().err) SV().err = ''; } catch (e) { SV().err = errMsg(e); }
    P.busy = false; repaint();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pl]'); if (!b) return;
    const a = b.dataset.pl, v = b.dataset.v;
    if (a === 'mclose') return closeModal();
    if (a === 'st') return statTap(v);
    if (a === 'stsave') return saveStats(false).catch(err => toast(errMsg(err)));
    if (a === 'stdel') return saveStats(true).catch(err => toast(errMsg(err)));
    if (a === 'stopen') { const [k, id] = v.split('|'); return openStats(k, id); }
    if (a === 'bell') { P.bell = !P.bell; if (P.bell) { loadNotes(true).then(() => { inject(); if (P.unread) setTimeout(markRead, 4000); }); } return inject(); }
    if (a === 'readall') return markRead().then(inject);
    if (a === 'push') return guard(enablePush);
    if (a === 'pok') { const [k, id] = v.split('|'); return guard(async () => { await rpc('whs_peer_attest', { p_kind: k, p_round: id, p_accept: true }); await loadQueue(); toast('Đã xác nhận điểm.'); }); }
    if (a === 'pno') { const x = $s('plWhy-' + v.split('|')[1]); if (x) { x.classList.toggle('hide'); const i = x.querySelector('input'); if (i) i.focus(); } return; }
    if (a === 'pno2') { const [k, id] = v.split('|'); const note = ($s('plWhyI-' + id) || {}).value || ''; return guard(async () => { await rpc('whs_peer_attest', { p_kind: k, p_round: id, p_accept: false, p_note: note }); await loadQueue(); toast('Đã gửi cho admin xem.'); }); }
    if (a === 'look') return guard(doLookup);
    if (a === 'impk') { I.kind = v; I.ref = null; I.res = null; return repaint(); }
    if (a === 'impchk') return guard(() => impRun(false));
    if (a === 'impgo') return guard(() => impRun(true));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target && e.target.id === 'plLq') { e.preventDefault(); guard(doLookup); }
    if (e.key === 'Escape' && $s('plModal')) closeModal();
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!t) return;
    if (t.dataset && t.dataset.pladv) { P.adv[t.dataset.pladv] = t.checked; return; }
    if (t.dataset && t.dataset.plc === 'fed') { I.fed = t.value; I.ref = null; I.res = null; return guard(loadImp); }
    if (t.id === 'plImpR') { I.ref = t.value; I.res = null; }
    if (t.id === 'plImpFile' && t.files && t.files[0]) { const r = new FileReader(); r.onload = () => { I.text = String(r.result || ''); if ($s('plImpT')) $s('plImpT').value = I.text; I.res = null; }; r.readAsText(t.files[0]); }
  });
  document.addEventListener('input', e => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.plk) return;
    const k = t.dataset.plk; P.peer[k] = { code: t.value };
    const n = $s('plPeerN-' + k); if (n) n.textContent = '';
  });
  document.addEventListener('focusout', e => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.plk || !t.value.trim()) return;
    const k = t.dataset.plk;
    resolvePeer(k).then(pv => { const n = $s('plPeerN-' + k); if (n && pv) n.textContent = '✓ ' + pv.name; })
      .catch(() => { const n = $s('plPeerN-' + k); if (n) n.textContent = 'Không tìm thấy mã VNC này.'; });
  });

  // ---------- Hộp thoại ----------
  function modal(html, cls) {
    closeModal();
    const d = document.createElement('div'); d.id = 'plModal'; d.className = 'pl-mod';
    d.innerHTML = `<div class="pl-box ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    d.addEventListener('click', e => { if (e.target === d) closeModal(); });
    document.body.appendChild(d);
    if (window.applyLang) { try { window.applyLang(); } catch (e) { } }
    const f = d.querySelector('button,input'); if (f) f.focus();
  }
  function closeModal() { const d = $s('plModal'); if (d) d.remove(); }

  // ---------- Giao diện ----------
  const css = document.createElement('style');
  css.textContent = `
.svtabs{overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none}.svtabs::-webkit-scrollbar{display:none}.svtabs button{flex:none;white-space:nowrap;padding-left:12px;padding-right:12px}
@media(min-width:700px){.svtabs{flex-wrap:wrap;overflow:visible}}
.svhead .svhx{display:flex;gap:8px;align-items:center;font-size:inherit;color:inherit}
.pl-bell{position:relative;padding:8px 12px}.pl-bell .nb{position:absolute;top:-6px;right:-6px;margin:0}
.pl-inst{display:inline-flex;gap:6px;align-items:center;margin-left:8px}
.pl-h{display:flex;justify-content:space-between;align-items:center;gap:12px}.pl-h h2{margin:0}
.pl-nl{margin:6px -20px 0}.pl-n{padding:12px 20px;border-top:1px solid var(--line);display:grid;gap:3px}
.pl-n.un{background:var(--warnBg)}.pl-n small{color:var(--mute);font-size:12.5px}.pl-n em{font-style:normal;font-size:13px;color:var(--mute)}
.pl-x{margin:14px 0 4px;display:grid;gap:10px}.pl-x .svia input{max-width:220px}.pl-adv span{font-size:14px}
.pl-sc{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.pl-sc span{display:grid;text-align:center;min-width:34px;border:1px solid var(--line);border-radius:8px;padding:3px 2px}
.pl-sc small{font-size:11px;color:var(--mute)}.pl-sc i{font-style:normal;font-size:10.5px;color:var(--mute)}.pl-sc b{font-variant-numeric:tabular-nums}.pl-sc .t{background:var(--soft)}
.pl-why{flex-basis:100%;margin-top:4px}
.pl-mod{position:fixed;inset:0;background:rgba(20,12,6,.45);display:flex;align-items:flex-end;justify-content:center;z-index:60}
.pl-box{background:var(--card);border-radius:18px 18px 0 0;padding:18px 18px 20px;width:100%;max-width:560px;max-height:92vh;overflow:auto}
.pl-box.wide{max-width:960px}
@media(min-width:700px){.pl-mod{align-items:center}.pl-box{border-radius:18px}}
.pl-steps{padding-left:20px;line-height:1.9}
.pl-st{display:grid;gap:0;margin:8px -18px;max-height:60vh;overflow:auto}
.pl-sr{display:grid;grid-template-columns:40px minmax(0,1fr);gap:6px 12px;align-items:center;padding:10px 18px;border-top:1px solid var(--line)}
.pl-hn{display:grid;text-align:center;grid-row:span 7;align-self:start}.pl-hn b{font-size:18px;color:var(--g)}.pl-hn small{font-size:11px;color:var(--mute)}
.pl-g{display:flex;align-items:center;gap:8px;min-width:0}.pl-g small{width:68px;flex:none;font-size:11.5px;color:var(--mute)}.pl-g>div{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
@media(min-width:900px){.pl-sr{grid-template-columns:44px minmax(0,1fr) minmax(0,1fr)}.pl-hn{grid-row:span 4}}
.pl-c{border:1px solid var(--line);background:var(--card);border-radius:9px;min-height:38px;min-width:38px;padding:4px 9px;font:inherit;font-size:13.5px;cursor:pointer;color:var(--ink)}
.pl-c.on{background:var(--gIn);border-color:var(--gIn);color:#fff}.pl-c:focus-visible{outline:2px solid var(--gold);outline-offset:1px}
.pl-g>div.pl-step{flex-wrap:nowrap}.pl-step b{min-width:18px;text-align:center;font-variant-numeric:tabular-nums}
.pl-chart{width:100%;height:auto;display:block;margin-top:8px}.pl-chart .ax text{font-size:11px;fill:var(--mute)}.pl-chart .ax line{stroke:var(--line)}
.pl-leg{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;margin-top:6px}.pl-leg i{display:inline-block;width:12px;height:3px;border-radius:2px;vertical-align:middle;margin-right:6px}
.pl-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:8px 0 14px}
.pl-tiles>div{background:var(--soft);border-radius:12px;padding:10px 12px;display:grid;gap:2px}.pl-tiles small{font-size:12px;color:var(--mute)}
.pl-tiles b{font-size:22px;color:var(--g)}.pl-tiles>div>span{font-size:12px;color:var(--mute)}
.pl-tiles.sm{grid-template-columns:repeat(auto-fit,minmax(110px,1fr));margin:8px 0 4px}.pl-tiles.sm b{font-size:18px}
.pl-tw{overflow-x:auto;margin:0 -4px}.pl-mt{font-size:13px;min-width:620px}.pl-mt td.n,.pl-mt th{text-align:right}.pl-mt th:first-child,.pl-mt td:first-child{text-align:left}
.pl-list .svitem:first-child{border-top:0}.pl-lk .pl-tiles.sm{background:none;padding:0;border-radius:0}
.pl-rec b{display:inline}.pl-lq input{flex:1;min-width:0}.pl-lk>div{flex:1}.pl-rec{margin:6px 0 0;padding-left:18px;font-size:13px;color:var(--mute)}
.pl-fg{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 14px}
#plImpT{width:100%;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13.5px}
.pl-imp-r{margin-top:12px}.pl-imp-r tr.bad td{color:var(--bad)}.pl-ok{color:var(--good)}
.pl-q .svitem>div:first-child{flex:1 1 100%;min-width:0}
`;
  document.head.appendChild(css);
})();
