Cần setup hosting cho trang web nội bộ của bộ phận Tài trợ

---

1. Tạo subdomain
- Subdomain: sponsorship.phuongnameducation.com
- Bật HTTPS/SSL cho subdomain này

---

2. Clone repo về server (chạy 1 lần duy nhất)

cd /var/www/sponsorship
git clone https://github.com/hueptt-bit/pne-taitro.git .

Sau khi clone xong, truy cập https://sponsorship.phuongnameducation.com/dashboard.html là mở được trang.

---

3. Tạo file deploy.php để tự động cập nhật code

Mỗi khi em push code mới lên GitHub, server sẽ tự kéo về mà không cần upload thủ công.

Tạo file /var/www/sponsorship/deploy.php với nội dung sau:

<?php
$secret = 'CHUỖI_BÍ_MẬT_TỰ_ĐẶT'; // anh tự đặt bất kỳ, ví dụ: pne_deploy_2026

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

⚠️ Sau khi tạo xong, báo lại cho em chuỗi bí mật đã đặt để em điền vào GitHub là hoàn tất.

---

4. Lưu ý kỹ thuật
- Web server (Nginx/Apache) cần cho phép chạy file .php
- Server cần có git đã cài sẵn
- User chạy web server cần có quyền đọc/ghi thư mục chứa web
- File HTML có gọi ra script.google.com — không cần cấu hình thêm gì phía server

---

5. Phần em tự làm sau khi anh/chị xong

Em sẽ tự vào GitHub đăng ký webhook — anh/chị không cần làm thêm gì. Từ đó về sau em push code là server tự cập nhật.
