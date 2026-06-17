# BACKLOG — PNE Tài Trợ Dashboard

> File này dùng để track toàn bộ tính năng đã làm, đang làm, và chờ làm.
> Claude đọc file này đầu mỗi session để nắm context nhanh.
> Cập nhật mỗi khi hoàn thành hoặc bắt đầu một task mới.

---

## 🗂️ Thông tin dự án

| | |
|---|---|
| **Dashboard** | `/Users/chiara/Documents/Claude/Projects/Tài Trợ/dashboard.html` |
| **GAS Script** | `/Users/chiara/Documents/Claude/Projects/Tài Trợ/gas_pne_taitro.js` *(trong .gitignore)* |
| **GitHub** | `https://github.com/hueptt-bit/pne-taitro` (branch: `main`) |
| **Live URL** | `https://sponsorship.phuongnameducation.com` |
| **GAS URL** | Được lưu trong dashboard dưới biến `GAS_URL` |
| **CRM API** | `https://api.phuongnameducation.com/_/sponsorship/` + `X-Api-Key: uz9a3wdn44U1EGTv` |

---

## ✅ Đã hoàn thành

### Core dashboard
- Xây dựng dashboard HTML single-file, 2 track (Trực tiếp / Test Online)
- Kanban, List view, Overview, Stats
- localStorage + GAS sync (`updatedAt` merge conflict resolution)
- Auto-sync pull mỗi 15 giây (silent — không toast khi update)
- Multi-account sync qua GAS Google Sheets

### Voucher
- Sinh mã voucher tự động (`mavoucher`, format `TTCLB001.01`)
- Section voucher trong tab Hợp đồng (qty, deadline, hanvoucher, trạng thái)
- Badge trạng thái voucher trong List view
- Filter "Có voucher" + Tab Voucher Board
- Telegram notify khi chuyển sang `chuyen_in` (gửi qua GAS)
  - Format: `Voucher 100%, SL: 2 cái`
  - Kèm hạn voucher (`hanvoucher`)

### Lịch phòng
- Tab "Lịch phòng" trong dashboard
- **API 1 (GET /api/rooms)** ✅ — `fetchRooms()` fetch danh sách phòng từ CRM, có fallback hardcoded 57 phòng
- View theo ngày + theo phòng học (tuần)

### GAS / Telegram bot
- Gmail watcher → parse email → tạo hồ sơ tự động
- Telegram bot: xác nhận in voucher (`confirm_print`), cập nhật `voucher_status` → `da_in`
- `updatedAt` stamp trên mọi `updateRecordField()` → auto-sync dashboard nhận được

### UX / feedback items (17 items — xem `feedback-review.html`)
- fb01–fb17: Tất cả đã xử lý (xem chi tiết trong feedback-review.html)

---

## 🔄 Đang làm / Tạm dừng

### ✅ Fix giật màn hình + đồng bộ nội dung hồ sơ liên tài khoản (DONE 16/06/2026)
- **Giật màn hình (dashboard.html `_autoSyncPull`):** bỏ điều kiện `(tGas===tLocal&&tGas>0)` coi timestamp bằng nhau là cập nhật, thêm chốt `JSON.stringify(localRec)!==JSON.stringify(merged)` trước khi `updatedCount++` → không còn `render()` thừa mỗi 15s (commit 59ebc33)
- **Giật cuộn về đầu (dashboard.html `render()`):** mọi re-render đều ghi đè `#content.innerHTML` tạo lại `.kb-board`/`.kb-cards` mới → reset cuộn. Đã lưu/khôi phục `scrollLeft` của `.kb-board`, `scrollTop` từng `.kb-cards` và `#content` qua `requestAnimationFrame` (commit e9cd9b7)
- **Nội dung hồ sơ không đồng bộ (gas_pne_taitro.js):** `proposalText` trước đây KHÔNG có trong `COLS` → GAS không lưu, chỉ tồn tại trên localStorage máy nhập. Đã thêm cột `proposalText` (cuối COLS để không xê dịch chỉ số cột cũ), truncate ~49k ký tự tránh giới hạn ô Sheet, và `saveAllRecords` tự ghi lại header
- **Cần làm để áp dụng:** (1) deploy lại GAS; (2) tài khoản đang giữ nội dung hồ sơ push/lưu lại 1 lần để đẩy `proposalText` lên Sheet → các tài khoản khác sync sẽ thấy

