/* @vncentre/site-builder – bộ tạo trang sân dùng chung cho app CSR và Golf Passport. Sinh từ app26.js + app30.js của app CSR (mã nguồn csr-vn 2026-10-26d + 02/11 giao diện giai đoạn 1+2). KHÔNG sửa tay: sửa app26/app30 bên app CSR rồi sinh lại. */
/* ===== GĐ2 · Tạo website giới thiệu sân từ dữ liệu đo (trang tĩnh, song ngữ, tông Golf Passport + người xem tự đổi giao diện) =====
   Hàm thuần sgModel / sgCourseHTML / sgIndexHTML dùng được cả trong app lẫn Node (để thử). */
const SG = {
  TEE_COLORS: [[/black|đen/i, '#1d1d1f'], [/gold|vàng kim/i, '#c9a227'], [/blue|xanh/i, '#2a62c9'], [/white|trắng/i, '#f2f2f2'], [/yellow|vàng/i, '#e5c23a'], [/red|đỏ/i, '#d13b3b'], [/green|lục/i, '#2e8b57'], [/silver|bạc/i, '#a7aab0']],
  TEE_VI: { black: 'Đen', gold: 'Vàng kim', blue: 'Xanh', white: 'Trắng', yellow: 'Vàng', red: 'Đỏ', green: 'Lục', silver: 'Bạc' },
  FAC: { range: ['Sân tập', 'Driving range'], putting: ['Green tập putt', 'Putting green'], rental: ['Thuê gậy', 'Club rental'], caddieReq: ['Bắt buộc caddie', 'Caddie required'], cart: ['Xe điện', 'Golf carts'], restaurant: ['Nhà hàng', 'Restaurant'], locker: ['Phòng thay đồ, tắm', 'Lockers & showers'], proshop: ['Pro shop', 'Pro shop'], hotel: ['Khách sạn trong khu', 'On-site hotel'], night: ['Chơi buổi tối', 'Night golf'] },
  CAT: { lodging: ['Lưu trú', 'Stay'], food: ['Ăn uống', 'Food'], cafe: ['Cà phê', 'Café'], see: ['Tham quan', 'Sightseeing'], family: ['Vui chơi gia đình', 'Family fun'], spa: ['Spa – massage', 'Spa & massage'], night: ['Buổi tối', 'Nightlife'], move: ['Di chuyển', 'Getting around'], shop: ['Mua sắm – Đặc sản', 'Shopping & local specialties'], kids: ['Khu vui chơi trẻ em', 'Kids & play'], heritage: ['Di tích – Di sản', 'Heritage'], nature: ['Thiên nhiên – Biển', 'Nature & beaches'], fun: ['Giải trí – Spa', 'Leisure & spa'] },
  /* Tab mục "Gợi ý tham khảo": mỗi tab gom 1 nhóm mới + các nhóm cũ tương ứng (giữ dữ liệu cũ hiển thị đúng) */
  TABS: [['lodging'], ['food'], ['cafe'], ['kids', 'family'], ['heritage', 'see'], ['nature'], ['fun', 'spa', 'night'], ['shop'], ['move']],
  SHOT: { gate: ['Cổng vào', 'Entrance'], clubhouse: ['Club House', 'Clubhouse'], reception: ['Quầy đón khách', 'Reception'], price: ['Bảng giá', 'Price list'], map: ['Sơ đồ sân', 'Course map'], scorecard: ['Scorecard', 'Scorecard'], bagdrop: ['Khu nhận túi gậy', 'Bag drop'], starter: ['Tee số 1', 'First tee'], signpost: ['Đường vào sân', 'Signposts'], lounge: ['Sảnh chờ', 'Lounge'], caddiemaster: ['Khu caddie', 'Caddie master'], rental: ['Thuê gậy, giày', 'Rentals'], evcharge: ['Sạc xe điện', 'EV charging'], range: ['Sân tập', 'Driving range'], putting: ['Green tập putt', 'Putting green'], restaurant: ['Nhà hàng', 'Restaurant'], terrace: ['View từ nhà hàng', 'Terrace view'], locker: ['Phòng thay đồ', 'Locker room'], proshop: ['Pro shop', 'Pro shop'], cart: ['Khu xe điện', 'Cart area'], halfway: ['Trạm nghỉ giữa sân', 'Halfway house'], dish: ['Món đặc trưng', 'Signature dish'], toilet: ['Nhà vệ sinh trên sân', 'On-course restroom'], rulesboard: ['Quy định sân', 'Course rules'], meeting: ['Phòng hội nghị, tiệc', 'Function room'], bunkerpractice: ['Khu tập bunker', 'Bunker practice'], cleaning: ['Khu rửa gậy', 'Club cleaning'], firstaid: ['Y tế', 'First aid'], academy: ['Học viện golf', 'Golf academy'], shortcourse: ['Sân ngắn, par-3', 'Short course'], honours: ['Bảng vinh danh', 'Honours board'], signature: ['Hố đẹp nhất', 'Signature hole'], view: ['Toàn cảnh', 'Course view'], sunset: ['Hoàng hôn', 'Sunset'], condition: ['Mặt cỏ', 'Turf'], nightlight: ['Đèn chơi buổi tối', 'Floodlights'], scenery: ['Cảnh quan quanh sân', 'Surroundings'], cartpath: ['Đường xe điện', 'Cart path'], shelter: ['Chòi trú mưa', 'Shelter'], markers: ['Cọc khoảng cách', 'Yardage markers'], teemarkers: ['Cọc tee', 'Tee markers'], flag: ['Green và cờ', 'Green & flag'], sand: ['Bunker', 'Bunker'], water: ['Hồ nước', 'Water'], nature: ['Thiên nhiên', 'Nature'], hotel: ['Khách sạn', 'Hotel'], room: ['Phòng khách sạn', 'Hotel room'], familyfac: ['Tiện ích gia đình', 'Family facilities'], team: ['Đoàn đo làm việc', 'Rating team at work'], other: ['Ảnh khác', 'More'] },
  PL: { front: ['Mặt tiền', 'Front'], entrance: ['Lối vào, đỗ xe', 'Entrance & parking'], inside: ['Bên trong', 'Inside'], menu: ['Thực đơn, giá', 'Menu & prices'], signature: ['Món tiêu biểu', 'Signature'], room: ['Phòng', 'Room'], view: ['View', 'View'], kids: ['Khu trẻ em', 'Kids area'], wc: ['Nhà vệ sinh', 'Restroom'], licence: ['Giấy phép', 'Licence'], other: ['Ảnh khác', 'More'] },
};
const sgEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sgSlug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'san';
const sgFmt = n => n == null || n === '' ? '' : Number(n).toLocaleString('en-US');
function sgTeeOf(title, gender) {
  const t = String(title || '').split('·').pop().trim(); const col = (SG.TEE_COLORS.find(([re]) => re.test(t)) || [0, '#888'])[1];
  const key = (Object.keys(SG.TEE_VI).find(k => new RegExp(k, 'i').test(t)) || '');
  return { name: t, vi: key ? SG.TEE_VI[key] : t, en: key ? key[0].toUpperCase() + key.slice(1) : t, color: col, gender: gender === 'F' ? 'F' : 'M' };
}
/* Ghép dữ liệu thành mô hình trang. preview=true: bỏ qua điều kiện đồng ý (chỉ để xem nội bộ). */
function sgModel(pack, opts = {}) {
  const preview = !!opts.preview, c = pack.course || {}, g = pack.guide || {}, inf = g.info || {}, tr = g.travel || {};
  const tees = (pack.tees || []).filter(t => (t.holes || []).some(h => h.len)).map(t => { const m = sgTeeOf(t.title, t.gender); const ls = t.holes.map(h => +h.len || 0);
    return { ...m, id: t.id, holes: t.holes, out: ls.slice(0, 9).reduce((a, b) => a + b, 0), in: ls.slice(9, 18).reduce((a, b) => a + b, 0), total: ls.reduce((a, b) => a + b, 0), photos: t.photos || [] }; })
    .sort((a, b) => b.total - a.total);
  const nH = Math.max(+c.holes || 0, ...tees.map(t => t.holes.length), 0);
  const ref = tees[0] || { holes: [] };
  const par = ref.holes.reduce((a, h) => a + (+h.par || 0), 0);
  const fT = tees.find(t => t.gender === 'F'), mT = tees.find(t => t.gender === 'M');
  const ph = (list, pred) => (list || []).find(pred);
  const stepRank = p => p.step === 'tee' ? (p.kind === 'teesign' ? 1 : 0) : /^lz:/.test(p.step || '') ? 2 + (+String(p.step).split(':')[2] || 1) * 2 + (String(p.step).split(':')[1] === 'b' ? 1 : 0) : p.step === 'green' ? (p.kind === 'back' ? 21 : p.kind === 'green' ? 20 : 22) : 30;
  const lab = (p, t) => { const st = String(p.step || ''), tv = t ? ` ${t.vi}` : '', te = t ? ` ${t.en}` : '';
    if (p.tvTee != null) return [`Từ tee ${p.tvTee}`, `From the ${p.tvTee} tee`];
    if (st === 'tee') return p.kind === 'teesign' ? ['Biển báo hố', 'Hole sign'] : p.kind === 'left' ? [`Tee${tv} · bên trái`, `${te} tee · left`] : p.kind === 'right' ? [`Tee${tv} · bên phải`, `${te} tee · right`] : [`Từ tee${tv} nhìn về green`, `From the${te} tee`];
    if (st.startsWith('lz:')) { const [, w, k] = st.split(':'), who = w === 'b' ? 'Bogey' : 'Scratch', side = p.kind === 'left' ? [' · bên trái', ' · left'] : p.kind === 'right' ? [' · bên phải', ' · right'] : p.kind === 'back' ? [' · nhìn lại', ' · looking back'] : ['', ''];
      return [`Điểm rơi ${k || 1} của ${who}${side[0]}`, `${who} landing zone ${k || 1}${side[1]}`]; }
    if (st === 'green') return p.kind === 'back' ? ['Từ sau green nhìn lại', 'From behind the green'] : p.kind === 'left' ? ['Green · bên trái', 'Green · left'] : p.kind === 'right' ? ['Green · bên phải', 'Green · right'] : ['Green', 'Green'];
    return ['Ảnh hố', 'Hole photo']; };
  const holes = Array.from({ length: nH }, (_, i) => { const n = i + 1, r = ref.holes[i] || {}, seen = new Set(), phs = [];
    const add = (p, t) => { const k = p.id || p.url; if (!k || seen.has(k)) return; seen.add(k); const [vi, en] = lab(p, t); phs.push({ p, vi, en, r: p.tvTee != null ? -1 : stepRank(p) }); };
    ((g.tv || {})[n] || []).forEach(x => x && add({ ...x, tvTee: x.tee || '' }, null));
    tees.forEach(t => (t.photos || []).filter(p => +p.hole === n).forEach(p => add(p, t)));
    phs.sort((a, b) => a.r - b.r);
    return { n, par: r.par ?? null, gw: r.greenWidth ?? null, gd: r.greenDepth ?? null, siM: ((mT || ref).holes[i] || {}).si ?? null, siF: fT ? (fT.holes[i] || {}).si ?? null : null,
      len: tees.map(t => (t.holes[i] || {}).len ?? null), phs, teePh: (phs[0] || {}).p || null }; });
  const gal = (g.photos || []).slice();
  const heroPick = g.heroId ? (gal.find(p => p.id === g.heroId) || tees.flatMap(t => t.photos || []).find(p => p.id === g.heroId) || ((g.tv ? Object.values(g.tv).flat() : []).find(p => p && p.id === g.heroId))) : null; /* ảnh chính do admin chọn (23/10/2026) */
  const heroP = heroPick || gal.find(p => p.kind === 'signature') || gal.find(p => p.kind === 'view') || gal.find(p => p.kind === 'sunset') || gal[0] || (holes[0] || {}).teePh || null;
  const places = (g.places || []).filter(p => p && p.name).map(p => { const ps = (p.photos || []).slice(); const cover = ps.find(x => x.kind === 'front') || ps.find(x => x.kind === 'signature') || ps[0] || null; return { ...p, cover, photos: cover ? [cover, ...ps.filter(x => x !== cover)] : ps }; });
  const official = (pack.officialWHS || []).flatMap(o => (o.tees || []).map(t => ({ ...t, date: o.date })));
  const name = c.name || '', nameEn = String(inf.nameEn || '').trim() || name;
  const longest = tees[0];
  const autoVi = `Sân ${nH} hố${c.province ? ` tại ${c.province}` : ''}, par ${par}${longest ? `, dài ${sgFmt(longest.total)} yd từ tee ${longest.vi}` : ''}.`;
  const autoEn = `A ${nH}-hole course${c.province ? ` in ${c.province}` : ''}, par ${par}${longest ? `, ${sgFmt(longest.total)} yd from the ${longest.en} tees` : ''}.`;
  return { slug: sgSlug(nameEn || name), name, nameEn, province: c.province || '', nH, par, tees, holes, fac: Object.keys(inf.fac || {}).filter(k => inf.fac[k] && SG.FAC[k]),
    introVi: String(inf.introVi || '').trim() || autoVi, introEn: String(inf.introEn || '').trim() || autoEn, info: inf, travel: tr, cond: opts.cond || {}, places, gal, heroP, official,
    show: { photos: true, holes: true, gps: true }, preview, measuredAt: opts.measuredAt || '', publishable: true };
}

