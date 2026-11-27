/* Chạy trong tab Cloudflare Pages "Create deployment" (tapgolf). Gom đủ tệp rồi đưa vào ô chọn tệp:
   index.html, _headers, og-tapgolf.jpg (từ nhánh tapgolf-site theo SHA), around.json (lấy từ trang đang chạy),
   bai/<slug>/index.html dựng mới từ pv_public_articles (mọi bài đã duyệt).
   Dùng: const files=await tgCollect('<sha>'); đưa vào input[webkitdirectory] bằng DataTransfer + sự kiện change;
   chờ "n/n files uploaded" rồi mới bấm "Save and deploy" (thiếu index.html mà deploy là web trắng). */
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
  /* Trình tải của Cloudflare dựa vào đường dẫn thư mục: mọi tệp phải có webkitRelativePath "tapgolf/<đường dẫn>",
     thiếu thì các tệp trùng khoá và kẹt ở "1/n files uploaded" (đã gặp 27/11/2026). Thư mục gốc "tapgolf/" bị bỏ khi đưa lên. */
  const mk=(path,data,type)=>{const f=new File([data],path.split("/").pop(),{type});
    Object.defineProperty(f,"webkitRelativePath",{value:"tapgolf/"+path});return f};
  const files=[mk("index.html",index,"text/html"),mk("_headers",headers,"text/plain"),mk("og-tapgolf.jpg",og,"image/jpeg"),mk("around.json",around,"application/json"),
    ...P.baiFiles(arts,SB.url,ART).map(x=>mk(x.path,x.html,"text/html"))];
  return files;
}
