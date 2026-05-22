function removeDiacritics(str) {
  return str.toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
    .replace(/[èéẹẻẽêềếệểễ]/g, "e")
    .replace(/[ìíịỉĩ]/g, "i")
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
    .replace(/[ùúụủũưừứựửữ]/g, "u")
    .replace(/[ỳýỵỷỹ]/g, "y")
    .replace(/[đ]/g, "d");
}

function autoReplySponsorship() {

  // Dung label rieng de tranh conflict voi gas_pne_taitro.js (no dung "pne-processed")
  var repliedLabel = GmailApp.getUserLabelByName("pne-autoreplied");
  if (!repliedLabel) {
    repliedLabel = GmailApp.createLabel("pne-autoreplied");
    Logger.log("Created label: pne-autoreplied");
  }

  // Luu y: KHONG loc -from:phuongnameducation.com vi PNE hay forward thu CLB vao
  // KHONG dung -label:pne-processed vi gas_pne_taitro.js co the da gan truoc
  var searchQuery =
    'newer_than:3d' +
    ' subject:("thư mời tài trợ" OR "thư ngỏ tài trợ" OR "tài trợ" OR "hợp tác")' +
    ' -subject:("hợp đồng" OR "thỏa thuận" OR "biên bản" OR "ký kết" OR "thanh lý" OR "phụ lục" OR "thống kê" OR "quyền truy cập" OR "Re:")' +
    ' -from:(noreply OR no-reply)' +
    ' -label:pne-autoreplied';

  var threads = GmailApp.search(searchQuery);
  Logger.log("Threads found: " + threads.length);

  // Gioi han 10 thread moi lan chay de tranh Gmail rate-limit
  var limit = Math.min(threads.length, 10);

  for (var i = 0; i < limit; i++) {
    var messages = threads[i].getMessages();
    var latestMessage = messages[messages.length - 1];

    var body = latestMessage.getPlainBody() || '';
    var subject = latestMessage.getSubject() || '';
    var subjectNorm = removeDiacritics(subject);
    var fromEmail = latestMessage.getFrom().toLowerCase();

    Logger.log("Processing: " + subject);
    Logger.log("From: " + fromEmail);

    // Loai tru hop dong, bien ban — INTENTIONAL SKIP: gan label de khong xu ly lai
    var excludeSubjectKeywords = [
      "hop dong", "thoa thuan", "bien ban", "ky ket",
      "thanh ly", "phu luc", "contract", "agreement",
      "thong ke", "quyen truy cap", "yeu cau"
    ];
    var shouldSkip = excludeSubjectKeywords.some(function(kw) {
      return subjectNorm.indexOf(kw) !== -1;
    });
    if (shouldSkip) {
      Logger.log("Skip (contract/agreement): " + subject);
      threads[i].addLabel(repliedLabel);
      threads[i].markRead();
      continue;
    }

    // Loai mail he thong — INTENTIONAL SKIP
    var excludeSenders = ["noreply", "no-reply", "mailer-daemon"];
    var isSysMail = excludeSenders.some(function(s) {
      return fromEmail.indexOf(s) !== -1;
    });
    if (isSysMail) {
      Logger.log("Skip (system email): " + fromEmail);
      threads[i].addLabel(repliedLabel);
      threads[i].markRead();
      continue;
    }

    // Loai thu co subject bat dau bang Re: (thu tu dong reply quay lai)
    if (/^Re:/i.test(subject)) {
      Logger.log("Skip (Re: reply loop): " + subject);
      threads[i].addLabel(repliedLabel);
      threads[i].markRead();
      continue;
    }

    // Phat hien thu chuyen tiep TRUOC khi kiem tra sender noi bo
    // Vi PNE hay forward thu CLB vao — can xu ly cac thu nay
    var isForward = /^(Fwd|Fw|Chuyển tiếp):/i.test(subject);

    // Loai thu tu noi bo phuongnameducation.com — CHI SKIP neu KHONG phai Fwd
    if (fromEmail.indexOf("phuongnameducation.com") !== -1 && !isForward) {
      Logger.log("Skip (internal sender, not forward): " + fromEmail);
      threads[i].addLabel(repliedLabel);
      threads[i].markRead();
      continue;
    }

    var originalEmail = null;

    if (isForward) {
      // Tim CHINH XAC email trong dong "Tu:" / "From:" cua phan Forwarded message
      // Day la email cua CLB/don vi gui thu tai tro goc
      var fromLineMatch = body.match(
        /(?:Forwarded message|Thu duoc chuyen tiep)[\s\S]{0,400}?(?:Từ|From):\s*[^<\n]*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/i
      );

      if (fromLineMatch) {
        originalEmail = fromLineMatch[1];
        Logger.log("Email from Forwarded section: " + originalEmail);
      }

      // Du phong: neu khong tim duoc qua regex tren, thu tim theo mau don gian hon
      if (!originalEmail) {
        var simpleMatch = body.match(/(?:Từ|From):\s*[^<\n]*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/i);
        if (simpleMatch) {
          originalEmail = simpleMatch[1];
          Logger.log("Email from simple From: line: " + originalEmail);
        }
      }

      if (!originalEmail) {
        // Khong tim duoc — KHONG gan label, de script thu lai lan sau
        Logger.log("WARNING - no original email found in forward (will retry): " + subject);
        continue;
      }
    } else {
      // Mail gui thang: dung email nguoi gui
      var senderMatch = latestMessage.getFrom().match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (senderMatch) {
        originalEmail = senderMatch[1];
        Logger.log("Email from direct sender: " + originalEmail);
      }
      if (!originalEmail) {
        Logger.log("Skip (no valid email): " + subject);
        threads[i].addLabel(repliedLabel);
        threads[i].markRead();
        continue;
      }
    }

    // Loai neu originalEmail la dia chi noi bo
    if (originalEmail.indexOf("phuongnameducation.com") !== -1) {
      Logger.log("Skip (internal target email): " + originalEmail);
      threads[i].addLabel(repliedLabel);
      threads[i].markRead();
      continue;
    }

    var programName = subject
      .replace(/Fwd:\s*/i, "")
      .replace(/Re:\s*/i, "")
      .replace(/\[.*?\]/g, "")
      .replace(/thư ngỏ tài trợ hợp tác/i, "")
      .replace(/thư mời tài trợ hợp tác/i, "")
      .replace(/thư ngỏ tài trợ/i, "")
      .replace(/thư mời tài trợ/i, "")
      .replace(/thư ngỏ hợp tác/i, "")
      .replace(/thư mời hợp tác/i, "")
      .replace(/tài trợ/i, "")
      .replace(/hợp tác/i, "")
      .replace(/[\:,\-\[\]]/g, "")
      .trim();

    if (!programName) { programName = "chuong trinh"; }

    var plainBody =
      "Than gui cac ban,\n\n" +
      "Phuong Nam Education cam on cac ban da gui thu moi tai tro " + programName + ". " +
      "De co the trao doi chi tiet hon ve noi dung hop tac, cac ban vui long lien he voi Trung tam thong qua Ms. Thuy Duong - 0836 811 821 (SDT/Zalo) nhe!\n\n" +
      "Kind Regards,\n--\n" +
      "PHUONG NAM EDUCATION\n" +
      "A: 357 Le Hong Phong St., Ward 02, Dist.10, HCM\n" +
      "T: 1900 7060 - (028) 3622 8849";

    var htmlBody =
      "<div style='font-family: Arial, sans-serif; font-size: 14px; color: #222222;'>" +
        "<p>Th&#226;n g&#7917;i c&#225;c b&#7841;n,</p>" +
        "<p><strong style='color: #B30000;'>Phuong Nam Education</strong> " +
        "c&#7843;m &#417;n c&#225;c b&#7841;n &#273;&#227; g&#7917;i th&#432; m&#7901;i t&#224;i tr&#7907; <strong>" + programName + "</strong>. " +
        "&#272;&#7875; c&#243; th&#7875; trao &#273;&#7893;i chi ti&#7871;t h&#417;n v&#7873; n&#7897;i dung h&#7907;p t&#225;c, " +
        "c&#225;c b&#7841;n vui l&#242;ng li&#234;n h&#7879; v&#7899;i Trung t&#226;m th&#244;ng qua " +
        "Ms. Th&#249;y D&#432;&#417;ng - 0836 811 821 (S&#272;T/Zalo) nh&#233;!</p>" +
        "<p>Kind Regards,<br>--</p>" +
        "<p><strong style='color: #B30000; font-size: 15px;'>PHUONG NAM EDUCATION</strong><br>" +
        "<strong style='color: #B30000;'>A:</strong> 357 Le Hong Phong St., Ward 02, Dist.10, HCM<br>" +
        "<strong style='color: #B30000;'>T:</strong> 1900 7060 - (028) 3622 8849</p>" +
      "</div>";

    var replySubject = subject.replace(/Fwd:\s*/i, "").replace(/Re:\s*/i, "");

    try {
      GmailApp.sendEmail(originalEmail, "Re: " + replySubject, plainBody, {
        cc: "hue.ptt@phuongnameducation.com, duong.ht@phuongnameducation.com",
        name: "Phuong Nam Education",
        htmlBody: htmlBody
      });
      Logger.log("Sent reply to: " + originalEmail);

      // Chi gan label SAU KHI gui reply thanh cong
      threads[i].addLabel(repliedLabel);
      threads[i].markRead();

      // Nghi 1.5 giay giua cac lan gui de tranh Gmail rate-limit
      Utilities.sleep(1500);

    } catch (e) {
      Logger.log("Error sending email: " + e.message);
      // Neu bi rate-limit (Gmail operation not allowed), nghi 5 giay roi tiep tuc
      if (e.message && e.message.indexOf('not allowed') !== -1) {
        Utilities.sleep(5000);
      }
      // Khong gan label neu gui that bai — de script thu lai lan sau
    }
  }

  Logger.log("Done.");
}

