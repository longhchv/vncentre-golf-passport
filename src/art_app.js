/* ===== Spec 30: bài tổng quan trong trang chi tiết địa điểm (đọc view pv_public_articles) ===== */
const ART_UI={
  vi:{artT:"Bài tổng quan",artMore:"Đọc toàn bài",artLess:"Thu gọn",artPage:"Trang bài viết ›",artViOnly:"Bài viết bằng tiếng Việt."},
  en:{artT:"Overview article",artMore:"Read the full article",artLess:"Show less",artPage:"Article page ›",artViOnly:"This article is in Vietnamese."}
};
for(const L in ART_UI)T[L]=Object.assign(T[L]||{},ART_UI[L]);
const ARTS={};let ART_FOCUS=false;
/* Link chia sẻ /bai/<slug>/ khi trang tĩnh chưa được dựng (bài vừa duyệt): Cloudflare trả index.html → chuyển về địa điểm, cuộn tới bài */
(()=>{try{const m=location.pathname.match(/^\/bai\/([a-z0-9-]+)\/?$/);if(!m)return;const id=(m[1].match(/^((?:hn|hcm|dn|north|central|south)-\d+)/)||[])[1];
  if(id){ART_FOCUS=true;history.replaceState(null,"","/#/"+id)}}catch(e){}})();
function artPick(p){const L=ARTS[p.id]||[];return L.find(a=>a.lang===lang)||L.find(a=>a.lang==="vi")||L[0]||null}
function artHtml(p){
  const a=artPick(p);if(!a)return "";
  const al=a.lang==="vi"?"vi":"en";const cv=ART.cover(a,SB.url);
  return `<article class="artbox">
    <p class="artkick">${t("artT")}${a.lang!==lang&&lang!=="vi"&&a.lang==="vi"?` · ${t("artViOnly")}`:""}</p>
    ${cv?`<img class="artcover" src="${esc(cv)}" alt="" loading="lazy">`:""}
    <h3>${esc(a.title)}</h3>${a.sapo?`<p class="artsapo">${esc(a.sapo)}</p>`:""}
    <div class="artbody clamp" id="artbody">${ART.md(a.body)}</div>
    <button type="button" class="btn sm" id="artmore">${t("artMore")}</button>
    ${ART.sourcesHtml(a,al)}
    ${ART.shareHtml(a,al)}
    <p class="artpage"><a href="${esc(ART.url(a))}">${t("artPage")}</a></p></article>`;
}
function fillArticle(p){
  const box=document.getElementById("artbox");if(!box||!cur||cur.id!==p.id)return;
  box.innerHTML=artHtml(p);if(!box.innerHTML)return;
  document.querySelector("#s-news .articles > .pending")?.remove();
  const b=document.getElementById("artbody"),m=document.getElementById("artmore");
  if(b&&m){if(b.scrollHeight<=b.clientHeight+40){b.classList.remove("clamp");m.remove()}
    else m.onclick=()=>{const o=b.classList.toggle("clamp");m.textContent=t(o?"artMore":"artLess")}}
  ART.bindShare(box,lang,toast);
  if(ART_FOCUS){ART_FOCUS=false;setTimeout(()=>document.getElementById("s-news")?.scrollIntoView({behavior:"smooth",block:"start"}),200)}
}
async function loadArticle(p){
  if(ARTS[p.id]){fillArticle(p);return}
  try{const r=await fetch(SB.url+"/rest/v1/pv_public_articles?select=*&kind=eq.overview&venue_id=eq."+encodeURIComponent(p.id),{headers:{apikey:SB.key,Authorization:"Bearer "+SB.key}});
    ARTS[p.id]=r.ok?await r.json():[];fillArticle(p)}catch(e){ARTS[p.id]=[]}
}
