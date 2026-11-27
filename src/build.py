#!/usr/bin/env python3
"""Dựng trang sân tập. SB_URL/SB_KEY (tuỳ chọn) bật đọc dữ liệu sống từ Supabase; thiếu thì chỉ dùng dữ liệu nhúng."""
import json, os, sys
T = open('template2.html').read()
d = json.load(open('all.json'))
for p in d['hn']:
    if 'Ocean Park' in p['name']: p['residents'] = True
sb = {"url": os.environ.get('SB_URL', ''), "key": os.environ.get('SB_KEY', '')}
out = (T.replace('/*BRANDS*/', open('brands.js').read()).replace('/*LM*/', open('lm.js').read())
        .replace('/*DATA*/{}', json.dumps(d, ensure_ascii=False)).replace('/*SB*/{url:"",key:""}', json.dumps(sb)))
out = out.replace('/*GD2*/', open('gd2.js').read().replace('/*CJK*/', open('i18n_cjk.js').read()), 1)
# Spec 30: bài viết tổng quan (lõi dùng chung với trang /bai/<slug>/ + phần gắn vào trang chi tiết)
out = out.replace('/*ARTCORE*/', open('artcore.js').read().replace('if(typeof module!=="undefined")module.exports=ART;', ''), 1).replace('/*ARTAPP*/', open('art_app.js').read(), 1)
if sb['url']:
    # Trang chạy riêng (tapgolf.vncentre.net): cần đủ khung tài liệu — thiếu viewport thì điện thoại hiển thị như máy tính, chữ rất nhỏ
    head_end = out.index('</style>') + len('</style>')
    out = ('<!doctype html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n'
           '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
           '<meta name="theme-color" content="#3a1f0c">\n'
           + out[:head_end] + '\n</head>\n<body>\n' + out[head_end:] + '\n</body>\n</html>\n')
for f in sys.argv[1:] or ['golf-practice-hanoi.html']:
    open(f, 'w').write(out)
print(len(out), 'live' if sb['url'] and sb['key'] else 'embedded-only')
