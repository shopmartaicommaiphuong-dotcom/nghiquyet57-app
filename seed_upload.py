# -*- coding: utf-8 -*-
"""
NẠP 21 ẢNH GỐC LÊN SUPABASE (chạy 1 lần để có dữ liệu ban đầu).
Cách chạy:
    export SUPABASE_URL="https://xxxx.supabase.co"
    export SUPABASE_SERVICE_KEY="eyJ...service_role..."   # KHOÁ BÍ MẬT, chỉ dùng ở máy
    python3 seed_upload.py
Chạy lại nhiều lần vẫn an toàn (ghi đè, không nhân đôi).
"""
import os, sys, unicodedata, re, requests

URL = os.environ.get("SUPABASE_URL","").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY","")
UP  = os.environ.get("UPLOADS_DIR","/sessions/quirky-trusting-mendel/mnt/uploads")
if not URL or not KEY:
    sys.exit("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY (biến môi trường).")

BUCKET="sotay"
H_STORE={"Authorization":f"Bearer {KEY}","apikey":KEY}
H_REST ={"Authorization":f"Bearer {KEY}","apikey":KEY,"Content-Type":"application/json"}

def slug(s):
    s=unicodedata.normalize("NFD",s).encode("ascii","ignore").decode()
    s=re.sub(r"[^a-zA-Z0-9]+","-",s).strip("-").lower()
    return s[:48] or "img"

# (slot, title, filename, order)
ITEMS=[
 ("hero","Trung tâm điều hành công nghệ & chuyển đổi số — Viện AVG",
   "1788098345950_8191439904494631813_8191439904494631813_11cf46a4325edb42a2cf8a5e70ad720d.jpg",1),
 ("poster","Đề án Trung tâm Truyền thông Công nghệ số VGEA",
   "1788163708204_8191439904494631813_8191439904494631813_9bc7b27ca2538b1c0600b5298b17203f.jpg",1),
 ("vientruong","Viện trưởng Phạm Quốc Đông","Ảnh Viện trường.jpg",1),
]
GAL=[
 ("Kế hoạch xây dựng & triển khai chuyển đổi số cấp xã/phường","1. KH xây dựng và triển khai CĐS xã - phường.jpg"),
 ("Nghị quyết 57 ở cấp xã/phường — cầm tay chỉ việc","2. NQ 57 ở cấp xã - phường.jpg"),
 ("Cán bộ phải làm được 5 việc","3. NQ 57 - cán bộ phải làm 5 việc.jpg"),
 ("Nghị quyết 57 chỉ tạo giá trị khi có dữ liệu để đo lường","4. NQ 57 tạo ra kho dữ liệu đo lường.jpg"),
 ("Kế hoạch triển khai chuyển đổi số cấp xã/phường","5. KH triển khai CĐS cấp xã phường.jpg"),
 ("Tài liệu tham chiếu Nghị quyết 57 (11 văn bản pháp lý)","6. Tài liệu Tham chiếu Nghị quyết 57.jpg"),
 ("Khung 54 KPI · 9 nhóm · 1 đích đến (bản tham khảo)","7. KPI 54 - 9 nhóm - 1 đích.jpg"),
 ("Nghị quyết 57 yêu cầu gì đối với giáo dục?","8. NQ57 đối với Giáo dục.jpg"),
 ("AI sẽ thay đổi nghề giáo ra sao?","9. Ai sẽ Thay đổi ra sao.jpg"),
 ("Sổ tay giám sát Nghị quyết 57 (HĐND phường/xã)","10. Sổ tay giám sát NQ 57.jpg"),
 ("Xây dựng Đề án chuyển đổi số – KHCN – ĐMST cấp phường/xã","11. Xây dựng Đề án CĐS KHCN - ĐMST.jpg"),
 ("Tương lai chuyển đổi số của Việt Nam quyết định tại từng xã/phường","12. Tương lai CĐS của Việt Nam.jpg"),
 ("Thách thức lớn nhất sau khi bỏ cấp huyện","13. Thách thức lớn nhất bỏ cấp Huyện.jpg"),
 ("Nghị quyết 57 thực chất nói gì? (tảng băng 7 nội dung)","14. Thực chất NQ 57 nói gì.jpg"),
 ("Chuyển đổi số thực chất là gì?","15. CĐS thực chất là gì.jpg"),
 ("Mục tiêu cuối cùng của chuyển đổi số","16. Mục tiêu của CĐS.jpg"),
 ("Chuyển đổi số để xây dựng phường/xã xã hội chủ nghĩa","17. CĐS xây dựng xã phường - Xã hội chủ nghĩa.jpg"),
 ("Bài học tham khảo: sự tiến hóa của ngành IT Ấn Độ","19. Sự tiến hoá của IT Ấn Độ.jpg"),
]
for i,(t,fn) in enumerate(GAL,1):
    ITEMS.append(("gallery",t,fn,i))

def upload(path, fn):
    fp=os.path.join(UP,fn)
    if not os.path.exists(fp): print("  ! thiếu file:",fn); return None
    data=open(fp,"rb").read()
    u=f"{URL}/storage/v1/object/{BUCKET}/{path}"
    r=requests.post(u,headers={**H_STORE,"Content-Type":"image/jpeg","x-upsert":"true"},data=data)
    if r.status_code not in (200,201):
        print("  ! upload lỗi",r.status_code,r.text[:120]); return None
    return f"{URL}/storage/v1/object/public/{BUCKET}/{path}"

# 1) Xoá sạch bảng cũ (idempotent)
requests.delete(f"{URL}/rest/v1/sotay_images?id=gt.0",headers=H_REST)
print("Đã dọn bảng cũ. Bắt đầu nạp %d ảnh…"%len(ITEMS))

# 2) Upload + insert
n=0
for slot,title,fn,order in ITEMS:
    ext="jpg"
    if slot=="gallery": path=f"gallery/{order:02d}-{slug(title)}.{ext}"
    else:               path=f"{slot}/{slot}.{ext}"
    url=upload(path,fn)
    if not url: continue
    row={"slot":slot,"title":title,"image_url":url,"storage_path":path,"display_order":order,"active":True}
    r=requests.post(f"{URL}/rest/v1/sotay_images",headers={**H_REST,"Prefer":"return=minimal"},json=row)
    if r.status_code in (200,201): n+=1; print(f"  ✓ [{slot}] {title[:44]}")
    else: print("  ! insert lỗi",r.status_code,r.text[:120])

print(f"\nXONG. Đã nạp {n}/{len(ITEMS)} ảnh. Mở Dashboard admin.html để quản lý.")