### ✅ Lịch phòng — sức chứa live, dropdown phòng trống, fix scroll (DONE 29/05/2026)
- `fetchRooms()` route qua `GAS_URL?action=getRooms` (proxy CRM `/api/rooms`) — tránh CORS
- `_roomsLoaded=false` ban đầu → tự fetch khi mở tab; fallback về hardcoded nếu GAS chưa sẵn
- Dropdown phòng trong form Tài trợ địa điểm: filter phòng trống theo `_rsScheduleCache[date]`
- Khi chọn ngày → `fetchRoomSchedule(date)` ngay để có data lọc; khi fetch xong → `renderVenueSchedules()` cập nhật dropdown
- Fix scroll giật: lưu `scrollLeft/Top` trước `main.innerHTML=...`, restore sau
- **GAS:** thêm `getRooms` action trong `doGet()` + `proxyRooms()` function

### ✅ API 2 — Lịch phòng theo ngày (DONE)
- **API:** `GET /api/room-schedule?date=YYYY-MM-DD` — proxy qua GAS
- **Flow:** Dashboard → `GAS_URL?action=getRoomSchedule&date=...` → GAS gọi CRM → trả về dashboard
- **GAS:** thêm `proxyRoomSchedule()` + `setupCrmApiKey()`, `CRM_API_KEY` lưu trong Script Properties
- **Dashboard:** `_rsScheduleCache`, `fetchRoomSchedule()`, `prefetchWeek()`, xóa `rsMockSessions` + `rsMockWeekSessions`
- **Badge:** ⏳ Đang tải / 📡 Lịch live (N buổi) / 📭 Không có lịch
- **Làm mới:** nút 🔄 clear cache và fetch lại

---

## 📋 Chờ làm

### API 3 — Cập nhật voucher lên CRM
- **API:** `POST /api/voucher`
- **Trigger:** Khi nhân viên chuyển `voucher_status` → `da_giao` (Đã giao CLB)
- **Payload:**
  ```json
  {
    "ma_voucher": "TTCLB001.01",
    "don_vi": "CLB Marketing RMIT",
    "gia_tri": 5000000,
    "so_luong": 2,
    "han_su_dung": "2026-08-31",
    "trang_thai": "da_giao_clb",
    "ngay_giao": "2026-05-27"
  }
  ```
- **Ghi chú:** `gia_tri` — chưa xác định cách tính (từ neg_items.maxVal?), cần xác nhận với IT/CRM
- **Nơi hook:** `saveRecord()` trong `dashboard.html`, ngay sau block `chuyen_in` (dòng ~3834)
- **Header:** `X-Api-Key: uz9a3wdn44U1EGTv`

### Tên miền tùy chỉnh (fb01)
- Hướng dẫn DNS trỏ `sponsorship.phuongnameducation.com` về GitHub Pages
- Không cần code, chỉ cần config DNS + GitHub Pages custom domain

---

## 🔐 Bảo mật

| Secret | Nơi lưu |
|---|---|
| Telegram bot token | GAS Script Properties: `TG_TOKEN` |
| CRM API key | Hardcoded trong `dashboard.html`: `uz9a3wdn44U1EGTv` *(cân nhắc chuyển sang GAS proxy sau)* |
| `gas_pne_taitro.js` | Đã thêm vào `.gitignore` — không commit lên GitHub |

---

## 📝 Ghi chú kỹ thuật quan trọng

- **`loadAll()`** sanitize array fields (`benefits`, `neg_items`, `neg_benefits`, `roomSponsorships`, `clbPackages`) — tránh lỗi `filter is not a function` khi data cũ lưu dạng JSON string
- **Auto-sync conflict:** dùng `updatedAt` ISO timestamp, bên nào mới hơn thắng
- **`neg_items`** có thể có `type` hoặc `label` cho voucher type — GAS dùng `i.type || i.label || '?'`
- **Git lock:** nếu lỗi `HEAD.lock`, user chạy `rm -f ".git/HEAD.lock"` trong Terminal
- **HEAD.lock path:** `/Users/chiara/Documents/Claude/Projects/Tài Trợ/.git/HEAD.lock`
