/* @vncentre/site-builder – bộ tạo trang sân dùng chung cho app CSR và Golf Passport. Sinh từ app26.js + app30.js của app CSR (mã nguồn csr-vn 2026-10-26d + 29/10 gợi ý 3 địa điểm, ảnh theo nhóm). KHÔNG sửa tay: sửa app26/app30 bên app CSR rồi sinh lại. */
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
.brand small{display:block;font:500 .7rem/1.3 var(--body);letter-spacing:.02em;text-transform:none;opacity:.75}
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
<style>${SG_CSS}</style></head><body>`;
}
function sgTopBar(homeHref, flag) {
  return `<div class="bar"><div class="wrap top"><a class="brand" href="${homeHref}">Sân golf Việt Nam<small>VN Centre – CSR Vietnam Team</small></a><span class="grow"></span>${flag ? `<span class="flag" data-vi="${sgEsc(flag[0])}" data-en="${sgEsc(flag[1])}">${sgEsc(flag[0])}</span>` : ''}
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
function sgCourseHTML(M, img, o = {}) {
  const src = p => p ? img(p) : '', flag = o.flag || null;
  const shotLab = p => SG.SHOT[p.kind] || ['', ''];
  const lbImg = (p, grp, vi, en, cls = '') => `<img loading="lazy" src="${src(p)}" alt="${sgEsc(vi)}" data-lb="${grp}" data-vi-c="${sgEsc(vi)}" data-en-c="${sgEsc(en)}"${cls ? ` class="${cls}"` : ''}>`;
  const tees = M.tees, maxLen = Math.max(1, ...M.holes.flatMap(h => h.len.map(x => +x || 0)));
  const desc = `${M.name} – ${M.introVi}`.slice(0, 160);
  const ld = { '@context': 'https://schema.org', '@type': 'GolfCourse', name: M.name, alternateName: M.nameEn !== M.name ? M.nameEn : undefined, address: M.province ? { '@type': 'PostalAddress', addressRegion: M.province, addressCountry: 'VN' } : undefined, telephone: M.info.bookPhone || undefined, url: M.info.bookWeb || undefined };
  const facts = [[M.nH, `hố`, `holes`], [M.par, 'Par', 'Par'], ...tees.slice(0, 3).map(t => [sgFmt(t.total), `yd · tee ${t.vi}`, `yd · ${t.en} tees`])];
  if (M.travel.distKm) facts.push([`~${M.travel.distKm} km`, `tới ${M.travel.airport || 'sân bay'}`, `to ${M.travel.airport || 'airport'}`]);
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
  return sgHead(`${M.name} · Sân golf Việt Nam`, desc, wmCss + `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}<\/script>`) + sgTopBar(o.home || '../../', flag) + `<div class="wrap">
  <div class="hero">${M.heroP && M.show.photos ? `${lbImg(M.heroP, 'gal', shotLab(M.heroP)[0] || M.name, shotLab(M.heroP)[1] || M.nameEn)}` : ''}<div class="cap"><div class="eyebrow">${sgBi((M.province ? M.province + ' · ' : '') + 'Việt Nam', (M.province ? M.province + ' · ' : '') + 'Vietnam')}</div><h1>${sgEsc(M.name)}</h1>${sgBi(M.introVi, M.introEn, 'p')}</div></div>
  <div class="facts">${facts.map(f => `<div><b class="num">${sgEsc(f[0])}</b>${sgBi(f[1], f[2])}</div>`).join('')}</div>
  <section class="two"><div><div class="eyebrow">${sgBi('Giới thiệu', 'Overview')}</div><h2>${sgEsc(M.nameEn !== M.name ? M.nameEn : M.name)}</h2>${sgBi(M.introVi, M.introEn, 'p', 'class="lead"')}
    ${M.fac.length ? `<div class="chips">${M.fac.map(k => `<span class="chip">${sgBi(SG.FAC[k][0], SG.FAC[k][1])}</span>`).join('')}</div>` : ''}
    ${book ? `<p style="margin-top:14px"><b>${sgBi('Đặt sân', 'Tee times')}:</b> ${book}</p>` : `<p class="muted" style="margin-top:14px;font-size:.85rem">${sgBi('Đặt sân, phòng: liên hệ trực tiếp sân. Trang này không nhận đặt chỗ hay thanh toán.', 'Tee times and rooms: contact the course directly. This page takes no bookings or payments.')}</p>`}</div>
    ${M.show.photos && M.gal[1] ? `<div><div class="ph">${(q => lbImg(q, 'gal', shotLab(q)[0], shotLab(q)[1]))(M.gal.find(p => p.kind === 'sunset' && p !== M.heroP) || M.gal.find(p => p !== M.heroP))}</div></div>` : '<div></div>'}</section>
  ${tees.length ? `<section><div class="eyebrow">${sgBi('Các bộ tee', 'Tees')}</div><h2>${sgBi('Chọn tee phù hợp', 'Choose your tees')}</h2><div class="two" style="margin-top:14px">
    <div class="tbl"><table><thead><tr><th class="l">Tee</th><th>${sgBi('Hố 1–9', 'Out')}</th><th>${sgBi('Hố 10–18', 'In')}</th><th>${sgBi('Tổng (yd)', 'Total (yd)')}</th><th>Par</th></tr></thead><tbody>
      ${tees.map(t => `<tr><td class="l"><span class="dot" style="background:${t.color}"></span>${sgBi(t.vi + (t.gender === 'F' ? ' · nữ' : ' · nam'), t.en + (t.gender === 'F' ? ' · women' : ' · men'))}</td><td class="num">${sgFmt(t.out)}</td><td class="num">${t.in ? sgFmt(t.in) : '–'}</td><td class="num">${sgFmt(t.total)}</td><td class="num">${t.holes.reduce((a, h) => a + (+h.par || 0), 0)}</td></tr>`).join('')}</tbody></table></div>
    <div class="pending"><h3>Course Rating & Slope</h3>${M.official.length ? offRows : sgBi('Sân được VN Centre – CSR Vietnam Team đo. Chỉ số chính thức sẽ hiển thị tại đây sau khi được công bố trên hệ thống WHS.', 'Measured by VN Centre – CSR Vietnam Team. Official ratings will appear here once published in the WHS system.', 'p', 'class="muted" style="margin:6px 0 0"')}</div></div></section>` : ''}
  ${M.show.holes && H.length ? `<section id="ho"><div class="eyebrow">${sgBi('Từng hố', 'Hole by hole')}</div><h2>${sgBi('Nhìn trước từng hố', 'Preview every hole')}</h2>${sgBi('Ảnh do đoàn đo chụp trực tiếp trên sân: từ tee, các điểm rơi bóng, green. Bấm ảnh để xem lớn.', 'Photos taken on site by the rating team: from the tee, landing zones and the green. Tap a photo to enlarge.', 'p', 'class="muted" style="margin:6px 0 14px"')}<div class="hn" id="hn" role="group" aria-label="Holes"></div><div id="hole"></div></section>` : ''}
  ${M.cond.stimpFt || M.cond.roughIn || M.info.grass ? `<section><div class="eyebrow">${sgBi('Mặt sân', 'Playing conditions')}</div><h2>${sgBi('Điều kiện khi đoàn đo', 'Conditions when measured')}</h2><div class="grid4">
    ${M.cond.stimpFt ? `<div class="card"><b class="num">${sgEsc(M.cond.stimpFt)}${M.cond.stimpIn ? `' ${sgEsc(M.cond.stimpIn)}"` : ' ft'}</b>${sgBi('Tốc độ green (Stimpmeter)', 'Green speed (Stimpmeter)')}</div>` : ''}
    ${M.cond.roughLabel ? `<div class="card"><b class="num">${sgEsc(M.cond.roughLabel)}</b>${sgBi('Chiều cao rough', 'Rough height')}</div>` : ''}
    ${M.info.grass ? `<div class="card"><b style="font-size:1.1rem">${sgEsc(M.info.grass)}</b>${sgBi('Loại cỏ', 'Grass')}</div>` : M.cond.warm != null ? `<div class="card">${sgBi(M.cond.warm === false ? 'Cỏ mùa lạnh' : 'Cỏ mùa ấm', M.cond.warm === false ? 'Cool-season' : 'Warm-season', 'b')}${sgBi('Loại cỏ', 'Grass')}</div>` : ''}</div></section>` : ''}
  ${M.places.length || travelRows.length ? `<section><div class="eyebrow">${sgBi('Quanh sân', 'Around the course')}</div><h2>${sgBi('Ăn ở và đi lại', 'Stay, eat and get there')}</h2>
    ${travelRows.length ? `<div class="card" style="margin-top:14px"><dl class="kv">${travelRows.map(r => `${sgBi(r[1], r[2], 'dt')}<dd>${sgEsc(r[3])}</dd>`).join('')}</dl>${tr.tips ? `<p style="margin:12px 0 0;font-size:.9rem">${sgEsc(tr.tips)}</p>` : ''}</div>` : ''}
    ${M.places.some(p => p.src !== 'web') ? `<div class="places">${M.places.filter(p => p.src !== 'web').map(placeCard).join('')}</div>` : ''}
    ${M.places.some(p => p.src === 'web') ? sgGySection(M.places.filter(p => p.src === 'web'), placeCard) : ''}</section>` : ''}
  ${M.show.photos && M.gal.length > 1 ? `<section><div class="eyebrow">${sgBi('Thư viện ảnh', 'Gallery')}</div><h2>${sgBi('Sân qua ống kính đoàn đo', "Through the rating team's lens")}</h2>${sgGalSection(M.gal.filter(p => p !== M.heroP), (p, grp) => { const l = shotLab(p); return `<figure><div class="ph">${lbImg(p, grp, l[0], l[1])}</div>${l[0] ? sgBi(l[0], l[1], 'figcaption') : ''}</figure>`; })}</section>` : ''}
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
paint();<\/script></body></html>`;
}
function sgIndexHTML(list, img) {
  return sgHead('Sân golf Việt Nam · VN Centre – CSR Vietnam Team', 'Thông tin các sân golf Việt Nam do đoàn đo VN Centre – CSR Vietnam Team trực tiếp ghi nhận: từng hố, ảnh, dịch vụ quanh sân.') + sgTopBar('./', null) + `<div class="wrap">
  <section style="padding-top:28px"><div class="eyebrow">${sgBi('Việt Nam', 'Vietnam')}</div><h2 style="font-size:clamp(2rem,5vw,3.2rem)">${sgBi('Sân golf Việt Nam, xem trước khi đến', 'Vietnam golf courses, before you go')}</h2>
  ${sgBi('Thông tin từng sân do đoàn đo độ khó sân ghi nhận trực tiếp: chiều dài từng tee, ảnh từng hố, dịch vụ quanh sân.', 'Each course measured on site by the course rating team: tee lengths, hole photos and what is around the course.', 'p', 'class="lead muted"')}
  <div class="cards">${list.map(M => `<a class="ccard" href="san/${M.slug}/"><div class="ph">${M.heroP && M.show.photos ? `<img loading="lazy" src="${img(M.heroP, M)}" alt="${sgEsc(M.name)}">` : ''}</div><div class="t"><div class="eyebrow">${sgEsc(M.province)}</div><h3 style="margin-top:4px">${sgEsc(M.name)}</h3><p class="muted num" style="margin:4px 0 0;font-size:.85rem">${M.nH} ${sgBi('hố', 'holes')} · Par ${M.par}${M.tees[0] ? ` · ${sgFmt(M.tees[0].total)} yd` : ''}</p></div></a>`).join('')}</div></section>
  <footer>VN Centre – CSR Vietnam Team</footer></div><script>${SG_JS_BASE}paint();<\/script></body></html>`;
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
  var K = { comment: ['Bình luận', 'Comment'], article: ['Bài viết', 'Story'], tip: ['Mẹo chơi hố', 'Hole tip'], place: ['Địa điểm', 'Place'], photo: ['Ảnh', 'Photos'], video: ['Video', 'Video'] };
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

  function formHTML() {
    var k = form, f = '';
    var holeSel = '<label>' + T('Hố', 'Hole') + '<select id="cmHole">' + Array.from({ length: C.holes || 18 }, function (_, i) { return '<option>' + (i + 1) + '</option>'; }).join('') + '</select></label>';
    if (k === 'article') f += '<label>' + T('Tiêu đề', 'Title') + '<input id="cmTitle" maxlength="200" placeholder="' + e(T('Một ngày ở sân…', 'A day at the course…')) + '"></label>';
    if (k === 'place') f += '<div class="two"><label>' + T('Tên địa điểm', 'Place name') + '<input id="cmTitle" maxlength="200"></label><label>' + T('Loại', 'Type') + '<select id="cmCat">' + Object.keys(CAT).map(function (c) { return '<option value="' + c + '">' + L(CAT[c]) + '</option>'; }).join('') + '</select></label></div>'
      + '<div class="two"><label>' + T('Địa chỉ', 'Address') + '<input id="cmAddr" maxlength="300"></label><label>' + T('Điện thoại', 'Phone') + '<input id="cmPhone" maxlength="40" inputmode="tel"></label></div>'
      + '<label>' + T('Link Google Maps (tuỳ chọn)', 'Google Maps link (optional)') + '<input id="cmMap" maxlength="500" placeholder="https://maps.app.goo.gl/…"></label>';
    if (k === 'tip') f += holeSel;
    f += '<label>' + (k === 'photo' || k === 'video' ? T('Chú thích', 'Caption') : k === 'place' ? T('Nhận xét của bạn', 'Your review') : k === 'tip' ? T('Mẹo của bạn', 'Your tip') : T('Nội dung', 'Text')) + '<textarea id="cmBody" maxlength="' + (k === 'article' ? 20000 : 3000) + '"></textarea></label>';
    if (k === 'photo' || k === 'place' || k === 'article') f += '<label>' + T('Ảnh (tối đa 6, ảnh do bạn chụp)', 'Photos (up to 6, taken by you)') + '<input id="cmFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>';
    if (k !== 'comment') f += '<label>' + (k === 'video' ? T('Link video YouTube, Facebook hoặc Vimeo', 'YouTube, Facebook or Vimeo video link') : T('Link video YouTube/Facebook/Vimeo (tuỳ chọn, mỗi dòng một link, tối đa 3)', 'YouTube/Facebook/Vimeo video links (optional, one per line, up to 3)')) + (k === 'video' ? '<input id="cmVid" maxlength="1000" placeholder="https://youtu.be/…">' : '<textarea id="cmVid" style="min-height:60px" maxlength="1500" placeholder="https://www.youtube.com/watch?v=…"></textarea>') + '</label><p class="muted" style="margin:-4px 0 0;font-size:.78rem">' + T('Tải video lên YouTube, Facebook hoặc Vimeo trước (chế độ Công khai hoặc Không công khai), rồi dán link vào đây.', 'Upload your video to YouTube, Facebook or Vimeo first (Public or Unlisted), then paste the link here.') + '</p>';
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
    h += '<div class="add">' + ['comment', 'article', 'tip', 'place', 'photo', 'video'].map(function (k) { return '<button class="cmbtn" data-cm="new" data-k="' + k + '" aria-pressed="' + (form === k) + '">+ ' + L(K[k]) + '</button>'; }).join('') + '</div>';
    if (note) h += '<div class="cmnote' + (/^!/.test(note) ? ' cmerr' : '') + '" role="status">' + e(note.replace(/^!/, '')) + '</div>';
    if (form) h += formHTML();
    if (mine.length) h += '<h3 style="margin-top:18px">' + T('Bài của bạn đang chờ duyệt', 'Your posts awaiting review') + '</h3><div class="cmlist">' + mine.map(function (p) { return card(p, true); }).join('') + '</div>';
    h += '<div class="tabs" role="group" aria-label="' + T('Lọc', 'Filter') + '">' + ['all', 'comment', 'article', 'tip', 'place', 'photo', 'video'].map(function (k) { return '<button class="cmbtn" data-cm="f" data-k="' + k + '" aria-pressed="' + (filter === k) + '">' + (k === 'all' ? T('Tất cả', 'All') : L(K[k])) + ' <small>' + (cnt[k] || 0) + '</small></button>'; }).join('') + '</div>';
    h += list.length ? '<div class="cmlist">' + list.map(function (p) { return card(p, false); }).join('') + '</div>' : '<p class="muted">' + T('Chưa có đóng góp nào. Hãy là người đầu tiên chia sẻ!', 'No contributions yet. Be the first to share!') + '</p>';
    root.innerHTML = h;
    if (form) put(shown === form ? keep : loadDraft(form));
    shown = form;
  }

  function load() {
    if (C.mock) { posts = C.mock; render(); return; }
    sb.from('cm_posts').select('id,kind,hole,title,body,data,photos,author_name,created_at').eq('course_id', C.cid).eq('status', 'approved').order('created_at', { ascending: false }).limit(300)
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
    if (k === 'video' ? !val('cmVid') : k === 'photo' ? !files.length : !body) { note = '!' + T(k === 'video' ? 'Vui lòng dán link video.' : k === 'photo' ? 'Vui lòng chọn ảnh.' : 'Vui lòng nhập nội dung.', k === 'video' ? 'Please paste a video link.' : k === 'photo' ? 'Please choose a photo.' : 'Please write something.'); render(); return; }
    var data = {}; if (k === 'place') { data = { cat: val('cmCat'), addr: val('cmAddr'), phone: val('cmPhone'), map: safeUrl(val('cmMap')) }; }
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
      if (r.error) throw r.error;
      dropDraft(k); form = null; note = T('Đã gửi. Bài sẽ hiện sau khi được duyệt.', 'Sent. Your post will appear after review.'); loadMine();
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
    else if (a === 'cancel') { form = null; render(); }
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
  sb.auth.onAuthStateChange(function (_ev, s) { var u = s && s.user || null; if ((u && u.id) !== (user && user.id)) { user = u; loadMine(); } });
  sb.auth.getSession().then(function (r) { user = r.data && r.data.session ? r.data.session.user : null; load(); });
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
    let out = withLinks.slice(0, i) + sgCmSection(M, o) + '\n  ' + withLinks.slice(i);
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
