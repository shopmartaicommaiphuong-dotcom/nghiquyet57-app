# -*- coding: utf-8 -*-
# Hậu xử lý: biến Sổ tay nhúng sẵn -> index.html đồng bộ Supabase realtime.
import io, sys

SRC="/sessions/quirky-trusting-mendel/mnt/outputs/SO_TAY_NGHI_QUYET_57.html"
DST="/sessions/quirky-trusting-mendel/mnt/outputs/nghiquyet57-app/index.html"

html=io.open(SRC,encoding="utf-8-sig").read()

# 1) Gắn id vào các ảnh mục tiêu (dựa vào alt duy nhất)
reps=[
 ('alt="Trung tâm điều hành công nghệ số"','id="sb-hero" alt="Trung tâm điều hành công nghệ số"'),
 ('alt="Đề án Trung tâm Truyền thông Công nghệ số VGEA"','id="sb-poster" alt="Đề án Trung tâm Truyền thông Công nghệ số VGEA"'),
 ('alt="Viện trưởng Phạm Quốc Đông"','id="sb-vt" alt="Viện trưởng Phạm Quốc Đông"'),
 ('<div class="gallery">','<div class="gallery" id="sb-gallery">'),
]
for a,b in reps:
    n=html.count(a)
    if n!=1:
        print("CẢNH BÁO: '%s...' xuất hiện %d lần"%(a[:40],n))
    html=html.replace(a,b,1)

# 2) Bộ nạp Supabase realtime (chèn trước </body>)
LOADER=r"""
<script src="config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script>
(function(){
  if(!window.SB_URL||!window.SB_ANON||String(SB_URL).indexOf('YOUR-')>=0){return;} /* chưa cấu hình -> giữ ảnh nhúng sẵn */
  var sb=supabase.createClient(SB_URL,SB_ANON);
  var $=function(s){return document.querySelector(s);};
  var esc=function(s){return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
  function card(url,cap,no){
    var n=(no<10?'0':'')+no;
    return '<figure class="gcard reveal in"><div class="gimg"><img loading="lazy" src="'+url+'" alt="'+cap+'"></div>'+
           '<figcaption><span class="gno">'+n+'</span><span>'+cap+'</span></figcaption></figure>';
  }
  function apply(){
    sb.from('sotay_images').select('*').eq('active',true)
      .order('slot').order('display_order').order('id')
      .then(function(res){
        var data=res.data; if(res.error||!data){return;}
        function bySlot(s){return data.filter(function(r){return r.slot===s;})
          .sort(function(a,b){return (a.display_order-b.display_order)||(a.id-b.id);});}
        var h=bySlot('hero')[0],p=bySlot('poster')[0],v=bySlot('vientruong')[0],g=bySlot('gallery');
        if(h&&$('#sb-hero'))$('#sb-hero').src=h.image_url;
        if(p&&$('#sb-poster'))$('#sb-poster').src=p.image_url;
        if(v&&$('#sb-vt'))$('#sb-vt').src=v.image_url;
        if(g.length&&$('#sb-gallery')){
          $('#sb-gallery').innerHTML=g.map(function(r,i){return card(esc(r.image_url),esc(r.title||''),i+1);}).join('');
        }
      });
  }
  apply();
  sb.channel('sotay-live').on('postgres_changes',
    {event:'*',schema:'public',table:'sotay_images'}, apply).subscribe();
})();
</script>
"""
html=html.replace("</body>", LOADER+"\n</body>",1)

io.open(DST,"w",encoding="utf-8-sig").write(html)
print("Đã tạo index.html:", len(html), "bytes")