function debugSearch() {
  Logger.log("=== START DEBUG ===");
  var threads = GmailApp.search(
    'is:unread newer_than:3d' +
    ' subject:("thư mời tài trợ" OR "thư ngỏ tài trợ" OR "tài trợ" OR "hợp tác")' +
    ' -subject:("hợp đồng" OR "thỏa thuận" OR "biên bản" OR "thống kê" OR "quyền truy cập")' +
    ' -from:(noreply OR no-reply)' +
    ' -label:pne-processed'
  );
  Logger.log("Threads found: " + threads.length);
  for (var i = 0; i < threads.length; i++) {
    var msg = threads[i].getMessages()[0];
    var body = msg.getPlainBody().substring(0, 500);
    Logger.log("---");
    Logger.log("Subject : " + msg.getSubject());
    Logger.log("From    : " + msg.getFrom());
    Logger.log("Body snippet: " + body);
  }
  Logger.log("=== END DEBUG ===");
}

function markAllOldEmailsAsProcessed() {
  var processedLabel = GmailApp.getUserLabelByName("pne-processed");
  if (!processedLabel) {
    processedLabel = GmailApp.createLabel("pne-processed");
  }

  var searchQuery =
    'subject:("thư mời tài trợ" OR "thư ngỏ tài trợ" OR "tài trợ" OR "hợp tác")' +
    ' -label:pne-processed';

  var threads = GmailApp.search(searchQuery);
  Logger.log("Old threads to mark: " + threads.length);

  for (var i = 0; i < threads.length; i++) {
    threads[i].addLabel(processedLabel);
    Logger.log("Marked: " + threads[i].getMessages()[0].getSubject());
  }

  Logger.log("Done - all old emails marked.");
}
