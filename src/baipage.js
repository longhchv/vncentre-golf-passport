/* ===== Spec 30: dựng trang tĩnh /bai/<slug>/index.html cho từng bài đã duyệt =====
   Trang tĩnh để Facebook, Zalo đọc được ảnh + tiêu đề (thẻ OG) và để Google lập chỉ mục.
   Chạy được ở Node (thử) và trong trình duyệt lúc đưa tapgolf lên (cần ART từ artcore.js). */
function baiPage(a,sbUrl,ART){
  const e=ART.esc,lang=a.lang==="vi"?"vi":"en",SITE=ART.SITE,u=ART.url(a);
  const img=ART.cover(a,sbUrl)||SITE+"/og-tapgolf.jpg";
  const desc=a.sapo||ART.plain(a.body,200);
  const venueUrl=SITE+"/#/"+a.venue_id;
  const pub=(a.published_at||a.updated_at||"").slice(0,19),mod=(a.updated_at||a.published_at||"").slice(0,19);
  const ld={"@context":"https://schema.org","@type":"Article",headline:a.title,description:desc,image:[img],datePublished:pub,dateModified:mod,inLanguage:a.lang,
    mainEntityOfPage:u,author:{"@type":"Organization",name:"VN Centre",url:"https://vncentre.net"},publisher:{"@type":"Organization",name:"VN Centre",url:"https://vncentre.net"},
    about:{"@type":"SportsActivityLocation",name:a.venue_name,url:venueUrl}};
  const TX=lang==="vi"
    ?{site:"Sân tập golf toàn quốc",crumb:"Sân tập golf",cta:"Xem giá, giờ vắng, bản đồ và chỉ đường",ctaSub:"Thông tin chi tiết của {n} trên trang VN Centre",more:"Tìm sân tập khác",foot:"VN Centre · Golf Education · vncentre.net"}
    :{site:"Golf practice across Vietnam",crumb:"Golf practice",cta:"See prices, quiet hours, map and directions",ctaSub:"Full details for {n} on VN Centre",more:"Find other practice venues",foot:"VN Centre · Golf Education · vncentre.net"};
  return `<!doctype html>
<html lang="${e(a.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#3a1f0c">
<title>${e(a.title)} · VN Centre</title>
<meta name="description" content="${e(desc)}">
<link rel="canonical" href="${e(u)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="VN Centre · ${e(TX.site)}">
<meta property="og:locale" content="${lang==="vi"?"vi_VN":"en_US"}">
<meta property="og:url" content="${e(u)}">
<meta property="og:title" content="${e(a.title)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:image" content="${e(img)}">
${img.endsWith("/og-tapgolf.jpg")?'<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n':""}<meta property="og:image:alt" content="${e(a.venue_name)}">
${pub?`<meta property="article:published_time" content="${e(pub)}">\n`:""}${mod?`<meta property="article:modified_time" content="${e(mod)}">\n`:""}<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g,"\\u003c")}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap">
<style>
:root{--brand:#3a1f0c;--on-brand:#fbf3e6;--accent:#f1ab50;--accent-2:#c57b2f;--on-accent:#2a1607;--bg:#faf7f2;--surface:#fff;--surface-2:#f4eee5;--ink:#2b2118;--muted:#6f655b;--line:#e7ded1;--serif:"Playfair Display",Georgia,serif;--sans:"Be Vietnam Pro",system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:17px;line-height:1.7;-webkit-font-smoothing:antialiased}
header{background:var(--brand);color:var(--on-brand)}
header a{display:block;max-width:760px;margin:0 auto;padding:12px 16px;color:inherit;text-decoration:none}
header b{font-family:var(--serif);font-size:18px;letter-spacing:.02em;display:block;line-height:1.1}header small{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.8}
main{max-width:760px;margin:0 auto;padding:20px 16px 40px}
.crumb{font-size:13px;color:var(--muted);margin:0 0 12px}.crumb a{color:inherit}
.cover{display:block;width:100%;aspect-ratio:1.91/1;object-fit:cover;border-radius:14px;background:var(--surface-2);margin:0 0 18px}
h1{font-family:var(--serif);font-size:clamp(28px,5vw,40px);line-height:1.15;margin:0 0 12px;text-wrap:balance}
.sapo{font-size:19px;font-weight:600;line-height:1.55;margin:0 0 18px}
.body h2{font-family:var(--serif);font-size:24px;line-height:1.25;margin:28px 0 8px}.body h3{font-size:18px;margin:20px 0 6px}
.body p{margin:0 0 14px}.body ul,.body ol{margin:0 0 14px;padding-left:22px}.body li{margin:5px 0}.body a{color:var(--accent-2);font-weight:600}
.cta{display:block;margin:26px 0;padding:16px 18px;border-radius:14px;background:var(--brand);color:var(--on-brand);text-decoration:none}
.cta b{display:block;font-size:17px}.cta span{font-size:14px;opacity:.85}
.artsrc{margin:24px 0 0;padding:14px 0 0;border-top:1px solid var(--line);font-size:14px;color:var(--muted);line-height:1.55}
.artsrc ul{margin:6px 0;padding-left:18px}.artsrc p{margin:4px 0}.artsrc a{color:inherit;font-weight:600}.artneeds{color:#8a5a12}
.artshare{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}
.btn{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 16px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);font:600 15px var(--sans);text-decoration:none;cursor:pointer}
.btn:hover{border-color:var(--accent-2)}
.more{margin:22px 0 0;font-size:15px}.more a{color:var(--accent-2);font-weight:600}
footer{max-width:760px;margin:0 auto;padding:18px 16px 32px;font-size:13px;color:var(--muted);border-top:1px solid var(--line)}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none}#toast.on{opacity:1}
</style>
</head>
<body>
<header><a href="${SITE}/"><b>VN CENTRE</b><small>${e(TX.site)}</small></a></header>
<main>
<p class="crumb"><a href="${SITE}/">${e(TX.crumb)}</a> › <a href="${e(venueUrl)}">${e(a.venue_name)}</a></p>
<article>
${ART.cover(a,sbUrl)?`<img class="cover" src="${e(img)}" alt="${e(a.venue_name)}">`:""}
<h1>${e(a.title)}</h1>
${a.sapo?`<p class="sapo">${e(a.sapo)}</p>`:""}
<div class="body">
${ART.md(a.body)}
</div>
<a class="cta" href="${e(venueUrl)}"><b>${e(TX.cta)} ›</b><span>${e(TX.ctaSub.replace("{n}",a.venue_name))}</span></a>
${ART.sourcesHtml(a,lang)}
${ART.shareHtml(a,lang)}
</article>
<p class="more"><a href="${SITE}/">${e(TX.more)} ›</a></p>
</main>
<footer>${e(TX.foot)}</footer>
<div id="toast" role="status" aria-live="polite"></div>
<script>
(function(){var t=document.getElementById("toast");function toast(m){t.textContent=m;t.classList.add("on");clearTimeout(toast.h);toast.h=setTimeout(function(){t.classList.remove("on")},1800)}
document.querySelectorAll(".artshare [data-art]").forEach(function(b){b.onclick=function(){var box=b.closest(".artshare"),u=box.dataset.url,ti=box.dataset.title;
function copy(){(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(function(){toast(${JSON.stringify(ART.tr(lang,"copied"))})},function(){toast(u)})}
if(b.dataset.art==="share"&&navigator.share){navigator.share({title:ti,url:u}).catch(function(e){if(!e||e.name!=="AbortError")copy()})}else copy()}})})();
</script>
</body>
</html>
`;
}
/* Trả về danh sách tệp cần đưa lên: [{path:"bai/<slug>/index.html", html}] */
function baiFiles(articles,sbUrl,ART){return articles.filter(a=>a&&a.slug&&/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)).map(a=>({path:"bai/"+a.slug+"/index.html",html:baiPage(a,sbUrl,ART)}))}
if(typeof module!=="undefined")module.exports={baiPage,baiFiles};
