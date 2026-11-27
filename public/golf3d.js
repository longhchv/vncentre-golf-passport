// ===== Mục "Tài khoản" › tab "Golf 3D": VNC Simulator Index trên máy chủ =====
// Minh · 25/11/2026. Máy chủ: migration 20261125000001_whs_simulator (repo vncentre-golf-passport, PR #29).
// Chỉ số NỘI BỘ VN Centre theo nguyên lý handicap thế giới, KHÔNG phải chỉ số chính thức của R&A/USGA/VGA.
// Golfer: chọn phòng 3D → sân ảo → nhập điểm từng hố (hoặc để AI đọc ảnh màn hình) → gửi kèm ảnh → admin phòng xác nhận.
// Admin phòng / nhân sự VN Centre: hàng chờ xác nhận. Admin nền tảng: hãng máy, sân ảo, admin phòng.
// Gắn vào lõi qua các móc window.srvSim* (giống tab "Trẻ em"); mọi thao tác có data-a bắt đầu bằng "g3".
(function () {
  const W = window.WHSrv;
  if (!W) return;
  const $s = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fx = x => x == null ? '–' : (x < 0 ? '+' + Math.abs(x).toFixed(1) : Number(x).toFixed(1));
  const dmy = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const badge = (t, k) => `<span class="bd ${k || ''}">${esc(t)}</span>`;
  const one = x => Array.isArray(x) ? x[0] : x;
  const NAME = 'VNC Simulator Index';
  const ST = { pending: ['Chờ phòng xác nhận', 'w'], confirmed: ['Đã xác nhận', ''], rejected: ['Bị từ chối', 'x'], withdrawn: ['Đã rút', 'm'], void: ['Đã huỷ', 'x'] };
  const FLAG = { gimme: 'Có bật gimme', edited_after_ai: 'Golfer sửa khác điểm AI đọc' };
  const HOLES = { '18': '18 hố', F: '9 hố đầu', B: '9 hố sau' };
  const ERR = {
    venue_not_found: 'Không tìm thấy phòng 3D.', venue_no_machine: 'Phòng này chưa khai báo hãng máy.', brand_disabled: 'VN Centre đang tạm dừng nhận điểm của hãng máy này.',
    course_not_found: 'Không tìm thấy sân ảo.', course_brand_mismatch: 'Sân ảo không thuộc hãng máy của phòng.', course_is_9_holes: 'Sân ảo này chỉ có 9 hố.',
    bad_holes: 'Số hố không hợp lệ.', gross_length: 'Chưa nhập đủ số hố.', gross_bad_value: 'Số gậy mỗi hố phải từ 1 đến 20.',
    mulligan_not_counted: 'Vòng có chơi lại cú hỏng (mulligan) không được tính chỉ số.', gimme_not_counted: 'Liên đoàn không nhận vòng bật putt tự động (gimme).',
    bad_date: 'Ngày chơi không hợp lệ.', too_old: 'Vòng chơi đã quá hạn gửi điểm.', photo_required: 'Cần gửi kèm ảnh màn hình bảng điểm.', bad_photo: 'Ảnh không hợp lệ.',
    duplicate_round: 'Vòng này đã được gửi.', cannot_withdraw: 'Chỉ rút được điểm đang chờ xác nhận.', not_pending: 'Điểm này đã được xử lý.',
    forbidden: 'Anh/chị không có quyền làm việc này (không tự xác nhận điểm của mình hoặc của con).', reason_required: 'Cần ghi lý do.',
    not_confirmed: 'Chỉ huỷ được vòng đã xác nhận.', course_9_or_18_holes: 'Sân ảo cần 9 hoặc 18 hố.', bad_par: 'Par từng hố phải từ 3 đến 6.',
    bad_si: 'Stroke index phải đủ và không trùng (1 đến số hố).', rating_required: 'Nhập Course Rating và Slope.', course_in_use: 'Sân ảo đã có vòng – không đổi hãng, par, SI được.',
    login_required: 'Nhập email hoặc số điện thoại.', user_not_found: 'Không tìm thấy tài khoản Golf Passport này.',
    not_active_member: 'Hồ sơ hội viên chưa được duyệt.', not_your_member: 'Hội viên này không thuộc tài khoản của anh/chị.',
  };
  const call = async (fn, args) => { try { return await W.rpc(fn, args); } catch (e) { throw new Error(ERR[e.code] || e.message); } };
  const sel = async (t, q) => { try { return await W.select(t, q); } catch (e) { return []; } };

  const G3 = { d: null, venue: null, course: null, holes: '18', photo: null, ai: null, open: null, photos: {}, scan: '' };
  window.G3 = G3;
  const SV = () => window.SV;
  const ctx = () => SV().ctx || {};
  const isStaff = () => { const c = ctx(); return !!(c.admin || (c.staff && c.staff.length)); };
  const isRoomAdmin = () => !!(ctx().roomAdmin && ctx().roomAdmin.length);
  const myMember = () => { const c = ctx(); return c.me && c.me.status === 'active' ? c.me : null; };

  // ---------- Nạp ----------
  async function load() {
    const m = myMember(), c = ctx();
    const [venues, courses, brands, idx, mine, queue, bstat, radmins] = await Promise.all([
      sel('practice_venues', 'select=id,name,district,region,machine&type=eq.3d&status=eq.active&machine=not.is.null&order=name'),
      sel('whs_sim_courses', 'select=*&status=eq.active&order=name,tee_name'),
      c.admin ? sel('sim_brands', 'select=key&active=is.true&order=sort,key') : [],
      m ? sel('whs_sim_index', 'select=*&member_id=eq.' + m.id + '&order=brand') : [],
      m ? sel('whs_sim_rounds', 'select=*,course:whs_sim_courses(name,tee_name,holes,par),venue:practice_venues(name),res:whs_sim_results(ags,diff,idx_after)&member_id=eq.' + m.id + '&order=played_on.desc,created_at.desc&limit=60') : [],
      (isStaff() || isRoomAdmin()) ? call('whs_sim_queue').catch(() => []) : [],
      sel('whs_sim_brand_status', 'select=*'),
      c.admin ? call('whs_sim_room_admin_list').catch(() => []) : [],
    ]);
    G3.d = { venues, courses, brands, idx, mine, queue, bstat, radmins };
    if (!G3.venue || !venues.some(v => v.id === G3.venue)) G3.venue = venues[0] ? venues[0].id : null;
    pickCourse();
    SV().ctx.simPend = queue.length;
  }
  window.srvSimLoad = load;

  const venueOf = id => G3.d.venues.find(v => v.id === id);
  const coursesFor = vid => { const v = venueOf(vid); return v ? G3.d.courses.filter(c => c.brand === v.machine) : []; };
  const courseOf = id => G3.d.courses.find(c => c.id === id);
  function pickCourse() {
    const L = coursesFor(G3.venue);
    if (!L.some(c => c.id === G3.course)) G3.course = L[0] ? L[0].id : null;
    const c = courseOf(G3.course);
    if (c && c.holes === 9) G3.holes = 'F';
  }
  const segPar = (c, h) => !c ? [] : h === '18' ? c.par : (c.holes === 9 ? c.par : h === 'F' ? c.par.slice(0, 9) : c.par.slice(9, 18));
  const holeInputs = (par, vals, cls, start) => '<div class="svholes">' + par.map((p, i) =>
    `<label class="hole"><span>Hố ${i + start}</span><small>Par ${p}</small><input class="${cls}" inputmode="numeric" value="${vals && vals[i] != null ? esc(vals[i]) : ''}"></label>`).join('') + '</div>';
  const firstHole = (c, h) => h === 'B' && c && c.holes === 18 ? 10 : 1;
  const official = b => { const s = G3.d.bstat.find(x => x.brand === b); return !!(s && s.wha_licensed && s.vga_signed_on); };

  // ---------- Vẽ ----------
  function introCard() {
    return `<div class="card"><h2>Golf 3D · ${NAME}</h2><p class="sub"><span>Chỉ số riêng cho golf mô phỏng (phòng 3D), mỗi hãng máy một chỉ số, không đổi qua lại với handicap sân thật.</span> <span>Đây là chỉ số nội bộ VN Centre. Nhãn Chính thức chỉ hiện khi hãng máy có giấy phép của The R&amp;A – USGA và đã ký với hiệp hội golf quốc gia.</span></p></div>`;
  }
  function myCard() {
    const m = myMember(); if (!m) return '';
    const L = G3.d.idx;
    return `<div class="card"><h2>Chỉ số của <span>${esc(m.full_name)}</span></h2>${L.length ? `<div class="kv">${L.map(x => `<div>${esc(x.brand)} ${x.official ? badge('Chính thức') : badge('Nội bộ', 'm')}<b>${x.idx != null ? fx(+x.idx) : '–'}</b><span class="note">${x.idx == null ? (x.need_scores ? 'cần thêm ' + x.need_holes + ' hố / ' + x.need_scores + ' vòng' : 'cần thêm ' + x.need_holes + ' hố') : x.n_scores + ' vòng · cập nhật ' + dmy(x.as_of)}</span></div>`).join('')}</div>`
      : '<div class="empty">Chưa có vòng nào được xác nhận. Gửi điểm ở mục bên dưới.</div>'}</div>`;
  }
  function submitCard() {
    const m = myMember(); if (!m) return '';
    const V = G3.d.venues;
    if (!V.length) return `<div class="card"><h2>Gửi điểm</h2><div class="empty">Chưa có phòng 3D nào nhận điểm.</div></div>`;
    const L = coursesFor(G3.venue), c = courseOf(G3.course), par = segPar(c, G3.holes);
    const scanBtn = SAMPLE ? `<label class="btn ghost sm scanb"><input type="file" id="g3Scan" accept="image/*" hidden>🤖 AI đọc ảnh màn hình</label>` : '';
    return `<div class="card"><h2>Gửi điểm vòng 3D</h2><p class="sub">Chụp màn hình bảng điểm cuối vòng trên máy (có ngày giờ). Vòng có chơi lại cú hỏng (mulligan) không được tính. Admin phòng xác nhận trong 72 giờ; phòng chưa có admin thì nhân sự VN Centre duyệt.</p>
      <div class="fields">
        <div class="f"><label for="g3Venue">Phòng 3D</label><select id="g3Venue">${V.map(v => `<option value="${esc(v.id)}"${v.id === G3.venue ? ' selected' : ''}>${esc(v.name)}${v.district ? ' · ' + esc(v.district) : ''} · ${esc(v.machine)}</option>`).join('')}</select></div>
        <div class="f"><label for="g3Course">Sân ảo · tee</label><select id="g3Course">${L.length ? L.map(x => `<option value="${x.id}"${x.id === G3.course ? ' selected' : ''}>${esc(x.name)} · ${esc(x.tee_name)} · ${x.holes} hố</option>`).join('') : '<option value="">Chưa có sân ảo cho hãng này</option>'}</select></div>
        <div class="f"><label>Số hố</label><div class="seg" id="g3H">${['18', 'F', 'B'].filter(h => !(c && c.holes === 9 && h !== 'F')).map(h => `<button data-a="g3holes" data-v="${h}" class="${G3.holes === h ? 'on' : ''}">${HOLES[h]}</button>`).join('')}</div></div>
        <div class="f"><label for="g3Date">Ngày chơi</label><input type="date" id="g3Date" value="${today()}" max="${today()}"></div>
      </div>
      ${c ? holeInputs(par, G3.ai, 'g3in', firstHole(c, G3.holes)) : '<div class="empty">Phòng này chưa có sân ảo. Báo VN Centre để khai báo.</div>'}
      <div class="chks"><label class="chk"><input type="checkbox" id="g3Gimme"> Có bật putt tự động (gimme)</label>
        <label class="chk"><input type="checkbox" id="g3Mull"> Có chơi lại cú hỏng (mulligan)</label></div>
      <div class="fields" style="margin-top:12px"><div class="f"><label for="g3Photo">Ảnh màn hình bảng điểm (bắt buộc)</label><input type="file" id="g3Photo" accept="image/*" capture="environment"><span class="note" id="g3PhotoN">${G3.photo ? 'Đã chọn ảnh (' + Math.round(G3.photo.data.length * 0.75 / 1024) + ' KB)' : ''}</span></div></div>
      <div id="g3ScanOut">${G3.scan}</div>
      <div class="acts">${scanBtn}<button class="btn" data-a="g3send"${c ? '' : ' disabled'}>Gửi điểm</button></div></div>`;
  }
  function mineCard() {
    const L = G3.d.mine; if (!L.length) return '';
    return `<div class="card"><h2>Các vòng 3D của tôi</h2><div class="list">${L.map(r => {
      const st = ST[r.status] || [r.status, ''], res = one(r.res), crs = r.course || {};
      return `<div class="svitem"><div><b>${dmy(r.played_on)} · ${esc(r.venue ? r.venue.name : r.venue_id)} · ${esc(r.brand)}</b><span>${esc(crs.name || '')} · ${esc(crs.tee_name || '')} · ${HOLES[r.holes]} · ${r.gross.join(' ')}${res && res.diff != null ? ' · điểm vòng ' + fx(+res.diff) + ' · chỉ số sau ' + fx(res.idx_after == null ? null : +res.idx_after) : ''}${r.decision_note ? ' · ' + esc(r.decision_note) : ''}</span><span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${(r.flags || []).map(f => badge(FLAG[f] || f, 'w')).join('')}</span></div>
        <div class="svia">${badge(st[0], st[1])}${r.status === 'pending' ? `<button class="btn ghost sm" data-a="g3withdraw" data-v="${r.id}">Rút lại</button>` : ''}</div></div>`;
    }).join('')}</div></div>`;
  }
  function queueCard() {
    if (!isStaff() && !isRoomAdmin()) return '';
    const Q = G3.d.queue;
    return `<div class="card"><h2>Điểm 3D chờ xác nhận ${Q.length ? `<i class="nb">${Q.length}</i>` : ''}</h2><p class="sub">Đối chiếu với ảnh màn hình: ngày giờ, tên sân ảo, điểm từng hố. Sửa điểm nếu cần rồi xác nhận; từ chối phải ghi lý do.</p>
      ${Q.length ? Q.map(r => {
        const op = G3.open === r.round_id, ph = G3.photos[r.round_id];
        return `<div class="row${op ? ' open' : ''}"><button class="rh" data-a="g3open" data-v="${r.round_id}" aria-expanded="${op}"><div class="c1"><b>${esc(r.golfer)} · ${dmy(r.played_on)}</b><span>${esc(r.venue_name)} · ${esc(r.course)} · ${esc(r.tee)} · ${HOLES[r.holes]}</span>
          <span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${r.overdue ? badge('Quá hạn 72 giờ', 'x') : ''}${r.room_has_admin ? '' : badge('Phòng chưa có admin', 'w')}${(r.flags || []).map(f => badge(FLAG[f] || f, 'w')).join('')}</span></div><div class="c2">${r.gross.join(' ')}</div></button>
          ${op ? `<div class="rd">${r.has_photo ? (ph ? `<img src="data:${esc(ph.mime)};base64,${ph.data}" alt="Ảnh màn hình bảng điểm" style="max-width:100%;border-radius:8px;margin-bottom:10px">` : '<p class="note">Đang tải ảnh…</p>') : '<p class="note">Không có ảnh.</p>'}
            ${r.ai_scores ? `<p class="note"><span>AI đọc:</span> ${r.ai_scores.join(' ')}</p>` : ''}
            ${holeInputs(r.par, r.gross, 'g3cin', r.holes === 'B' ? 10 : 1)}
            <div class="f" style="margin-top:12px"><label for="g3n-${r.round_id}">Ghi chú / lý do</label><input id="g3n-${r.round_id}" placeholder="VD: đã đối chiếu ảnh màn hình"></div>
            <div class="acts"><button class="btn sm" data-a="g3ok" data-v="${r.round_id}">Xác nhận</button><button class="btn ghost sm" data-a="g3no" data-v="${r.round_id}">Từ chối</button></div></div>` : ''}</div>`;
      }).join('') : '<div class="empty">Không có điểm nào đang chờ.</div>'}</div>`;
  }
  function adminCard() {
    if (!ctx().admin) return '';
    const D = G3.d, B = D.brands.map(b => b.key);
    const allV = D.venues;
    return `<div class="card"><h2>Hãng máy</h2><p class="sub">Chỉ số của hãng được đánh dấu Chính thức khi đủ cả hai: có giấy phép WHA và đã ký thỏa thuận với hiệp hội golf quốc gia.</p>
      ${D.bstat.length ? '<table class="tb"><thead><tr><th>Hãng</th><th>Giấy phép WHA</th><th>Ký hiệp hội</th><th>Nhận điểm</th></tr></thead><tbody>' + D.bstat.map(s => `<tr><td>${esc(s.brand)}</td><td>${s.wha_licensed ? '<span>Có</span>' + (s.wha_licensed_on ? ' · ' + dmy(s.wha_licensed_on) : '') : 'Chưa'}</td><td>${s.vga_signed_on ? dmy(s.vga_signed_on) : 'Chưa'}</td><td>${s.enabled ? 'Có' : 'Tạm dừng'}</td></tr>`).join('') + '</tbody></table>' : ''}
      <div class="fields" style="margin-top:12px"><div class="f"><label for="g3bB">Hãng</label><select id="g3bB">${B.map(b => `<option>${esc(b)}</option>`).join('')}</select></div>
        <div class="f"><label for="g3bW">Ngày có giấy phép WHA</label><input type="date" id="g3bW"></div>
        <div class="f"><label for="g3bV">Ngày ký với hiệp hội quốc gia</label><input type="date" id="g3bV"></div></div>
      <div class="chks"><label class="chk"><input type="checkbox" id="g3bL"> Đã có giấy phép WHA</label><label class="chk"><input type="checkbox" id="g3bE" checked> Cho nhận điểm</label></div>
      <div class="acts"><button class="btn ghost sm" data-a="g3brand">Lưu hãng</button></div></div>
    <div class="card"><h2>Sân ảo</h2><p class="sub">Mỗi dòng là một sân + một tee của một hãng. Rating/Slope tạm nhập tay theo số liệu của hãng; khi R&amp;A ra thông số thì cập nhật, máy chủ tự tính lại.</p>
      ${D.courses.length ? '<table class="tb"><thead><tr><th>Hãng</th><th>Sân · tee</th><th>Hố</th><th>CR / Slope</th><th>Nguồn</th></tr></thead><tbody>' + D.courses.map(x => `<tr><td>${esc(x.brand)}</td><td>${esc(x.name)} · ${esc(x.tee_name)}</td><td>${x.holes}</td><td>${Number(x.cr).toFixed(1)} / ${x.slope}</td><td>${esc(x.rating_source)}</td></tr>`).join('') + '</tbody></table>' : ''}
      <div class="fields" style="margin-top:12px"><div class="f"><label for="g3cB">Hãng</label><select id="g3cB">${B.map(b => `<option>${esc(b)}</option>`).join('')}</select></div>
        <div class="f"><label for="g3cN">Tên sân ảo</label><input id="g3cN" placeholder="Pebble Beach"></div><div class="f"><label for="g3cT">Tee</label><input id="g3cT" placeholder="White"></div></div>
      <div class="fields" style="margin-top:8px"><div class="f"><label for="g3cP">Par từng hố (9 hoặc 18 số)</label><input id="g3cP" placeholder="4,4,3,5,4,4,3,5,4,…"></div><div class="f"><label for="g3cS">Stroke index từng hố</label><input id="g3cS" placeholder="7,11,15,1,…"></div></div>
      <div class="fields" style="margin-top:8px"><div class="f"><label for="g3cR">Course Rating</label><input id="g3cR" inputmode="decimal" placeholder="72.0"></div><div class="f"><label for="g3cL">Slope</label><input id="g3cL" inputmode="numeric" placeholder="113"></div>
        <div class="f"><label for="g3cSrc">Nguồn rating</label><select id="g3cSrc"><option value="manual">Nhập tay</option><option value="brand">Hãng cung cấp</option><option value="wha">WHA</option></select></div></div>
      <div class="acts"><button class="btn ghost sm" data-a="g3course">Thêm sân ảo</button></div></div>
    <div class="card"><h2>Admin phòng 3D</h2><p class="sub">Người xác nhận điểm tại phòng. Nhập email hoặc số điện thoại tài khoản Golf Passport của họ.</p>
      ${D.radmins.length ? '<table class="tb"><thead><tr><th>Phòng</th><th>Tài khoản</th><th></th></tr></thead><tbody>' + D.radmins.map(a => `<tr><td>${esc(a.venue_name)}</td><td>${esc(a.login || a.user_id)}</td><td><button class="btn ghost sm" data-a="g3radel" data-v="${esc(a.venue_id)}|${esc(a.login || '')}">Bỏ quyền</button></td></tr>`).join('') + '</tbody></table>' : '<div class="empty">Chưa phòng nào có admin – nhân sự VN Centre đang duyệt thay.</div>'}
      <div class="fields" style="margin-top:12px"><div class="f"><label for="g3aV">Phòng 3D</label><select id="g3aV">${allV.map(v => `<option value="${esc(v.id)}">${esc(v.name)} · ${esc(v.machine)}</option>`).join('')}</select></div>
        <div class="f"><label for="g3aL">Email hoặc số điện thoại</label><input id="g3aL" placeholder="0912345678"></div></div>
      <div class="acts"><button class="btn ghost sm" data-a="g3radd">Giao quyền</button></div></div>`;
  }
  window.srvSimTab = function () {
    if (!G3.d) {
      // Mở thẳng vào tab (vd. admin phòng không là hội viên) mà chưa nạp → tự nạp rồi vẽ lại
      if (!G3.loading) { G3.loading = true; load().catch(e => { SV().err = e.message; }).finally(() => { G3.loading = false; window.srvPaint && window.srvPaint(); }); }
      return '<div class="card"><p class="note">Đang tải…</p></div>';
    }
    const v = SV().view;   // giao diện mới: mỗi trang chỉ lấy phần cần
    if (v === 'post') return submitCard();
    if (v === 'mine') return myCard() + mineCard();
    if (v === 'admin') return queueCard() + adminCard();
    return introCard() + myCard() + submitCard() + queueCard() + mineCard() + adminCard();
  };
  window.srvSimBind = function () {
    const v = $s('g3Venue'); if (v && !v.dataset.b) { v.dataset.b = 1; v.addEventListener('change', () => { G3.venue = v.value; G3.course = null; G3.ai = null; pickCourse(); keepPaint(); }); }
    const c = $s('g3Course'); if (c && !c.dataset.b) { c.dataset.b = 1; c.addEventListener('change', () => { G3.course = c.value; G3.ai = null; pickCourse(); keepPaint(); }); }
    const p = $s('g3Photo'); if (p && !p.dataset.b) { p.dataset.b = 1; p.addEventListener('change', onPhoto); }
    const s = $s('g3Scan'); if (s && !s.dataset.b) { s.dataset.b = 1; s.addEventListener('change', onScan); }
  };
  // Vẽ lại nhưng giữ ngày đã chọn
  function keepPaint() { const d = $s('g3Date') && $s('g3Date').value; window.srvPaint && window.srvPaint(); if (d && $s('g3Date')) $s('g3Date').value = d; }

  // ---------- Ảnh: nén ≤ 1600 px, JPEG (giống tab Trẻ em) ----------
  async function compress(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
      let max = 1600, q = 0.72, data;
      for (let k = 0; k < 4; k++) {
        const s = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        data = cv.toDataURL('image/jpeg', q).split(',')[1];
        if (data.length < 1400000) break; max = Math.round(max * 0.75); q -= 0.08;
      }
      return { mime: 'image/jpeg', data };
    } finally { URL.revokeObjectURL(url); }
  }
  async function onPhoto(e) {
    const f = e.target.files && e.target.files[0]; if (!f) { G3.photo = null; return; }
    try { G3.photo = await compress(f); const n = $s('g3PhotoN'); if (n) n.textContent = 'Đã chọn ảnh (' + Math.round(G3.photo.data.length * 0.75 / 1024) + ' KB)'; }
    catch (err) { G3.photo = null; alert(typeof tr === 'function' ? tr('Không đọc được ảnh.') : 'Không đọc được ảnh.'); }
  }

  // ---------- AI đọc ảnh màn hình (Claude) – chỉ có khi app chạy trong Claude ----------
  let SAMPLE = null, scanCtl = null;
  (async () => { try { if (!window.claude || !window.claude.use) return; const sm = await window.claude.use('sample'); const lim = sm && await sm.limits().catch(() => null); if (lim && lim.images) SAMPLE = sm; } catch (e) {} })();
  async function onScan(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f || !SAMPLE) return;
    const c = courseOf(G3.course); if (!c) return;
    const par = segPar(c, G3.holes), n = par.length, start = firstHole(c, G3.holes);
    G3.scan = '<p class="note">⏳ Đang đọc ảnh màn hình… (thường 20–60 giây)</p>'; const out = $s('g3ScanOut'); if (out) out.innerHTML = G3.scan + '<button class="btn ghost sm" id="g3Stop">Dừng</button>';
    scanCtl = new AbortController(); const st = $s('g3Stop'); if (st) st.onclick = () => scanCtl.abort();
    if (!G3.photo) { try { G3.photo = await compress(f); } catch (err) {} }
    const prompt = `You are reading a screenshot or photo of a golf simulator scorecard (${venueOf(G3.venue).machine}), virtual course "${c.name}", tee "${c.tee_name}". The player played ${n} holes starting at hole ${start}; pars: ${par.join(',')}.
Reply with ONLY one JSON object: {"course_text": string|null, "date": "YYYY-MM-DD"|null, "time": "HH:MM"|null, "players":[{"name": string, "scores":[${n} integers, gross strokes for holes ${start}..${start + n - 1}, null if unreadable]}], "mulligan_or_gimme_noted": string|null, "uncertain":[hole numbers]}
Ignore totals, net and points columns. Do not guess unreadable digits: put null. Today is ${today()}.`;
    try {
      const r = await SAMPLE.json(prompt, { images: [f], signal: scanCtl.signal, cache: false });
      const p = (r.players || []).filter(x => x && Array.isArray(x.scores))[0];
      if (!p) throw { code: 'invalid_json' };
      G3.ai = Array.from({ length: n }, (_, i) => { const v = parseInt(p.scores[i]); return v > 0 && v <= 20 ? v : null; });
      G3.scan = `<p class="note"><span>AI đã điền sẵn điểm.</span>${r.course_text ? ' <span>Sân trên ảnh:</span> <b>' + esc(r.course_text) + '</b>' : ''}${r.date ? ' <span>Ngày:</span> <b>' + dmy(r.date) + '</b>' : ''} <span>Kiểm tra lại từng hố trước khi gửi.</span>${G3.ai.some(x => x == null) ? ' <span>Ô trống là hố AI không đọc được.</span>' : ''}</p>`;
      if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date <= today()) G3.date = r.date;
    } catch (err) {
      const m = { not_granted: 'Anh/chị chưa cho phép app dùng Claude để đọc ảnh.', image_rejected: 'Ảnh không đọc được. Thử ảnh khác.', rate_limited: 'Đang gửi quá nhiều – thử lại sau ít phút.', invalid_json: 'Không đọc được bảng điểm từ ảnh này.', cancelled: 'Đã dừng.' };
      G3.scan = `<p class="why">${m[err && err.code] || 'Có lỗi khi đọc ảnh – hãy nhập tay.'}</p>`;
    }
    const d = G3.date; window.srvPaint && window.srvPaint(); if (d && $s('g3Date')) $s('g3Date').value = d;
  }

  // ---------- Thao tác ----------
  const readScores = (root, cls) => [...root.querySelectorAll('.' + cls)].map(i => {
    const v = i.value.trim(); if (!/^\d+$/.test(v) || +v < 1 || +v > 20) throw new Error('Nhập đủ số gậy từng hố (1 đến 20).'); return +v;
  });
  const nums = s => String(s || '').split(/[,;\s]+/).filter(Boolean).map(Number);
  window.srvSimAct = async function (a, v, b, act, paint) {
    if (a === 'g3holes') { G3.holes = v; G3.ai = null; return keepPaint(); }
    if (a === 'g3open') {
      G3.open = G3.open === v ? null : v; paint();
      const r = G3.d.queue.find(x => x.round_id === v);
      if (G3.open && r && r.has_photo && !G3.photos[v]) { const p = await sel('whs_sim_photos', 'select=mime,data&round_id=eq.' + v); if (p[0]) { G3.photos[v] = p[0]; paint(); } }
      return;
    }
    if (a === 'g3send') return act(async () => {
      const root = b.closest('.card'), gross = readScores(root, 'g3in');
      if ($s('g3Mull').checked) throw new Error(ERR.mulligan_not_counted);
      if (!G3.photo) throw new Error(ERR.photo_required);
      await call('whs_sim_submit', { p_venue: G3.venue, p_course: G3.course, p_holes: G3.holes, p_played_on: $s('g3Date').value, p_gross: gross,
        p_gimme: $s('g3Gimme').checked, p_mulligan: false, p_photo: G3.photo.data, p_photo_mime: G3.photo.mime, p_ai_scores: G3.ai && G3.ai.every(x => x != null) ? G3.ai : null, p_member: myMember().id });
      G3.photo = null; G3.ai = null; G3.scan = ''; G3.date = null; await load();
      window.srvToast && window.srvToast('Đã gửi – chờ phòng 3D xác nhận.');
    });
    if (a === 'g3withdraw') return act(async () => { await call('whs_sim_withdraw', { p_round: v }); await load(); });
    if (a === 'g3ok' || a === 'g3no') return act(async () => {
      const root = b.closest('.rd'), note = ($s('g3n-' + v).value || '').trim() || null;
      const gross = a === 'g3ok' ? readScores(root, 'g3cin') : null;
      await call('whs_sim_decide', { p_round: v, p_approve: a === 'g3ok', p_gross: gross, p_note: note });
      G3.open = null; await load(); window.srvToast && window.srvToast(a === 'g3ok' ? 'Đã xác nhận – chỉ số được tính lại.' : 'Đã từ chối.');
    });
    if (a === 'g3brand') return act(async () => {
      await call('whs_sim_set_brand_status', { p_brand: $s('g3bB').value, p_wha_licensed: $s('g3bL').checked, p_wha_on: $s('g3bW').value || null,
        p_vga_signed_on: $s('g3bV').value || null, p_enabled: $s('g3bE').checked, p_note: null });
      await load(); window.srvToast && window.srvToast('Đã lưu hãng máy.');
    });
    if (a === 'g3course') return act(async () => {
      const name = $s('g3cN').value.trim(), tee = $s('g3cT').value.trim();
      if (!name || !tee) throw new Error('Nhập tên sân ảo và tee.');
      const cr = parseFloat(String($s('g3cR').value).replace(',', '.')), sl = parseInt($s('g3cL').value);
      if (!(cr > 0) || !(sl > 0)) throw new Error(ERR.rating_required);
      await call('whs_sim_save_course', { p_id: null, p_brand: $s('g3cB').value, p_name: name, p_tee: tee, p_par: nums($s('g3cP').value), p_si: nums($s('g3cS').value),
        p_cr: cr, p_slope: sl, p_source: $s('g3cSrc').value });
      await load(); window.srvToast && window.srvToast('Đã thêm sân ảo.');
    });
    if (a === 'g3radd') return act(async () => {
      const who = await call('whs_sim_set_room_admin_by_login', { p_venue: $s('g3aV').value, p_login: $s('g3aL').value, p_active: true });
      await load(); window.srvToast && window.srvToast('Đã giao quyền: ' + who);
    });
    if (a === 'g3radel') return act(async () => {
      const [venue, login] = v.split('|'); if (!login) throw new Error('Tài khoản không có email/SĐT – bỏ quyền trên máy chủ.');
      await call('whs_sim_set_room_admin_by_login', { p_venue: venue, p_login: login, p_active: false });
      await load(); window.srvToast && window.srvToast('Đã bỏ quyền.');
    });
  };
})();
