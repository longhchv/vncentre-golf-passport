/* ===== GĐ2 (spec 29): thẻ tóm tắt, so sánh, gợi ý theo nhu cầu, thông tin chi tiết, "Quanh đây" 5 nhóm ===== */
const G2={
 vi:{need:"Bạn cần gì?",needAll:"Tất cả",needs:{kids:"Đi cùng con",noon:"Tranh thủ giờ trưa",early:"Tập sáng sớm",after_work:"Sau giờ làm",group:"Đi nhóm, tiếp khách",foreigners:"Khách nước ngoài",beginner:"Mới chơi, cần thuê gậy"},
  needHit:"Hợp nhu cầu",from:"từ",perH:"/giờ",perHP:"/giờ/người",perRound:"/vòng",perBalls:"/{b} bóng",
  ico:{parking:"Đỗ xe",shop:"Shop golf",academy:"Học viện",kids:"Hợp trẻ em",lang:"Nói tiếng",vip:"Phòng VIP",rental:"Thuê gậy"},
  cmpAdd:"So sánh",cmpOn:"Đã chọn",cmpTray:"{n}/3 nơi để so sánh",cmpGo:"So sánh ngay",cmpClear:"Bỏ chọn",cmpTitle:"So sánh địa điểm",cmpMax:"Chỉ so sánh tối đa 3 nơi.",cmpNeed2:"Chọn thêm ít nhất 1 nơi.",
  row:{type:"Loại",google:"Google",vnc:"Điểm VN Centre",users:"Người chơi",dist:"Khoảng cách",from:"Giá từ",machine:"Hãng máy",sims:"Giá theo máy",range:"Giá sân tập",rental:"Thuê gậy",hours:"Giờ mở cửa",quiet:"Giờ vắng",kids:"Trẻ em",shop:"Shop golf",academy:"Học viện",fac:"Tiện nghi",parking:"Đỗ xe",lang:"Ngôn ngữ",fit:"Phù hợp với",promo:"Ưu đãi"},
  yes:"Có",no:"Không",na:"—",hl:"Điểm mạnh",fitT:"Phù hợp với",
  fit:{noon:"Tranh thủ giờ trưa",early:"Sáng sớm vắng",after_work:"Tối sau giờ làm",kids_mall:"Con tập, bố mẹ đi siêu thị",group:"Đi nhóm, tiếp khách",foreigners:"Khách nước ngoài"},
  slot:{early:"Sáng sớm 5–8h",morning:"Sáng 8–11h",noon:"Trưa 11–14h",afternoon:"Chiều 14–17h",evening:"Tối 17–20h",late:"Khuya 20h+"},
  lng:{en:"Tiếng Anh",ko:"Tiếng Hàn",ja:"Tiếng Nhật",zh:"Tiếng Trung"},
  simUnit:{hour_room:"giờ / phòng",hour_person:"giờ / người",round:"vòng 18 hố",other:"lượt"},
  rk:{balls:"Rổ bóng",hour:"Theo giờ",unlimited:"Không giới hạn bóng",month:"Thẻ tháng / gói",lesson:"Buổi học",other:"Khác"},
  simT:"Giá theo loại máy",bayN:"{n} phòng",rangeT:"Giá sân tập",colMachine:"Máy",colBays:"Số phòng",rentT:"Thuê gậy",promoT:"Ưu đãi đang có",until:"đến {d}",
  moreT:"Tiện ích & phù hợp",moreSub:"Thông tin VN Centre khảo sát, chủ sân cập nhật hoặc tổng hợp từ nguồn công khai.",
  busyT:"Giờ vắng / đông",quiet:"Vắng",busy:"Đông",kidsT:"Trẻ em",jClubs:"Gậy cỡ nhỏ cho trẻ",jClass:"Lớp junior",minAge:"Nhận từ {n} tuổi",
  shopT:"Shop golf",shopK:{apparel:"Quần áo",accessories:"Phụ kiện",clubs:"Bán gậy",fitting:"Fitting gậy"},
  facT:"Tiện nghi",facK:{waiting_area:"Chỗ ngồi chờ cho người nhà",vip_room:"Phòng riêng / VIP",covered:"Có mái che"},surf:{mat:"Mặt thảm",grass:"Cỏ thật",both:"Thảm và cỏ thật"},
  langT:"Nhân viên nói được",acadT:"Học viện & huấn luyện viên",coachSrc:"nguồn",noMore:"VN Centre đang thu thập thêm thông tin cho địa điểm này.",
  nav:{more:"Tiện ích"},
  ar:{kids:"Bé vui chơi",beauty:"Làm đẹp & chăm sóc",shop:"Mua sắm",cafe:"Cà phê chờ",elder:"Ông bà"},
  arSub:"Quanh {r}: chỗ để người nhà vui chơi, thư giãn trong lúc bạn tập. Dữ liệu OpenStreetMap; mở Google Maps để xem thêm.",
  arLoading:"Đang tìm quanh đây…",arNone:"Chưa có dữ liệu bản đồ cho nhóm này quanh đây.",arMore:"Tìm thêm trên Google Maps",arErr:"Không tải được dữ liệu quanh đây. Mở Google Maps để xem.",
  arQ:{kids:[["🎠","Khu vui chơi trẻ em","khu vui chơi trẻ em"],["🎮","Trò chơi, game","khu trò chơi"],["🌳","Công viên","công viên"],["📚","Nhà sách, thư viện","nhà sách"]],beauty:[["💆","Spa, gội đầu dưỡng sinh","spa gội đầu dưỡng sinh"],["💅","Làm nail","tiệm nail"],["💇","Làm tóc","salon tóc"]],shop:[["🛍","Trung tâm thương mại","trung tâm thương mại"],["🛒","Siêu thị","siêu thị"]],cafe:[["☕","Cà phê yên tĩnh","quán cà phê yên tĩnh"],["💻","Cà phê làm việc","cà phê làm việc"]],elder:[["🌳","Công viên đi dạo","công viên"],["🛕","Chùa, đền","chùa"],["🍵","Quán trà","quán trà"]]},
  arK:{playground:"Sân chơi",park:"Công viên",arcade:"Khu trò chơi",library:"Thư viện",books:"Nhà sách",cinema:"Rạp phim",amusement:"Khu vui chơi",water_park:"Công viên nước",zoo:"Vườn thú",beauty:"Làm đẹp",hairdresser:"Làm tóc",massage:"Massage",spa:"Spa",sauna:"Xông hơi",nail:"Làm nail",mall:"Trung tâm thương mại",supermarket:"Siêu thị",department_store:"Bách hoá",cafe:"Cà phê",tea:"Trà",worship:"Chùa, đền",garden:"Vườn"},
  lngName:"Tiếng Việt"},
 en:{need:"What do you need?",needAll:"All",needs:{kids:"With kids",noon:"Lunch-break session",early:"Early morning",after_work:"After work",group:"Groups & clients",foreigners:"International visitors",beginner:"Beginner, need clubs"},
  needHit:"Good match",from:"from",perH:"/hour",perHP:"/hour/person",perRound:"/round",perBalls:"/{b} balls",
  ico:{parking:"Parking",shop:"Golf shop",academy:"Academy",kids:"Kids friendly",lang:"Speaks",vip:"VIP room",rental:"Club rental"},
  cmpAdd:"Compare",cmpOn:"Selected",cmpTray:"{n}/3 places to compare",cmpGo:"Compare now",cmpClear:"Clear",cmpTitle:"Compare places",cmpMax:"You can compare up to 3 places.",cmpNeed2:"Pick at least one more place.",
  row:{type:"Type",google:"Google",vnc:"VN Centre score",users:"Players",dist:"Distance",from:"Price from",machine:"Simulator brand",sims:"Rates by simulator",range:"Range prices",rental:"Club rental",hours:"Hours",quiet:"Quiet hours",kids:"Kids",shop:"Golf shop",academy:"Academy",fac:"Facilities",parking:"Parking",lang:"Languages",fit:"Good for",promo:"Offers"},
  yes:"Yes",no:"No",na:"—",hl:"Top strength",fitT:"Good for",
  fit:{noon:"Lunch-break session",early:"Quiet early mornings",after_work:"After work",kids_mall:"Kids train, parents shop nearby",group:"Groups & hosting clients",foreigners:"International visitors"},
  slot:{early:"Early 5–8",morning:"Morning 8–11",noon:"Midday 11–14",afternoon:"Afternoon 14–17",evening:"Evening 17–20",late:"Late 20+"},
  lng:{en:"English",ko:"Korean",ja:"Japanese",zh:"Chinese"},
  simUnit:{hour_room:"hour / room",hour_person:"hour / person",round:"18-hole round",other:"session"},
  rk:{balls:"Ball basket",hour:"Hourly",unlimited:"Unlimited balls",month:"Monthly pass / package",lesson:"Lesson",other:"Other"},
  simT:"Rates by simulator",bayN:"{n} rooms",rangeT:"Range prices",colMachine:"Simulator",colBays:"Rooms",rentT:"Club rental",promoT:"Current offers",until:"until {d}",
  moreT:"Amenities & good for",moreSub:"From VN Centre surveys, owner updates or public sources.",
  busyT:"Quiet / busy hours",quiet:"Quiet",busy:"Busy",kidsT:"Kids",jClubs:"Junior-size clubs",jClass:"Junior classes",minAge:"From age {n}",
  shopT:"Golf shop",shopK:{apparel:"Apparel",accessories:"Accessories",clubs:"Clubs",fitting:"Club fitting"},
  facT:"Facilities",facK:{waiting_area:"Seating for family",vip_room:"Private / VIP room",covered:"Covered bays"},surf:{mat:"Mats",grass:"Real grass",both:"Mats and real grass"},
  langT:"Staff speak",acadT:"Academy & coaches",coachSrc:"source",noMore:"VN Centre is still collecting details for this place.",
  nav:{more:"Amenities"},
  ar:{kids:"Kids' fun",beauty:"Beauty & care",shop:"Shopping",cafe:"Cafés to wait",elder:"Grandparents"},
  arSub:"Within {r}: places for family to enjoy while you practise. Data from OpenStreetMap; open Google Maps for more.",
  arLoading:"Looking around…",arNone:"No map data for this group nearby yet.",arMore:"Find more on Google Maps",arErr:"Couldn't load nearby places. Open Google Maps instead.",
  arQ:{kids:[["🎠","Kids' play areas","kids playground"],["🎮","Game centres","game center"],["🌳","Parks","park"],["📚","Bookshops & libraries","bookstore"]],beauty:[["💆","Spa & hair wash","spa"],["💅","Nail salons","nail salon"],["💇","Hair salons","hair salon"]],shop:[["🛍","Shopping malls","shopping mall"],["🛒","Supermarkets","supermarket"]],cafe:[["☕","Quiet cafés","quiet cafe"],["💻","Cafés to work","cafe wifi"]],elder:[["🌳","Parks to stroll","park"],["🛕","Pagodas & temples","pagoda"],["🍵","Tea houses","tea house"]]},
  arK:{playground:"Playground",park:"Park",arcade:"Game centre",library:"Library",books:"Bookshop",cinema:"Cinema",amusement:"Amusement",water_park:"Water park",zoo:"Zoo",beauty:"Beauty",hairdresser:"Hair salon",massage:"Massage",spa:"Spa",sauna:"Sauna",nail:"Nails",mall:"Mall",supermarket:"Supermarket",department_store:"Department store",cafe:"Café",tea:"Tea",worship:"Pagoda / temple",garden:"Garden"},
  lngName:"English"}
};
for(const L in G2)T[L]=Object.assign(T[L]||{},G2[L],{nav:Object.assign({},(T[L]||{}).nav,G2[L].nav)});
/*CJK*/

