# 🚀 Hướng dẫn cài đặt tự động hoá PNE Tài Trợ

## Tổng quan

Bạn sẽ có 3 tính năng tự động:
1. **Gmail → Telegram**: Email tài trợ mới → nhận thông báo Telegram ngay
2. **Hợp đồng → Tracking Sheet**: Paste link Google Docs → file tracking tự tạo với đầy đủ quyền lợi
3. **Dashboard → Google Sheets**: Sync 2 chiều giữa dashboard và file thống kê

---

## Bước 1: Tạo Telegram Bot (5 phút)

1. Mở Telegram, tìm **@BotFather**
2. Nhắn `/newbot` → đặt tên bot (vd: `PNE Tài Trợ Bot`)
3. Copy **Bot Token** (dạng `1234567890:ABCdef...`)
4. Nhắn bất kỳ cho bot vừa tạo
5. Mở link này (thay YOUR_TOKEN): `https://api.telegram.org/botYOUR_TOKEN/getUpdates`
6. Tìm `"chat":{"id":` → copy số đó (đây là **Chat ID**)

---

## Bước 2: Cài đặt Google Apps Script (10 phút)

1. Vào [script.google.com](https://script.google.com) → **New project**
2. Xoá code mẫu, paste toàn bộ nội dung file `PNE_Automation.gs`
3. Điền thông tin vào phần **CONFIG** đầu file:
   ```javascript
   TELEGRAM_BOT_TOKEN: '1234567890:ABCdef...',  // Token từ BotFather
   TELEGRAM_CHAT_ID: '123456789',               // Chat ID ở bước trên
   MASTER_SHEET_ID: '1KK4Et...',                // Giữ nguyên (đã có sẵn)
   ```
4. **Lưu project** (Ctrl+S), đặt tên: `PNE Tài Trợ Automation`
5. Chọn hàm **`setupTriggers`** → nhấn **Run** → cho phép quyền khi được hỏi
6. Kiểm tra: nếu Telegram nhận được tin "Bot đã sẵn sàng!" → thành công!

---

## Bước 3: Deploy Web App (cho sync 2 chiều)

1. Trong Apps Script: **Deploy** → **New deployment**
2. Chọn type: **Web app**
3. Cài đặt:
   - Execute as: **Me**
   - Who has access: **Anyone** *(cần để dashboard gọi được)*
4. Nhấn **Deploy** → copy **Web App URL**
5. Mở file `dashboard.html`, tìm dòng:
   ```javascript
   const GAS_URL = ''; // Dán URL vào đây
   ```
   Dán URL vừa copy vào

---

## Bước 4: Cài đặt Sheet thống kê chính

Để sync hoạt động, sheet thống kê cần có các cột header:

| id | year | org | prog | date | cat | stage | totalValue | cashValue | voucherCode | voucherExpiry | trackingUrl | contractUrl | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

> **Gợi ý**: Dùng tính năng **Xuất CSV** trong dashboard → mở bằng Google Sheets → đây sẽ là cấu trúc đúng.

---

## Cách dùng hàng ngày

### Tạo tracking sheet từ hợp đồng
Trong Apps Script, mở **console** (Ctrl+Shift+I) và chạy:
```javascript
createTrackingFromContract(
  'https://docs.google.com/document/d/YOUR_CONTRACT_ID',
  'Tên CLB / Đơn vị',
  'Tên chương trình'
)
```
→ Bot Telegram sẽ gửi link tracking vừa tạo cho bạn

### Kiểm tra Gmail thủ công
Chạy hàm `testGmailScan()` trong Apps Script

### Test Telegram
Chạy hàm `testTelegram()` → nếu nhận được tin → OK

---

## Câu hỏi thường gặp

**Q: Bot không nhận được email?**
A: Kiểm tra từ khoá trong `CONFIG.GMAIL_KEYWORDS`. Thêm từ khoá phù hợp với cách các CLB thường đặt tiêu đề email.

**Q: Không trích được quyền lợi từ hợp đồng?**
A: Script tìm phần "Quyền lợi Nhà Tài Trợ" trong hợp đồng. Nếu hợp đồng dùng tên khác (vd: "Quyền lợi của NTT"), chỉnh hàm `extractBenefits()`.

**Q: Dashboard không sync được với Sheets?**
A: Kiểm tra Web App URL đã điền đúng chưa. Đảm bảo deployment là "Anyone" (không phải "Anyone with Google account").

---

## Lưu ý bảo mật

- Bot Token là thông tin nhạy cảm, **không chia sẻ** file `.gs` với người khác khi đã điền token
- Web App URL có thể đọc/ghi data của bạn — chỉ chia sẻ với người tin tưởng
- Để xoá quyền truy cập: vào Apps Script → Manage deployments → Xoá deployment
