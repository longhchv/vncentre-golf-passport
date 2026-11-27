/* ===== Spec 30 GĐ3: soạn bài tổng quan tự động cho từng địa điểm =====
   Chỉ dùng: dữ liệu địa điểm trong Supabase (nguồn gốc: Google Maps khi nhập, hoặc info_sources ghi rõ),
   khối kiến thức máy trong sim_brands (metrics/practice có nguồn chính hãng).
   Bỏ qua mọi trường có nguồn toplist (chưa xác nhận). Chạy được ở Node (thử) và trong trình duyệt. */
function artGen(v,B,opts){
  opts=opts||{};
  const AT=opts.at||"2026-11-27";
  const src=v.info_sources||{};
  const bad=k=>{const s=src[k];return !!(s&&/toplist/i.test(s.src||""))};
  const ok=(k,x)=>!bad(k)&&x!=null&&(Array.isArray(x)?x.length>0:typeof x==="object"?Object.keys(x).length>0:x!=="");
  const n=v.name.trim();
  const TYPE={range:"sân tập golf ngoài trời","3d":"phòng golf 3D",academy:"học viện golf",course:"sân golf có khu tập",mini:"sân golf mini"};
  const tName=TYPE[v.type]||"địa điểm tập golf";
  const REG={hn:"Hà Nội",hcm:"TP.HCM",dn:"Đà Nẵng"};
  const area=[v.district,REG[v.region]].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(", ");
  const money=x=>x==null?"":Number(x).toLocaleString("vi-VN").replace(/,/g,".")+"đ";
  const hoursTxt=(()=>{const h=(v.hours||"").trim();if(!h)return "";if(/^24h$/i.test(h))return "mở cửa 24/24";
    const m=h.match(/^(\d{1,2}[:.]\d{2})?\s*[–-]\s*(\d{1,2}[:.]\d{2})$/);if(m){const c=m[2].replace(".",":");return m[1]?`mở cửa ${m[1]}–${c}`:(/^(0|00|24):00$/.test(c)?"mở cửa đến nửa đêm":/^[0-4]:\d\d$/.test(c)?`mở cửa đến ${c} sáng hôm sau`:`mở cửa đến ${c}`)}return "giờ mở cửa: "+h})();
  const late=/24\/24|nửa đêm|sáng hôm sau|đến 2[3-4]:/.test(hoursTxt);
  const svc=new Set(v.svc||[]);
  const B0=B&&v.machine?B[v.machine]:null;
  const hasKnow=!!(B0&&B0.metrics&&B0.metrics.length&&B0.sources&&B0.sources.length);
  const rating=v.google_rating&&v.google_reviews>=10?`${String(v.google_rating).replace(".",",")}/5 (${v.google_reviews} đánh giá)`:"";
  const sources=[];const addSrc=s=>{if(s&&s.label&&!sources.some(x=>x.label===s.label&&x.url===s.url))sources.push(s)};
  const gmLabel="Google Maps – thông tin địa điểm (địa chỉ, giờ mở cửa, điện thoại, tiện ích)";
  addSrc({label:gmLabel,at:v.google_at||"2026-11-23"});
  const L=[];const P=t=>L.push(t);
  let need=(v.needs_survey||[]).length>0;

  /* 1. Mở bài */
  P("## Điểm nổi bật\n");
  let intro=`${n} là ${tName} tại ${v.address?v.address+(area&&!v.address.includes(v.district||"@")?", "+area:""):area}.`;
  if(v.residents_only)intro+=" Lưu ý: nơi này chủ yếu phục vụ cư dân trong khu, nên hỏi trước trước khi đến.";
  P(intro);
  const hl=ok("highlight_vi",v.highlight_vi)?v.highlight_vi:"";
  if(hl&&src.highlight_vi){P(`\nĐiều đáng chú ý nhất: **${hl.replace(/\.$/,"")}**.`);addSrc(srcOf(src.highlight_vi))}
  const pts=[];
  if(rating)pts.push(`được người chơi chấm **${rating.replace(" (","** (")}`.replace("****","**"));
  if(v.machine)pts.push(`dùng hệ thống **${v.machine}**${v.bays?` với ${v.bays} ${v.type==="3d"?"phòng":"làn"}`:""}`);
  else if(v.bays)pts.push(`có ${v.bays} ${v.type==="3d"?"phòng":"làn"} tập`);
  if(hoursTxt)pts.push(hoursTxt+(late?", tiện cho người tập sau giờ làm":""));
  if(svc.has("class"))pts.push("có lớp học golf");
  if(svc.has("food")||svc.has("restaurant")||svc.has("cafe")||svc.has("bar"))pts.push("có đồ ăn, đồ uống"+(svc.has("cafe")?" và chỗ ngồi cà phê":""));
  if(svc.has("kids")||svc.has("family"))pts.push("được ghi là phù hợp cho trẻ em, gia đình");
  if(svc.has("vip"))pts.push("có phòng VIP");
  if(v.parking==="free")pts.push("có chỗ đỗ xe miễn phí");
  if(svc.has("gym")||svc.has("pool")||svc.has("sauna"))pts.push("có thêm "+["gym","pool","sauna"].filter(x=>svc.has(x)).map(x=>({gym:"phòng gym",pool:"bể bơi",sauna:"phòng xông hơi"})[x]).join(", "));
  if(pts.length){P("\nTheo thông tin trên Google Maps, nơi này:");pts.forEach(x=>P("- "+x+"."));}

  /* 2. Thiết bị & cách tận dụng */
  const eq=[];
  if(v.type==="3d"||v.type==="academy"||v.machine){
    if(hasKnow){
      eq.push(`Phòng dùng hệ thống **${v.machine}**${v.machine_detail&&v.machine_detail.model?` (dòng ${v.machine_detail.model})`:""}. Mỗi cú đánh cho ra số liệu ngay trên màn hình. Những con số người chơi phong trào nên nhìn trước:`);
      B0.metrics.slice(0,5).forEach(m=>eq.push(`- **${m[0]}**: ${m[1]}`));
      if(v.machine!=="Trackman")eq.push(`\nThông số cụ thể có thể khác nhau tùy dòng máy ${v.machine} mà phòng đang dùng.`);
      B0.sources.forEach((u,i)=>addSrc({label:`${v.machine} – trang chính hãng${B0.sources.length>1?" ("+(i+1)+")":""}`,url:u,at:B0.knowledge_checked_at||AT}));
    }else if(v.machine){
      eq.push(`Phòng dùng hệ thống **${v.machine}**. VN Centre đang thu thập thông tin chính hãng về dòng máy này và cách tận dụng khi tập; phần này sẽ được bổ sung.`);need=true;
    }else{
      eq.push("Hãng máy và dòng máy chưa được địa điểm công bố công khai. VN Centre sẽ cập nhật sau khi khảo sát tại chỗ.");need=true;
    }
  }else{
    const f=ok("facilities",v.facilities)?v.facilities:null;
    if(f){const s=[];if(f.surface)s.push({mat:"mặt thảm",grass:"cỏ thật",both:"cả thảm và cỏ thật"}[f.surface]);if(f.covered)s.push("có mái che");
      if(s.length)eq.push(`Làn tập: ${s.join(", ")}.`);if(f.note)eq.push(f.note.replace(/\.?$/,"."));addSrc(srcOf(src.facilities))}
    if(v.machine)eq.push(`Địa điểm có dùng hệ thống ${v.machine}.`);
    if(!eq.length){eq.push("Số làn, mặt thảm hay cỏ, khu short game: các thông tin này chưa được địa điểm công bố công khai. VN Centre sẽ bổ sung sau khi khảo sát.");need=true}
  }
  const co=ok("coaches",v.coaches)?v.coaches.filter(c=>c.src):[];
  if(co.length){eq.push("\n**Huấn luyện viên** (theo trang của địa điểm):");co.forEach(c=>{eq.push(`- **${c.name}**${c.title?", "+c.title:""}.`);addSrc({label:"Trang huấn luyện viên – "+c.name,url:c.src,at:AT})})}
  P("\n## Thiết bị và cách tận dụng\n");eq.forEach(P);

  /* 3. Tập vui hơn */
  const fun=[];
  if(hasKnow&&B0.practice&&B0.practice.length){fun.push(`Hệ thống ${v.machine} không chỉ để chỉnh swing:`);B0.practice.slice(0,5).forEach(p=>fun.push(`- **${p[0]}**: ${p[1]}`))}
  const k=ok("kids",v.kids)?v.kids:null;
  if(k){const s=[];if(k.junior_class)s.push("có lớp junior");if(k.junior_clubs)s.push("có gậy cỡ nhỏ cho các bạn nhỏ");if(k.min_age)s.push(`nhận các con từ ${k.min_age} tuổi`);if(k.note)s.push(k.note.replace(/\.$/,""));
    if(s.length){fun.push(`\n**Cho các bạn nhỏ:** ${s.join("; ")}.`);addSrc(srcOf(src.kids))}}
  if(fun.length){P("\n## Tập vui hơn\n");fun.forEach(P)}

  /* 4. Thông tin thực tế */
  P("\n## Thông tin thực tế\n");
  const pr=[];
  if(ok("sim_rates",v.sim_rates)){v.sim_rates.forEach(r=>pr.push(`- ${[r.brand,r.model].filter(Boolean).join(" ")}${r.unit?` (${({hour_room:"theo giờ/phòng",hour_person:"theo giờ/người",round:"theo vòng",other:"theo lượt"})[r.unit]})`:""}: ngày thường ${money(r.weekday)||"chưa rõ"}${r.weekend?`, cuối tuần ${money(r.weekend)}`:""}.${r.note?" "+r.note.replace(/\.?$/,"."):""}`));addSrc(srcOf(src.sim_rates))}
  if(ok("range_rates",v.range_rates)){v.range_rates.forEach(r=>{const lb=r.label||r.kind;const two=r.weekend!=null&&r.weekend!==r.weekday;pr.push(`- ${lb}: ${two?`ngày thường ${money(r.weekday)}, cuối tuần ${money(r.weekend)}`:money(r.weekday!=null?r.weekday:r.weekend)}.${r.note?" "+r.note.replace(/\.?$/,"."):""}`)});addSrc(srcOf(src.range_rates))}
  if(pr.length){P("**Giá:**");pr.forEach(P)}
  else{P("**Giá:** địa điểm chưa công bố bảng giá công khai; nên gọi trước để hỏi giá và đặt chỗ.");need=true}
  if(ok("busy",v.busy)&&(v.busy.quiet||[]).length+(v.busy.busy||[]).length){
    const SL={early:"sáng sớm (5–8h)",morning:"buổi sáng (8–11h)",noon:"buổi trưa (11–14h)",afternoon:"buổi chiều (14–17h)",evening:"buổi tối (17–20h)",late:"sau 20h"};
    const q=(v.busy.quiet||[]).map(x=>SL[x]),b=(v.busy.busy||[]).map(x=>SL[x]);
    P(`\n**Nên đi lúc nào:** theo biểu đồ mức độ đông khách trên Google Maps, ${q.length?"vắng nhất vào "+q.join(", "):""}${q.length&&b.length?"; ":""}${b.length?"đông nhất vào "+b.join(", "):""}.`);addSrc(srcOf(src.busy))}
  const fit=[];const FT={noon:"người tranh thủ tập giờ nghỉ trưa",early:"người thích tập sáng sớm cho vắng",after_work:"người tập sau giờ làm",kids_mall:"gia đình: các con tập, bố mẹ dạo trung tâm thương mại",group:"nhóm bạn, tiếp khách",foreigners:"khách nước ngoài"};
  (ok("fit_tags",v.fit_tags)?v.fit_tags:[]).forEach(t=>FT[t]&&fit.push(FT[t]));
  if(late&&!fit.includes(FT.after_work))fit.push(FT.after_work);
  if(svc.has("class")||(ok("academy",v.academy)&&v.academy.has))fit.push("người mới muốn học bài bản");
  if((svc.has("kids")||svc.has("family")||(k&&(k.junior_class||k.junior_clubs)))&&!fit.some(x=>x.startsWith("gia đình")))fit.push("gia đình có các bạn nhỏ");
  if(fit.length){P("\n**Phù hợp với:**");[...new Set(fit)].forEach(x=>P("- "+x+";"));L[L.length-1]=L[L.length-1].replace(/;$/,".")}
  const ct=[];
  if(v.address)ct.push("địa chỉ: "+v.address+(area&&!v.address.includes(v.district||"@")?", "+area:""));
  if(v.phone)ct.push("điện thoại: "+v.phone.replace(/^\+84\s?/,"0"));
  if(v.fb_url)ct.push(`fanpage: [Facebook](${v.fb_url})`);
  if(v.web&&v.web!==v.fb_url)ct.push(`website: [${v.web.replace(/^https?:\/\/(www\.)?/,"").replace(/\/$/,"")}](${v.web})`);
  if(ct.length){P("\n**Liên hệ:**");ct.forEach((x,i)=>P("- "+x+(i<ct.length-1?";":".")))}
  if(need)P("\nMột số thông tin chưa được địa điểm công bố công khai. VN Centre sẽ cập nhật sau khi khảo sát tại chỗ; chủ địa điểm có thể nhận trang và bổ sung trực tiếp trên tapgolf.vncentre.net.");

  /* Tiêu đề, sapo */
  const lead=v.type==="3d"?(v.machine?`phòng golf 3D ${v.machine}`:"phòng golf 3D"):tName;
  const title=`${n}: ${lead}${v.district?" tại "+v.district:REG[v.region]?" tại "+REG[v.region]:""}`.slice(0,160);
  const sp=[];
  sp.push(`${tName.charAt(0).toUpperCase()+tName.slice(1)}${v.district?" ở "+v.district:""}${v.machine?`, dùng hệ thống ${v.machine}`:""}`);
  if(rating)sp.push(`người chơi chấm ${rating} trên Google Maps`);
  if(hoursTxt)sp.push(hoursTxt);
  let sapo=sp.join("; ")+".";
  if(hasKnow)sapo+=` Bài viết giải thích các số liệu ${v.machine} đo được và cách tận dụng khi tập.`;
  else if(pr.length)sapo+=" Có bảng giá và thông tin thực tế để bạn chọn giờ đi phù hợp.";
  return {venue_id:v.id,kind:"overview",lang:"vi",title,sapo:sapo.slice(0,400),body:L.join("\n")+"\n",sources,info_date:AT,needs_survey:need,status:"draft"};
}
function srcOf(s){return s?{label:s.src||"Nguồn",...(s.url?{url:s.url}:{}),...(s.at?{at:s.at}:{})}:null}
if(typeof module!=="undefined")module.exports={artGen};