const g2=k=>t(k);
const fmtK=n=>n==null?"":n>=1e6?(Math.round(n/1e5)/10).toLocaleString(lang==="vi"?"vi-VN":"en-US")+(lang==="vi"?"tr":"M"):n>=1000?Math.round(n/1000)+"k":String(n);
const money=n=>n==null?t("na"):n.toLocaleString(lang==="vi"?"vi-VN":"en-US")+"đ";
const hasDet=p=>!!(p.hl||(p.sims||[]).length||(p.ranges||[]).length||Object.keys(p.kids||{}).length||Object.keys(p.shop||{}).length||Object.keys(p.fac||{}).length||(p.langs||[]).length||(p.fit||[]).length||(p.coaches||[]).length);
function hlOf(p){return lang==="vi"?(p.hl||p.hlEn||""):(p.hlEn||p.hl||"")}
/* Giá thấp nhất ngày thường (máy theo giờ, rồi rổ bóng) để hiện "từ …" */
function priceFrom(p){
  const s=(p.sims||[]).filter(r=>r.weekday!=null).sort((a,b)=>a.weekday-b.weekday)[0];
  if(s)return {v:s.weekday,u:s.unit==="hour_person"?t("perHP"):s.unit==="round"?t("perRound"):s.unit==="hour_room"||!s.unit?t("perH"):""};
  const r=(p.ranges||[]).filter(r=>r.weekday!=null&&(r.kind==="balls"||r.kind==="hour"||r.kind==="unlimited")).sort((a,b)=>a.weekday-b.weekday)[0];
  if(r)return {v:r.weekday,u:r.kind==="balls"&&r.balls?t("perBalls").replace("{b}",r.balls):r.kind==="hour"?t("perH"):""};
  return null;
}
function icons(p){
  const o=[];
  if(p.shop&&(p.shop.apparel||p.shop.accessories||p.shop.clubs||p.shop.fitting))o.push(["🛍",t("ico.shop")]);
  if(p.academy&&p.academy.has&&p.type!=="academy")o.push(["🎓",t("ico.academy")]);
  if(p.kids&&(p.kids.junior_clubs||p.kids.junior_class))o.push(["👪",t("ico.kids")]);
  if(p.rental&&p.rental.available)o.push(["🏌",t("ico.rental")]);
  if(p.fac&&p.fac.vip_room)o.push(["★",t("ico.vip")]);
  if((p.langs||[]).length)o.push(["🌐",(p.langs||[]).map(x=>x.toUpperCase()).join(" · ")]);
  return o;
}
/* Thẻ tóm tắt: chèn vào thẻ danh sách sẵn có */
function summaryHtml(p){
  const pf=priceFrom(p),hl=hlOf(p),ic=icons(p),inC=CMP.includes(p.id),nm=needMatch(p);
  return `${hl?`<p class="hl">“${esc(hl)}”</p>`:""}
   <div class="sumrow">${pf?`<span class="pfrom">${t("from")} <b>${fmtK(pf.v)}</b>${esc(pf.u)}</span>`:""}${nm?`<span class="nhit">✓ ${t("needHit")}</span>`:""}${ic.map(([i,l])=>`<span class="ico" title="${esc(l)}">${i} <span>${esc(l)}</span></span>`).join("")}
   <button class="cmpb${inC?" on":""}" data-cmp="${p.id}" aria-pressed="${inC}">${inC?"✓ "+t("cmpOn"):"⇄ "+t("cmpAdd")}</button></div>`;
}