/* ---- giao diện: tông Golf Passport mặc định + 3 tông khác, sáng/tối/theo máy; người xem tự chọn, lưu trên máy họ ---- */
const SG_CSS = `
:root{--bg:#FAF6EF;--surface:#ffffff;--ink:#0B0E2E;--muted:#5f5b6e;--line:#e6dfd2;--soft:#f4eee3;--accent:#B06829;--accent2:#F5C54E;--hdr:#070A2E;--hdrInk:#ffffff;--btn:linear-gradient(135deg,#B8702A,#F5C54E);--btnInk:#0B0E2E;
  --display:"Oswald","Arial Narrow",system-ui,sans-serif;--body:"Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#070A24;--surface:#10143a;--ink:#ECEAF4;--muted:#a9a8c2;--line:#262a55;--soft:#171b47;--accent:#E8B04A;--accent2:#F5C54E;--hdr:#050720;--hdrInk:#fff;--btn:linear-gradient(135deg,#C98734,#E8B04A);--btnInk:#0B0E2E;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#070A24;--surface:#10143a;--ink:#ECEAF4;--muted:#a9a8c2;--line:#262a55;--soft:#171b47;--accent:#E8B04A;--accent2:#F5C54E;--hdr:#050720;--hdrInk:#fff;--btn:linear-gradient(135deg,#C98734,#E8B04A);--btnInk:#0B0E2E;color-scheme:dark}
:root[data-pal="sea"]{--bg:#F2F7F8;--surface:#fff;--ink:#0E2A33;--muted:#557079;--line:#d3e3e7;--soft:#e4f0f2;--accent:#127082;--accent2:#58B7C6;--hdr:#0B3440;--btn:#127082;--btnInk:#fff}
@media (prefers-color-scheme: dark){:root[data-pal="sea"]:not([data-theme="light"]){--bg:#081a20;--surface:#0f252d;--ink:#e2f0f3;--muted:#9bb6bd;--line:#21414b;--soft:#13313a;--accent:#5cc3d3;--accent2:#58B7C6;--hdr:#06161b;--btn:#2a93a5;--btnInk:#fff}}
:root[data-pal="sea"][data-theme="dark"]{--bg:#081a20;--surface:#0f252d;--ink:#e2f0f3;--muted:#9bb6bd;--line:#21414b;--soft:#13313a;--accent:#5cc3d3;--accent2:#58B7C6;--hdr:#06161b;--btn:#2a93a5;--btnInk:#fff}
:root[data-pal="green"]{--bg:#F3F5F0;--surface:#fff;--ink:#15241C;--muted:#5b6b62;--line:#d9ded5;--soft:#e8eee6;--accent:#1F6B4A;--accent2:#D8A31A;--hdr:#173A2A;--btn:#1F6B4A;--btnInk:#fff}
@media (prefers-color-scheme: dark){:root[data-pal="green"]:not([data-theme="light"]){--bg:#0e1611;--surface:#16211b;--ink:#e4ece6;--muted:#9fb0a6;--line:#2a3a31;--soft:#1b2a22;--accent:#5bbd8d;--accent2:#e2b440;--hdr:#0b130e;--btn:#3f9c70;--btnInk:#fff}}
:root[data-pal="green"][data-theme="dark"]{--bg:#0e1611;--surface:#16211b;--ink:#e4ece6;--muted:#9fb0a6;--line:#2a3a31;--soft:#1b2a22;--accent:#5bbd8d;--accent2:#e2b440;--hdr:#0b130e;--btn:#3f9c70;--btnInk:#fff}
:root[data-pal="mono"]{--bg:#F6F6F4;--surface:#fff;--ink:#1a1a1a;--muted:#666;--line:#ddd;--soft:#ededea;--accent:#1a1a1a;--accent2:#9a9a9a;--hdr:#1a1a1a;--btn:#1a1a1a;--btnInk:#fff}
@media (prefers-color-scheme: dark){:root[data-pal="mono"]:not([data-theme="light"]){--bg:#121212;--surface:#1c1c1c;--ink:#ececec;--muted:#a3a3a3;--line:#333;--soft:#242424;--accent:#f0f0f0;--accent2:#888;--hdr:#000;--btn:#ececec;--btnInk:#111}}
:root[data-pal="mono"][data-theme="dark"]{--bg:#121212;--surface:#1c1c1c;--ink:#ececec;--muted:#a3a3a3;--line:#333;--soft:#242424;--accent:#f0f0f0;--accent2:#888;--hdr:#000;--btn:#ececec;--btnInk:#111}
:root[data-fs="l"]{font-size:17px}
*{box-sizing:border-box}
html{font-size:15px}
body{margin:0;background:var(--bg);color:var(--ink);font:1rem/1.6 var(--body)}
.wrap{max-width:1080px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1,h2,h3{font-family:var(--display);font-weight:600;line-height:1.1;text-wrap:balance;margin:0;letter-spacing:.01em}
h2{font-size:clamp(1.8rem,4vw,2.5rem)}h3{font-size:1.35rem}
.eyebrow{font:600 .75rem/1 var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums}.muted{color:var(--muted)}a{color:var(--accent)}
.bar{background:var(--hdr);color:var(--hdrInk)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--hdr)}
.top{display:flex;align-items:center;gap:10px;padding-block:10px;flex-wrap:wrap;position:relative}
.brand{font:600 .95rem/1.15 var(--display);letter-spacing:.08em;text-transform:uppercase;color:var(--hdrInk);text-decoration:none}
.brand{display:flex;align-items:center;gap:12px}.brand .blogo{height:44px;width:auto;display:block}.brand .bt{display:block;border-left:1px solid rgba(255,255,255,.28);padding-left:12px}
.brand small{display:block;font:500 .7rem/1.3 var(--body);letter-spacing:.02em;text-transform:none;opacity:.75}
@media (max-width:560px){.brand .blogo{height:34px}.brand .bt{font-size:.78rem}.brand small{display:none}}
.grow{flex:1}
.pill{all:unset;cursor:pointer;border:1px solid rgba(255,255,255,.35);color:var(--hdrInk);border-radius:999px;padding:6px 12px;font:600 .75rem/1 var(--body)}
.pill[aria-pressed="true"]{background:var(--accent2);color:#0B0E2E;border-color:transparent}
.pill:focus-visible,.sw:focus-visible,.hn button:focus-visible{outline:2px solid var(--accent2);outline-offset:2px}
.prefs{position:absolute;right:0;top:100%;z-index:20;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:14px;width:min(300px,calc(100vw - 32px));box-shadow:0 10px 30px rgba(0,0,0,.18)}
.prefs h4{margin:0 0 8px;font:600 .75rem/1 var(--body);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.prefs .row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.sw{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:.8rem}
.sw i{width:16px;height:16px;border-radius:50%;display:inline-block}
.sw[aria-pressed="true"]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.flag{font:600 .7rem/1.3 var(--body);background:var(--accent2);color:#0B0E2E;border-radius:6px;padding:5px 9px}
.hero{position:relative;border-radius:14px;overflow:hidden;background:var(--soft);aspect-ratio:16/8;max-width:100%;margin-top:14px}
.hero img{width:100%;height:100%;object-fit:cover;display:block}
.hero .cap{position:absolute;inset:auto 0 0 0;padding:28px 22px 18px;background:linear-gradient(to top,rgba(5,7,30,.85),rgba(5,7,30,0));color:#fff}
.hero h1{font-size:clamp(2.1rem,6vw,4rem);color:#fff}.hero p{margin:6px 0 0;color:#eceaf4;max-width:60ch}
.hero .eyebrow{color:var(--accent2)}
@media (max-width:560px){.hero{aspect-ratio:4/5}}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:16px}
.facts div{background:var(--surface);padding:12px 14px}@media (max-width:560px){.facts{grid-template-columns:1fr 1fr}.facts div:last-child:nth-child(odd){grid-column:1/-1}}.facts b{display:block;font:600 1.6rem/1.1 var(--display)}.facts span{font-size:.8rem;color:var(--muted)}
section{padding-block:36px 6px}
.lead{max-width:65ch;font-size:1.05rem}
.two{display:grid;grid-template-columns:1.2fr 1fr;gap:24px;align-items:start}.two>*{min-width:0}
@media (max-width:820px){.two{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.85rem}
th,td{padding:7px 8px;text-align:center;border-bottom:1px solid var(--line);white-space:nowrap}
th{font:600 .7rem/1.2 var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:var(--soft)}
td.l,th.l{text-align:left}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px;border:1px solid var(--line)}
.pending{border:1px dashed var(--line);border-radius:10px;padding:14px;background:var(--surface)}
.hn{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px}
.hn button{all:unset;cursor:pointer;flex:0 0 auto;min-width:42px;text-align:center;padding:8px 6px;border:1px solid var(--line);border-radius:8px;background:var(--surface);font:600 1rem/1 var(--display)}
.hn button small{display:block;font:500 .65rem/1.3 var(--body);color:var(--muted)}
.hn button[aria-pressed="true"]{background:var(--btn);border-color:transparent;color:var(--btnInk)}.hn button[aria-pressed="true"] small{color:var(--btnInk)}
.hole{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;margin-top:14px}.hole>*{min-width:0}
@media (max-width:820px){.hole{grid-template-columns:1fr}}
.ph{border-radius:12px;overflow:hidden;background:var(--soft);aspect-ratio:4/3;max-width:100%}.ph img{width:100%;height:100%;object-fit:cover;display:block}
.cap2{font-size:.78rem;color:var(--muted);margin-top:6px}
.hnum{display:flex;align-items:baseline;gap:10px}.hnum b{font:600 3.4rem/1 var(--display);color:var(--accent)}.hnum span{font:500 1.2rem/1 var(--display);color:var(--muted)}
.yd{display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;align-items:center;margin-top:12px}
.yd .b{height:8px;border-radius:4px;background:var(--soft);overflow:hidden}.yd .b i{display:block;height:100%}
.kv{display:grid;grid-template-columns:1fr auto;gap:4px 12px;margin:14px 0 0;font-size:.9rem}.kv dt{color:var(--muted)}.kv dd{margin:0;font-family:var(--mono)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.chip{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:6px 12px;font-size:.82rem}
.grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:14px}
.grid4 b{display:block;font:600 1.4rem/1.1 var(--display)}.grid4 span{font-size:.82rem;color:var(--muted)}
.places{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:14px}
.place{display:grid;grid-template-columns:110px 1fr;gap:12px}.place.np{grid-template-columns:1fr}.place>*{min-width:0}.place .ph{aspect-ratio:1/1}
.stars{font-family:var(--mono);font-size:.8rem;color:var(--muted)}
.gyhd{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:22px}.gyhd h3{margin:0}
.gyinfo{all:unset;cursor:pointer;flex:none;width:32px;height:32px;border-radius:50%;border:1.5px solid var(--accent);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;font:italic 600 1rem/1 Georgia,serif}
.gyinfo[aria-expanded="true"]{background:var(--accent);color:var(--surface)}
.gycrit{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin-top:12px;font-size:.88rem}.gycrit h4{margin:0;color:var(--accent);font-size:.92rem}.gycrit ul{margin:8px 0 2px;padding-left:20px}.gycrit li{margin:3px 0}
.gytabs,.galtabs{position:sticky;top:0;z-index:5;background:var(--bg);display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:10px 0;margin-top:12px;border-bottom:1px solid var(--line)}.gytabs::-webkit-scrollbar,.galtabs::-webkit-scrollbar{display:none}
.gytab,.galtab{all:unset;cursor:pointer;flex:none;display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font:600 .85rem/1 var(--body);white-space:nowrap}
.gytab .n,.galtab .n{font-weight:500;color:var(--muted);font-size:.75rem}.gytab[aria-selected="true"],.galtab[aria-selected="true"]{background:var(--btn);border-color:transparent;color:var(--btnInk)}.gytab[aria-selected="true"] .n,.galtab[aria-selected="true"] .n{color:var(--btnInk);opacity:.8}
.gyp[hidden],.galp[hidden],.gycrit[hidden]{display:none}
.galp:not(.open)>figure:nth-child(n+7){display:none}
.gal.galp{grid-template-columns:repeat(2,minmax(0,1fr))}@media(min-width:600px){.gal.galp{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:900px){.gal.galp{grid-template-columns:repeat(6,minmax(0,1fr))}}
.gyp:not(.open)>.place:nth-child(n+4){display:none}
.gymore{all:unset;box-sizing:border-box;cursor:pointer;grid-column:1/-1;justify-self:center;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;border:1.5px solid var(--accent);color:var(--accent);background:var(--surface);font:600 .88rem/1.2 var(--body)}
.gymore svg{transition:transform .2s}.open>.gymore svg{transform:rotate(180deg)}
.open>.gymore .gym-a,:not(.open)>.gymore .gym-b{display:none}
.gymore:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.gytab:focus-visible,.galtab:focus-visible,.gyinfo:focus-visible,.gymap:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.gymeta{display:flex;flex-wrap:wrap;gap:4px 14px;margin:4px 0 2px;font-size:.85rem;color:var(--muted)}.gymeta b{color:var(--ink,inherit)}.gystar{color:#c98a00}
.gymap{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;padding:10px 12px;border:1.5px solid var(--accent);border-radius:10px;color:var(--accent);text-decoration:none;font:600 .88rem/1.2 var(--body);text-align:center}
.copy{all:unset;cursor:pointer;font:600 .75rem/1 var(--body);color:var(--accent);border:1px solid var(--line);border-radius:6px;padding:5px 8px;margin-left:6px}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin-top:14px}.gal figure{margin:0}.gal .ph{aspect-ratio:1/1;border-radius:8px}
figcaption{font-size:.78rem;color:var(--muted);margin-top:4px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:18px}
.ccard{display:block;text-decoration:none;color:inherit;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.ccard .ph{border-radius:0;aspect-ratio:16/10}.ccard div.t{padding:12px 14px}
.thumbs{display:flex;gap:6px;overflow-x:auto;margin-top:8px;padding-bottom:4px}
.thumbs .th{all:unset;cursor:pointer;flex:0 0 auto;width:64px;height:48px;border-radius:6px;overflow:hidden;background:var(--soft);border:2px solid transparent}
.thumbs .th img{width:100%;height:100%;object-fit:cover;display:block}.thumbs .th.on{border-color:var(--accent)}.thumbs .th:focus-visible{outline:2px solid var(--accent)}
img[data-lb]{cursor:zoom-in}
.lb{position:fixed;inset:0;z-index:50;background:rgba(4,6,20,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
.lbw{display:inline-block;max-width:100%;max-height:calc(100% - 70px);line-height:0}.lb img{display:block;max-width:100%;max-height:calc(100vh - 110px);object-fit:contain;border-radius:6px}
.lb .lbc{color:#eceaf4;font-size:.9rem;margin-top:10px;text-align:center}
.lb button{all:unset;cursor:pointer;position:absolute;color:#fff;background:rgba(255,255,255,.12);border-radius:999px;width:44px;height:44px;display:grid;place-items:center;font:500 22px/1 var(--body)}
.lb button:focus-visible{outline:2px solid var(--accent2)}
.lb .x{top:max(14px,env(safe-area-inset-top,0px));right:max(14px,env(safe-area-inset-right,0px))}.lb .pv{left:max(10px,env(safe-area-inset-left,0px));top:50%}.lb .nx{right:max(10px,env(safe-area-inset-right,0px));top:50%}
footer{margin-top:40px;padding-block:24px 40px;border-top:1px solid var(--line);font-size:.82rem;color:var(--muted)}
@media (prefers-reduced-motion:no-preference){.hole{animation:sgin .25s ease-out}@keyframes sgin{from{opacity:.5;transform:translateY(4px)}to{opacity:1;transform:none}}}`;

/* phần đầu trang + bảng chọn giao diện, dùng chung cho trang sân và trang danh sách */
function sgHead(title, desc, extra) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${sgEsc(title)}</title><meta name="description" content="${sgEsc(desc)}"><meta property="og:title" content="${sgEsc(title)}"><meta property="og:description" content="${sgEsc(desc)}">${extra || ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600&family=IBM+Plex+Mono:wght@500&family=Oswald:wght@500;600&display=swap">
<script>try{var d=document.documentElement,p=JSON.parse(localStorage.getItem('sg_prefs')||'{}');if(p.pal&&p.pal!=='gp')d.dataset.pal=p.pal;if(p.theme==='light'||p.theme==='dark')d.dataset.theme=p.theme;if(p.fs==='l')d.dataset.fs='l';if(p.lang==='en')d.lang='en';}catch(e){}<\/script>
<style>${SG_CSS}${typeof SG_P1_CSS !== 'undefined' ? SG_P1_CSS : ''}${typeof SG_P2_CSS !== 'undefined' ? SG_P2_CSS : ''}</style>
<script>/* đếm lượt xem: Cloudflare Web Analytics, không cookie (02/11/2026) */try{if(/(^|\\.)courses\\.vncentre\\.net$|vncentre-courses\\.pages\\.dev$/.test(location.hostname)&&!window.__cfBeacon){var cfb=document.createElement('script');cfb.defer=true;cfb.src='https://static.cloudflareinsights.com/beacon.min.js';cfb.setAttribute('data-cf-beacon','{"token":"6ed43d34957a49fcb90ec8e43f7db523"}');document.head.appendChild(cfb)}}catch(e){}<\/script></head><body>`;
}
/* Logo Course & Slope Rating – Vietnam Team (trắng, nền trong; Long gửi 02/11/2026) */
const SG_LOGO = 'data:image/webp;base64,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';
function sgTopBar(homeHref, flag) {
  return `<div class="bar"><div class="wrap top"><a class="brand" href="${homeHref}"><img class="blogo" src="${SG_LOGO}" width="521" height="132" alt="Course &amp; Slope Rating – Vietnam Team"><span class="bt">Sân golf Việt Nam<small>VN Centre – CSR Vietnam Team</small></span></a><span class="grow"></span>${flag ? `<span class="flag" data-vi="${sgEsc(flag[0])}" data-en="${sgEsc(flag[1])}">${sgEsc(flag[0])}</span>` : ''}
  <button class="pill" id="sgL" data-l="vi" aria-pressed="true">VI</button><button class="pill" id="sgE" data-l="en" aria-pressed="false">EN</button>
  <button class="pill" id="sgP" aria-expanded="false" aria-controls="sgPrefs" data-vi="Giao diện" data-en="Display">Giao diện</button>
  <div class="prefs" id="sgPrefs" hidden><h4 data-vi="Tông màu" data-en="Colours">Tông màu</h4><div class="row">
   <button class="sw" data-pal="gp"><i style="background:linear-gradient(135deg,#070A2E 50%,#E8B04A 50%)"></i>Golf Passport</button><button class="sw" data-pal="sea"><i style="background:#127082"></i><span data-vi="Biển" data-en="Sea">Biển</span></button>
   <button class="sw" data-pal="green"><i style="background:#1F6B4A"></i><span data-vi="Sân cỏ" data-en="Fairway">Sân cỏ</span></button><button class="sw" data-pal="mono"><i style="background:#1a1a1a"></i><span data-vi="Tối giản" data-en="Minimal">Tối giản</span></button></div>
   <h4 data-vi="Sáng / tối" data-en="Light / dark">Sáng / tối</h4><div class="row"><button class="sw" data-th="auto" data-vi="Theo máy" data-en="System">Theo máy</button><button class="sw" data-th="light" data-vi="Sáng" data-en="Light">Sáng</button><button class="sw" data-th="dark" data-vi="Tối" data-en="Dark">Tối</button></div>
   <h4 data-vi="Cỡ chữ" data-en="Text size">Cỡ chữ</h4><div class="row" style="margin:0"><button class="sw" data-fs="m" data-vi="Vừa" data-en="Normal">Vừa</button><button class="sw" data-fs="l" data-vi="Lớn" data-en="Large">Lớn</button></div></div></div></div>`;
}
const SG_JS_BASE = `
var P={};try{P=JSON.parse(localStorage.getItem('sg_prefs')||'{}')}catch(e){}
var lang=P.lang==='en'?'en':'vi';function T(v,e){return lang==='en'?e:v}
function save(){try{localStorage.setItem('sg_prefs',JSON.stringify(P))}catch(e){}}
function paint(){var d=document.documentElement;if(P.pal&&P.pal!=='gp')d.dataset.pal=P.pal;else delete d.dataset.pal;
 if(P.theme==='light'||P.theme==='dark')d.dataset.theme=P.theme;else delete d.dataset.theme;if(P.fs==='l')d.dataset.fs='l';else delete d.dataset.fs;d.lang=lang;
 document.querySelectorAll('[data-vi]').forEach(function(el){el.textContent=el.getAttribute('data-'+lang)});
 document.getElementById('sgL').setAttribute('aria-pressed',lang==='vi');document.getElementById('sgE').setAttribute('aria-pressed',lang==='en');
 document.querySelectorAll('.sw[data-pal]').forEach(function(b){b.setAttribute('aria-pressed',(P.pal||'gp')===b.dataset.pal)});
 document.querySelectorAll('.sw[data-th]').forEach(function(b){b.setAttribute('aria-pressed',(P.theme||'auto')===b.dataset.th)});
 document.querySelectorAll('.sw[data-fs]').forEach(function(b){b.setAttribute('aria-pressed',(P.fs||'m')===b.dataset.fs)});
 if(window.sgRender)window.sgRender();}
document.addEventListener('click',function(e){var b=e.target.closest('button');var pr=document.getElementById('sgPrefs');
 if(!b){if(pr&&!pr.hidden&&!e.target.closest('#sgPrefs')){pr.hidden=true;document.getElementById('sgP').setAttribute('aria-expanded','false')}return}
 if(b.id==='sgP'){pr.hidden=!pr.hidden;b.setAttribute('aria-expanded',!pr.hidden);return}
 if(b.dataset.l){lang=b.dataset.l;P.lang=lang;save();paint();return}
 if(b.dataset.pal&&b.classList.contains('sw')){P.pal=b.dataset.pal;save();paint();return}
 if(b.dataset.th){P.theme=b.dataset.th;save();paint();return}
 if(b.dataset.fs&&b.classList.contains('sw')){P.fs=b.dataset.fs;save();paint();return}
 if(b.dataset.copy){var t=b.dataset.copy,ok=function(){b.textContent=T('Đã chép','Copied')};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(ok).catch(function(){})}});
var LB=null,LBI=0,LBF=null;
function lbShow(){var b=document.getElementById('lb');if(!LB){if(b)b.remove();if(LBF)LBF.focus();return}var it=LB[LBI];
 if(!b){b=document.createElement('div');b.id='lb';b.className='lb';b.setAttribute('role','dialog');b.setAttribute('aria-modal','true');b.innerHTML='<div class="lbw"><img alt=""></div><div class="lbc"></div><button class="x" aria-label="Close">×</button><button class="pv" aria-label="Previous">‹</button><button class="nx" aria-label="Next">›</button>';document.body.appendChild(b);b.querySelector('.x').focus()}
 b.querySelector('img').src=it.s;b.querySelector('img').alt=T(it.vi,it.en);b.querySelector('.lbc').textContent=T(it.vi,it.en)+(LB.length>1?'  ·  '+(LBI+1)+'/'+LB.length:'');
 b.querySelector('.pv').hidden=b.querySelector('.nx').hidden=LB.length<2}
function lbStep(d){if(!LB)return;LBI=(LBI+d+LB.length)%LB.length;lbShow()}
document.addEventListener('click',function(e){var b=e.target.closest('.lb button');if(b){if(b.classList.contains('x'))LB=null,lbShow();else lbStep(b.classList.contains('nx')?1:-1);return}
 if(e.target.classList&&e.target.classList.contains('lb')){LB=null;lbShow();return}
 var im=e.target.closest('img[data-lb]');if(!im)return;var g=im.dataset.lb;LBF=im;
 if(window.sgLbList&&window.sgLbList(g)){LB=window.sgLbList(g).list;LBI=window.sgLbList(g).i}
 else{var all=[].slice.call(document.querySelectorAll('img[data-lb="'+g+'"]'));LB=all.map(function(x){return{s:x.getAttribute('src'),vi:x.dataset.viC||'',en:x.dataset.enC||''}});LBI=Math.max(0,all.indexOf(im))}
 lbShow()});
var tx0=null;document.addEventListener('touchstart',function(e){if(LB&&e.target.closest('.lb'))tx0=e.touches[0].clientX},{passive:true});
document.addEventListener('touchend',function(e){if(LB&&tx0!=null){var dx=e.changedTouches[0].clientX-tx0;if(Math.abs(dx)>40)lbStep(dx<0?1:-1);tx0=null}},{passive:true});
document.addEventListener('keydown',function(e){if(LB){if(e.key==='Escape'){LB=null;lbShow()}else if(e.key==='ArrowRight')lbStep(1);else if(e.key==='ArrowLeft')lbStep(-1);return}
 if(e.key==='Escape'){var pr=document.getElementById('sgPrefs');if(pr&&!pr.hidden){pr.hidden=true;document.getElementById('sgP').focus()}}});`;

const sgBi = (vi, en, tag = 'span', attrs = '') => `<${tag} ${attrs} data-vi="${sgEsc(vi)}" data-en="${sgEsc(en)}">${sgEsc(vi)}</${tag}>`;
/* ===== Mục "Gợi ý tham khảo" theo tab (23/10/2026) =====
   Trường thêm cho địa điểm tra cứu (src='web'): km (đường chim bay từ sân), gR (sao Google), gN (lượt đánh giá), gAt (ngày lấy số), pid (Google place_id). */
const SG_PIN = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
const sgGyMap = p => p.map || (p.pid ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${encodeURIComponent(p.pid)}` : '');
const sgKm = k => { k = +k; return k < 10 ? String(Math.round(k * 10) / 10).replace('.', ',') : String(Math.round(k)); };
const sgKmEn = k => { k = +k; return k < 10 ? String(Math.round(k * 10) / 10) : String(Math.round(k)); };
function sgGyMeta(p) {
  const a = [];
  if (p.km != null && p.km !== '') a.push(`<span>${sgBi('Cách sân', 'From course')} <b class="num" data-vi="≈ ${sgKm(p.km)} km" data-en="≈ ${sgKmEn(p.km)} km">≈ ${sgKm(p.km)} km</b></span>`);
  if (+p.gR) { const n = +p.gN || 0; a.push(`<span><span class="gystar" aria-hidden="true">★</span> <b class="num" data-vi="${(+p.gR).toFixed(1).replace('.', ',')}" data-en="${(+p.gR).toFixed(1)}">${(+p.gR).toFixed(1).replace('.', ',')}</b> Google${n ? ` · <span data-vi="${n.toLocaleString('de-DE')} lượt" data-en="${n.toLocaleString('en-US')} reviews">${n.toLocaleString('de-DE')} lượt</span>` : ''}</span>`); }
  return a.length ? `<p class="gymeta">${a.join('')}</p>` : '';
}
/* Mỗi tab chỉ hiện 3 địa điểm đầu (gần sân nhất), bấm mũi tên để xem thêm / thu gọn (29/10/2026). */
const SG_GY_TOP = 3;
const SG_CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>';
const sgGyMore = (n, u = ['địa điểm', 'more']) => `<button type="button" class="gymore" aria-expanded="false">${sgBi(`Xem thêm ${n} ${u[0]}`, `Show ${n} ${u[1]}`, 'span', 'class="gym-a"')}${sgBi('Thu gọn', 'Show less', 'span', 'class="gym-b"')}${SG_CHEV}</button>`;
function sgGySection(list, card) {
  const tabOf = c => SG.TABS.findIndex(t => t.includes(c));
  const groups = SG.TABS.map(() => []);
  list.forEach(p => { const k = tabOf(p.cat); (groups[k < 0 ? groups.length - 1 : k]).push(p); });
  groups.forEach(g => g.sort((a, b) => (a.km == null || a.km === '' ? 1e9 : +a.km) - (b.km == null || b.km === '' ? 1e9 : +b.km)));
  const tabs = SG.TABS.map((t, i) => [t[0], groups[i]]).filter(x => x[1].length);
  if (!tabs.length) return '';
  const dates = list.map(p => p.gAt).filter(Boolean).sort(), at = dates[dates.length - 1] || '';
  const atVi = at ? at.split('-').reverse().join('/') : '';
  const fam = list.some(p => ['kids', 'family', 'nature'].includes(p.cat));
  const crit = [
    ['Nằm trong phạm vi khoảng 60 phút lái xe từ sân.', 'Within about a 60-minute drive of the course.'],
    ['Được chấm từ 4.0 sao trở lên, với ít nhất 50 lượt đánh giá trên Google Maps.' + (fam ? ' Riêng nhóm Khu vui chơi trẻ em và Thiên nhiên – Biển: từ 3.0 sao và ít nhất 20 lượt, vì quanh sân ít địa điểm loại này và bãi biển, núi thường ít người chấm.' : ''), 'Rated 4.0 stars or higher with at least 50 Google Maps reviews.' + (fam ? ' Kids & play and Nature & beaches: 3.0 stars and 20 reviews, since such places are fewer and beaches or hills get fewer reviews.' : '')],
    ['Trong mỗi nhóm, nơi gần sân xếp trước.', 'Within each group, the nearest places come first.'],
    ['Khoảng cách tính theo đường chim bay từ sân; đường đi thực tế sẽ xa hơn.', 'Distances are straight-line from the course; the road distance is longer.'],
    [`Số sao và lượt đánh giá lấy từ Google Maps${atVi ? ' ngày ' + atVi : ''}, có thể đã thay đổi.`, `Ratings and review counts from Google Maps${at ? ' on ' + at : ''}; they may have changed.`]];
  return `<div class="gyhd"><h3>${sgBi('Gợi ý tham khảo', 'More suggestions')}</h3><button class="gyinfo" id="gyInfo" aria-expanded="false" aria-controls="gyCrit" data-vi="i" data-en="i" title="Tiêu chí chọn địa điểm" aria-label="Các địa điểm này được chọn thế nào?">i</button></div>
    ${sgBi('Thông tin tra cứu từ nguồn công khai, đoàn đo chưa trực tiếp ghé. Nên gọi trước để kiểm tra.', 'Compiled from public sources; not yet visited by our team. Please check before you go.', 'p', 'class="muted" style="font-size:.85rem;margin:4px 0 0"')}
    <div class="gycrit" id="gyCrit" hidden>${sgBi('Các địa điểm này được chọn thế nào?', 'How were these places chosen?', 'h4')}<ul>${crit.map(c => sgBi(c[0], c[1], 'li')).join('')}</ul></div>
    <div class="gytabs" role="tablist" aria-label="Nhóm gợi ý">${tabs.map((t, i) => `<button class="gytab" role="tab" id="gyt-${t[0]}" aria-controls="gyp-${t[0]}" aria-selected="${!i}" tabindex="${i ? -1 : 0}" data-gt="${t[0]}">${sgBi(SG.CAT[t[0]][0], SG.CAT[t[0]][1])}<span class="n">${t[1].length}</span></button>`).join('')}</div>
    ${tabs.map((t, i) => `<div class="places gyp" role="tabpanel" id="gyp-${t[0]}" aria-labelledby="gyt-${t[0]}"${i ? ' hidden' : ''}>${t[1].map(card).join('')}${t[1].length > SG_GY_TOP ? sgGyMore(t[1].length - SG_GY_TOP) : ''}</div>`).join('')}`;
}
const SG_GY_JS = `document.addEventListener('click',function(e){var m=e.target.closest('.gymore');if(!m)return;var p=m.parentNode,on=p.classList.toggle('open');m.setAttribute('aria-expanded',on);
 if(!on){var t=p.getBoundingClientRect().top;if(t<0)window.scrollBy(0,t-80)}});
document.addEventListener('click',function(e){var b=e.target.closest('.gytab,#gyInfo');if(!b)return;
 if(b.id==='gyInfo'){var c=document.getElementById('gyCrit');c.hidden=!c.hidden;b.setAttribute('aria-expanded',!c.hidden);return}
 [].forEach.call(document.querySelectorAll('.gytab'),function(x){var on=x===b;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;document.getElementById('gyp-'+x.dataset.gt).hidden=!on});
 if(b.scrollIntoView)b.scrollIntoView({block:'nearest',inline:'center'})});
document.addEventListener('keydown',function(e){var b=e.target.closest&&e.target.closest('.gytab');if(!b||(e.key!=='ArrowRight'&&e.key!=='ArrowLeft'))return;e.preventDefault();
 var l=[].slice.call(document.querySelectorAll('.gytab')),n=l[(l.indexOf(b)+(e.key==='ArrowRight'?1:-1)+l.length)%l.length];n.focus();n.click()});`;

