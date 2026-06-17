# Email gửi Team IT — Setup Hosting + Auto-deploy

---

**To:** IT Team  
**Subject:** Nhờ setup hosting subdomain + auto-deploy từ GitHub

---

Anh/chị IT ơi,

Em cần nhờ anh/chị setup một trang web tĩnh trên hosting công ty và kết nối auto-deploy từ GitHub. Chi tiết như sau:

---

## 1. Tạo subdomain

- **Subdomain:** `sponsorship.phuongnameducation.com`
- **Bật HTTPS/SSL** cho subdomain này

---

## 2. Clone repo về server (chạy 1 lần duy nhất)

```bash
cd /var/www/sponsorship
git clone https://github.com/hueptt-bit/pne-taitro.git .
```

> File cần phục vụ là `dashboard.html` nằm ở root của repo.  
> Truy cập `https://sponsorship.phuongnameducation.com/dashboard.html` là mở được trang.

---

## 3. Tạo script webhook để auto-deploy

Tạo file `deploy.php` trong thư mục web (`/var/www/sponsorship/deploy.php`):

```php
<?php
$secret = 'THAY_BẰNG_CHUỖI_BÍ_MẬT_TỰ_ĐẶT'; // anh/chị tự đặt, ví dụ: pne_deploy_2026

$payload = file_get_contents('php://input');
$sig     = 'sha256=' . hash_hmac('sha256', $payload, $secret);

if (!hash_equals($sig, $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '')) {
    http_response_code(401);
    die('Unauthorized');
}

$data = json_decode($payload, true);
if (($data['ref'] ?? '') !== 'refs/heads/main') {
    die('Not main branch, skipping.');
}

exec('cd /var/www/sponsorship && git pull origin main 2>&1', $output);
file_put_contents(__DIR__ . '/deploy.log', date('Y-m-d H:i:s') . "\n" . implode("\n", $output) . "\n\n", FILE_APPEND);

http_response_code(200);
echo 'Deploy OK';
```

> Sau khi tạo xong, anh/chị cho em biết **chuỗi bí mật** đã đặt để em điền vào GitHub.

---

## 4. Yêu cầu kỹ thuật bổ sung

- Web server (Nginx/Apache) cần cho phép chạy file `deploy.php`
- Server cần có **git** đã cài sẵn
- User chạy web server cần có quyền đọc/ghi thư mục `/var/www/sponsorship/`
- File HTML gọi ra `script.google.com` — **không cần cấu hình CORS** phía server

---

## 5. Sau khi setup xong

Em sẽ tự vào GitHub đăng ký webhook — anh/chị không cần làm thêm gì. Từ đó về sau mỗi lần em cập nhật code, server sẽ tự động kéo file mới về mà không cần upload thủ công.

---

Nếu server dùng **Python** thay vì PHP, em có thể cung cấp script tương đương — anh/chị cho em biết nhé.

Cảm ơn anh/chị!

---
*Liên hệ nếu cần hỗ trợ thêm.*
