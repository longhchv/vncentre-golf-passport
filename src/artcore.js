/* ===== Spec 30: lõi bài viết tổng quan — dùng chung cho app tapgolf (index.html) và trang /bai/<slug>/ =====
   Markdown rút gọn, cùng quy tắc với app quản trị (src/features/venues/articles/md.tsx):
   ## mục · ### mục nhỏ · - gạch đầu dòng · 1. đánh số · **đậm** · [chữ](https://…) · dòng trống = đoạn mới.
   Mọi chữ được escape trước rồi mới áp quy tắc, nên nội dung bài không chèn được HTML hay script. */
const ART=(()=>{
  const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const inline=s=>esc(s)
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(m,txt,u)=>`<a href="${u}" target="_blank" rel="noopener noreferrer nofollow">${txt}</a>`);
  function blocks(src){
    const out=[];let para=[];const flush=()=>{if(para.length){out.push({t:"p",text:para.join(" ")});para=[]}};
    for(const raw of String(src||"").replace(/\r\n?/g,"\n").split("\n")){
      const line=raw.trim();let m;
      if(!line){flush();continue}
      if((m=line.match(/^(#{2,3})\s+(.+)$/))){flush();out.push({t:m[1].length===2?"h2":"h3",text:m[2]});continue}
      if((m=line.match(/^[-*]\s+(.+)$/))||(m=line.match(/^\d+[.)]\s+(.+)$/))){flush();const t=/^\d/.test(line)?"ol":"ul";const last=out[out.length-1];
        if(last&&last.t===t)last.items.push(m[1]);else out.push({t,items:[m[1]]});continue}
      para.push(line);
    }
    flush();return out;
  }
  const md=src=>blocks(src).map(b=>b.items?`<${b.t}>${b.items.map(x=>`<li>${inline(x)}</li>`).join("")}</${b.t}>`:`<${b.t}>${inline(b.text)}</${b.t}>`).join("\n");
  const plain=(src,n)=>{const s=blocks(src).map(b=>b.items?b.items.join(" "):b.text).join(" ").replace(/\*\*|\[|\]\([^)]*\)/g,"").replace(/\s+/g," ").trim();return n&&s.length>n?s.slice(0,n-1).replace(/\s\S*$/,"")+"…":s};
  const fmtDate=(d,lang)=>{if(!d)return "";const x=new Date(d.length===10?d+"T00:00:00":d);return isNaN(x)?"":x.toLocaleDateString(lang==="vi"||!lang?"vi-VN":lang,{day:"2-digit",month:"2-digit",year:"numeric"})};
  const cover=(a,sbUrl)=>a.cover_path&&sbUrl?sbUrl+"/storage/v1/object/public/venue-photos/"+a.cover_path.split("/").map(encodeURIComponent).join("/"):(a.cover_url||"");
  const SITE="https://tapgolf.vncentre.net";
  const url=a=>SITE+"/bai/"+a.slug+"/";
  const L={
    vi:{src:"Nguồn thông tin",asOf:"Thông tin cập nhật đến {d}",needs:"Một số thông tin chưa được địa điểm công bố, VN Centre sẽ bổ sung sau khi khảo sát tại chỗ.",
        fb:"Chia sẻ Facebook",share:"Chia sẻ",copy:"Chép link",copied:"Đã chép link bài viết",seen:"xem ngày {d}"},
    en:{src:"Sources",asOf:"Information as of {d}",needs:"Some details have not been published by the venue yet; VN Centre will add them after a site visit.",
        fb:"Share on Facebook",share:"Share",copy:"Copy link",copied:"Article link copied",seen:"checked {d}"}
  };
  const tr=(lang,k)=>(L[lang]||L.en)[k];
  function sourcesHtml(a,lang){
    const li=(a.sources||[]).map(s=>`<li>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.label)}</a>`:esc(s.label)}${s.at?` <span>(${esc(tr(lang,"seen").replace("{d}",fmtDate(s.at,lang)))})</span>`:""}</li>`).join("");
    const d=a.info_date||(a.updated_at||"").slice(0,10);
    return `<div class="artsrc"><b>${tr(lang,"src")}</b>${li?`<ul>${li}</ul>`:""}${d?`<p>${esc(tr(lang,"asOf").replace("{d}",fmtDate(d,lang)))}</p>`:""}${a.needs_survey?`<p class="artneeds">${esc(tr(lang,"needs"))}</p>`:""}</div>`;
  }
  function shareHtml(a,lang){
    const u=url(a);
    return `<div class="artshare" data-url="${esc(u)}" data-title="${esc(a.title)}">
      <a class="btn sm" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}" target="_blank" rel="noopener">f ${tr(lang,"fb")}</a>
      <button type="button" class="btn sm" data-art="share">↗ ${tr(lang,"share")}</button>
      <button type="button" class="btn sm" data-art="copy">🔗 ${tr(lang,"copy")}</button></div>`;
  }
  /* Nút chia sẻ: điện thoại mở bảng chia sẻ của máy (Zalo, Messenger…); máy tính chép link. */
  function bindShare(root,lang,toast){
    root.querySelectorAll(".artshare [data-art]").forEach(b=>b.onclick=async()=>{
      const box=b.closest(".artshare");const u=box.dataset.url,ti=box.dataset.title;
      if(b.dataset.art==="share"&&navigator.share){try{await navigator.share({title:ti,url:u});return}catch(e){if(e&&e.name==="AbortError")return}}
      try{await navigator.clipboard.writeText(u);toast(tr(lang,"copied"))}catch(e){toast(u)}
    });
  }
  return {esc,inline,blocks,md,plain,fmtDate,cover,url,sourcesHtml,shareHtml,bindShare,tr,SITE};
})();
if(typeof module!=="undefined")module.exports=ART;