/* ---- Gợi ý theo nhu cầu: không lọc bớt, chỉ xếp nơi hợp lên đầu ---- */
const NEEDS=["kids","noon","early","after_work","group","foreigners","beginner"];
function needScore(p,n){
  if(!n)return 0;const f=p.fit||[],q=(p.busy&&p.busy.quiet)||[],k=p.kids||{};let s=0;
  if(n==="kids"){s+=f.includes("kids_mall")?3:0;s+=k.junior_clubs?2:0;s+=k.junior_class?2:0;s+=(p.svc||[]).includes("kids")?1:0;s+=p.type==="mini"?1:0}
  if(n==="noon"){s+=f.includes("noon")?3:0;s+=q.includes("noon")?2:0}
  if(n==="early"){s+=f.includes("early")?3:0;s+=q.includes("early")||q.includes("morning")?2:0;s+=p.hours==="24h"?1:0}
  if(n==="after_work"){s+=f.includes("after_work")?3:0;s+=p.late?2:0;s+=q.includes("evening")||q.includes("late")?1:0}
  if(n==="group"){s+=f.includes("group")?3:0;s+=p.fac&&p.fac.vip_room?2:0;s+=(p.bays||0)>=4?1:0;s+=(p.svc||[]).includes("food")?1:0}
  if(n==="foreigners"){s+=f.includes("foreigners")?3:0;s+=(p.langs||[]).length*1.5}
  if(n==="beginner"){s+=p.rental&&p.rental.available?3:0;s+=(p.academy&&p.academy.has)||p.type==="academy"?2:0;s+=(p.svc||[]).includes("class")?1:0}
  return s;
}
const needMatch=p=>st.need?needScore(p,st.need)>=2:false;
function renderNeeds(){
  const box=$("needs");if(!box)return;
  box.innerHTML=`<span class="nlab">${t("need")}</span>`+["",...NEEDS].map(k=>`<button class="pill${(st.need||"")===k?" on":""}" data-need="${k}" aria-pressed="${(st.need||"")===k}">${k?t("needs."+k):t("needAll")}</button>`).join("");
  box.querySelectorAll("[data-need]").forEach(b=>b.onclick=()=>{st.need=b.dataset.need;renderNeeds();update()});
}

