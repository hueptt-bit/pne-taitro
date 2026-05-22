# 📬 Hướng dẫn Make.com — Gmail → Telegram realtime

## Tại sao Make.com thay vì Apps Script?

| |Apps Script (trigger)|Make.com|
|---|---|---|
|Tốc độ|Mỗi giờ kiểm tra 1 lần|Mỗi 15 phút (free) hoặc tức thì (paid)|
|Cài đặt|Cần code Google Apps Script|Kéo thả, không cần code|
|Độ ổn định|Phụ thuộc Google quota|Chạy trên cloud độc lập|
|Giá|Miễn phí|Free: 1.000 operations/tháng|

---

## Bước 1: Tạo tài khoản Make.com

1. Vào **[make.com](https://make.com)** → **Sign up free**
2. Đăng ký bằng Gmail (dùng cùng tài khoản Google với hộp thư tài trợ)
3. Xác nhận email → vào dashboard

---

## Bước 2: Tạo Scenario mới

1. Nhấn **Create a new scenario**
2. Giao diện sẽ hiện một vòng tròn trống — đây là nơi bạn kéo thả các module

---

## Bước 3: Thêm module Gmail (Watch Emails)

1. Nhấn vào vòng tròn **"+"** → tìm kiếm **Gmail**
2. Chọn trigger: **Watch Emails**
3. Kết nối tài khoản Google:
   - Nhấn **Add** → đăng nhập Google → cho phép quyền đọc Gmail
4. Cấu hình filter:

   | Trường | Giá trị |
   |--------|---------|
   | Folder | `INBOX` |
   | Criteria | `All email` |
   | Maximum number of results | `5` |

5. Nhấn **OK**

> 💡 **Mẹo**: Sau khi tạo xong, bạn có thể thêm filter từ khoá bên dưới để lọc chính xác hơn.

---

## Bước 4: Thêm module Filter (lọc email tài trợ)

1. Nhấn dấu **"+"** sau module Gmail → chọn **Filter** (không phải module, là hình chiếc phễu trên đường nối)
2. Nhấn vào đường nối giữa Gmail và Telegram → **Set up a filter**
3. Cấu hình:

   ```
   Label: Chỉ lấy email tài trợ
   Condition: Subject | Contains (case insensitive) | tài trợ
   ```

4. Thêm điều kiện **OR**:
   - `Subject` Contains `hợp tác`
   - `Subject` Contains `sponsorship`
   - `Subject` Contains `tài trợ`
   - `From` Contains `[domain các CLB quen thuộc]` (tuỳ chọn)

5. Nhấn **OK**

---

## Bước 5: Thêm module Telegram (Send a Message)

1. Nhấn **"+"** → tìm **Telegram Bot**
2. Chọn action: **Send a Message**
3. Kết nối Bot:
   - Nhấn **Add** → nhập **Bot Token** từ BotFather (xem `HUONG_DAN_CAI_DAT.md`)
4. Cấu hình tin nhắn:

   | Trường | Giá trị |
   |--------|---------|
   | Chat ID | `[Chat ID của bạn]` |
   | Text | Xem mẫu bên dưới |

**Mẫu tin nhắn Telegram** (copy-paste vào trường Text, dùng dynamic values):

```
🔔 EMAIL TÀI TRỢ MỚI

📧 Từ: {{1.from.name}} <{{1.from.address}}>
📌 Tiêu đề: {{1.subject}}
🕐 Nhận lúc: {{formatDate(1.date; "DD/MM/YYYY HH:mm")}}

📝 Nội dung tóm tắt:
{{substring(1.snippet; 0; 300)}}…

🔗 Xem Gmail: {{1.webLink}}
```

> Các giá trị `{{1.from.name}}`, `{{1.subject}}`... là dynamic variables từ Gmail module. Nhấn vào trường Text rồi chọn từ danh sách hiện ra.

---

## Bước 6: Đặt lịch chạy

1. Nhấn vào **đồng hồ** ở góc dưới trái của module Gmail
2. Chọn tần suất:
   - **Free plan**: `15 minutes` (kiểm tra mỗi 15 phút)
   - **Core plan ($9/tháng)**: `1 minute` hoặc `Immediately when email arrives`

3. Nhấn **OK**

---

## Bước 7: Kích hoạt & Test

1. Nhấn **Run once** (góc dưới trái) để test thủ công
2. Gửi một email test vào hộp thư Gmail với tiêu đề chứa "tài trợ"
3. Kiểm tra Telegram — nếu nhận được tin → thành công!
4. Bật **Scheduling** (toggle ở góc dưới trái) → **ON**
5. Nhấn **Save** (Ctrl+S)

---

## Nâng cao: Thêm bước tạo tracking tự động

Sau module Telegram, thêm tiếp:

1. **"+"** → **Google Sheets** → **Add a Row**
2. Kết nối Google Sheet thống kê chính
3. Map các cột:
   - `org` → `{{1.from.name}}`
   - `notes` → `{{1.subject}}`
   - `stage` → `prospect` (cố định)
   - `year` → `{{formatDate(now; "YYYY")}}`

→ Email mới sẽ tự động thêm vào sheet để bạn điền tiếp thông tin.

---

## Sơ đồ scenario hoàn chỉnh

```
[Gmail: Watch Emails]
       ↓
  [Filter: keywords]
       ↓
[Telegram: Send Message]
       ↓
[Google Sheets: Add Row]  ← tuỳ chọn
```

---

## Câu hỏi thường gặp

**Q: Tôi dùng Google Workspace (email công ty), có cài được không?**
A: Được. Khi kết nối Google account ở bước 3, chọn tài khoản Workspace là xong.

**Q: Free plan đủ dùng không?**
A: Đủ. 1.000 operations/tháng — nếu nhận 10 email tài trợ/ngày × 30 ngày = 300 operations. Còn dư nhiều.

**Q: Muốn nhận thông báo vào group Telegram thay vì chat riêng?**
A: Thêm bot vào group → lấy Chat ID của group (số âm, VD: `-1001234567890`) → điền vào Chat ID.

**Q: Có thể thông báo vào nhiều kênh cùng lúc không?**
A: Có. Thêm nhiều module Telegram tiếp theo (mỗi module là một chat/group khác nhau).

---

## Lưu ý bảo mật

- Bot Token là thông tin nhạy cảm — không chia sẻ scenario với người ngoài
- Make.com mã hoá credentials — an toàn hơn lưu trong Apps Script
- Nếu muốn thu hồi quyền: Make.com → Connections → Xoá kết nối Gmail/Telegram