/* Thư viện ảnh theo nhóm như lúc chụp (Đón tiếp, Tiện ích, Trên sân, Lưu trú & gia đình, Khác); mỗi nhóm hiện 6 ảnh (29/10/2026) */
const SG_GAL_TOP = 6;
const SG_GAL_TABS = [
  ['welcome', 'Đón tiếp', 'Welcome', ['gate', 'clubhouse', 'reception', 'price', 'map', 'scorecard', 'bagdrop', 'starter', 'signpost', 'lounge', 'caddiemaster', 'rental', 'evcharge']],
  ['facilities', 'Tiện ích', 'Facilities', ['range', 'putting', 'restaurant', 'terrace', 'locker', 'proshop', 'cart', 'halfway', 'dish', 'toilet', 'rulesboard', 'meeting', 'bunkerpractice', 'cleaning', 'firstaid', 'academy', 'shortcourse']],
  ['course', 'Trên sân', 'On the course', ['signature', 'hole', 'view', 'sunset', 'condition', 'nightlight', 'scenery', 'cartpath', 'shelter', 'markers', 'teemarkers', 'flag', 'sand', 'water', 'nature']],
  ['stay', 'Lưu trú & gia đình', 'Stay & family', ['hotel', 'room', 'familyfac']],
  ['more', 'Khác', 'More', []]];
function sgGalSection(list, fig) {
  const ix = k => SG_GAL_TABS.findIndex(t => t[3].includes(k)), groups = SG_GAL_TABS.map(() => []);
  list.forEach(p => { const i = ix(p.kind); groups[i < 0 ? groups.length - 1 : i].push(p); });
  groups.forEach((g, gi) => { const ord = SG_GAL_TABS[gi][3]; g.forEach((p, i) => { p.__o = i; }); g.sort((a, b) => ((ord.indexOf(a.kind) + 1 || 99) - (ord.indexOf(b.kind) + 1 || 99)) || a.__o - b.__o); g.forEach(p => { delete p.__o; }); });
  const tabs = SG_GAL_TABS.map((t, i) => [t, groups[i]]).filter(x => x[1].length);
  if (!tabs.length) return '';
  return `<div class="galtabs" role="tablist" aria-label="Nhóm ảnh">${tabs.map(([t, g], i) => `<button class="galtab" role="tab" id="galt-${t[0]}" aria-controls="galp-${t[0]}" aria-selected="${!i}" tabindex="${i ? -1 : 0}" data-gl="${t[0]}">${sgBi(t[1], t[2])}<span class="n">${g.length}</span></button>`).join('')}</div>
    ${tabs.map(([t, g], i) => `<div class="gal galp" role="tabpanel" id="galp-${t[0]}" aria-labelledby="galt-${t[0]}"${i ? ' hidden' : ''}>${g.map(p => fig(p, 'gal')).join('')}${g.length > SG_GAL_TOP ? sgGyMore(g.length - SG_GAL_TOP, ['ảnh', 'more']) : ''}</div>`).join('')}`;
}
const SG_GAL_JS = `document.addEventListener('click',function(e){var b=e.target.closest('.galtab');if(!b)return;
 [].forEach.call(document.querySelectorAll('.galtab'),function(x){var on=x===b;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;document.getElementById('galp-'+x.dataset.gl).hidden=!on});
 if(b.scrollIntoView)b.scrollIntoView({block:'nearest',inline:'center'})});
document.addEventListener('keydown',function(e){var b=e.target.closest&&e.target.closest('.galtab');if(!b||(e.key!=='ArrowRight'&&e.key!=='ArrowLeft'))return;e.preventDefault();
 var l=[].slice.call(document.querySelectorAll('.galtab')),n=l[(l.indexOf(b)+(e.key==='ArrowRight'?1:-1)+l.length)%l.length];n.focus();n.click()});`;
/* ===== Nâng cấp giao diện – giai đoạn 1 (02/11/2026, Long duyệt) =====
   Trang sân: lưới ảnh đầu trang, huy hiệu đoàn đo, dải số nhanh, mục lục dính, hỏi đáp, sân khác / bạn vừa xem, chia sẻ, thanh Gọi · Chỉ đường trên điện thoại.
   Trang chủ: ô tìm + lọc nhanh, dải số tin cậy, bản đồ sân.
   Chỉ dùng dữ liệu sẵn có; Slope chỉ hiện khi có số chính thức (M.official). */
const SG_SITE = 'https://courses.vncentre.net';
const SG_REG = {
  bac: ['ha-noi', 'hai-phong', 'quang-ninh', 'bac-ninh', 'bac-giang', 'hai-duong', 'hung-yen', 'thai-binh', 'nam-dinh', 'ha-nam', 'ninh-binh', 'vinh-phuc', 'phu-tho', 'thai-nguyen', 'tuyen-quang', 'ha-giang', 'cao-bang', 'lang-son', 'lao-cai', 'yen-bai', 'dien-bien', 'lai-chau', 'son-la', 'hoa-binh', 'bac-kan'],
  trung: ['thanh-hoa', 'nghe-an', 'ha-tinh', 'quang-binh', 'quang-tri', 'thua-thien-hue', 'hue', 'da-nang', 'quang-nam', 'quang-ngai', 'binh-dinh', 'phu-yen', 'khanh-hoa', 'ninh-thuan', 'binh-thuan', 'kon-tum', 'gia-lai', 'dak-lak', 'dak-nong', 'lam-dong']
};
const SG_REG_LAB = { bac: ['Miền Bắc', 'North'], trung: ['Miền Trung', 'Central'], nam: ['Miền Nam', 'South'] };
function sgRegion(prov) { const s = sgSlug(prov); if (!s) return ''; for (const k of ['bac', 'trung']) if (SG_REG[k].some(x => s === x || s.includes(x))) return k; return 'nam'; }
/* Toạ độ sân: trung bình các điểm GPS đoàn đo đã ghi (guide.gps); không có thì lấy trung vị các địa điểm đoàn ghé quanh sân. */
function sgCourseLL(g) {
  const inf = (g && g.info) || {}; if (isFinite(parseFloat(inf.lat)) && isFinite(parseFloat(inf.lng)) && parseFloat(inf.lat)) return [parseFloat(inf.lat), parseFloat(inf.lng)];   /* toạ độ nhập tay (GĐ2) */
  const pts = [];
  Object.values((g && g.gps) || {}).forEach(t => Object.values((t && t.holes) || {}).forEach(h => ((h && h.pts) || []).forEach(p => { if (Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1]) && +p[0]) pts.push([+p[0], +p[1]]); })));
  if (pts.length) return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  const pl = ((g && g.places) || []).filter(p => p && isFinite(+p.lat) && isFinite(+p.lng) && +p.lat && (p.km == null || +p.km <= 5)).map(p => [+p.lat, +p.lng]);
  if (!pl.length) return null;
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return [med(pl.map(p => p[0])), med(pl.map(p => p[1]))];
}
{ const _m0 = sgModel; sgModel = function (pack, opts) { const M = _m0(pack, opts); const g = pack.guide || {};
    const ll = sgCourseLL(g); M.lat = ll ? Math.round(ll[0] * 1e5) / 1e5 : null; M.lng = ll ? Math.round(ll[1] * 1e5) / 1e5 : null;
    M.region = sgRegion(M.province);
    M.nPh = M.gal.length + M.holes.reduce((a, h) => a + h.phs.length, 0);
    M.nHolePh = M.holes.filter(h => h.phs.length).length;
    M.slopeMax = M.official.length ? Math.max(...M.official.filter(t => t.gender !== 'F').map(t => +t.slope || 0), 0) || null : null;
    return M; }; }
const sgAbs = (u, base) => !u ? '' : /^https?:/i.test(u) ? u : u[0] === '/' ? SG_SITE + u : (base || SG_SITE + '/') + u;
const sgDir = M => M.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${M.lat},${M.lng}` : (M.info.map || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(M.name + (M.province ? ', ' + M.province : ''))}`);
const SG_IC = {
  check: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  share: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
  link: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  fb: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H7.9v3h2.6V21h3z"/></svg>',
  phone: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>',
  route: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.7 11.3l-9-9a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4l9 9a1 1 0 0 0 1.4 0l9-9a1 1 0 0 0 0-1.4zM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5z"/></svg>',
  zalo: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.8 2 11.5c0 2.6 1.4 4.9 3.6 6.5L5 21l3.3-1.8c1.2.4 2.4.6 3.7.6 5.5 0 10-3.8 10-8.5S17.5 3 12 3zm-3.8 10.6H5.5v-.8l1.8-2.4H5.6v-.9h2.6v.8l-1.8 2.4h1.8zm1.9 0h-.9v-4h.9zm3.4 0h-.8v-.3a1.4 1.4 0 0 1-.8.3c-.8 0-1.4-.7-1.4-1.6s.6-1.5 1.4-1.5c.3 0 .6.1.8.3v-.2h.8zm3.3-1.5c0 .9-.7 1.6-1.5 1.6s-1.5-.7-1.5-1.6.7-1.5 1.5-1.5 1.5.6 1.5 1.5z"/></svg>'
};
const SG_P1_CSS = `
.crumb{font-size:.8rem;color:var(--muted);margin-top:14px}.crumb a{color:var(--muted);text-decoration:none}.crumb a:hover{color:var(--accent)}
.ttl{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px 20px;margin-top:8px}
.ttl h1{font-size:clamp(2rem,5vw,3.2rem);margin-top:6px}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 11px;font:600 .78rem/1.2 var(--body);border:1px solid var(--line);background:var(--surface)}
.badge.csr{background:var(--hdr);color:var(--hdrInk);border-color:transparent}.badge.csr svg{color:var(--accent2)}
.acts{display:flex;gap:8px;flex-wrap:wrap}
.act{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:600 .85rem/1 var(--body);text-decoration:none}
.act:hover{border-color:var(--accent)}.act:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.mosaic{position:relative;display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:6px;margin-top:16px;border-radius:14px;overflow:hidden;aspect-ratio:21/9;background:var(--soft)}
.mosaic>div{min-width:0;min-height:0;background:var(--soft)}.mosaic>div:first-child{grid-row:1/3}
.mosaic img{width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in;transition:filter .2s}.mosaic img:hover{filter:brightness(.92)}
.mosaic.n1{grid-template-columns:1fr}.mosaic.n1>div:first-child{grid-row:auto}.mosaic.n2,.mosaic.n3{grid-template-columns:2fr 1fr}
.mall{all:unset;cursor:pointer;position:absolute;right:12px;bottom:12px;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.94);color:#0B0E2E;font:600 .82rem/1 var(--body);box-shadow:0 2px 10px rgba(0,0,0,.2)}
.mall:focus-visible{outline:2px solid var(--accent2);outline-offset:2px}
@media (max-width:700px){.mosaic{grid-template-columns:1fr 1fr;grid-template-rows:2fr 1fr;aspect-ratio:4/3.4}.mosaic>div:first-child{grid-row:auto;grid-column:1/-1}.mosaic>div:nth-child(n+4){display:none}.mosaic.n1,.mosaic.n2{grid-template-rows:1fr}}
.snav{position:sticky;top:0;z-index:8;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:saturate(1.4) blur(8px);-webkit-backdrop-filter:saturate(1.4) blur(8px);border-bottom:1px solid var(--line);margin-top:22px}
.snav .wrap{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}.snav .wrap::-webkit-scrollbar{display:none}
.snav a{flex:none;padding:13px 12px 11px;font:600 .85rem/1 var(--body);color:var(--muted);text-decoration:none;border-bottom:3px solid transparent;white-space:nowrap}
.snav a[aria-current="true"]{color:var(--ink);border-bottom-color:var(--accent)}.snav a:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.gytabs,.galtabs{top:46px}
section[id],#cm-sec{scroll-margin-top:60px}
.sbar{display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;align-items:center;margin-top:14px;font-size:.82rem}
.sbar .rail{position:relative;height:10px;border-radius:5px;background:linear-gradient(90deg,#5bb47a,#e8c34a 55%,#d4553f)}
.sbar .rail i{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:var(--surface);border:3px solid var(--ink);transform:translate(-50%,-50%)}
.faq details{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:0 16px;margin-top:8px}
.faq summary{cursor:pointer;list-style:none;padding:14px 0;font-weight:600;display:flex;justify-content:space-between;gap:12px}.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font:500 1.3rem/1 var(--body);color:var(--accent)}.faq details[open] summary::after{content:"–"}
.faq details p{margin:0 0 14px;color:var(--ink)}
.rel{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:14px}
.rel a{display:block;text-decoration:none;color:inherit;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.rel a:hover{border-color:var(--accent)}.rel .ph{border-radius:0;aspect-ratio:16/10}.rel .t{padding:10px 12px}.rel h3{font-size:1.1rem;margin-top:4px}
.mbar{display:none}
@media (max-width:760px){.acts{display:none}}
@media (max-width:760px){body.hasmbar{padding-bottom:calc(68px + env(safe-area-inset-bottom,0px))}
 .mbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:30;gap:8px;padding:10px max(12px,env(safe-area-inset-left,0px)) calc(10px + env(safe-area-inset-bottom,0px));background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -6px 20px rgba(0,0,0,.1)}
 .mbar a,.mbar button{all:unset;box-sizing:border-box;flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 4px;border-radius:10px;font:600 .72rem/1.1 var(--body);color:var(--ink);text-align:center;cursor:pointer}
 .mbar .pri{background:var(--btn);color:var(--btnInk)}}
.toast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:10px;font-size:.88rem;z-index:40}
/* trang chủ */
.hhero{padding:34px 0 8px}.hhero h1{font-size:clamp(2.2rem,6vw,3.6rem)}
.find{display:flex;align-items:center;gap:10px;margin-top:18px;background:var(--surface);border:1.5px solid var(--line);border-radius:999px;padding:6px 6px 6px 18px;max-width:640px;box-shadow:0 4px 18px rgba(0,0,0,.06)}
.find:focus-within{border-color:var(--accent)}.find input{all:unset;flex:1;min-width:0;font:500 1rem/1.4 var(--body);color:var(--ink);padding:8px 0}
.find span{font:600 .85rem/1 var(--body);color:var(--muted);padding-right:12px;white-space:nowrap}
.qf{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.qf button{all:unset;cursor:pointer;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font:600 .82rem/1 var(--body)}
.qf button[aria-pressed="true"]{background:var(--btn);color:var(--btnInk);border-color:transparent}.qf button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.trust{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:22px}
.trust div{background:var(--surface);padding:14px 16px}.trust b{display:block;font:600 1.7rem/1.1 var(--display);color:var(--accent)}.trust span{font-size:.82rem;color:var(--muted)}
@media (max-width:700px){.trust{grid-template-columns:1fr 1fr}}
.hgrid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:18px;margin-top:22px;align-items:start}
@media (max-width:900px){.hgrid{grid-template-columns:1fr}}
.hgrid .cards{margin-top:0;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
#vmap{height:520px;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:var(--soft);position:sticky;top:12px}
@media (max-width:900px){#vmap{height:320px;position:static}}
.ccard .meta{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px;font-size:.78rem;color:var(--muted)}
.ccard.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent)}
.empty2{padding:24px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:12px}
.leaflet-popup-content a{font-weight:600}
`;
const SG_P1_JS = `
(function(){var u=location.href.split('#')[0];
 function toast(m){var t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=m;document.body.appendChild(t);setTimeout(function(){t.remove()},2200)}
 function copy(s){if(navigator.clipboard)navigator.clipboard.writeText(s).then(function(){toast(T('Đã chép link','Link copied'))},function(){prompt('',s)});else prompt('',s)}
 document.addEventListener('click',function(e){var b=e.target.closest('[data-act]');if(!b)return;var a=b.dataset.act;
  if(a==='share'){e.preventDefault();if(navigator.share)navigator.share({title:document.title,url:u}).catch(function(){});else copy(u)}
  else if(a==='copy'){e.preventDefault();copy(u)}
  else if(a==='all'){e.preventDefault();var im=document.querySelector('img[data-lb="gal"]')||document.querySelector('.mosaic img');if(im)im.click()}});
 var nav=document.querySelector('.snav');if(nav&&'IntersectionObserver' in window){var L=[].slice.call(nav.querySelectorAll('a')),M={};
  L.forEach(function(a){var s=document.querySelector(a.getAttribute('href'));if(s)M[s.id]=a});
  var hold=0;function mark(a){L.forEach(function(b){b.removeAttribute('aria-current')});if(a){a.setAttribute('aria-current','true');if(nav.scrollWidth>nav.clientWidth)a.parentNode.scrollLeft=a.offsetLeft-40}}
  nav.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;mark(a);hold=Date.now()+1200});
  var io=new IntersectionObserver(function(es){if(Date.now()<hold)return;es.forEach(function(x){if(x.isIntersecting){L.forEach(function(a){a.removeAttribute('aria-current')});var a=M[x.target.id];if(a){a.setAttribute('aria-current','true');if(a.scrollIntoView&&nav.scrollWidth>nav.clientWidth)a.parentNode.scrollLeft=a.offsetLeft-40}}})},{rootMargin:'-55% 0px -40% 0px'});
  Object.keys(M).forEach(function(id){io.observe(document.getElementById(id))})}
 var me=window.SG_ME;if(me){var K='sg_seen',seen=[];try{seen=JSON.parse(localStorage.getItem(K)||'[]')}catch(e){}
  var box=document.getElementById('seen');var prev=seen.filter(function(x){return x.s!==me.s}).slice(0,4);
  if(box&&prev.length){box.hidden=false;box.querySelector('.rel').innerHTML=prev.map(function(x){return '<a href="'+esc(x.h)+'"><div class="ph">'+(x.i?'<img loading="lazy" src="'+esc(x.i)+'" alt="">':'')+'</div><div class="t"><div class="eyebrow">'+esc(x.p||'')+'</div><h3>'+esc(x.n)+'</h3></div></a>'}).join('')}
  me.h=u;if(me.i)try{me.i=new URL(me.i,u).href}catch(e){}
  try{localStorage.setItem(K,JSON.stringify([me].concat(prev).slice(0,8)))}catch(e){}}
})();`;