/* ---- So sánh 2–3 nơi ---- */
let CMP=[];
for(const id of String(QP.get("ss")||"").split(","))if(/^[a-z]+-\d+$/.test(id)&&CMP.length<3&&!CMP.includes(id))CMP.push(id);
function toggleCmp(id){
  if(CMP.includes(id))CMP=CMP.filter(x=>x!==id);else{if(CMP.length>=3){toast(t("cmpMax"));return}CMP.push(id)}
  renderTray();update(false);
}
function renderTray(){
  let tr=$("cmptray");if(!tr){tr=document.createElement("div");tr.id="cmptray";tr.className="cmptray";document.body.appendChild(tr)}
  const L=CMP.map(id=>BYID[id]).filter(Boolean);
  if(!L.length){tr.hidden=true;return}
  tr.hidden=false;
  tr.innerHTML=`<div class="ct-in"><span class="ct-n">${t("cmpTray").replace("{n}",L.length)}</span><span class="ct-list">${L.map(p=>`<span>${esc(p.name)}<button data-x="${p.id}" aria-label="${t("cmpClear")}">×</button></span>`).join("")}</span>
   <button class="btn sm" id="ctclear">${t("cmpClear")}</button><button class="btn primary sm" id="ctgo" ${L.length<2?"disabled":""}>${t("cmpGo")}</button></div>`;
  tr.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>toggleCmp(b.dataset.x));
  $("ctclear").onclick=()=>{CMP=[];renderTray();update(false)};
  $("ctgo").onclick=()=>L.length<2?toast(t("cmpNeed2")):openCompare();
}
function yn(v){return v===true?"✓ "+t("yes"):v===false?t("no"):t("na")}
function openCompare(){
  const L=CMP.map(id=>BYID[id]).filter(Boolean);
  const rateList=(p,k)=>k==="sims"?(p.sims||[]).map(r=>`${esc(r.brand)}${r.model?" "+esc(r.model):""}: ${fmtK(r.weekday)||"?"} / ${fmtK(r.weekend)||"?"}`).join("<br>"):(p.ranges||[]).map(r=>`${esc(r.label||t("rk."+r.kind))}: ${fmtK(r.weekday)||"?"}`).join("<br>");
  const rows=[
   ["type",p=>t("types."+p.type)],["dist",p=>me?fmtD(km(me,p)):t("na")],["google",p=>p.rating?`★ ${p.rating.toFixed(1)} (${p.reviews})`:t("na")],
   ["vnc",p=>p.vnc!=null?`<b>${p.vnc.toFixed(1)}</b>/10`:t("na")],["users",p=>p.urev?`★ ${p.urate.toFixed(1)} (${p.urev})`:t("na")],
   ["from",p=>{const f=priceFrom(p);return f?`<b>${fmtK(f.v)}</b>${esc(f.u)}`:t("na")}],["machine",p=>esc(p.machine||t("na"))],
   ["sims",p=>rateList(p,"sims")||t("na")],["range",p=>rateList(p,"range")||t("na")],["rental",p=>p.rental&&p.rental.available!=null?yn(p.rental.available)+(p.rental.price!=null?" · "+fmtK(p.rental.price):""):t("na")],
   ["hours",p=>p.hours?esc(fmtH(p.hours)):t("na")],["quiet",p=>((p.busy&&p.busy.quiet)||[]).map(s=>t("slot."+s)).join("<br>")||t("na")],
   ["kids",p=>p.kids&&(p.kids.junior_clubs!=null||p.kids.junior_class!=null)?[p.kids.junior_clubs?t("jClubs"):"",p.kids.junior_class?t("jClass"):""].filter(Boolean).join("<br>")||t("no"):t("na")],
   ["shop",p=>p.shop&&Object.keys(p.shop).length?Object.entries(t("shopK")).filter(([k])=>p.shop[k]).map(([,l])=>l).join(", ")||t("no"):t("na")],
   ["academy",p=>p.academy&&p.academy.has!=null?yn(p.academy.has)+(p.academy.name?" · "+esc(p.academy.name):""):p.type==="academy"?"✓":t("na")],
   ["fac",p=>p.fac&&Object.keys(p.fac).length?[...Object.entries(t("facK")).filter(([k])=>p.fac[k]).map(([,l])=>l),p.fac.surface?t("surf."+p.fac.surface):""].filter(Boolean).join("<br>")||t("na"):t("na")],
   ["parking",p=>p.parking==="free"?t("svc.parking"):p.parking==="paid"?"✓":t("na")],
   ["lang",p=>(p.langs||[]).map(x=>t("lng."+x)).join(", ")||t("na")],["fit",p=>(p.fit||[]).map(x=>t("fit."+x)).join("<br>")||t("na")],
   ["promo",p=>(p.promos||[]).map(x=>esc(x.title)).join("<br>")||t("na")]];
  const M=document.createElement("div");M.className="cmpmodal";M.setAttribute("role","dialog");M.setAttribute("aria-modal","true");M.setAttribute("aria-label",t("cmpTitle"));
  M.innerHTML=`<div class="cm-box"><div class="cm-head"><h2>${t("cmpTitle")}</h2><button class="btn sm" id="cmclose">${t("closeB")}</button></div>
   <div class="cm-scroll"><table class="cmp"><thead><tr><th></th>${L.map(p=>`<th><a href="#/${p.id}" data-close>${esc(p.name)}</a>${hlOf(p)?`<small>“${esc(hlOf(p))}”</small>`:""}</th>`).join("")}</tr></thead>
   <tbody>${rows.map(([k,f])=>`<tr><th>${t("row."+k)}</th>${L.map(p=>`<td>${f(p)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  document.body.appendChild(M);document.body.classList.add("noscroll");
  const close=()=>{M.remove();document.body.classList.remove("noscroll")};
  M.querySelector("#cmclose").onclick=close;M.onclick=e=>{if(e.target===M||e.target.closest("[data-close]"))close()};
  document.addEventListener("keydown",function esc1(e){if(e.key==="Escape"){close();document.removeEventListener("keydown",esc1)}});
  M.querySelector("#cmclose").focus();
}

/* ---- Trang chi tiết: giá theo máy, giá sân tập, tiện ích & phù hợp ---- */
function priceDetailHtml(p){
  const sims=p.sims||[],rg=p.ranges||[];if(!sims.length&&!rg.length&&!(p.rental&&p.rental.available!=null)&&!(p.promos||[]).length)return "";
  const unit=u=>t("simUnit."+(u||"hour_room"));
  return `${sims.length?`<h3 class="rh">${t("simT")}</h3><table class="price"><thead><tr><th>${t("colMachine")}</th><th>${t("colWeek")}</th><th>${t("colWkd")}</th></tr></thead><tbody>${sims.map(r=>`<tr><td><b>${esc(r.brand)}</b>${r.model?" "+esc(r.model):""}${r.bays?` · ${t("bayN").replace("{n}",r.bays)}`:""}<br><small>${esc(unit(r.unit))}${r.note?" · "+esc(r.note):""}</small></td><td class="v">${money(r.weekday)}</td><td class="v">${money(r.weekend)}</td></tr>`).join("")}</tbody></table>`:""}
   ${rg.length?`<h3 class="rh">${t("rangeT")}</h3><table class="price"><thead><tr><th>${t("colItem")}</th><th>${t("colWeek")}</th><th>${t("colWkd")}</th></tr></thead><tbody>${rg.map(r=>`<tr><td><b>${esc(r.label||t("rk."+r.kind))}</b>${r.balls?` · ${r.balls}`:""}${r.note?`<br><small>${esc(r.note)}</small>`:""}</td><td class="v">${money(r.weekday)}</td><td class="v">${money(r.weekend)}</td></tr>`).join("")}</tbody></table>`:""}
   ${p.rental&&p.rental.available!=null?`<p class="vnote"><b>${t("rentT")}:</b> ${yn(p.rental.available)}${p.rental.price!=null?" · "+money(p.rental.price):""}${p.rental.note?" · "+esc(p.rental.note):""}</p>`:""}
   ${(p.promos||[]).length?`<h3 class="rh">${t("promoT")}</h3><div class="promos">${p.promos.map(x=>`<div><b>🎁 ${esc(x.title)}</b>${x.detail?`<span>${esc(x.detail)}</span>`:""}${x.until?`<small>${t("until").replace("{d}",new Date(x.until).toLocaleDateString(lang==="vi"?"vi-VN":"en-GB"))}</small>`:""}${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">›</a>`:""}</div>`).join("")}</div>`:""}`;
}
function moreHtml(p){
  const parts=[];
  if((p.fit||[]).length)parts.push(`<h3 class="rh">${t("fitT")}</h3><div class="fitchips">${p.fit.map(x=>`<span>✓ ${t("fit."+x)}</span>`).join("")}</div>`);
  const b=p.busy||{};if((b.quiet||[]).length||(b.busy||[]).length)parts.push(`<h3 class="rh">${t("busyT")}</h3><div class="slots">${Object.keys(t("slot")).map(s=>`<span class="${(b.quiet||[]).includes(s)?"q":(b.busy||[]).includes(s)?"b":""}">${t("slot."+s)}<small>${(b.quiet||[]).includes(s)?t("quiet"):(b.busy||[]).includes(s)?t("busy"):""}</small></span>`).join("")}</div>${b.note?`<p class="sub">${esc(b.note)}</p>`:""}`);
  const k=p.kids||{};if(Object.keys(k).length)parts.push(`<h3 class="rh">${t("kidsT")}</h3><ul class="ynl"><li>${t("jClubs")}: ${yn(k.junior_clubs)}</li><li>${t("jClass")}: ${yn(k.junior_class)}</li>${k.min_age?`<li>${t("minAge").replace("{n}",k.min_age)}</li>`:""}${k.note?`<li>${esc(k.note)}</li>`:""}</ul>`);
  const sh=p.shop||{};if(Object.keys(sh).length)parts.push(`<h3 class="rh">${t("shopT")}</h3><ul class="ynl">${Object.entries(t("shopK")).map(([x,l])=>`<li>${l}: ${yn(sh[x])}</li>`).join("")}${sh.note?`<li>${esc(sh.note)}</li>`:""}</ul>`);
  const f=p.fac||{};if(Object.keys(f).length)parts.push(`<h3 class="rh">${t("facT")}</h3><ul class="ynl">${Object.entries(t("facK")).map(([x,l])=>`<li>${l}: ${yn(f[x])}</li>`).join("")}${f.surface?`<li>${t("surf."+f.surface)}</li>`:""}${f.note?`<li>${esc(f.note)}</li>`:""}</ul>`);
  if((p.langs||[]).length)parts.push(`<h3 class="rh">${t("langT")}</h3><div class="fitchips">${p.langs.map(x=>`<span>🌐 ${t("lng."+x)}</span>`).join("")}</div>`);
  const ac=p.academy||{};if(ac.has||(p.coaches||[]).length)parts.push(`<h3 class="rh">${t("acadT")}</h3>${ac.name?`<p><b>${esc(ac.name)}</b>${ac.note?" · "+esc(ac.note):""}</p>`:""}${(p.coaches||[]).length?`<ul class="ynl">${p.coaches.map(c=>`<li><b>${esc(c.name)}</b>${c.title?" · "+esc(c.title):""} <a href="${esc(c.src)}" target="_blank" rel="noopener nofollow">${t("coachSrc")} ›</a></li>`).join("")}</ul>`:""}`);
  return parts.length?parts.join(""):`<span class="pending">● ${t("noMore")}</span>`;
}

/* ---- "Quanh đây": 5 nhóm, dữ liệu OpenStreetMap (Overpass), kèm tìm thêm trên Google Maps ---- */
const AR_GROUPS=["kids","beauty","shop","cafe","elder"];
/* Chừa chỗ nối web Cafe Review: khi có nguồn dữ liệu (URL trả về [{name,lat,lng,url,note}]) thì điền vào đây; quán của VN Centre hiện lên đầu nhóm "Cà phê chờ" */
const CAFE_REVIEW={url:"",label:"Cafe Review by VN Centre"};
const AR_R=1500;
const AROUND_CACHE={};let arGroup="kids";
function arClassify(tg){
  const L=tg.leisure,A=tg.amenity,S=tg.shop;
  if(L==="playground")return ["kids","playground"];if(L==="amusement_arcade"||L==="adult_gaming_centre"&&false)return ["kids","arcade"];
  if(L==="water_park")return ["kids","water_park"];if(tg.tourism==="theme_park")return ["kids","amusement"];if(tg.tourism==="zoo")return ["kids","zoo"];
  if(A==="library")return ["kids","library"];if(S==="books")return ["kids","books"];if(A==="cinema")return ["kids","cinema"];
  if(S==="beauty")return ["beauty",tg.beauty==="nails"?"nail":"beauty"];if(S==="hairdresser")return ["beauty","hairdresser"];if(S==="massage")return ["beauty","massage"];
  if(L==="sauna"||A==="spa"||tg.leisure==="spa")return ["beauty",L==="sauna"?"sauna":"spa"];
  if(S==="mall")return ["shop","mall"];if(S==="supermarket")return ["shop","supermarket"];if(S==="department_store")return ["shop","department_store"];
  if(A==="cafe")return [/tea/i.test(tg.cuisine||"")?"elder":"cafe",/tea/i.test(tg.cuisine||"")?"tea":"cafe"];if(S==="tea")return ["elder","tea"];
  if(A==="place_of_worship"&&/buddhist|taoist|folk/i.test(tg.religion||"buddhist"))return ["elder","worship"];
  if(L==="park")return ["park","park"];if(L==="garden")return ["elder","garden"];
  return null;
}
/* Nguồn 1: around.json tính sẵn cho mọi địa điểm (đưa lên cùng trang); nguồn 2: hỏi trực tiếp Overpass (mirror nhanh trước) cho địa điểm mới */
let AROUND_FILE=null;
const aroundFile=()=>AROUND_FILE||(AROUND_FILE=fetch("around.json",{cache:"no-cache"}).then(r=>r.ok?r.json():{}).catch(()=>({})));
const OVERPASS=["https://maps.mail.ru/osm/tools/overpass/api/interpreter","https://overpass-api.de/api/interpreter"];
function arFromFile(p,f){const v=f&&f.v&&f.v[p.id];if(!v)return null;const out={};
  for(const g of AR_GROUPS)out[g]=(v[g]||[]).map(([n,k,la,lo,en])=>({n:lang!=="vi"&&en?en:n,k,lat:la,lng:lo,d:km(p,{lat:la,lng:lo})}));return out}
async function overpassFetch(q){let last;for(const u of OVERPASS){try{const c=new AbortController();const tm=setTimeout(()=>c.abort(),20000);
  const r=await fetch(u,{method:"POST",body:"data="+encodeURIComponent(q),headers:{"Content-Type":"application/x-www-form-urlencoded"},signal:c.signal});clearTimeout(tm);
  if(r.ok)return await r.json();last=new Error(r.status)}catch(e){last=e}}throw last||new Error("overpass")}
async function loadAround(p){
  if(AROUND_CACHE[p.id])return AROUND_CACHE[p.id];
  const f=await aroundFile();const fromFile=arFromFile(p,f);if(fromFile)return AROUND_CACHE[p.id]=fromFile;
  try{const c=sessionStorage.getItem("ar2:"+p.id);if(c)return AROUND_CACHE[p.id]=JSON.parse(c)}catch(e){}
  const a=`(around:${AR_R},${p.lat},${p.lng})`;
  const q=`[out:json][timeout:20];(nwr["leisure"~"^(playground|amusement_arcade|water_park|park|garden|sauna)$"]${a};nwr["tourism"~"^(theme_park|zoo)$"]${a};nwr["amenity"~"^(library|cinema|cafe|place_of_worship|spa)$"]${a};nwr["shop"~"^(books|beauty|hairdresser|massage|mall|supermarket|department_store|tea)$"]${a};);out center tags 400;`;
  const j=await overpassFetch(q);
  const out={kids:[],beauty:[],shop:[],cafe:[],elder:[]};
  for(const e of j.elements||[]){const tg=e.tags||{};const nm=(lang!=="vi"&&tg["name:en"])||tg.name;if(!nm)continue;const c=arClassify(tg);if(!c)continue;
    const la=e.lat??(e.center&&e.center.lat),lo=e.lon??(e.center&&e.center.lon);if(la==null)continue;const it={n:nm,k:c[1],lat:la,lng:lo,d:km(p,{lat:la,lng:lo})};
    if(c[0]==="park"){out.kids.push(it);out.elder.push(it)}else out[c[0]].push(it)}
  for(const g in out){const seen=new Set();out[g]=out[g].sort((a,b)=>a.d-b.d).filter(x=>{const key=x.n.toLowerCase();if(seen.has(key))return false;seen.add(key);return true}).slice(0,8)}
  AROUND_CACHE[p.id]=out;try{sessionStorage.setItem("ar2:"+p.id,JSON.stringify(out))}catch(e){}return out;
}
function aroundHtml(p){
  return `<p class="sub">${t("arSub").replace("{r}",fmtD(AR_R/1000))}</p>
   <div class="tabs artabs" role="tablist">${AR_GROUPS.map(g=>`<button class="pill${g===arGroup?" on":""}" role="tab" aria-selected="${g===arGroup}" data-ar="${g}">${t("ar."+g)}</button>`).join("")}</div>
   <div id="arbox" class="arbox"><span class="pending">● ${t("arLoading")}</span></div>`;
}
function fillAround(p){
  const box=$("arbox");if(!box)return;
  const gq=q=>`https://www.google.com/maps/search/${encodeURIComponent(q)}/@${p.lat},${p.lng},15z`;
  const links=(t("arQ")[arGroup]||[]).map(([ic,l,q])=>`<a target="_blank" rel="noopener" href="${gq(q)}"><i>${ic}</i><b>${esc(l)}</b><span>Google Maps ›</span></a>`).join("");
  const draw=data=>{if(!cur||cur.id!==p.id)return;const L=data?data[arGroup]:null;
    box.innerHTML=(L&&L.length?`<div class="arlist">${L.map(x=>`<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.n)}%20${x.lat},${x.lng}"><span><b>${esc(x.n)}</b><small>${t("arK."+x.k)}</small></span><small>${fmtD(x.d)} ›</small></a>`).join("")}</div>`:data?`<span class="pending">● ${t("arNone")}</span>`:`<span class="pending">● ${t("arErr")}</span>`)
      +`<h3 class="rh" style="font-size:15px;margin-top:14px">${t("arMore")}</h3><div class="near">${links}</div>`};
  document.querySelectorAll("[data-ar]").forEach(b=>b.onclick=()=>{arGroup=b.dataset.ar;document.querySelectorAll("[data-ar]").forEach(x=>{x.classList.toggle("on",x===b);x.setAttribute("aria-selected",x===b)});fillAround(p)});
  if(AROUND_CACHE[p.id])return draw(AROUND_CACHE[p.id]);
  box.innerHTML=`<span class="pending">● ${t("arLoading")}</span>`;
  loadAround(p).then(draw).catch(()=>draw(null));
}
