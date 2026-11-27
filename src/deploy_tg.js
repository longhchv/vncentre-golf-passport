/* Chạy trong tab Cloudflare Pages "Create deployment" (tapgolf). Gom đủ tệp rồi đưa vào ô chọn tệp:
   index.html, _headers, og-tapgolf.jpg (từ nhánh tapgolf-site theo SHA), around.json (lấy từ trang đang chạy),
   bai/<slug>/index.html dựng mới từ pv_public_articles (mọi bài đã duyệt).
   Dùng: await tgCollect('<sha>')  → trả về danh sách tệp; sau đó bấm "Save and deploy". */
async function tgCollect(sha){
  const RAW="https://raw.githubusercontent.com/longhchv/vncentre-golf-passport/"+sha+"/";
  const SB={url:"https://zrfipnqkjrhzrscaaeth.supabase.co",key:"sb_publishable_Av1bNAWdHq5SZQSl-JtkQA_PgK6fI-m"};
  const get=async(u,kind)=>{const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error(u+" → "+r.status);return kind==="blob"?r.blob():r.text()};
  const [index,headers,og,core,page,around]=await Promise.all([
    get(RAW+"index.html"),get(RAW+"_headers"),get(RAW+"og-tapgolf.jpg","blob"),get(RAW+"src/artcore.js"),get(RAW+"src/baipage.js"),
    get("https://tapgolf.vncentre.net/around.json")]);
  JSON.parse(around);
  const ART=new Function(core.replace('if(typeof module!=="undefined")module.exports=ART;',"")+";return ART")();
  const P=new Function(page.replace('if(typeof module!=="undefined")module.exports={baiPage,baiFiles};',"")+";return {baiFiles}")();
  const r=await fetch(SB.url+"/rest/v1/pv_public_articles?select=*",{headers:{apikey:SB.key,Authorization:"Bearer "+SB.key}});
  const arts=r.ok?await r.json():[];
  const mk=(path,data,type)=>{const f=new File([data],path.split("/").pop(),{type});
    if(path.includes("/"))Object.defineProperty(f,"webkitRelativePath",{value:"tapgolf/"+path});return f};
  const files=[mk("index.html",index,"text/html"),mk("_headers",headers,"text/plain"),mk("og-tapgolf.jpg",og,"image/jpeg"),mk("around.json",around,"application/json"),
    ...P.baiFiles(arts,SB.url,ART).map(x=>mk(x.path,x.html,"text/html"))];
  return files;
}