/* ===== Giai đoạn 2 (02/11/2026, Long duyệt): chọn tee theo cú driver, bản đồ quanh sân, lịch trình, lưu sân, điểm golfer ===== */
/* Bảng "Tee It Forward" (USGA & PGA of America): cú driver trung bình → chiều dài sân 18 hố nên chơi */
const SG_TIF = [[100, 2100, 2300], [125, 2800, 3000], [150, 3500, 3700], [175, 4400, 4600], [200, 5200, 5400], [225, 5800, 6000], [250, 6200, 6400], [275, 6700, 6900]];
const SG_IC2 = {
  heart: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.9 3.9 4.5 7.3 4.5c2 0 3.5 1.1 4.7 2.7 1.2-1.6 2.7-2.7 4.7-2.7 3.4 0 5.7 3.4 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"/></svg>'
};
function sgPlan(M) {
  const vi = String(M.info.planVi || '').trim(), en = String(M.info.planEn || '').trim() || vi; if (!vi) return '';
  const blocks = t => t.split(/\n\s*\n/).map(b => b.split('\n').map(x => x.trim()).filter(Boolean)).filter(b => b.length);
  const B = blocks(vi), E = blocks(en);
  const html = B.map((b, i) => { const e = E[i] || b; const head = /^(ngày|day)\s*\d/i.test(b[0]); const rows = head ? b.slice(1) : b, rowsE = head ? e.slice(1) : e;
    return `<div class="plan">${head ? sgBi(b[0], e[0], 'h3') : ''}<ol>${rows.map((r, j) => { const m = r.match(/^(\d{1,2}[:h]\d{2})\s*[–-]\s*(.*)$/), me = String(rowsE[j] || r).match(/^(\d{1,2}[:h]\d{2})\s*[–-]\s*(.*)$/);
      return m ? `<li><b class="num">${sgEsc(m[1].replace('h', ':'))}</b>${sgBi(m[2], me ? me[2] : m[2])}</li>` : `<li>${sgBi(r, rowsE[j] || r)}</li>`; }).join('')}</ol></div>`; }).join('');
  return `<div class="plans"><div class="eyebrow" style="margin-top:26px">${sgBi('Gợi ý của đoàn đo', 'Suggested by the team')}</div><h3 style="font-size:1.5rem;margin-top:6px">${sgBi('Lịch trình gợi ý', 'Suggested itinerary')}</h3><div class="planrow">${html}</div></div>`;
}
function sgTeeGuide(M) {
  if (!M.tees.length) return '';
  const T2 = M.tees.map(t => ({ vi: t.vi, en: t.en, c: t.color, g: t.gender, y: t.total }));
  return `<div class="tguide card" id="tguide" data-tees="${sgEsc(JSON.stringify(T2))}"><h3>${sgBi('Sân này hợp với bạn ở tee nào?', 'Which tee suits you?')}</h3>
  ${sgBi('Chọn khoảng cách cú driver thường ngày của bạn (gồm cả bóng lăn):', 'Pick your usual driver distance (carry plus roll):', 'p', 'class="muted" style="margin:6px 0 10px;font-size:.9rem"')}
  <div class="qf" role="group" aria-label="Driver">${SG_TIF.map(r => `<button type="button" data-drv="${r[0]}" aria-pressed="false"><span class="num">${r[0]}</span> yd</button>`).join('')}</div>
  <div id="tgOut" class="tgout" aria-live="polite"></div>
  ${sgBi('Theo hướng dẫn "Tee It Forward" của USGA và PGA of America: chơi đúng chiều dài giúp vòng golf vui hơn và nhanh hơn. Đây là gợi ý, không phải chỉ số Course Rating.', 'Based on the USGA and PGA of America "Tee It Forward" guidelines: the right length makes golf faster and more fun. A guide only, not a Course Rating.', 'p', 'class="muted" style="margin:10px 0 0;font-size:.78rem"')}</div>`;
}
const SG_P2_CSS = `
.tguide{margin-top:16px}.tguide h3{font-size:1.25rem}
.tgout{margin-top:12px;font-size:.95rem}.tgout b.tee{display:inline-flex;align-items:center;gap:6px}.tgout .dot{margin:0}
.tgout .tbox{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.tgout .tbox>span{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:.85rem;background:var(--bg)}.tgout .tbox>span.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);font-weight:600}
#pmap{height:380px;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:var(--soft);margin-top:14px}
.pmleg{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;font-size:.8rem;color:var(--muted)}.pmleg i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:6px;vertical-align:-1px;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.planrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:12px}
.plan{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.plan h3{font-size:1.15rem;color:var(--accent)}
.plan ol{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}.plan li{display:grid;grid-template-columns:52px 1fr;gap:8px;font-size:.92rem}.plan li b{color:var(--muted);font-weight:500}.plan li:not(:has(b)){grid-template-columns:1fr}
.act[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}.act[aria-pressed="true"] svg path,.mbar [aria-pressed="true"] svg path{fill:currentColor}
.mbar [aria-pressed="true"]{color:var(--accent)}
.gscore{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 11px;font:600 .78rem/1.2 var(--body);border:1px solid var(--line);background:var(--surface);color:var(--ink);text-decoration:none}.gscore b{color:#c98a00}
.saved{margin-top:22px}.saved .rel{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
`;
const SG_P2_JS = `
(function(){
 var tg=document.getElementById('tguide');if(tg){var TE=JSON.parse(tg.dataset.tees||'[]'),TIF=${JSON.stringify(SG_TIF)};
  function show(d){var r=TIF.filter(function(x){return x[0]===d})[0];if(!r)return;var lo=r[1],hi=r[2],best=null,bd=1e9;
   TE.forEach(function(t,i){var dd=t.y<lo?lo-t.y:t.y>hi?t.y-hi:0;if(dd<bd||(dd===bd&&best!=null&&t.y>TE[best].y&&dd===0)){bd=dd;best=i}});
   [].forEach.call(tg.querySelectorAll('[data-drv]'),function(b){b.setAttribute('aria-pressed',+b.dataset.drv===d)});
   var t=TE[best],f=function(n){return Number(n).toLocaleString(lang==='en'?'en-US':'de-DE')};
   var msg=T('Với cú driver khoảng '+d+' yd, chiều dài sân nên chơi là '+f(lo)+'–'+f(hi)+' yd. ','With a '+d+' yd drive, aim for a course of '+f(lo)+'–'+f(hi)+' yd. ')
    +(bd===0?T('Tee hợp nhất: ','Best tee: '):TE.every(function(x){return x.y<lo})?T('Tee dài nhất của sân vẫn ngắn hơn mức này, nên chọn: ','Even the longest tee is shorter than that; choose: '):TE.every(function(x){return x.y>hi})?T('Tee ngắn nhất của sân vẫn dài hơn mức này, nên chọn: ','Even the shortest tee is longer than that; choose: '):T('Sân không có tee đúng khoảng này; tee gần nhất: ','No tee falls in that range; the closest is: '));
   document.getElementById('tgOut').innerHTML=esc(msg)+'<b class="tee"><span class="dot" style="background:'+esc(t.c)+'"></span>'+esc(T(t.vi,t.en))+' · '+f(t.y)+' yd</b><div class="tbox">'+TE.map(function(x,i){return '<span class="'+(i===best?'on':'')+'"><span class="dot" style="background:'+esc(x.c)+'"></span>'+esc(T(x.vi,x.en))+' '+f(x.y)+' yd</span>'}).join('')+'</div>';
   try{localStorage.setItem('sg_drv',d)}catch(e){}}
  tg.addEventListener('click',function(e){var b=e.target.closest('[data-drv]');if(b)show(+b.dataset.drv)});
  var sv=0;try{sv=+localStorage.getItem('sg_drv')}catch(e){}if(sv)show(sv);
  document.addEventListener('click',function(e){if(e.target.closest('#sgL,#sgE')){var c=tg.querySelector('[aria-pressed="true"]');if(c)setTimeout(function(){show(+c.dataset.drv)},0)}})}
 var pm=document.getElementById('pmap');if(pm){var P=JSON.parse(pm.dataset.p||'{}'),go=function(){if(pm.dataset.on)return;pm.dataset.on=1;
  var css=document.createElement('link');css.rel='stylesheet';css.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';document.head.appendChild(css);
  var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';s.onload=function(){var L=window.L,map=L.map(pm,{scrollWheelZoom:false});
   L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,attribution:'Tiles &copy; Esri'}).addTo(map);
   var B=[],ac=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#B06829';
   (P.pl||[]).forEach(function(x){var m=L.circleMarker([x.a,x.o],{radius:x.w?6:8,color:'#fff',weight:2,fillColor:x.w?'#6f7fa3':ac,fillOpacity:1}).addTo(map);B.push([x.a,x.o]);
    m.bindPopup('<b>'+esc(x.n)+'</b><br><small>'+esc(T(x.c,x.ce))+(x.k?' · ≈ '+x.k+' km':'')+'</small>'+(x.m?'<br><a href="'+esc(x.m)+'" target="_blank" rel="noopener">'+T('Mở Google Maps','Open Google Maps')+'</a>':''))});
   if(P.c){var cm=L.marker([P.c[0],P.c[1]],{title:P.n,zIndexOffset:1000}).addTo(map).bindPopup('<b>'+esc(P.n)+'</b>');B.push(P.c)}
   map.fitBounds(B,{padding:[30,30],maxZoom:14});setTimeout(function(){map.invalidateSize();map.fitBounds(B,{padding:[30,30],maxZoom:14})},300)};document.body.appendChild(s)};
  if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){if(es[0].isIntersecting){io.disconnect();go()}},{rootMargin:'300px'});io.observe(pm)}else go()}
 /* Lưu sân: trên máy (localStorage sg_saved); khi đăng nhập, phần cộng đồng đồng bộ với bảng site_saves */
 var me=window.SG_ME;function get(){try{return JSON.parse(localStorage.getItem('sg_saved')||'[]')}catch(e){return[]}}
 function put(a){try{localStorage.setItem('sg_saved',JSON.stringify(a))}catch(e){}}
 window.sgSaved={get:get,put:put,paint:paint};
 function paint(){var on=me&&get().some(function(x){return x.s===me.s});[].forEach.call(document.querySelectorAll('[data-act="save"]'),function(b){b.setAttribute('aria-pressed',!!on);var l=b.querySelector('.sl');if(l)l.textContent=on?T('Đã lưu','Saved'):T('Lưu sân','Save')})}
 document.addEventListener('click',function(e){var b=e.target.closest('[data-act="save"]');if(!b||!me)return;e.preventDefault();var a=get(),on=a.some(function(x){return x.s===me.s});
  a=on?a.filter(function(x){return x.s!==me.s}):[{s:me.s,c:me.c,n:me.n,p:me.p,i:me.i,h:location.href.split('#')[0],t:Date.now()}].concat(a);put(a);paint();
  if(window.sgSaveSync)window.sgSaveSync(me.c,!on)});
 document.addEventListener('click',function(e){if(e.target.closest('#sgL,#sgE'))setTimeout(paint,0)});
 paint();
})();`;

/* Hỏi đáp nhanh: chỉ câu có dữ liệu; câu trả lời là sự thật đã ghi nhận, không suy đoán. */
function sgFaq(M) {
  const inf = M.info, tr = M.travel, f = new Set(M.fac), q = [];
  const yd = M.tees[0] ? sgFmt(M.tees[0].total) : '';
  q.push([`${M.name} có bao nhiêu hố, par bao nhiêu?`, `How many holes and what par is ${M.nameEn}?`,
    `Sân có ${M.nH} hố, par ${M.par}${yd ? `, dài ${yd} yard từ tee ${M.tees[0].vi}` : ''}. Số liệu do đoàn đo VN Centre – CSR Vietnam Team đo trực tiếp.`,
    `${M.nH} holes, par ${M.par}${yd ? `, ${yd} yards from the ${M.tees[0].en} tees` : ''}. Measured on site by VN Centre – CSR Vietnam Team.`]);
  if (inf.hours) q.push(['Sân mở cửa mấy giờ?', 'What are the opening hours?', `${inf.hours}.`, `${inf.hours}.`]);
  if (f.has('caddieReq')) q.push(['Có bắt buộc thuê caddie không?', 'Is a caddie required?', 'Có. Sân yêu cầu mỗi người chơi đi cùng caddie.', 'Yes. The course requires a caddie for every player.']);
  if (f.has('night')) q.push(['Sân có chơi đêm không?', 'Is night golf available?', 'Có. Sân có hệ thống đèn để chơi buổi tối.', 'Yes. The course has floodlights for evening play.']);
  if (f.has('rental')) q.push(['Có cho thuê gậy không?', 'Can I rent clubs?', 'Có. Sân có dịch vụ cho thuê gậy.', 'Yes. Club rental is available.']);
  if (f.has('hotel')) q.push(['Có khách sạn ngay trong khu sân không?', 'Is there a hotel on site?', 'Có. Khu sân có khách sạn; xem thêm phần Ăn ở và đi lại.', 'Yes. There is a hotel within the resort; see Stay, eat and get there.']);
  if (tr.airport) q.push(['Sân bay nào gần sân nhất?', 'Which airport is nearest?', `${tr.airport}${tr.distKm ? `, khoảng ${tr.distKm} km` : ''}${tr.driveMin ? `, khoảng ${tr.driveMin} phút đi xe` : ''}.`, `${tr.airport}${tr.distKm ? `, about ${tr.distKm} km` : ''}${tr.driveMin ? `, about ${tr.driveMin} minutes by car` : ''}.`]);
  const bk = [inf.bookPhone && `gọi ${inf.bookPhone}`, inf.bookZalo && `Zalo ${inf.bookZalo}`, inf.bookWeb && `trang đặt sân của sân`].filter(Boolean), bkE = [inf.bookPhone && `call ${inf.bookPhone}`, inf.bookZalo && `Zalo ${inf.bookZalo}`, inf.bookWeb && `the course booking page`].filter(Boolean);
  q.push(['Đặt sân thế nào?', 'How do I book a tee time?', `${bk.length ? 'Liên hệ trực tiếp sân: ' + bk.join(', ') + '.' : 'Liên hệ trực tiếp sân.'} Trang này không nhận đặt chỗ hay thanh toán.`, `${bkE.length ? 'Contact the course directly: ' + bkE.join(', ') + '.' : 'Contact the course directly.'} This site takes no bookings or payments.`]);
  return q;
}

