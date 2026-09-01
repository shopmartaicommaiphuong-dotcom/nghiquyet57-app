# Sổ tay Nghị quyết 57 + Dashboard Super Admin (đồng bộ realtime)

Hai trang dùng chung 1 kho Supabase. Admin đổi ảnh ở Dashboard → Sổ tay tự cập nhật **tức thì** trên mọi máy, mọi điện thoại.

```
nghiquyet57-app/
├─ index.html          ← SỔ TAY (công khai cho mọi người xem)
├─ admin.html          ← DASHBOARD SUPER ADMIN (chỉ mình anh đăng nhập)
├─ config.js           ← điền URL + anon key Supabase (dùng chung)
├─ supabase_schema.sql ← chạy 1 lần để tạo bảng + kho ảnh
├─ seed_upload.py      ← nạp sẵn 21 ảnh gốc
└─ vercel.json
```

## Các ô ảnh Dashboard quản lý
- **Hero** (ảnh đầu trang) · **Poster Đề án** · **Ảnh Viện trưởng** — mỗi ô 1 ảnh, bấm *Thay ảnh*.
- **Thư viện “Tìm hiểu NQ57”** — thêm/bớt/sắp thứ tự/ẩn-hiện bao nhiêu ảnh tùy ý.

---

## 6 BƯỚC CÀI ĐẶT

**1. Tạo dự án Supabase (miễn phí)**
Vào https://supabase.com → *New project* → đặt tên (vd `nghiquyet57`), chọn vùng Singapore, đặt mật khẩu database.

**2. Tạo bảng + kho ảnh**
Mở **SQL Editor** → *New query* → dán toàn bộ `supabase_schema.sql` → **Run**.

**3. Tạo tài khoản Admin**
**Authentication → Users → Add user** → nhập email + mật khẩu (đây chính là tài khoản đăng nhập Dashboard). Bật *Auto Confirm*.

**4. Lấy khóa & điền vào `config.js`**
**Project Settings → API** → copy **Project URL** và **anon public** → dán vào `config.js`:
```js
window.SB_URL  = "https://xxxx.supabase.co";
window.SB_ANON = "eyJ... (anon public) ...";
```
> `anon` là khóa công khai — an toàn để lộ. TUYỆT ĐỐI không đưa khóa `service_role` vào `config.js`.

**5. Nạp 21 ảnh ban đầu** (chọn 1 trong 2 cách)
- *Cách nhanh:* mở `admin.html`, đăng nhập, bấm **＋ Thêm ảnh** / **Thay ảnh** rồi tải ảnh lên.
- *Cách tự động:* chạy script (cần khóa `service_role` ở **Project Settings → API**):
```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_KEY="eyJ...service_role..."
python3 seed_upload.py
```

**6. Đưa lên tên miền `nghiquyet57.ngoclinh.shopmartai.com`**
- Đẩy cả thư mục lên GitHub (repo mới, vd `nghiquyet57`).
- Vào https://vercel.com → *Add New → Project* → *Import* repo → **Deploy** (không cần cấu hình build, đây là web tĩnh).
- **Settings → Domains** → thêm `nghiquyet57.ngoclinh.shopmartai.com`.
- Vào nơi quản lý DNS của `shopmartai.com`, thêm bản ghi **CNAME**: `nghiquyet57` → `cname.vercel-dns.com`. Chờ vài phút cho DNS.

---

## Truy cập
- **Sổ tay (mọi người):** `https://nghiquyet57.ngoclinh.shopmartai.com/`
- **Dashboard (mình anh):** `https://nghiquyet57.ngoclinh.shopmartai.com/admin.html`

## Cơ chế đồng bộ
Sổ tay và Dashboard đều lắng nghe Supabase Realtime. Anh đổi/thêm/xóa ảnh ở Dashboard → tất cả trình duyệt đang mở Sổ tay tự đổi ngay, không cần tải lại. Khi mất mạng, Sổ tay hiển thị bộ ảnh nhúng sẵn để không bao giờ trắng trang.