function sgCourseHTML(M, img, o = {}) {
  const src = p => p ? img(p) : '', flag = o.flag || null;
  const shotLab = p => SG.SHOT[p.kind] || ['', ''];
  const lbImg = (p, grp, vi, en, cls = '') => `<img loading="lazy" src="${src(p)}" alt="${sgEsc(vi)}" data-lb="${grp}" data-vi-c="${sgEsc(vi)}" data-en-c="${sgEsc(en)}"${cls ? ` class="${cls}"` : ''}>`;
  const tees = M.tees, maxLen = Math.max(1, ...M.holes.flatMap(h => h.len.map(x => +x || 0)));
  const desc = `${M.name} – ${M.introVi}`.slice(0, 160);
  const ld = { '@context': 'https://schema.org', '@type': 'GolfCourse', name: M.name, alternateName: M.nameEn !== M.name ? M.nameEn : undefined, address: M.province ? { '@type': 'PostalAddress', addressRegion: M.province, addressCountry: 'VN' } : undefined, telephone: M.info.bookPhone || undefined, url: M.info.bookWeb || undefined };
  const facts = [[M.nH, `hố`, `holes`], [M.par, 'Par', 'Par'], ...tees.slice(0, 2).map(t => [sgFmt(t.total), `yd · tee ${t.vi}`, `yd · ${t.en} tees`])];
  if (M.slopeMax) facts.push([M.slopeMax, 'Slope (tee nam xa nhất)', 'Slope (back men\'s tee)']);
  if (M.nPh) facts.push([sgFmt(M.nPh), 'ảnh thật do đoàn đo chụp', 'real photos by the team']);
  if (M.travel.distKm) facts.push([`~${M.travel.distKm} km`, `tới ${M.travel.airport || 'sân bay'}`, `to ${M.travel.airport || 'airport'}`]);
  const base = o.pageUrl || `${SG_SITE}/san/${M.slug}/`, heroAbs = M.heroP ? sgAbs(src(M.heroP), base) : '';
  const faq = sgFaq(M);
  const pmPl = M.places.filter(p => isFinite(parseFloat(p.lat)) && isFinite(parseFloat(p.lng)) && parseFloat(p.lat)).map(p => { const c = SG.CAT[p.cat] || [p.cat || '', p.cat || '']; return { n: p.name, c: c[0], ce: c[1], a: +p.lat, o: +p.lng, w: p.src === 'web' ? 1 : 0, k: p.km != null && p.km !== '' ? sgKm(p.km) : '', m: p.map || sgGyMap(p) || '' }; });
  const pmap = pmPl.length ? { n: M.name, c: M.lat != null ? [M.lat, M.lng] : null, pl: pmPl } : null;
  const ldFaq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(x => ({ '@type': 'Question', name: x[0], acceptedAnswer: { '@type': 'Answer', text: x[2] } })) };
  const og = `<link rel="canonical" href="${sgEsc(base)}"><meta property="og:type" content="website"><meta property="og:url" content="${sgEsc(base)}">${heroAbs ? `<meta property="og:image" content="${sgEsc(heroAbs)}"><meta name="twitter:card" content="summary_large_image">` : ''}<script type="application/ld+json">${JSON.stringify(ldFaq).replace(/</g, '\\u003c')}<\/script>`;
  const mPick = (() => { if (!M.show.photos) return []; const out = M.heroP ? [M.heroP] : [], ord = ['signature', 'view', 'sunset', 'clubhouse', 'flag', 'scenery', 'water', 'terrace', 'restaurant', 'sand', 'nature'];
    const pool = M.gal.filter(p => p !== M.heroP); ord.forEach(k => pool.filter(p => p.kind === k).forEach(p => { if (out.length < 5 && !out.includes(p) && !out.some(q => q.kind === p.kind)) out.push(p); }));
    pool.forEach(p => { if (out.length < 5 && !out.includes(p)) out.push(p); }); M.holes.forEach(h => { if (out.length < 5 && h.teePh && !out.includes(h.teePh)) out.push(h.teePh); }); return out; })();
  const snav = [['tong-quan', 'Tổng quan', 'Overview', 1], ['tee', 'Tee & độ khó', 'Tees', tees.length], ['ho', 'Từng hố', 'Holes', M.show.holes && M.holes.length], ['quanh-san', 'Quanh sân', 'Around', M.places.length || M.travel.airport], ['anh', 'Ảnh', 'Photos', M.show.photos && M.gal.length > 1], ['hoi-dap', 'Hỏi đáp', 'FAQ', 1], ['cm-sec', 'Golfer chia sẻ', 'Golfers', 1]].filter(x => x[3]);
  const others = (o.others || []).filter(x => x.slug !== M.slug).sort((a, b) => (b.region === M.region) - (a.region === M.region)).slice(0, 4);
  const relCard = x => `<a href="${sgEsc(x.href)}"><div class="ph">${x.img ? `<img loading="lazy" src="${sgEsc(x.img)}" alt="${sgEsc(x.name)}">` : ''}</div><div class="t"><div class="eyebrow">${sgEsc(x.province || '')}${x.region === M.region && M.region ? ` · ${sgBi('cùng vùng', 'same region')}` : ''}</div><h3>${sgEsc(x.name)}</h3><p class="muted num" style="margin:4px 0 0;font-size:.8rem">${x.nH} ${sgBi('hố', 'holes')} · Par ${x.par}${x.yd ? ` · ${sgFmt(x.yd)} yd` : ''}</p></div></a>`;
  const me = { s: M.slug, c: M.cid || M.slug, n: M.name, p: M.province, i: M.heroP ? src(M.heroP) : '' };
  const mb = [inf0 => inf0.bookPhone && `<a class="pri" href="tel:${sgEsc(String(inf0.bookPhone).replace(/[^\d+]/g, ''))}">${SG_IC.phone}${sgBi('Gọi đặt sân', 'Call')}</a>`, inf0 => inf0.bookZalo && /^[\d\s+.]+$/.test(inf0.bookZalo) && `<a href="https://zalo.me/${sgEsc(String(inf0.bookZalo).replace(/[^\d]/g, ''))}" target="_blank" rel="noopener">${SG_IC.zalo}Zalo</a>`,
    () => `<a href="${sgEsc(sgDir(M))}" target="_blank" rel="noopener">${SG_IC.route}${sgBi('Chỉ đường', 'Directions')}</a>`, () => `<button type="button" data-act="save" aria-pressed="false">${SG_IC2.heart}<span class="sl">${sgBi('Lưu sân', 'Save')}</span></button>`, () => `<button type="button" data-act="share">${SG_IC.share}${sgBi('Chia sẻ', 'Share')}</button>`].map(f => f(M.info)).filter(Boolean);
  const H = M.holes.map(h => ({ n: h.n, par: h.par, len: h.len, siM: h.siM, siF: h.siF, gw: h.gw, gd: h.gd, ph: h.phs.map(x => [src(x.p), x.vi, x.en]) }));
  const TJ = tees.map(t => ({ vi: t.vi, en: t.en, c: t.color }));
  const offRows = M.official.length ? `<div class="tbl" style="margin-top:10px"><table><thead><tr><th class="l">Tee</th><th>Course Rating</th><th>Slope</th></tr></thead><tbody>${M.official.map(t => `<tr><td class="l">${sgEsc(t.name)} · ${t.gender === 'F' ? sgBi('Nữ', 'Women') : sgBi('Nam', 'Men')}</td><td class="num">${sgEsc(t.CR)}</td><td class="num">${sgEsc(t.slope)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const tr = M.travel, inf = M.info;
  const travelRows = [[tr.airport, 'Sân bay gần nhất', 'Nearest airport', tr.airport], [tr.distKm, 'Khoảng cách', 'Distance', `~${tr.distKm} km`], [tr.driveMin, 'Thời gian xe', 'Drive time', `~${tr.driveMin} ${'phút'}`], [inf.hours, 'Giờ mở cửa', 'Opening hours', inf.hours], [tr.season, 'Mùa đẹp', 'Best season', tr.season], [inf.openYear, 'Năm mở cửa', 'Opened', inf.openYear], [inf.designer, 'Thiết kế', 'Designer', inf.designer]].filter(r => r[0]);
  const book = [inf.bookPhone && `<span class="num">${sgEsc(inf.bookPhone)}</span><button class="copy" data-copy="${sgEsc(inf.bookPhone)}" data-vi="Chép số" data-en="Copy">Chép số</button>`, inf.bookZalo && sgEsc(inf.bookZalo), inf.bookWeb && `<a href="${sgEsc(inf.bookWeb)}" target="_blank" rel="noopener">${sgBi('Trang đặt sân', 'Booking page')}</a>`].filter(Boolean).join(' · ');
  const placeCard = p => { const cat = SG.CAT[p.cat] || [p.cat || '', p.cat || ''], r = p.r || {};
    const pl = (p.photos || []).map(x => { const l = SG.PL[x.kind] || ['', '']; return [x, l[0] ? `${p.name} · ${l[0]}` : p.name, l[1] ? `${p.name} · ${l[1]}` : p.name]; });
    const grp = 'pl-' + sgSlug(p.id || p.name);
    return `<div class="card place${pl.length ? '' : ' np'}">${pl.length ? `<div class="ph">${lbImg(pl[0][0], grp, pl[0][1], pl[0][2])}</div>` : ''}<div><div class="eyebrow">${sgBi(cat[0] + (p.src === 'web' && p.area ? ' · ' + p.area : '') + (p.family ? ' · hợp gia đình' : ''), cat[1] + (p.src === 'web' && p.area ? ' · ' + p.area : '') + (p.family ? ' · family friendly' : ''))}</div>
      <h3 style="margin-top:6px;font-size:1.15rem">${sgEsc(p.name)}</h3>${p.src === 'web' ? sgGyMeta(p) : ''}${p.note ? sgBi(p.note, p.noteEn || p.note, 'p', 'style="margin:6px 0;font-size:.9rem"') : ''}
      ${p.src !== 'web' && (r.q || r.s || r.v) ? `<div class="stars">${r.q ? `${sgBi('Chất lượng', 'Quality')} ${r.q}/5 · ` : ''}${r.s ? `${sgBi('Phục vụ', 'Service')} ${r.s}/5 · ` : ''}${r.v ? `${sgBi('Đáng tiền', 'Value')} ${r.v}/5` : ''}${p.price ? ` · ${'₫'.repeat(+p.price || 1)}` : ''}</div>` : ''}
      <p style="margin:8px 0 0;font-size:.9rem">${p.phone ? `<span class="num">${sgEsc(p.phone)}</span><button class="copy" data-copy="${sgEsc(p.phone)}" data-vi="Chép số" data-en="Copy">Chép số</button>` : ''}${p.map && p.src !== 'web' ? `${p.phone ? ' · ' : ''}<a href="${sgEsc(p.map)}" target="_blank" rel="noopener">${sgBi('Bản đồ', 'Map')}</a>` : ''}${p.src === 'web' && p.srcUrl ? `${p.phone || p.map ? ' · ' : ''}<a href="${sgEsc(p.srcUrl)}" target="_blank" rel="noopener nofollow">${sgBi('Nguồn', 'Source')}</a>` : ''}</p>
      ${p.src === 'web' && sgGyMap(p) ? `<a class="gymap" href="${sgEsc(sgGyMap(p))}" target="_blank" rel="noopener">${SG_PIN}${sgBi('Xem ảnh & đánh giá trên Google Maps', 'Photos & reviews on Google Maps')}</a>` : ''}
      ${pl.length > 1 ? `<div class="thumbs">${pl.slice(1).map(x => `<span class="th">${lbImg(x[0], grp, x[1], x[2])}</span>`).join('')}</div>` : ''}
      ${p.updated ? `<p class="muted" style="margin:6px 0 0;font-size:.75rem">${sgBi('Đoàn đo ghé ' + p.updated, 'Visited ' + p.updated)}</p>` : ''}</div></div>`; };
  const wmCss = o.wmOverlay ? `<style>.ph,.lbw{position:relative}.hero::after,.ph::after,.lbw::after{content:"";position:absolute;left:50%;top:3%;margin-top:2.25%;transform:translateX(-50%);width:22.7%;max-width:227px;aspect-ratio:900/223;background:url(${o.wmOverlay}) no-repeat center/contain;opacity:.62;filter:drop-shadow(0 0 3px rgba(0,0,0,.6));pointer-events:none}.hero::after{z-index:1}.hero .cap{z-index:2}.lbw::after{max-width:none}.thumbs .ph::after,.ccard .ph::after{display:none}</style>` : '';
  return sgHead(`${M.name} · Sân golf Việt Nam`, desc, wmCss + og + `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}<\/script>`) + sgTopBar(o.home || '../../', flag) + `<div class="wrap">
  <div class="crumb"><a href="${o.home || '../../'}">${sgBi('Sân golf Việt Nam', 'Vietnam golf courses')}</a>${M.region ? ` › ${sgBi(SG_REG_LAB[M.region][0], SG_REG_LAB[M.region][1])}` : ''}${M.province ? ` › ${sgEsc(M.province)}` : ''}</div>
  <div class="ttl"><div><div class="eyebrow">${sgBi((M.province ? M.province + ' · ' : '') + 'Việt Nam', (M.province ? M.province + ' · ' : '') + 'Vietnam')}</div><h1>${sgEsc(M.name)}</h1>
    <div class="badges"><span class="badge csr">${SG_IC.check}${sgBi('Đo trực tiếp bởi CSR Vietnam Team' + (M.measuredAt ? ' · ' + M.measuredAt : ''), 'Measured on site by CSR Vietnam Team' + (M.measuredAt ? ' · ' + M.measuredAt.replace(/^tháng\s*/, '') : ''))}</span>${M.official.length ? `<span class="badge">${sgBi('Có Course Rating & Slope chính thức', 'Official Course & Slope Rating')}</span>` : ''}${M.nHolePh ? `<span class="badge">${sgBi(`Ảnh ${M.nHolePh}/${M.nH} hố`, `Photos of ${M.nHolePh}/${M.nH} holes`)}</span>` : ''}<span id="cmScore"></span></div></div>
    <div class="acts"><button type="button" class="act" data-act="save" aria-pressed="false">${SG_IC2.heart}<span class="sl">${sgBi('Lưu sân', 'Save')}</span></button><button type="button" class="act" data-act="share">${SG_IC.share}${sgBi('Chia sẻ', 'Share')}</button><a class="act" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(base)}" target="_blank" rel="noopener">${SG_IC.fb}Facebook</a><button type="button" class="act" data-act="copy">${SG_IC.link}${sgBi('Chép link', 'Copy link')}</button></div></div>
  ${mPick.length ? `<div class="mosaic n${mPick.length}">${mPick.map((p, i) => `<div>${lbImg(p, 'mo', shotLab(p)[0] || M.name, shotLab(p)[1] || M.nameEn)}</div>`).join('')}${M.nPh > mPick.length ? `<button type="button" class="mall" data-act="all">${sgBi(`Xem ${sgFmt(M.gal.length)} ảnh sân`, `See all ${sgFmt(M.gal.length)} photos`)}</button>` : ''}</div>` : ''}
  <div class="facts">${facts.map(f => `<div><b class="num">${sgEsc(f[0])}</b>${sgBi(f[1], f[2])}</div>`).join('')}</div></div>
  <nav class="snav" aria-label="${sgEsc('Mục trong trang')}"><div class="wrap">${snav.map(x => `<a href="#${x[0]}">${sgBi(x[1], x[2])}</a>`).join('')}</div></nav><div class="wrap">
  <section class="two" id="tong-quan"><div><div class="eyebrow">${sgBi('Giới thiệu', 'Overview')}</div><h2>${sgEsc(M.nameEn !== M.name ? M.nameEn : M.name)}</h2>${sgBi(M.introVi, M.introEn, 'p', 'class="lead"')}
    ${M.fac.length ? `<div class="chips">${M.fac.map(k => `<span class="chip">${sgBi(SG.FAC[k][0], SG.FAC[k][1])}</span>`).join('')}</div>` : ''}
    ${book ? `<p style="margin-top:14px"><b>${sgBi('Đặt sân', 'Tee times')}:</b> ${book}</p>` : `<p class="muted" style="margin-top:14px;font-size:.85rem">${sgBi('Đặt sân, phòng: liên hệ trực tiếp sân. Trang này không nhận đặt chỗ hay thanh toán.', 'Tee times and rooms: contact the course directly. This page takes no bookings or payments.')}</p>`}</div>
    ${M.show.photos && M.gal[1] ? `<div><div class="ph">${(q => lbImg(q, 'gal', shotLab(q)[0], shotLab(q)[1]))(M.gal.find(p => p.kind === 'sunset' && p !== M.heroP) || M.gal.find(p => p !== M.heroP))}</div></div>` : '<div></div>'}</section>
  ${tees.length ? `<section id="tee"><div class="eyebrow">${sgBi('Các bộ tee', 'Tees')}</div><h2>${sgBi('Chọn tee phù hợp', 'Choose your tees')}</h2><div class="two" style="margin-top:14px">
    <div class="tbl"><table><thead><tr><th class="l">Tee</th><th>${sgBi('Hố 1–9', 'Out')}</th><th>${sgBi('Hố 10–18', 'In')}</th><th>${sgBi('Tổng (yd)', 'Total (yd)')}</th><th>Par</th></tr></thead><tbody>
      ${tees.map(t => `<tr><td class="l"><span class="dot" style="background:${t.color}"></span>${sgBi(t.vi + (t.gender === 'F' ? ' · nữ' : ' · nam'), t.en + (t.gender === 'F' ? ' · women' : ' · men'))}</td><td class="num">${sgFmt(t.out)}</td><td class="num">${t.in ? sgFmt(t.in) : '–'}</td><td class="num">${sgFmt(t.total)}</td><td class="num">${t.holes.reduce((a, h) => a + (+h.par || 0), 0)}</td></tr>`).join('')}</tbody></table></div>
    <div class="pending"><h3>Course Rating & Slope</h3>${M.official.length ? offRows + `<div class="sbar">${M.official.map(t => `<span>${sgEsc(t.name)}</span><div class="rail" role="img" aria-label="Slope ${sgEsc(t.slope)}"><i style="left:${Math.max(0, Math.min(100, (+t.slope - 55) / 100 * 100))}%"></i></div><b class="num">${sgEsc(t.slope)}</b>`).join('')}</div>${sgBi('Slope từ 55 (dễ nhất) đến 155 (khó nhất); sân trung bình là 113.', 'Slope runs from 55 (easiest) to 155 (hardest); 113 is average.', 'p', 'class="muted" style="font-size:.8rem;margin:8px 0 0"')}` : sgBi('Sân được VN Centre – CSR Vietnam Team đo. Chỉ số chính thức sẽ hiển thị tại đây sau khi được công bố trên hệ thống WHS.', 'Measured by VN Centre – CSR Vietnam Team. Official ratings will appear here once published in the WHS system.', 'p', 'class="muted" style="margin:6px 0 0"')}</div></div>${sgTeeGuide(M)}</section>` : ''}
  ${M.show.holes && H.length ? `<section id="ho"><div class="eyebrow">${sgBi('Từng hố', 'Hole by hole')}</div><h2>${sgBi('Nhìn trước từng hố', 'Preview every hole')}</h2>${sgBi('Ảnh do đoàn đo chụp trực tiếp trên sân: từ tee, các điểm rơi bóng, green. Bấm ảnh để xem lớn.', 'Photos taken on site by the rating team: from the tee, landing zones and the green. Tap a photo to enlarge.', 'p', 'class="muted" style="margin:6px 0 14px"')}<div class="hn" id="hn" role="group" aria-label="Holes"></div><div id="hole"></div></section>` : ''}
  ${M.cond.stimpFt || M.cond.roughIn || M.info.grass ? `<section><div class="eyebrow">${sgBi('Mặt sân', 'Playing conditions')}</div><h2>${sgBi('Điều kiện khi đoàn đo', 'Conditions when measured')}</h2><div class="grid4">
    ${M.cond.stimpFt ? `<div class="card"><b class="num">${sgEsc(M.cond.stimpFt)}${M.cond.stimpIn ? `' ${sgEsc(M.cond.stimpIn)}"` : ' ft'}</b>${sgBi('Tốc độ green (Stimpmeter)', 'Green speed (Stimpmeter)')}</div>` : ''}
    ${M.cond.roughLabel ? `<div class="card"><b class="num">${sgEsc(M.cond.roughLabel)}</b>${sgBi('Chiều cao rough', 'Rough height')}</div>` : ''}
    ${M.info.grass ? `<div class="card"><b style="font-size:1.1rem">${sgEsc(M.info.grass)}</b>${sgBi('Loại cỏ', 'Grass')}</div>` : M.cond.warm != null ? `<div class="card">${sgBi(M.cond.warm === false ? 'Cỏ mùa lạnh' : 'Cỏ mùa ấm', M.cond.warm === false ? 'Cool-season' : 'Warm-season', 'b')}${sgBi('Loại cỏ', 'Grass')}</div>` : ''}</div></section>` : ''}
  ${M.places.length || travelRows.length || M.info.planVi ? `<section id="quanh-san"><div class="eyebrow">${sgBi('Quanh sân', 'Around the course')}</div><h2>${sgBi('Ăn ở và đi lại', 'Stay, eat and get there')}</h2>
    ${travelRows.length ? `<div class="card" style="margin-top:14px"><dl class="kv">${travelRows.map(r => `${sgBi(r[1], r[2], 'dt')}<dd>${sgEsc(r[3])}</dd>`).join('')}</dl>${tr.tips ? `<p style="margin:12px 0 0;font-size:.9rem">${sgEsc(tr.tips)}</p>` : ''}</div>` : ''}
    ${pmap ? `<div id="pmap" role="region" aria-label="${sgEsc('Bản đồ quanh sân')}" data-p="${sgEsc(JSON.stringify(pmap))}"></div><div class="pmleg"><span><i style="background:#2b6be0"></i>${sgBi('Sân golf', 'Golf course')}</span><span><i style="background:var(--accent)"></i>${sgBi('Đoàn đo đã ghé', 'Visited by our team')}</span><span><i style="background:#6f7fa3"></i>${sgBi('Gợi ý tham khảo', 'More suggestions')}</span></div>` : ''}
    ${sgPlan(M)}
    ${M.places.some(p => p.src !== 'web') ? `<div class="places">${M.places.filter(p => p.src !== 'web').map(placeCard).join('')}</div>` : ''}
    ${M.places.some(p => p.src === 'web') ? sgGySection(M.places.filter(p => p.src === 'web'), placeCard) : ''}</section>` : ''}
  ${M.show.photos && M.gal.length > 1 ? `<section id="anh"><div class="eyebrow">${sgBi('Thư viện ảnh', 'Gallery')}</div><h2>${sgBi('Sân qua ống kính đoàn đo', "Through the rating team's lens")}</h2>${sgGalSection(M.gal.filter(p => p !== M.heroP), (p, grp) => { const l = shotLab(p); return `<figure><div class="ph">${lbImg(p, grp, l[0], l[1])}</div>${l[0] ? sgBi(l[0], l[1], 'figcaption') : ''}</figure>`; })}</section>` : ''}
  <section id="hoi-dap" class="faq"><div class="eyebrow">${sgBi('Hỏi đáp nhanh', 'Quick answers')}</div><h2>${sgBi('Câu hỏi hay gặp', 'Frequently asked')}</h2><div style="margin-top:12px">${faq.map((x, i) => `<details${i ? '' : ' open'}><summary>${sgBi(x[0], x[1])}</summary>${sgBi(x[2], x[3], 'p')}</details>`).join('')}</div></section>
  <!--cm-slot-->
  <section id="san-khac">${others.length ? `<div class="eyebrow">${sgBi('Đi tiếp', 'Keep exploring')}</div><h2>${sgBi('Sân khác đã được đo', 'More measured courses')}</h2><div class="rel">${others.map(relCard).join('')}</div>` : ''}
   <div id="seen" hidden style="margin-top:${others.length ? 28 : 0}px"><div class="eyebrow">${sgBi('Bạn vừa xem', 'Recently viewed')}</div><div class="rel"></div></div></section>
  <footer>${sgBi(`Số liệu và ảnh do VN Centre – CSR Vietnam Team đo, chụp tại sân${M.measuredAt ? ', ' + M.measuredAt : ''}. Thông tin có thể thay đổi theo điều kiện sân.`, `Data and photos measured and taken on site by VN Centre – CSR Vietnam Team${M.measuredAt ? ', ' + M.measuredAt : ''}. Details may change with course conditions.`)}</footer></div>
<script>${SG_JS_BASE}
var H=${JSON.stringify(H).replace(/</g, '\\u003c')},TE=${JSON.stringify(TJ).replace(/</g, '\\u003c')},MX=${maxLen},cur=0;
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
window.sgRender=function(){var nav=document.getElementById('hn');if(!nav)return;
 nav.innerHTML=H.map(function(h,i){return '<button data-i="'+i+'" aria-pressed="'+(i===cur)+'">'+h.n+'<small>Par '+esc(h.par)+'</small></button>'}).join('');
 var h=H[cur],m=h.ph[h.k||0];document.getElementById('hole').innerHTML='<div class="hole"><div>'+(m?'<div class="ph"><img src="'+m[0]+'" alt="'+esc(T(m[1],m[2]))+'" data-lb="h'+h.n+'" data-vi-c="'+esc(m[1])+'" data-en-c="'+esc(m[2])+'"></div><div class="cap2">'+esc(T(m[1],m[2]))+(h.ph.length>1?' · '+((h.k||0)+1)+'/'+h.ph.length:'')+'</div>'
 +(h.ph.length>1?'<div class="thumbs" role="group" aria-label="'+T('Ảnh hố','Hole photos')+'">'+h.ph.map(function(x,i){return '<button class="th'+(i===(h.k||0)?' on':'')+'" data-k="'+i+'" aria-label="'+esc(T(x[1],x[2]))+'"><img loading="lazy" src="'+x[0]+'" alt=""></button>'}).join('')+'</div>':''):'<div class="ph"></div>')+'</div>'
 +'<div class="card"><div class="hnum"><b class="num">'+h.n+'</b><span>Par '+esc(h.par)+'</span></div><div class="yd">'
 +TE.map(function(t,j){var l=h.len[j];return l?'<span><span class="dot" style="background:'+t.c+'"></span>'+esc(T(t.vi,t.en))+'</span><div class="b"><i style="background:'+t.c+';width:'+(l/MX*100)+'%"></i></div><b class="num">'+l+' yd</b>':''}).join('')+'</div>'
 +'<dl class="kv">'+(h.siM!=null?'<dt>'+T('Độ khó (SI) nam','Stroke index men')+(h.siF!=null?T(' / nữ',' / women'):'')+'</dt><dd>'+h.siM+(h.siF!=null?' / '+h.siF:'')+'</dd>':'')+(h.gw?'<dt>'+T('Green rộng × sâu','Green width × depth')+'</dt><dd>'+h.gw+' × '+h.gd+' yd</dd>':'')+'<dt>'+T('Ảnh của hố','Photos of this hole')+'</dt><dd>'+h.ph.length+'</dd></dl></div></div>'};
window.sgLbList=function(g){if(!/^h\\d+$/.test(g))return null;var h=H[cur];return{list:h.ph.map(function(x){return{s:x[0],vi:x[1]+' · '+T('Hố ','Hole ')+h.n,en:x[2]+' · Hole '+h.n}}),i:h.k||0}};
document.addEventListener('click',function(e){var t=e.target.closest('#hole .thumbs button');if(!t)return;H[cur].k=+t.dataset.k;window.sgRender();var n=document.querySelector('#hole .thumbs button[data-k="'+H[cur].k+'"]');if(n)n.focus({preventScroll:true})});
document.addEventListener('click',function(e){var b=e.target.closest('#hn button');if(!b)return;cur=+b.dataset.i;window.sgRender();var n=document.querySelector('#hn button[data-i="'+cur+'"]');if(n)n.focus({preventScroll:true})});
${SG_GY_JS}
${SG_GAL_JS}
window.SG_ME=${JSON.stringify(me).replace(/</g, '\\u003c')};${SG_P1_JS}${SG_P2_JS}
paint();<\/script>${mb.length ? `<nav class="mbar" aria-label="${sgEsc('Liên hệ nhanh')}">${mb.join('')}</nav><script>document.body.classList.add('hasmbar')<\/script>` : ''}</body></html>`;
}
function sgIndexHTML(list, img) {
  /* 02/11/2026 (giai đoạn 1): ô tìm + lọc nhanh, dải số tin cậy, bản đồ sân */
  const regs = ['bac', 'trung', 'nam'].filter(r => list.some(M => M.region === r));
  const FQ = [['hotel', 'Có khách sạn', 'Hotel on site'], ['night', 'Chơi đêm', 'Night golf'], ['rental', 'Thuê gậy', 'Club rental']].filter(x => list.some(M => M.fac.includes(x[0])));
  const nPh = list.reduce((a, M) => a + (M.nPh || 0), 0), nHo = list.reduce((a, M) => a + (M.nHolePh || 0), 0);
  const pts = list.filter(M => M.lat != null).map(M => ({ s: M.slug, n: M.name, p: M.province, a: M.lat, o: M.lng }));
  const card = M => `<a class="ccard" id="c-${M.slug}" href="san/${M.slug}/" data-q="${sgEsc(sgSlug([M.name, M.nameEn, M.province, M.region ? SG_REG_LAB[M.region][0] : ''].join(' ')).replace(/-/g, ' '))}" data-r="${M.region || ''}" data-f="${M.fac.join(' ')}"><div class="ph">${M.heroP && M.show.photos ? `<img loading="lazy" src="${img(M.heroP, M)}" alt="${sgEsc(M.name)}">` : ''}</div><div class="t"><div class="eyebrow">${sgEsc(M.province)}</div><h3 style="margin-top:4px">${sgEsc(M.name)}</h3><p class="muted num" style="margin:4px 0 0;font-size:.85rem">${M.nH} ${sgBi('hố', 'holes')} · Par ${M.par}${M.tees[0] ? ` · ${sgFmt(M.tees[0].total)} yd` : ''}${M.slopeMax ? ` · Slope ${M.slopeMax}` : ''}</p><div class="meta">${M.nPh ? sgBi(`${sgFmt(M.nPh)} ảnh thật`, `${sgFmt(M.nPh)} real photos`) : ''}${M.nHolePh ? sgBi(`ảnh ${M.nHolePh}/${M.nH} hố`, `${M.nHolePh}/${M.nH} holes photographed`) : ''}${M.fac.includes('hotel') ? sgBi('có khách sạn', 'hotel on site') : ''}</div></div></a>`;
  return sgHead('Sân golf Việt Nam · VN Centre – CSR Vietnam Team', 'Thông tin các sân golf Việt Nam do đoàn đo VN Centre – CSR Vietnam Team trực tiếp ghi nhận: chiều dài từng tee, ảnh từng hố, dịch vụ quanh sân.', `<link rel="canonical" href="${SG_SITE}/"><meta property="og:type" content="website"><meta property="og:url" content="${SG_SITE}/">${pts.length ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">' : ''}`) + sgTopBar('./', null) + `<div class="wrap">
  <section class="hhero"><div class="eyebrow">${sgBi('Việt Nam', 'Vietnam')}</div><h1>${sgBi('Sân golf Việt Nam, xem trước khi đến', 'Vietnam golf courses, before you go')}</h1>
  ${sgBi('Thông tin từng sân do đoàn đo độ khó sân ghi nhận trực tiếp: chiều dài từng tee, ảnh từng hố, dịch vụ quanh sân.', 'Each course measured on site by the course rating team: tee lengths, hole photos and what is around the course.', 'p', 'class="lead muted" style="margin:10px 0 0"')}
  <label class="find"><input id="fq" type="search" autocomplete="off" placeholder="Tìm sân theo tên, tỉnh, thành phố" data-ph-en="Search by course, province or city" aria-label="Tìm sân"><span id="fn"></span></label>
  ${regs.length > 1 || FQ.length ? `<div class="qf" role="group" aria-label="Lọc nhanh"><button data-qr="" aria-pressed="true">${sgBi('Tất cả', 'All')}</button>${regs.length > 1 ? regs.map(r => `<button data-qr="${r}" aria-pressed="false">${sgBi(SG_REG_LAB[r][0], SG_REG_LAB[r][1])}</button>`).join('') : ''}${FQ.map(x => `<button data-qf="${x[0]}" aria-pressed="false">${sgBi(x[1], x[2])}</button>`).join('')}</div>` : ''}
  <div class="trust"><div><b class="num">${list.length}</b>${sgBi('sân đã đo trực tiếp', 'courses measured on site')}</div><div><b class="num">${sgFmt(nPh)}</b>${sgBi('ảnh thật do đoàn đo chụp', 'real photos by the team')}</div><div><b class="num">${sgFmt(nHo)}</b>${sgBi('hố có ảnh và số đo', 'holes with photos and data')}</div><div><b>WHS</b>${sgBi('đo theo hệ thống Course Rating', 'measured to the Course Rating System')}</div></div>
  <div class="saved" id="saved" hidden><div class="eyebrow">${sgBi('Sân bạn đã lưu', 'Your saved courses')}</div><div class="rel"></div></div></section>
  <section style="padding-top:8px"><div class="hgrid${pts.length ? '' : ' nomap'}"><div><div class="cards" id="cards">${list.map(card).join('')}</div><p class="empty2" id="none" hidden>${sgBi('Chưa có sân nào khớp. Thử từ khoá khác hoặc bỏ bớt bộ lọc.', 'No course matches yet. Try another word or clear a filter.')}</p></div>${pts.length ? '<div id="vmap" role="region" aria-label="Bản đồ sân"></div>' : ''}</div></section>
  <footer>VN Centre – CSR Vietnam Team</footer></div><script>${SG_JS_BASE}paint();
(function(){var a=[];try{a=JSON.parse(localStorage.getItem('sg_saved')||'[]')}catch(e){}var b=document.getElementById('saved');if(b&&a.length){b.hidden=false;b.querySelector('.rel').innerHTML=a.slice(0,8).map(function(x){return '<a href="'+esc(x.h||('san/'+x.s+'/'))+'"><div class="ph">'+(x.i?'<img loading="lazy" src="'+esc(x.i)+'" alt="">':'')+'</div><div class="t"><div class="eyebrow">'+esc(x.p||'')+'</div><h3>'+esc(x.n)+'</h3></div></a>'}).join('')}})();
(function(){var q=document.getElementById('fq'),fn=document.getElementById('fn'),C=[].slice.call(document.querySelectorAll('#cards .ccard')),R='',F={},MK={};
 function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'d').toLowerCase().trim()}
 function ph(){q.placeholder=lang==='en'?q.dataset.phEn:'Tìm sân theo tên, tỉnh, thành phố'}ph();document.addEventListener('click',function(e){if(e.target.closest('#sgL,#sgE'))setTimeout(ph,0)});
 function run(){var t=norm(q.value).split(/\\s+/).filter(Boolean),n=0;C.forEach(function(c){var ok=t.every(function(w){return c.dataset.q.indexOf(w)>=0})&&(!R||c.dataset.r===R)&&Object.keys(F).every(function(k){return !F[k]||(' '+c.dataset.f+' ').indexOf(' '+k+' ')>=0});c.hidden=!ok;if(ok)n++;var m=MK[c.id.slice(2)];if(m){if(ok)m.addTo(window.__map);else m.remove()}});
  document.getElementById('none').hidden=n>0;fn.textContent=(q.value||R||Object.keys(F).some(function(k){return F[k]}))?n+' '+T('sân','courses'):''}
 q.addEventListener('input',run);
 document.addEventListener('click',function(e){var b=e.target.closest('.qf button');if(!b)return;if(b.dataset.qf!=null){F[b.dataset.qf]=!F[b.dataset.qf];b.setAttribute('aria-pressed',F[b.dataset.qf])}else{R=b.dataset.qr;[].forEach.call(document.querySelectorAll('.qf [data-qr]'),function(x){x.setAttribute('aria-pressed',x===b)})}run()});
 var P=${JSON.stringify(pts).replace(/</g, '\\u003c')};if(!P.length)return;
 var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';s.onload=function(){var L=window.L,el=document.getElementById('vmap');
  var map=window.__map=L.map(el,{scrollWheelZoom:false,zoomControl:true});L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,attribution:'Tiles &copy; Esri'}).addTo(map);
  var ac=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#B06829',B=[];
  P.forEach(function(p){var m=L.circleMarker([p.a,p.o],{radius:9,color:'#fff',weight:2,fillColor:ac,fillOpacity:1}).addTo(map);MK[p.s]=m;B.push([p.a,p.o]);
   m.bindPopup('<a href="san/'+p.s+'/">'+esc(p.n)+'</a><br><small>'+esc(p.p||'')+'</small>');
   m.on('mouseover',function(){var c=document.getElementById('c-'+p.s);if(c)c.classList.add('on')});m.on('mouseout',function(){var c=document.getElementById('c-'+p.s);if(c)c.classList.remove('on')});
   m.on('click',function(){var c=document.getElementById('c-'+p.s);if(c&&innerWidth>900)c.scrollIntoView({block:'nearest',behavior:'smooth'})})});
  function fit(){map.invalidateSize();if(B.length>1)map.fitBounds(B,{padding:[40,40],maxZoom:9});else map.setView(B[0],9)}fit();setTimeout(fit,300);addEventListener('load',fit);
  C.forEach(function(c){var m=MK[c.id.slice(2)];if(!m)return;c.addEventListener('mouseenter',function(){m.setStyle({radius:13});m.bringToFront()});c.addEventListener('mouseleave',function(){m.setStyle({radius:9})})})};
 document.body.appendChild(s)})();
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}<\/script></body></html>`;
}
/* ===== Cộng đồng trên website sân (courses.vncentre.net) =====
   Đội đo cung cấp thông tin core; người dùng đăng nhập Google/Facebook gửi bình luận, bài viết, mẹo hố, địa điểm, ảnh.
   Mọi bài vào hàng chờ duyệt (bảng cm_posts, status=pending); trang chỉ hiện bài đã duyệt, gắn nhãn "Do người dùng bổ sung". */
const CM_CFG = { url: 'https://zrfipnqkjrhzrscaaeth.supabase.co', key: 'sb_publishable_Av1bNAWdHq5SZQSl-JtkQA_PgK6fI-m', sbjs: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js', contact: 'VNCentre.net@gmail.com' };

const SG_CM_CSS = `
.cm{scroll-margin-top:70px}
.cm .who{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.cmbtn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:8px 14px;font:600 .85rem/1 var(--body)}
.cmbtn:hover{border-color:var(--accent)}.cmbtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cmbtn.pri{background:var(--btn);color:var(--btnInk,#fff);border-color:transparent}
.cmbtn[aria-pressed="true"]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.cmbtn[disabled]{opacity:.5;cursor:default}
.cm .tabs{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 4px}
.cm .add{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.cmform{margin-top:14px;display:grid;gap:10px}
.cmform label{display:grid;gap:4px;font-size:.85rem;color:var(--muted)}
.cmform input,.cmform textarea,.cmform select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 10px;width:100%;box-sizing:border-box}
.cmform textarea{min-height:110px;resize:vertical}
.cmform .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:640px){.cmform .two{grid-template-columns:1fr}}
.cmform .ok{display:flex;gap:8px;align-items:flex-start;color:var(--ink);font-size:.85rem}.cmform .ok input{width:auto;margin-top:3px}
.cmlist{display:grid;gap:12px;margin-top:14px}
.cmc{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--accent2);border-radius:12px;padding:14px 16px}
.cmc.pend{border-left-color:var(--muted);opacity:.85}
.cmh{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:.78rem;color:var(--muted)}
.cmb{background:var(--soft);color:var(--ink);border-radius:999px;padding:3px 9px;font-weight:600}
.cmc h3{margin:8px 0 4px;font-size:1.1rem}
.cmc p{margin:6px 0;font-size:.95rem;white-space:normal}
.cmph{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:8px}
.cmph img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;cursor:zoom-in;display:block}
.cmvids{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-top:8px}
.cmvid{all:unset;cursor:pointer;position:relative;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;width:100%;aspect-ratio:16/9;border-radius:8px;background:#111 center/cover no-repeat;color:#fff}
.cmvid.fb{background:#1b3a6b}.cmvid.vm{background:#0d2a35}.cmvid span{width:56px;height:40px;border-radius:10px;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;font-size:20px}
.cmvid:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cmvf{position:relative;width:100%;aspect-ratio:16/9}.cmvf iframe{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px}
.cmvl{display:inline-block;font-size:.75rem;margin-top:4px}
.cmrep{all:unset;cursor:pointer;font-size:.75rem;color:var(--muted);text-decoration:underline;margin-top:8px;display:inline-block}
.cmnote{background:var(--soft);border-radius:10px;padding:10px 12px;font-size:.85rem;margin-top:12px}
.cmerr{color:#b42318}
.stars{display:inline-flex;gap:1px;font-size:1rem;line-height:1;vertical-align:-1px}.stars .st{display:inline-block;color:var(--line)}.stars .st.on{color:#e0a200}.stars .st.half{background:linear-gradient(90deg,#e0a200 50%,var(--line) 50%);-webkit-background-clip:text;background-clip:text;color:transparent}.stars.big{font-size:1.35rem}
.rvsum{display:grid;grid-template-columns:auto 1fr;gap:16px 28px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-top:14px}
@media (max-width:560px){.rvsum{grid-template-columns:1fr}}
.rvbig{display:flex;flex-direction:column;gap:4px}.rvbig b{font:600 2.6rem/1 var(--display)}.rvbig span:last-child{font-size:.8rem;color:var(--muted)}
.rvbars{display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;align-items:center;font-size:.82rem}.rvbars i{height:8px;border-radius:4px;background:var(--soft);overflow:hidden}.rvbars s{display:block;height:100%;background:#e0a200;text-decoration:none}
.rvline{display:flex;align-items:center;gap:8px;margin-top:6px}
.rvpick{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;font-size:.9rem;color:var(--ink);border-bottom:1px dashed var(--line);padding-bottom:6px}
.rvst{display:inline-flex;gap:2px}.rvst button{all:unset;cursor:pointer;font-size:1.6rem;line-height:1;color:var(--line);padding:2px}.rvst button.on{color:#e0a200}.rvst button:focus-visible{outline:2px solid var(--accent);border-radius:4px}
`;

/* Mã chạy trên trang tĩnh (không dùng biến của app). Dùng T()/lang của SG_JS_BASE. */
function cmClient(C) {
  var sb = null, user = null, posts = [], mine = [], filter = 'all', form = null, busy = false, note = '', repFor = null;
  /* Giữ bản nháp: không mất chữ khi form vẽ lại (báo lỗi, gửi lỗi) hay khi tải lại trang (23/10/2026) */
  var DIDS = ['cmTitle', 'cmBody', 'cmCat', 'cmHole', 'cmAddr', 'cmPhone', 'cmMap', 'cmVid'], shown = null;
  function dkey(k) { return 'cm-draft:' + location.pathname + ':' + k; }
  function grab() { var d = {}, n = 0; DIDS.forEach(function (id) { var x = document.getElementById(id); if (x) { d[id] = x.value; n++; } }); var ok = document.getElementById('cmOk'); if (ok) d.cmOk = ok.checked; return n ? d : null; }
  function put(d) { if (!d) return; Object.keys(d).forEach(function (id) { var x = document.getElementById(id); if (!x) return; if (id === 'cmOk') x.checked = !!d[id]; else if (d[id] != null && d[id] !== '') x.value = d[id]; }); }
  function saveDraft() { if (!form) return; var d = grab(); try { if (d) localStorage.setItem(dkey(form), JSON.stringify(d)); } catch (_) {} }
  function loadDraft(k) { try { return JSON.parse(localStorage.getItem(dkey(k)) || 'null'); } catch (_) { return null; } }
  function dropDraft(k) { try { localStorage.removeItem(dkey(k)); } catch (_) {} }
  /* GĐ2 (02/11/2026): đánh giá sân bằng sao – bài loại 'review', data.r = {all, cond, design, value, service, pace} */
  var RK = [['cond', 'Tình trạng sân', 'Course condition'], ['design', 'Thiết kế, độ thú vị', 'Design & fun'], ['value', 'Đáng tiền', 'Value for money'], ['service', 'Phục vụ, caddie', 'Service & caddies'], ['pace', 'Tốc độ vòng chơi', 'Pace of play']], rv = {};
  function stars(n, big) { n = +n || 0; var h = ''; for (var i = 1; i <= 5; i++) h += '<span class="st' + (n >= i - .25 ? ' on' : n >= i - .75 ? ' half' : '') + '">★</span>'; return '<span class="stars' + (big ? ' big' : '') + '" aria-label="' + n.toFixed(1) + '/5">' + h + '</span>'; }
  function num1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace('.', lang === 'en' ? '.' : ','); }
  function score() { var R = posts.filter(function (p) { return p.kind === 'review' && p.data && p.data.r && +p.data.r.all; }); if (!R.length) return null;
    var o = { n: R.length, all: R.reduce(function (a, p) { return a + +p.data.r.all; }, 0) / R.length, sub: {} };
    RK.forEach(function (k) { var v = R.map(function (p) { return +p.data.r[k[0]] || 0; }).filter(Boolean); if (v.length) o.sub[k[0]] = v.reduce(function (a, b) { return a + b; }, 0) / v.length; }); return o; }
  function paintScore() { var b = document.getElementById('cmScore'), o = score(); if (!b) return;
    b.innerHTML = o ? '<a class="gscore" href="#cm-sec"><b>★ ' + num1(o.all) + '</b>' + T(' · ' + o.n + ' đánh giá golfer', ' · ' + o.n + ' golfer review' + (o.n > 1 ? 's' : '')) + '</a>' : ''; }
  function mineReview() { return mine.some(function (p) { return p.kind === 'review'; }) || (user && posts.some(function (p) { return p.kind === 'review' && p.author === user.id; })); }
  var K = { review: ['Đánh giá sân', 'Rate this course'], comment: ['Bình luận', 'Comment'], article: ['Bài viết', 'Story'], tip: ['Mẹo chơi hố', 'Hole tip'], place: ['Địa điểm', 'Place'], photo: ['Ảnh', 'Photos'], video: ['Video', 'Video'] };
  var CAT = { lodging: ['Lưu trú', 'Stay'], food: ['Ăn uống', 'Food'], cafe: ['Cà phê', 'Café'], see: ['Tham quan', 'Sightseeing'], family: ['Vui chơi gia đình', 'Family fun'], spa: ['Spa – massage', 'Spa & massage'], move: ['Di chuyển', 'Getting around'], shop: ['Mua sắm', 'Shopping'] };
  var REP = [['spam', 'Quảng cáo, spam', 'Spam or advertising'], ['wrong', 'Thông tin sai', 'Wrong information'], ['rude', 'Xúc phạm, không phù hợp', 'Offensive or inappropriate'], ['copy', 'Vi phạm bản quyền, quyền riêng tư', 'Copyright or privacy'], ['other', 'Lý do khác', 'Other']];
  function L(a) { return T(a[0], a[1]); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function paras(s) { return String(s || '').trim().split(/\n\s*\n/).map(function (p) { return '<p>' + e(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }
  function day(s) { var d = new Date(s); return isNaN(d) ? '' : ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); }
  function purl(p) { return /^(https?:|data:)/.test(p) ? p : C.url + '/storage/v1/object/public/cm-photos/' + p; }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  /* Video: chỉ nhận link YouTube / Facebook, nhúng từ chính YouTube/Facebook/Vimeo (không tải video lên máy chủ của mình) */
  function vid(u) { u = String(u || '').trim(); var m = u.match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) return { t: 'yt', id: m[1], u: 'https://www.youtube.com/watch?v=' + m[1] };
    if (/^https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\//i.test(u) && /(\/videos?\/|\/watch|\/reel\/|fb\.watch\/|\/share\/[rv]\/)/i.test(u)) return { t: 'fb', u: u.split('#')[0] };
    m = u.match(/^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/|channels\/[\w-]+\/|groups\/[\w-]+\/videos\/|showcase\/\d+\/video\/)?(\d{6,12})(?:\/([0-9a-f]{6,20}))?(?:[?&#].*?(?:\bh=([0-9a-f]{6,20}))?)?/i);
    if (m) { var hh = m[2] || m[3] || ''; return { t: 'vm', id: m[1], h: hh, u: 'https://vimeo.com/' + m[1] + (hh ? '/' + hh : '') }; }
    return null; }
  function vidHTML(v, i) {
    if (v.t === 'yt') return '<button class="cmvid" data-cm="play" data-i="' + i + '" style="background-image:url(https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg)" aria-label="' + T('Phát video YouTube', 'Play YouTube video') + '"><span>▶</span></button>';
    var nm = v.t === 'vm' ? 'Vimeo' : 'Facebook';
    return '<button class="cmvid ' + v.t + '" data-cm="play" data-i="' + i + '" aria-label="' + T('Phát video ', 'Play video on ') + nm + '"><span>▶</span><small>' + T('Video trên ', 'Video on ') + nm + '</small></button>'; }
  function vidFrame(v) { var src = v.t === 'yt' ? 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&rel=0' : v.t === 'vm' ? 'https://player.vimeo.com/video/' + v.id + '?autoplay=1&dnt=1' + (v.h ? '&h=' + v.h : '') : 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(v.u) + '&show_text=false&autoplay=true';
    return '<div class="cmvf"><iframe src="' + e(src) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" title="Video"></iframe></div>'; }
  var VIDS = [];
  function uname() { var m = (user && user.user_metadata) || {}; return m.full_name || m.name || T('bạn', 'there'); }
  var root = document.getElementById('cm'); if (!root) return;

  function card(p, pend) {
    var d = p.data || {}, ph = p.photos || [], h = '';
    h += '<article class="cmc' + (pend ? ' pend' : '') + '"><div class="cmh"><span class="cmb">' + (pend ? T('Chờ duyệt · chỉ bạn thấy', 'Awaiting review · only you can see this') : T('Do người dùng bổ sung', 'Added by a user')) + '</span>'
      + '<span>' + L(K[p.kind] || K.comment) + (p.hole ? ' · ' + T('Hố ', 'Hole ') + e(p.hole) : '') + (p.kind === 'place' && CAT[d.cat] ? ' · ' + L(CAT[d.cat]) : '') + '</span>'
      + '<span>' + e(p.author_name || T('Người dùng', 'User')) + ' · ' + day(p.created_at) + '</span></div>';
    if (p.title) h += '<h3>' + e(p.title) + '</h3>';
    if (p.kind === 'review' && d.r) { h += '<div class="rvline">' + stars(d.r.all) + ' <b>' + e(d.r.all) + '/5</b></div>'; var sub = RK.filter(function (k) { return +d.r[k[0]]; }); if (sub.length) h += '<p class="muted" style="font-size:.82rem;margin:4px 0">' + sub.map(function (k) { return T(k[1], k[2]) + ' ' + e(d.r[k[0]]) + '/5'; }).join(' · ') + '</p>'; }
    if (p.kind === 'place') { var ln = []; if (d.addr) ln.push(e(d.addr)); if (d.phone) ln.push('<span class="num">' + e(d.phone) + '</span>'); if (safeUrl(d.map)) ln.push('<a href="' + e(safeUrl(d.map)) + '" target="_blank" rel="noopener nofollow ugc">' + T('Bản đồ', 'Map') + '</a>'); if (ln.length) h += '<p class="muted" style="font-size:.85rem">' + ln.join(' · ') + '</p>'; }
    h += paras(p.body);
    if (ph.length) h += '<div class="cmph">' + ph.map(function (x) { return '<img loading="lazy" src="' + e(purl(x)) + '" alt="' + e(T('Ảnh người dùng gửi', 'User photo')) + '" data-lb="cm-' + e(p.id) + '" data-vi-c="' + e(T('Ảnh người dùng gửi · ', 'User photo · ') + (p.author_name || '')) + '" data-en-c="' + e('User photo · ' + (p.author_name || '')) + '">'; }).join('') + '</div>';
    var vs = (d.videos || []).map(vid).filter(Boolean);
    if (vs.length) h += '<div class="cmvids">' + vs.map(function (v) { VIDS.push(v); return '<div>' + vidHTML(v, VIDS.length - 1) + '<a class="cmvl" href="' + e(v.u) + '" target="_blank" rel="noopener nofollow ugc">' + T('Mở trên ', 'Open on ') + (v.t === 'yt' ? 'YouTube' : v.t === 'vm' ? 'Vimeo' : 'Facebook') + '</a></div>'; }).join('') + '</div>';
    if (!pend) {
      if (repFor === p.id) h += '<div class="cmform" style="margin-top:8px"><label>' + T('Lý do báo vi phạm', 'Reason') + '<select id="cmRepR">' + REP.map(function (r) { return '<option value="' + r[0] + '">' + T(r[1], r[2]) + '</option>'; }).join('') + '</select></label><div class="add"><button class="cmbtn pri" data-cm="repSend" data-id="' + e(p.id) + '">' + T('Gửi báo cáo', 'Send report') + '</button><button class="cmbtn" data-cm="repX">' + T('Huỷ', 'Cancel') + '</button></div></div>';
      else h += '<button class="cmrep" data-cm="rep" data-id="' + e(p.id) + '">' + T('Báo vi phạm', 'Report') + '</button>';
    }
    return h + '</article>';
  }

  function pick(key) { var h = '<span class="rvst" role="radiogroup" aria-label="' + key + '">'; for (var i = 1; i <= 5; i++) h += '<button type="button" role="radio" aria-checked="' + (+rv[key] === i) + '" data-cm="rv" data-k="' + key + '" data-v="' + i + '" class="' + (+rv[key] >= i ? 'on' : '') + '" aria-label="' + i + '/5">★</button>'; return h + '</span>'; }
  function formHTML() {
    var k = form, f = '';
    var holeSel = '<label>' + T('Hố', 'Hole') + '<select id="cmHole">' + Array.from({ length: C.holes || 18 }, function (_, i) { return '<option>' + (i + 1) + '</option>'; }).join('') + '</select></label>';
    if (k === 'article') f += '<label>' + T('Tiêu đề', 'Title') + '<input id="cmTitle" maxlength="200" placeholder="' + e(T('Một ngày ở sân…', 'A day at the course…')) + '"></label>';
    if (k === 'place') f += '<div class="two"><label>' + T('Tên địa điểm', 'Place name') + '<input id="cmTitle" maxlength="200"></label><label>' + T('Loại', 'Type') + '<select id="cmCat">' + Object.keys(CAT).map(function (c) { return '<option value="' + c + '">' + L(CAT[c]) + '</option>'; }).join('') + '</select></label></div>'
      + '<div class="two"><label>' + T('Địa chỉ', 'Address') + '<input id="cmAddr" maxlength="300"></label><label>' + T('Điện thoại', 'Phone') + '<input id="cmPhone" maxlength="40" inputmode="tel"></label></div>'
      + '<label>' + T('Link Google Maps (tuỳ chọn)', 'Google Maps link (optional)') + '<input id="cmMap" maxlength="500" placeholder="https://maps.app.goo.gl/…"></label>';
    if (k === 'tip') f += holeSel;
    if (k === 'review') { f += '<div class="rvpick"><span>' + T('Chấm chung', 'Overall') + ' *</span>' + pick('all') + '</div>' + RK.map(function (x) { return '<div class="rvpick"><span>' + T(x[1], x[2]) + '</span>' + pick(x[0]) + '</div>'; }).join(''); }
    f += '<label>' + (k === 'review' ? T('Cảm nhận của bạn (tuỳ chọn)', 'Your thoughts (optional)') : k === 'photo' || k === 'video' ? T('Chú thích', 'Caption') : k === 'place' ? T('Nhận xét của bạn', 'Your review') : k === 'tip' ? T('Mẹo của bạn', 'Your tip') : T('Nội dung', 'Text')) + '<textarea id="cmBody" maxlength="' + (k === 'article' ? 20000 : 3000) + '"></textarea></label>';
    if (k === 'photo' || k === 'place' || k === 'article') f += '<label>' + T('Ảnh (tối đa 6, ảnh do bạn chụp)', 'Photos (up to 6, taken by you)') + '<input id="cmFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>';
    if (k !== 'comment' && k !== 'review') f += '<label>' + (k === 'video' ? T('Link video YouTube, Facebook hoặc Vimeo', 'YouTube, Facebook or Vimeo video link') : T('Link video YouTube/Facebook/Vimeo (tuỳ chọn, mỗi dòng một link, tối đa 3)', 'YouTube/Facebook/Vimeo video links (optional, one per line, up to 3)')) + (k === 'video' ? '<input id="cmVid" maxlength="1000" placeholder="https://youtu.be/…">' : '<textarea id="cmVid" style="min-height:60px" maxlength="1500" placeholder="https://www.youtube.com/watch?v=…"></textarea>') + '</label><p class="muted" style="margin:-4px 0 0;font-size:.78rem">' + T('Tải video lên YouTube, Facebook hoặc Vimeo trước (chế độ Công khai hoặc Không công khai), rồi dán link vào đây.', 'Upload your video to YouTube, Facebook or Vimeo first (Public or Unlisted), then paste the link here.') + '</p>';
    f += '<label class="ok"><input type="checkbox" id="cmOk" checked><span>' + T('Nội dung, ảnh, video do tôi tạo ra hoặc có quyền đăng, và tôi đồng ý ', 'I created this text, these photos and videos, or have the right to post them, and I agree to the ') + '<a href="' + C.home + 'dieu-khoan/" target="_blank">' + T('Điều khoản', 'Terms') + '</a>.</span></label>';
    f += '<div class="add"><button class="cmbtn pri" data-cm="send"' + (busy ? ' disabled' : '') + '>' + (busy ? T('Đang gửi…', 'Sending…') : T('Gửi để duyệt', 'Submit for review')) + '</button><button class="cmbtn" data-cm="cancel">' + T('Huỷ', 'Cancel') + '</button></div>';
    return '<div class="card cmform"><b>' + L(K[k]) + '</b>' + f + '<p class="muted" style="margin:0;font-size:.8rem">' + T('Bài sẽ hiện sau khi được VN Centre duyệt. Không đăng quảng cáo, thông tin sai, ảnh có mặt trẻ em khi chưa được phụ huynh đồng ý.', 'Posts appear after review by VN Centre. No ads, false information, or photos of children without parental consent.') + '</p></div>';
  }

  function render() {
    var keep = (form && shown === form) ? grab() : null;
    VIDS = [];
    var cnt = { all: posts.length }; posts.forEach(function (p) { cnt[p.kind] = (cnt[p.kind] || 0) + 1; });
    var list = posts.filter(function (p) { return filter === 'all' || p.kind === filter; });
    var h = '';
    h += '<div class="who">' + (C.mock ? '<span class="cmb">' + T('Bản xem trước · dữ liệu mẫu', 'Preview · sample data') + '</span>' : '') + (user
      ? '<span>' + T('Xin chào ', 'Hi ') + '<b>' + e(uname()) + '</b></span><button class="cmbtn" data-cm="out">' + T('Đăng xuất', 'Sign out') + '</button>'
      : '<span class="muted" style="font-size:.9rem">' + T('Đăng nhập để đóng góp:', 'Sign in to contribute:') + '</span><button class="cmbtn" data-cm="in" data-p="google">Google</button><button class="cmbtn" data-cm="in" data-p="facebook">Facebook</button>') + '</div>';
    var sc = score();
    if (sc) h += '<div class="rvsum"><div class="rvbig"><b>' + num1(sc.all) + '</b>' + stars(sc.all, true) + '<span>' + T(sc.n + ' đánh giá của golfer', sc.n + ' golfer review' + (sc.n > 1 ? 's' : '')) + '</span></div><div class="rvbars">' + RK.filter(function (k) { return sc.sub[k[0]]; }).map(function (k) { return '<span>' + T(k[1], k[2]) + '</span><i><s style="width:' + (sc.sub[k[0]] / 5 * 100) + '%"></s></i><b class="num">' + num1(sc.sub[k[0]]) + '</b>'; }).join('') + '</div></div>';
    var done = mineReview();
    h += '<div class="add">' + ['review', 'comment', 'article', 'tip', 'place', 'photo', 'video'].map(function (k) { return k === 'review' && done ? '<button class="cmbtn" disabled>★ ' + T('Bạn đã đánh giá sân này', 'You have rated this course') + '</button>' : '<button class="cmbtn' + (k === 'review' ? ' pri' : '') + '" data-cm="new" data-k="' + k + '" aria-pressed="' + (form === k) + '">' + (k === 'review' ? '★ ' : '+ ') + L(K[k]) + '</button>'; }).join('') + '</div>';
    if (note) h += '<div class="cmnote' + (/^!/.test(note) ? ' cmerr' : '') + '" role="status">' + e(note.replace(/^!/, '')) + '</div>';
    if (form) h += formHTML();
    if (mine.length) h += '<h3 style="margin-top:18px">' + T('Bài của bạn đang chờ duyệt', 'Your posts awaiting review') + '</h3><div class="cmlist">' + mine.map(function (p) { return card(p, true); }).join('') + '</div>';
    h += '<div class="tabs" role="group" aria-label="' + T('Lọc', 'Filter') + '">' + ['all', 'review', 'comment', 'article', 'tip', 'place', 'photo', 'video'].map(function (k) { return '<button class="cmbtn" data-cm="f" data-k="' + k + '" aria-pressed="' + (filter === k) + '">' + (k === 'all' ? T('Tất cả', 'All') : L(K[k])) + ' <small>' + (cnt[k] || 0) + '</small></button>'; }).join('') + '</div>';
    h += list.length ? '<div class="cmlist">' + list.map(function (p) { return card(p, false); }).join('') + '</div>' : '<p class="muted">' + T('Chưa có đóng góp nào. Hãy là người đầu tiên chia sẻ!', 'No contributions yet. Be the first to share!') + '</p>';
    root.innerHTML = h;
    if (form) put(shown === form ? keep : loadDraft(form));
    shown = form; paintScore();
  }

  function load() {
    if (C.mock) { posts = C.mock; render(); return; }
    sb.from('cm_posts').select('id,kind,hole,title,body,data,photos,author,author_name,created_at').eq('course_id', C.cid).eq('status', 'approved').order('created_at', { ascending: false }).limit(300)
      .then(function (r) { if (!r.error) posts = r.data || []; render(); });
    loadMine();
  }
  function loadMine() {
    if (!sb || !user) { mine = []; render(); return; }
    sb.from('cm_posts').select('id,kind,hole,title,body,data,photos,author_name,created_at,status').eq('course_id', C.cid).eq('author', user.id).neq('status', 'approved').order('created_at', { ascending: false }).limit(50)
      .then(function (r) { mine = (r.data || []).filter(function (p) { return p.status === 'pending'; }); render(); });
  }
  function shrink(file) {
    return new Promise(function (ok, bad) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { var s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(function (b) { b ? ok(b) : bad(new Error('img')); }, 'image/jpeg', 0.85); };
      img.onerror = function () { URL.revokeObjectURL(u); bad(new Error(T('Không đọc được ảnh', 'Could not read the image'))); }; img.src = u;
    });
  }
  function val(id) { var x = document.getElementById(id); return x ? String(x.value || '').trim() : ''; }
  async function send() {
    if (!user && !C.mock) { note = '!' + T('Vui lòng đăng nhập trước.', 'Please sign in first.'); render(); return; }
    var k = form, body = val('cmBody'), title = val('cmTitle'), fl = document.getElementById('cmFiles'), files = fl && fl.files ? [].slice.call(fl.files, 0, 6) : [];
    if (!document.getElementById('cmOk').checked) { note = '!' + T('Vui lòng đánh dấu ô xác nhận.', 'Please tick the confirmation box.'); render(); return; }
    if ((k === 'article' || k === 'place') && !title) { note = '!' + T('Vui lòng nhập tiêu đề/tên.', 'Please enter a title/name.'); render(); return; }
    if (k === 'review' && !(+rv.all >= 1)) { note = '!' + T('Vui lòng chấm điểm chung (1–5 sao).', 'Please give an overall rating (1–5 stars).'); render(); return; }
    if (k === 'review' ? false : k === 'video' ? !val('cmVid') : k === 'photo' ? !files.length : !body) { note = '!' + T(k === 'video' ? 'Vui lòng dán link video.' : k === 'photo' ? 'Vui lòng chọn ảnh.' : 'Vui lòng nhập nội dung.', k === 'video' ? 'Please paste a video link.' : k === 'photo' ? 'Please choose a photo.' : 'Please write something.'); render(); return; }
    var data = {}; if (k === 'review') { data.r = {}; ['all'].concat(RK.map(function (x) { return x[0]; })).forEach(function (x) { if (+rv[x] >= 1 && +rv[x] <= 5) data.r[x] = +rv[x]; }); }
    if (k === 'place') { data = { cat: val('cmCat'), addr: val('cmAddr'), phone: val('cmPhone'), map: safeUrl(val('cmMap')) }; }
    var vl = val('cmVid').split(/\s+/).filter(Boolean), vv = vl.map(vid);
    if (vv.some(function (x) { return !x; })) { note = '!' + T('Link video chưa đúng. Chỉ nhận link video YouTube, Facebook hoặc Vimeo.', 'Video link not recognised. Only YouTube, Facebook or Vimeo video links are accepted.'); render(); return; }
    if (vv.length > 3) { note = '!' + T('Tối đa 3 video mỗi bài.', 'Up to 3 videos per post.'); render(); return; }
    if (vv.length) data.videos = vv.map(function (x) { return x.u; });
    if (C.mock) { note = T('Bản xem trước: chưa gửi thật.', 'Preview: nothing was sent.'); form = null; render(); return; }
    var hole = k === 'tip' ? +val('cmHole') : null;
    busy = true; note = ''; render();
    try {
      var paths = [];
      for (var i = 0; i < files.length; i++) { var b = await shrink(files[i]), path = user.id + '/' + Date.now() + '-' + i + '.jpg';
        var up = await sb.storage.from('cm-photos').upload(path, b, { contentType: 'image/jpeg', upsert: false }); if (up.error) throw up.error; paths.push(path); }
      var r = await sb.from('cm_posts').insert({ course_id: C.cid, kind: k, hole: hole, title: title || null, body: body || null, data: data, photos: paths, lang: lang });
      if (r.error) { if (/cm_posts_one_review|duplicate/i.test(r.error.message)) throw new Error(T('Bạn đã gửi đánh giá cho sân này rồi.', 'You have already rated this course.')); throw r.error; }
      dropDraft(k); form = null; rv = {}; note = T('Đã gửi. Bài sẽ hiện sau khi được duyệt.', 'Sent. Your post will appear after review.'); loadMine();
    } catch (err) { note = '!' + T('Chưa gửi được: ', 'Could not send: ') + (err && err.message || err); }
    busy = false; render();
  }
  async function report(id) {
    if (C.mock) { repFor = null; note = T('Bản xem trước: chưa gửi thật.', 'Preview: nothing was sent.'); render(); return; }
    if (!user) { note = '!' + T('Vui lòng đăng nhập để báo vi phạm.', 'Please sign in to report.'); repFor = null; render(); return; }
    var r = await sb.from('cm_reports').insert({ post_id: id, reason: val('cmRepR') });
    repFor = null; note = r.error && !/duplicate/i.test(r.error.message) ? '!' + r.error.message : T('Cảm ơn bạn, VN Centre sẽ xem xét.', 'Thank you, VN Centre will review it.'); render();
  }
  root.addEventListener('input', saveDraft); root.addEventListener('change', saveDraft);
  root.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-cm]'); if (!b) return; var a = b.dataset.cm;
    if (a === 'in' && C.mock) { note = T('Bản xem trước: khi lên mạng, nút này mở trang đăng nhập ', 'Preview: when live, this opens the sign-in page of ') + (b.dataset.p === 'google' ? 'Google' : 'Facebook') + '.'; render(); }
    else if (a === 'in') { note = ''; sb.auth.signInWithOAuth({ provider: b.dataset.p, options: { redirectTo: location.origin + location.pathname + '#cm' } }); }
    else if (a === 'out') { sb.auth.signOut(); }
    else if (a === 'new') { if (!user && !C.mock) { note = '!' + T('Vui lòng đăng nhập bằng Google hoặc Facebook để đóng góp.', 'Please sign in with Google or Facebook to contribute.'); form = null; } else { form = form === b.dataset.k ? null : b.dataset.k; note = ''; } render(); }
    else if (a === 'cancel') { form = null; rv = {}; render(); }
    else if (a === 'rv') { rv[b.dataset.k] = +rv[b.dataset.k] === +b.dataset.v && b.dataset.k !== 'all' ? 0 : +b.dataset.v; render(); }
    else if (a === 'send') { send(); }
    else if (a === 'play') { var v = VIDS[+b.dataset.i]; if (v) b.outerHTML = vidFrame(v); }
    else if (a === 'f') { filter = b.dataset.k; render(); }
    else if (a === 'rep') { repFor = b.dataset.id; render(); }
    else if (a === 'repX') { repFor = null; render(); }
    else if (a === 'repSend') { report(b.dataset.id); }
  });
  var _r = window.sgRender; window.sgRender = function () { if (_r) _r(); render(); };
  if (C.mock) { load(); return; }
  (window.__freshP || Promise.resolve(false)).then(function (sw) { if (sw) return; start(); });
  function start() {
  if (!window.supabase) { root.innerHTML = '<p class="muted">' + T('Chưa tải được phần cộng đồng. Vui lòng tải lại trang.', 'Community section failed to load. Please reload.') + '</p>'; return; }
  sb = window.supabase.createClient(C.url, C.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'vncentre-courses-auth' } });
  sb.auth.onAuthStateChange(function (_ev, s) { var u = s && s.user || null; if ((u && u.id) !== (user && user.id)) { user = u; loadMine(); syncSaves(); } });
  sb.auth.getSession().then(function (r) { user = r.data && r.data.session ? r.data.session.user : null; load(); syncSaves(); });
  /* Lưu sân (GĐ2): đăng nhập thì ghi vào bảng site_saves, gộp với danh sách trên máy */
  window.sgSaveSync = function (cid, on) { if (!sb || !user) return; (on ? sb.from('site_saves').upsert({ course_id: cid }, { onConflict: 'user_id,course_id' }) : sb.from('site_saves').delete().eq('user_id', user.id).eq('course_id', cid)).then(function () {}); };
  function syncSaves() { var S2 = window.sgSaved, me = window.SG_ME; if (!sb || !user || !S2) return;
    sb.from('site_saves').select('course_id').eq('user_id', user.id).then(function (r) { if (r.error) return; var db = (r.data || []).map(function (x) { return x.course_id; }), loc = S2.get();
      var up = loc.filter(function (x) { return x.c && db.indexOf(x.c) < 0; }).map(function (x) { return { course_id: x.c }; }); if (up.length) sb.from('site_saves').upsert(up, { onConflict: 'user_id,course_id' }).then(function () {});
      if (me && db.indexOf(me.c) >= 0 && !loc.some(function (x) { return x.s === me.s; })) { loc.unshift({ s: me.s, c: me.c, n: me.n, p: me.p, i: me.i, h: location.href.split('#')[0], t: Date.now() }); S2.put(loc); S2.paint(); } }); }
  }
}

function sgCmSection(M, o = {}) {
  return `<section class="cm" id="cm-sec"><style>${SG_CM_CSS}</style><div class="eyebrow">${sgBi('Cộng đồng golfer', 'Golfer community')}</div><h2>${sgBi('Golfer chia sẻ', 'Shared by golfers')}</h2>
  ${sgBi('Phần dưới đây do người dùng bổ sung, không phải thông tin của đoàn đo độ khó sân. Mỗi bài được VN Centre duyệt trước khi hiện.', 'Everything below is added by users, not by the course rating team. Each post is reviewed by VN Centre before it appears.', 'p', 'class="muted" style="max-width:70ch"')}
  <div id="cm" aria-live="polite"><p class="muted">…</p></div></section>`;
}
function sgCmScript(M, o = {}) {
  const cfg = { url: CM_CFG.url, key: CM_CFG.key, cid: M.cid || M.slug, holes: M.nH || 18, home: o.home || '../../', mock: o.cmMock || null };
  return `${cfg.mock ? '' : `<script src="${CM_CFG.sbjs}"><\/script>`}<script>(${cmClient.toString()})(${JSON.stringify(cfg).replace(/</g, '\\u003c')});<\/script>`;
}

/* Trang chính sách: Điều khoản, Quyền riêng tư, Xoá dữ liệu */
function sgPolicyPages() {
  const mail = CM_CFG.contact, upd = '23/10/2026';
  const page = (slug, tVi, tEn, bodyVi, bodyEn) => [slug + '/index.html', sgHead(`${tVi} · Sân golf Việt Nam`, tVi) + sgTopBar('../', null) + `<div class="wrap" style="max-width:780px"><section style="padding-top:28px">
    <div class="eyebrow">VN Centre – CSR Vietnam Team</div><h2>${sgBi(tVi, tEn)}</h2><p class="muted" style="font-size:.85rem">${sgBi('Cập nhật ' + upd, 'Updated ' + upd)}</p>
    <div data-lang="vi">${bodyVi}</div><div data-lang="en" hidden>${bodyEn}</div></section>
    <footer><a href="../dieu-khoan/">${sgBi('Điều khoản', 'Terms')}</a> · <a href="../chinh-sach-rieng-tu/">${sgBi('Quyền riêng tư', 'Privacy')}</a> · <a href="../xoa-du-lieu/">${sgBi('Xoá dữ liệu', 'Data deletion')}</a></footer></div>
    <script>${SG_JS_BASE}var _p=paint;paint=function(){_p();document.querySelectorAll('[data-lang]').forEach(function(x){x.hidden=x.getAttribute('data-lang')!==lang})};paint();<\/script></body></html>`];
  const ul = xs => '<ul>' + xs.map(x => `<li>${x}</li>`).join('') + '</ul>';
  return [
    page('dieu-khoan', 'Điều khoản sử dụng', 'Terms of use',
      `<p>Trang courses.vncentre.net (“Trang”) giới thiệu các sân golf tại Việt Nam. Thông tin sân, số đo, ảnh có logo “Course &amp; Slope Rating – Vietnam Team” do đoàn đo VN Centre – CSR Vietnam Team cung cấp. Phần “Cộng đồng golfer” do người dùng bổ sung và được ghi rõ “Do người dùng bổ sung”; đó là ý kiến của người gửi, không phải của đoàn đo.</p>
      <h3>Tài khoản</h3>${ul(['Bạn đăng nhập bằng tài khoản Google hoặc Facebook của mình để đóng góp. Xem trang không cần đăng nhập.', 'Mỗi tài khoản gửi tối đa 20 bài trong 24 giờ.'])}
      <h3>Nội dung bạn gửi</h3>${ul(['Chỉ gửi nội dung, ảnh, video do bạn tạo ra hoặc có quyền sử dụng. Video được đăng bằng link YouTube/Facebook/Vimeo; video vẫn nằm trên YouTube/Facebook/Vimeo và tuân theo quy định của các nền tảng đó.', 'Không đăng nội dung vi phạm pháp luật Việt Nam, xúc phạm người khác, quảng cáo, spam, thông tin sai sự thật.', 'Không đăng ảnh có thể nhận rõ mặt trẻ em khi chưa có sự đồng ý của cha mẹ; hạn chế chụp rõ mặt người khác.', 'Mọi bài được VN Centre duyệt trước khi hiện. VN Centre có quyền từ chối, ẩn hoặc xoá bài mà không cần báo trước.', 'Bạn giữ quyền với nội dung của mình và cho phép VN Centre hiển thị, thu nhỏ ảnh, trích dẫn nội dung đó trên Trang và các kênh của VN Centre, có ghi tên bạn.'])}
      <h3>Giới hạn trách nhiệm</h3>${ul(['Thông tin sân có thể thay đổi theo điều kiện thực tế; hãy liên hệ sân trước khi đi.', 'Trang không nhận đặt sân, đặt phòng hay thanh toán.', 'Course Rating và Slope Rating chỉ hiển thị khi đã được công bố chính thức.'])}
      <h3>Liên hệ</h3><p>Báo vi phạm bằng nút “Báo vi phạm” dưới mỗi bài, hoặc email <a href="mailto:${mail}">${mail}</a>.</p>`,
      `<p>courses.vncentre.net (the “Site”) presents golf courses in Vietnam. Course information, measurements and photos marked “Course &amp; Slope Rating – Vietnam Team” are provided by the VN Centre – CSR Vietnam Team. The “Golfer community” section is added by users and labelled “Added by a user”; it reflects the poster's opinion, not the rating team's.</p>
      <h3>Accounts</h3>${ul(['You sign in with your own Google or Facebook account to contribute. Browsing needs no account.', 'Each account may post up to 20 items per 24 hours.'])}
      <h3>Your content</h3>${ul(['Only post text, photos and videos you created or have the right to use. Videos are shared as YouTube/Facebook/Vimeo links; they stay on YouTube/Facebook/Vimeo and follow those platforms\' rules.', 'No content that breaks Vietnamese law, insults others, advertises, spams or is false.', 'No photos where children can be identified without parental consent; avoid clear faces of other people.', 'All posts are reviewed by VN Centre before they appear. VN Centre may refuse, hide or remove any post without notice.', 'You keep the rights to your content and allow VN Centre to display, resize and quote it on the Site and VN Centre channels, with your name.'])}
      <h3>Limits</h3>${ul(['Course details can change; contact the course before you travel.', 'The Site takes no bookings or payments.', 'Course and Slope Ratings are shown only once officially published.'])}
      <h3>Contact</h3><p>Use the “Report” button under any post, or email <a href="mailto:${mail}">${mail}</a>.</p>`),
    page('chinh-sach-rieng-tu', 'Chính sách quyền riêng tư', 'Privacy policy',
      `<h3>Chúng tôi thu thập gì</h3>${ul(['Khi bạn đăng nhập bằng Google hoặc Facebook: tên hiển thị, địa chỉ email, ảnh đại diện và mã tài khoản do Google/Facebook cung cấp. Chúng tôi không nhận mật khẩu của bạn.', 'Nội dung bạn gửi: bài viết, bình luận, mẹo, địa điểm, ảnh, thời điểm gửi.', 'Báo cáo vi phạm bạn gửi.', 'Nhật ký kỹ thuật (địa chỉ IP, trình duyệt) do nhà cung cấp hạ tầng ghi để bảo mật và vận hành.', 'Lựa chọn giao diện (màu, ngôn ngữ, cỡ chữ) chỉ lưu trên máy của bạn.', 'Video trong bài được nhúng từ YouTube/Facebook/Vimeo. Khi bạn bấm phát, trình phát của YouTube/Facebook/Vimeo được tải và các nền tảng đó có thể ghi cookie theo chính sách của họ.'])}
      <h3>Dùng để làm gì</h3>${ul(['Cho bạn đăng nhập và gửi nội dung; hiển thị tên bạn cạnh bài đã duyệt.', 'Kiểm duyệt nội dung, chống spam và lạm dụng.', 'Liên hệ bạn khi cần về nội dung bạn đã gửi.'])}<p>Chúng tôi không bán dữ liệu cá nhân và không dùng email của bạn để quảng cáo.</p>
      <h3>Hiển thị công khai</h3><p>Sau khi được duyệt, bài của bạn hiện công khai kèm tên hiển thị và ngày gửi. Email của bạn không bao giờ hiện công khai.</p>
      <h3>Lưu trữ</h3><p>Dữ liệu lưu trên dịch vụ cơ sở dữ liệu Supabase; trang được phục vụ qua Cloudflare. Dữ liệu được giữ đến khi bạn yêu cầu xoá hoặc khi nội dung bị gỡ.</p>
      <h3>Quyền của bạn</h3>${ul(['Xem, sửa, xoá dữ liệu của bạn: xem trang <a href="../xoa-du-lieu/">Hướng dẫn xoá dữ liệu</a>.', 'Rút lại đồng ý bằng cách xoá tài khoản theo hướng dẫn trên.'])}
      <h3>Liên hệ</h3><p>VN Centre – CSR Vietnam Team · <a href="mailto:${mail}">${mail}</a></p>`,
      `<h3>What we collect</h3>${ul(['When you sign in with Google or Facebook: your display name, email address, profile picture and account ID as provided by Google/Facebook. We never receive your password.', 'What you post: stories, comments, tips, places, photos and the time you posted.', 'Reports you send.', 'Technical logs (IP address, browser) kept by our infrastructure providers for security and operation.', 'Display choices (colours, language, text size) are stored only on your device.', 'Videos in posts are embedded from YouTube/Facebook/Vimeo. When you press play, their player loads and those platforms may set cookies under their own policies.'])}
      <h3>How we use it</h3>${ul(['To let you sign in and post, and show your name next to approved posts.', 'To moderate content and prevent spam and abuse.', 'To contact you about content you submitted if needed.'])}<p>We do not sell personal data and do not use your email for advertising.</p>
      <h3>Public display</h3><p>Once approved, your post is public with your display name and date. Your email is never shown.</p>
      <h3>Storage</h3><p>Data is stored with the Supabase database service; the Site is served through Cloudflare. Data is kept until you ask us to delete it or the content is removed.</p>
      <h3>Your rights</h3>${ul(['See, correct or delete your data: see <a href="../xoa-du-lieu/">Data deletion instructions</a>.', 'Withdraw consent by deleting your account as described there.'])}
      <h3>Contact</h3><p>VN Centre – CSR Vietnam Team · <a href="mailto:${mail}">${mail}</a></p>`),
    page('xoa-du-lieu', 'Hướng dẫn xoá dữ liệu', 'Data deletion instructions',
      `<h3>Xoá một bài</h3><p>Bài đang chờ duyệt: liên hệ chúng tôi hoặc gửi yêu cầu như dưới đây. Bài đã hiện công khai: gửi email kèm đường dẫn trang sân và tên bài.</p>
      <h3>Xoá toàn bộ tài khoản và dữ liệu</h3><ol><li>Gửi email tới <a href="mailto:${mail}?subject=Xoa%20du%20lieu%20courses.vncentre.net">${mail}</a> với tiêu đề “Xoá dữ liệu courses.vncentre.net”.</li><li>Ghi rõ tên hiển thị và email Google/Facebook bạn đã dùng để đăng nhập.</li><li>Trong vòng 30 ngày, chúng tôi xoá tài khoản, toàn bộ bài, ảnh và báo cáo của bạn, rồi email xác nhận.</li></ol>
      <h3>Gỡ quyền truy cập Facebook</h3><p>Vào Facebook → Cài đặt và quyền riêng tư → Cài đặt → Ứng dụng và trang web → chọn “VN Centre Golf” → Gỡ. Việc này ngừng chia sẻ dữ liệu mới; để xoá dữ liệu đã có, làm theo các bước ở trên.</p>
      <h3>Gỡ quyền truy cập Google</h3><p>Vào myaccount.google.com → Bảo mật → Ứng dụng và dịch vụ của bên thứ ba → chọn “VN Centre Golf” → Xoá mọi quyền truy cập.</p>`,
      `<h3>Delete a single post</h3><p>Email us with the course page link and the post title.</p>
      <h3>Delete your account and all data</h3><ol><li>Email <a href="mailto:${mail}?subject=Data%20deletion%20courses.vncentre.net">${mail}</a> with the subject “Data deletion courses.vncentre.net”.</li><li>Include your display name and the Google/Facebook email you signed in with.</li><li>Within 30 days we delete your account, posts, photos and reports and confirm by email.</li></ol>
      <h3>Remove Facebook access</h3><p>Facebook → Settings &amp; privacy → Settings → Apps and websites → “VN Centre Golf” → Remove. This stops new data sharing; to delete existing data, follow the steps above.</p>
      <h3>Remove Google access</h3><p>myaccount.google.com → Security → Third-party apps &amp; services → “VN Centre Golf” → Delete all connections.</p>`)
  ];
}

/* Gắn vào bộ tạo website */
{ const _c = sgCourseHTML; sgCourseHTML = function (M, img, o = {}) { const h = _c(M, img, o);
    const links = `<p style="margin:8px 0 0;font-size:.8rem"><a href="${o.home || '../../'}dieu-khoan/">${sgBi('Điều khoản', 'Terms')}</a> · <a href="${o.home || '../../'}chinh-sach-rieng-tu/">${sgBi('Quyền riêng tư', 'Privacy')}</a> · <a href="${o.home || '../../'}xoa-du-lieu/">${sgBi('Xoá dữ liệu', 'Data deletion')}</a></p>`;
    const i = h.lastIndexOf('<footer>'); if (i < 0) return h;
    const j = h.indexOf('</footer>', i);
    const withLinks = h.slice(0, j) + links + h.slice(j);
    const slot = withLinks.indexOf('<!--cm-slot-->');   /* 02/11/2026: phần cộng đồng nằm trước "Sân khác" nếu trang có chỗ đặt sẵn */
    let out = slot >= 0 ? withLinks.slice(0, slot) + sgCmSection(M, o) + withLinks.slice(slot + 14) : withLinks.slice(0, i) + sgCmSection(M, o) + '\n  ' + withLinks.slice(i);
    const k = out.lastIndexOf('</body>'); return out.slice(0, k) + sgCmScript(M, o) + out.slice(k); }; }
{ const _m = sgModel; sgModel = function (pack, opts) { const M = _m(pack, opts); M.cid = (pack.course || {}).id || M.slug; return M; }; }

/* ===== Cập nhật nhanh: trang tĩnh tự hiện bản mới hơn đã "Đăng lên website" từ app (bảng site_courses) ===== */
function sgFreshScript(key, builtAt) {
  return `<script>window.__freshP=(function(){try{var K=${JSON.stringify(key)},B=${JSON.stringify(builtAt)};
return fetch(${JSON.stringify(CM_CFG.url)}+'/rest/v1/site_courses?select=html&course_id=eq.'+encodeURIComponent(K)+'&published_at=gt.'+encodeURIComponent(B),{headers:{apikey:${JSON.stringify(CM_CFG.key)}}})
.then(function(r){return r.ok?r.json():[]}).then(function(a){if(a&&a[0]&&a[0].html){document.open();document.write(a[0].html);document.close();return new Promise(function(){})}return false})
.catch(function(){return false})}catch(e){return Promise.resolve(false)}})();<\/script>`;
}
function sg404HTML() {
  return sgHead('Sân golf Việt Nam · VN Centre – CSR Vietnam Team', 'Sân golf Việt Nam') + sgTopBar('/', null) + `<div class="wrap"><section style="padding-top:40px" id="nf"><p class="muted">…</p></section></div>
<script>${SG_JS_BASE}paint();
(function(){var m=location.pathname.match(/^\\/san\\/([^\\/]+)\\/?$/),box=document.getElementById('nf');
function nf(){box.innerHTML='<h2>'+T('Không tìm thấy trang','Page not found')+'</h2><p><a href="/">'+T('Về danh sách sân','Back to all courses')+'</a></p>'}
if(!m){nf();return}
fetch(${JSON.stringify(CM_CFG.url)}+'/rest/v1/site_courses?select=html&slug=eq.'+encodeURIComponent(decodeURIComponent(m[1])),{headers:{apikey:${JSON.stringify(CM_CFG.key)}}})
.then(function(r){return r.ok?r.json():[]}).then(function(a){if(a&&a[0]&&a[0].html){document.open();document.write(a[0].html);document.close()}else nf()}).catch(nf)})();<\/script></body></html>`;
}
{ const _c2 = sgCourseHTML; sgCourseHTML = function (M, img, o = {}) { const h = _c2(M, img, o); if (!o.builtAt) return h;
    const i = h.indexOf('<body>') + 6; return h.slice(0, i) + sgFreshScript(o.freshKey || M.cid || M.slug, o.builtAt) + h.slice(i); }; }
{ const _ix = sgIndexHTML; sgIndexHTML = function (list, img, o = {}) { const h = _ix(list, img); if (!o.builtAt) return h;
    const i = h.indexOf('<body>') + 6; return h.slice(0, i) + sgFreshScript('_index', o.builtAt) + h.slice(i); }; }

export { sgModel, sgCourseHTML, sgIndexHTML, sgSlug, sgPolicyPages, sg404HTML, sgFreshScript, SG };
