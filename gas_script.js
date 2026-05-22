// ═══════════════════════════════════════════════════════════════
// PNE TÀI TRỢ — Google Apps Script
// Vai trò: API cho Dashboard + Gmail Watcher + Telegram Bot
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  TG_TOKEN:         '8883609953:AAEe88AtNr808jQhJ0gZM8ntX7ShSVXfHTI',
  TG_CHAT_ID:       '-5110564753',
  SHEET_NAME:       'Records',
  // ↓ Lấy URL /exec từ: Triển khai → Quản lý triển khai → copy URL
  WEB_APP_URL:      'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnTXI-HjZxodBhBFqTEc_RRZLPsFJJ9lEuLIpZAe1DEftZPxO7Q_CVPkunevlVKqOgalz2N3zlM0e0uInE7AXMkWcY99mA6EZhNJwR_W1HRSdoYt1THL-dN3dCnfW1USDp9lWQ9dekFOuKjjmcXFp4c3IdszennARUXp0rwCvLFsgBG4qW3k0PQechIc-POsyiMQZA7iDIZ5bykeeH6NEQHIixW3JLb8m3QTNNYcDAKN5dqvPjFtnPaUGJw7b-wbxRFqW9eVDyoJRX4l5E0E7jhqB0phUQ&lib=MFQwz8DyVTbWMbb5Iwgo6vMhD9dEftbu5',
  DASHBOARD_URL:    'https://hueptt-bit.github.io/pne-taitro/dashboard.html',
  GMAIL_QUERY:      '-label:pne-processed newer_than:3d',
  GMAIL_LABEL:      'pne-processed',
  GMAIL_LABEL_MOI:  'PNE/Lời mời',
  GMAIL_LABEL_HD:   'PNE/Hợp đồng',
};

// ═══════════════════════════════════════════════════════════════
// SHEET HELPERS
// ═══════════════════════════════════════════════════════════════

function getSheet() {
  const ss = SpreadsheetApp.openById('1zXOliDHlkELXzLE0dIAZc9s5ubbD5Knglfa94Y-hAfs');
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(['id', 'data', 'updatedAt']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getAllRecords() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const records = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      try { records.push(JSON.parse(data[i][1])); } catch(e) {}
    }
  }
  return records;
}

function upsertRecord(record) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === record.id) {
      sheet.getRange(i + 1, 2).setValue(JSON.stringify(record));
      sheet.getRange(i + 1, 3).setValue(new Date().toISOString());
      return;
    }
  }
  sheet.appendRow([record.id, JSON.stringify(record), new Date().toISOString()]);
}

function saveAllRecords(records) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 3).clearContent();
  records.forEach(r => {
    sheet.appendRow([r.id, JSON.stringify(r), new Date().toISOString()]);
  });
}

function updateRecordField(id, field, value) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const record = JSON.parse(data[i][1]);
      record[field] = value;
      sheet.getRange(i + 1, 2).setValue(JSON.stringify(record));
      sheet.getRange(i + 1, 3).setValue(new Date().toISOString());
      return record;
    }
  }
}

function deleteRecordById(id) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === id) { sheet.deleteRow(i + 1); return; }
  }
}

// ═══════════════════════════════════════════════════════════════
// WEB APP — API cho Dashboard (GET + POST)
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'getAll';
  if (action === 'getAll') {
    return jsonResponse({ ok: true, records: getAllRecords() });
  }
  return jsonResponse({ ok: false, error: 'Unknown GET action' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch(err) { return jsonResponse({ ok: false, error: 'Invalid JSON' }); }

  // ── Telegram webhook callback (nút bấm) ──
  if (body.callback_query) {
    handleTelegramCallback(body.callback_query);
    return jsonResponse({ ok: true });
  }

  // ── Telegram message (text reply — nhập tên Zalo) ──
  if (body.message && body.message.text) {
    handleTelegramMessage(body.message);
    return jsonResponse({ ok: true });
  }

  // ── Dashboard API ──
  const action = body.action;

  if (action === 'saveAll') {
    saveAllRecords(body.records || []);
    return jsonResponse({ ok: true });
  }
  if (action === 'upsert') {
    upsertRecord(body.record);
    return jsonResponse({ ok: true });
  }
  if (action === 'delete') {
    deleteRecordById(body.id);
    return jsonResponse({ ok: true });
  }
  if (action === 'updateField') {
    const r = updateRecordField(body.id, body.field, body.value);
    return jsonResponse({ ok: true, record: r });
  }
  if (action === 'createTracking') {
    const url = createTrackingSheet(body.id);
    return jsonResponse({ ok: !!url, trackingUrl: url || null });
  }

  return jsonResponse({ ok: false, error: 'Unknown POST action' });
}

// ═══════════════════════════════════════════════════════════════
// GMAIL WATCHER — chạy mỗi 5 phút
// ═══════════════════════════════════════════════════════════════

function classifyEmail(subject, snippet) {
  const s = (subject + ' ' + snippet).toLowerCase();
  const isContract = /hợp đồng|contract|ký kết|scan|đính kèm.*ký|signed|biên bản|phụ lục|thanh lý/.test(s);
  const isNew = /xin tài trợ|đề xuất tài trợ|sponsorship|lời mời|proposal|hợp tác|tài trợ|đối tác/.test(s);
  if (isContract) return 'hop_dong';
  if (isNew) return 'loi_moi';
  return 'unknown';
}

function checkNewEmails() {
  // Tạo labels nếu chưa có
  let labelProcessed = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL);
  if (!labelProcessed) labelProcessed = GmailApp.createLabel(CONFIG.GMAIL_LABEL);

  let labelMoi = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL_MOI);
  if (!labelMoi) labelMoi = GmailApp.createLabel(CONFIG.GMAIL_LABEL_MOI);

  let labelHD = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL_HD);
  if (!labelHD) labelHD = GmailApp.createLabel(CONFIG.GMAIL_LABEL_HD);

  const threads = GmailApp.search(CONFIG.GMAIL_QUERY, 0, 10);

  threads.forEach(thread => {
    const messages = thread.getMessages();
    const msg     = messages[messages.length - 1];
    const gmailId = msg.getId();
    const subject = msg.getSubject();
    const from    = msg.getFrom();
    const body    = msg.getPlainBody().substring(0, 800);
    const date    = msg.getDate();

    const type = classifyEmail(subject, body);

    // ── Hợp đồng / Ký kết ──
    if (type === 'hop_dong') {
      thread.addLabel(labelHD);
      thread.addLabel(labelProcessed);
      thread.markRead();

      const nameMatch = from.match(/^"?([^"<@]+)"?\s*</);
      const fromName  = nameMatch ? nameMatch[1].trim() : from;

      const text =
        `📄 <b>Hợp đồng / Tài liệu ký!</b>\n` +
        `🏫 <b>${escHtml(fromName)}</b>\n` +
        `📌 ${escHtml(subject)}\n` +
        `📅 ${Utilities.formatDate(date, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm')}\n` +
        `📩 ${escHtml(from)}\n\n` +
        `<i>Vào Gmail → PNE/Hợp đồng để xem đính kèm</i>`;

      tgCall('sendMessage', {
        chat_id:    CONFIG.TG_CHAT_ID,
        text:       text,
        parse_mode: 'HTML',
      });
      return;
    }

    // ── Mail tài trợ mới ──
    if (type === 'loi_moi') {
      const existing = getAllRecords();
      if (existing.find(r => r.gmailId === gmailId)) {
        thread.addLabel(labelProcessed);
        return;
      }

      thread.addLabel(labelMoi);

      const nameMatch = from.match(/^"?([^"<@]+)"?\s*</);
      const fromName  = nameMatch ? nameMatch[1].trim() : from;

      // Lưu file PDF đính kèm lên Google Drive
      let proposalUrl = '';
      try {
        const folders = DriveApp.getFoldersByName('PNE - Hồ sơ tài trợ');
        const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('PNE - Hồ sơ tài trợ');
        outerLoop:
        for (const m of messages) {
          const atts = m.getAttachments({ includeInlineImages: false, includeAttachments: true });
          for (const att of atts) {
            const attName = att.getName().toLowerCase();
            const attType = att.getContentType();
            if (attType === 'application/pdf' || attName.endsWith('.pdf')) {
              const file = folder.createFile(att);
              file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
              proposalUrl = file.getUrl();
              break outerLoop;
            }
          }
        }
      } catch(e) { Logger.log('PDF scan error: ' + e); }

      const record = {
        id:           'mail_' + gmailId.substring(0, 10),
        org:           fromName,
        event:         subject,
        track:         'voucher',
        cat:           '',
        stage:         'received',
        year:          String(date.getFullYear()),
        receivedDate:  Utilities.formatDate(date, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'),
        deadlineDate:  '',
        proposalUrl:   proposalUrl,
        hangmuc:       '',
        contact:       from,
        notes:         body,
        proposalText:  '',
        benefits:      [],
        offer:         null,
        clbPackages:   [],
        approval:      null,
        hopdong: '', mavoucher: '', hanvoucher: '', anhsukien: '', data: '', tracking: '',
        lienhe:        'chua',
        zaloGroup:     '',
        source:        'gmail',
        gmailId:       gmailId,
      };

      upsertRecord(record);
      sendTelegramNewMail(record);
    }

    // ── Unknown: chỉ đánh label, không thông báo ──
    thread.addLabel(labelProcessed);
    thread.markRead();
  });
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM — gửi thông báo mail tài trợ mới
// ═══════════════════════════════════════════════════════════════

function sendTelegramNewMail(record) {
  const dashUrl = CONFIG.DASHBOARD_URL + '?open=' + record.id;

  const pdfLine = record.proposalUrl
    ? `\n📎 <a href="${record.proposalUrl}">Hồ sơ PDF</a>` : '';
  const text =
    `📧 <b>Mail tài trợ mới!</b>\n` +
    `🏫 <b>${escHtml(record.org)}</b>\n` +
    `📌 ${escHtml(record.event)}\n` +
    `📅 ${escHtml(record.receivedDate)}\n` +
    `📩 ${escHtml(record.contact)}` +
    pdfLine;

  const payload = {
    chat_id:    CONFIG.TG_CHAT_ID,
    text:       text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Đã liên hệ', callback_data: 'contacted:' + record.id },
        { text: '📋 Xem hồ sơ',  url: dashUrl },
        { text: '⏳ Để sau',     callback_data: 'snooze:' + record.id },
      ]]
    }
  };

  try {
    const res    = tgCall('sendMessage', payload);
    const raw    = res.getContentText();
    const result = JSON.parse(raw);
    Logger.log('TG sendMessage → ' + raw);
    if (result.ok) {
      updateRecordField(record.id, 'tgMessageId', result.result.message_id);
      updateRecordField(record.id, 'tgChatId',    result.result.chat.id);
    } else {
      Logger.log('❌ Telegram lỗi: ' + result.description);
    }
  } catch(e) {
    Logger.log('❌ sendTelegramNewMail exception: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM — xử lý callback (nút bấm)
// ═══════════════════════════════════════════════════════════════

function handleTelegramCallback(cq) {
  const [action, recordId] = cq.data.split(':');
  const chatId = cq.message.chat.id;
  const msgId  = cq.message.message_id;

  if (action === 'contacted') {
    updateRecordField(recordId, 'lienhe', 'da');
    updateRecordField(recordId, 'stage',  'reviewing');

    editTgMessage(chatId, msgId,
      `✅ <b>Đã đánh dấu liên hệ</b>\n<i>Nhập tên group Zalo để lưu:</i>\n<i>(Gõ /skip nếu chưa có)</i>`
    );

    const props = PropertiesService.getScriptProperties();
    props.setProperty('pending_zalo_' + chatId, recordId);
    props.setProperty('pending_zalo_time_' + chatId, String(Math.floor(Date.now() / 1000)));
  }

  if (action === 'snooze') {
    const snoozeTime = new Date(Date.now() + 4 * 60 * 60 * 1000);
    updateRecordField(recordId, 'snoozeUntil', snoozeTime.toISOString());

    const timeStr = Utilities.formatDate(snoozeTime, 'Asia/Ho_Chi_Minh', 'HH:mm');
    editTgMessage(chatId, msgId,
      `⏳ <b>Để sau</b> — sẽ nhắc lại lúc <b>${timeStr}</b>`
    );
  }

  tgCall('answerCallbackQuery', { callback_query_id: cq.id });
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM — xử lý tin nhắn text (nhập tên Zalo)
// ═══════════════════════════════════════════════════════════════

function handleTelegramMessage(msg) {
  const chatId = String(msg.chat.id);
  const text   = (msg.text || '').trim();

  const props      = PropertiesService.getScriptProperties();
  const pendingKey = 'pending_zalo_' + chatId;
  const pendingId  = props.getProperty(pendingKey);

  if (!pendingId) return;

  const pendingTime = parseInt(props.getProperty('pending_zalo_time_' + chatId) || '0');
  if (msg.date < pendingTime) return;

  props.deleteProperty(pendingKey);
  props.deleteProperty('pending_zalo_time_' + chatId);

  if (text === '/skip' || text.startsWith('/')) {
    sendTgText(chatId, '👍 OK, bỏ qua group Zalo.');
    return;
  }

  updateRecordField(pendingId, 'zaloGroup', text);
  sendTgText(chatId, `💬 Đã lưu group Zalo: <b>${escHtml(text)}</b>`);
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM POLLING — lấy nút bấm từ Telegram mỗi 1 phút
// ═══════════════════════════════════════════════════════════════

function checkTelegramUpdates() {
  const MAX_RUN_MS = 50 * 1000;
  const start = Date.now();
  const props = PropertiesService.getScriptProperties();

  while (Date.now() - start < MAX_RUN_MS) {
    const lastId = parseInt(props.getProperty('tg_last_update_id') || '0');
    try {
      const res = UrlFetchApp.fetch(
        'https://api.telegram.org/bot' + CONFIG.TG_TOKEN +
        '/getUpdates?offset=' + (lastId + 1) + '&limit=10&timeout=5',
        { muteHttpExceptions: true, deadline: 10 }
      );
      const data = JSON.parse(res.getContentText());

      if (data.ok && data.result.length) {
        data.result.forEach(update => {
          if (update.callback_query) handleTelegramCallback(update.callback_query);
          else if (update.message && update.message.text) handleTelegramMessage(update.message);
        });
        const maxId = Math.max(...data.result.map(u => u.update_id));
        props.setProperty('tg_last_update_id', String(maxId));
      }
    } catch(e) {
      Utilities.sleep(1000);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SNOOZE CHECK — gọi mỗi 5 phút
// ═══════════════════════════════════════════════════════════════

function checkSnoozedRecords() {
  const now     = new Date();
  const records = getAllRecords();

  records.forEach(r => {
    if (!r.snoozeUntil) return;
    if (new Date(r.snoozeUntil) > now) return;
    updateRecordField(r.id, 'snoozeUntil', null);
    sendTelegramNewMail(r);
  });
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM UTILS
// ═══════════════════════════════════════════════════════════════

function tgCall(method, payload) {
  return UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + CONFIG.TG_TOKEN + '/' + method,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload) }
  );
}

function editTgMessage(chatId, msgId, text) {
  tgCall('editMessageText', {
    chat_id:    chatId,
    message_id: msgId,
    text:       text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [] },
  });
}

function sendTgText(chatId, text) {
  tgCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════
// SETUP — chạy 1 lần duy nhất khi cài đặt
// ═══════════════════════════════════════════════════════════════

/** Bước 1: Chạy hàm này sau khi Deploy Web App để đăng ký webhook Telegram */
function setupWebhook() {
  const webAppUrl = CONFIG.WEB_APP_URL;
  if (!webAppUrl || webAppUrl === 'PASTE_EXEC_URL_HERE') {
    Logger.log('❌ Chưa điền WEB_APP_URL vào CONFIG!');
    return;
  }
  const res = tgCall('setWebhook', { url: webAppUrl });
  Logger.log('setWebhook: ' + res.getContentText());
}

/** Bước 2: Chạy hàm này để tạo trigger tự động */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('checkNewEmails')
    .timeBased().everyMinutes(5).create();

  ScriptApp.newTrigger('checkSnoozedRecords')
    .timeBased().everyMinutes(5).create();

  ScriptApp.newTrigger('checkTelegramUpdates')
    .timeBased().everyMinutes(1).create();

  Logger.log('✅ Đã tạo 3 triggers');
}

/** Test: gửi tin nhắn thử lên Telegram */
function testTelegram() {
  sendTgText(CONFIG.TG_CHAT_ID,
    '✅ <b>PNE Bot đang hoạt động!</b>\n<i>Sẵn sàng nhận thông báo tài trợ.</i>'
  );
  Logger.log('Đã gửi test message');
}

/** Đánh dấu toàn bộ mail hiện có — chạy 1 lần để không bị thông báo mail cũ */
function markAllExistingEmails() {
  let label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL);
  if (!label) label = GmailApp.createLabel(CONFIG.GMAIL_LABEL);
  const threads = GmailApp.search('is:unread', 0, 500);
  threads.forEach(t => t.addLabel(label));
  Logger.log('✅ Đã đánh dấu ' + threads.length + ' threads — chỉ nhận thông báo mail mới từ đây');
}

/** Xóa webhook để polling hoạt động */
function deleteWebhook() {
  const res = tgCall('deleteWebhook', {});
  Logger.log('deleteWebhook: ' + res.getContentText());
}

/** Test: giả lập có mail tài trợ mới */
function testFakeEmail() {
  const fakeRecord = {
    id:           'test_' + Date.now().toString(36),
    org:          'CLB Âm nhạc UTE',
    event:        '[Test] Đêm nhạc Acoustic 2026',
    track:        'voucher',
    cat:          '',
    stage:        'received',
    year:         '2026',
    receivedDate:  Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'),
    deadlineDate:  '',
    proposalUrl:   '',
    hangmuc:       '',
    contact:       'clbamnhacute@gmail.com',
    notes:         'Đây là test notification từ GAS.',
    proposalText:  '',
    benefits:      [],
    offer:         null,
    clbPackages:   [],
    approval:      null,
    hopdong: '', mavoucher: '', hanvoucher: '', anhsukien: '', data: '', tracking: '',
    lienhe:        'chua',
    zaloGroup:     '',
    source:        'test',
    gmailId:       'test_gmail_id',
  };
  upsertRecord(fakeRecord);
  sendTelegramNewMail(fakeRecord);
  Logger.log('✅ Đã gửi test notification');
}

// ═══════════════════════════════════════════════════════════════
// TRACKING SHEET — Tạo file theo dõi quyền lợi từ hợp đồng
// ═══════════════════════════════════════════════════════════════

/**
 * Tạo Google Sheets tracking quyền lợi theo đúng mẫu PNE.
 * Cấu trúc: 1 sheet, 7 cột (A: Loại | B: trống | C: Chi tiết | D: Yêu cầu | E: Ngày TH | F: File minh chứng | G: Tiến độ)
 * Gọi từ dashboard qua POST: { action: 'createTracking', id: recordId }
 * Hoặc chạy thủ công: createTrackingSheet('record_id_here')
 */
function createTrackingSheet(recordId) {
  const records = getAllRecords();
  const r = records.find(x => x.id === recordId);
  if (!r) { Logger.log('❌ Không tìm thấy record: ' + recordId); return null; }

  // ── Tên file + folder ──
  const orgShort = (r.org || 'CLB').replace(/[^\w\sÀ-ỹ]/g, '').trim();
  const eventShort = (r.event || r.year || '').replace(/[^\w\sÀ-ỹ]/g, '').trim().substring(0, 40);
  const fileName = `PNE x ${orgShort} | THEO DÕI QUYỀN LỢI TÀI TRỢ ${eventShort}`;

  const folders = DriveApp.getFoldersByName('PNE - Tracking Quyền lợi');
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('PNE - Tracking Quyền lợi');

  const ss = SpreadsheetApp.create(fileName);
  DriveApp.getFileById(ss.getId()).moveTo(folder);

  // ── Sheet duy nhất: Theo dõi quyền lợi ──
  const sh = ss.getActiveSheet();
  sh.setName('Theo dõi quyền lợi');

  // Column widths: A=110, B=8, C=380, D=300, E=130, F=130, G=140
  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(2, 8);
  sh.setColumnWidth(3, 380);
  sh.setColumnWidth(4, 300);
  sh.setColumnWidth(5, 130);
  sh.setColumnWidth(6, 130);
  sh.setColumnWidth(7, 140);
  sh.setRowHeight(1, 36);
  sh.setRowHeight(2, 28);

  // ── Row 1: Header chính ──
  // A1:B1 = "Quyền lợi Nhà tài trợ"
  sh.getRange('A1:B1').merge()
    .setValue('Quyền lợi Nhà tài trợ')
    .setFontWeight('bold').setFontSize(11)
    .setBackground('#1e3a5f').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // C1:D1 = "Phuong Nam Education (PNE)"
  sh.getRange('C1:D1').merge()
    .setValue('Phuong Nam Education (PNE)')
    .setFontWeight('bold').setFontSize(11)
    .setBackground('#c9daf8').setFontColor('#1e3a5f')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // E1:G1 = "Hội sinh viên (HSV)"
  sh.getRange('E1:G1').merge()
    .setValue(orgShort + ' (HSV)')
    .setFontWeight('bold').setFontSize(11)
    .setBackground('#d9ead3').setFontColor('#1a4d1a')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // ── Row 2: Sub-headers ──
  const subHeaders = ['', '', 'Chi tiết', 'Yêu cầu', 'Ngày thực hiện', 'File minh chứng', 'Tiến độ hoàn thành'];
  sh.getRange(2, 1, 1, 7).setValues([subHeaders])
    .setFontWeight('bold').setFontSize(10)
    .setBackground('#f3f3f3').setFontColor('#333333')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // ── Lấy quyền lợi từ record ──
  const rawBenefits = (r.neg_benefits || []).filter(b => b && b.label && !b.isHeader);
  const fallback = (r.benefits || []).filter(b => b && b.label);
  const allBenefits = rawBenefits.length > 0 ? rawBenefits : fallback;

  // Link logo PNE mặc định
  const LOGO_LINK = 'File logo: https://drive.google.com/drive/u/2/folders/1pJm8-GusWi7KUGMK-QUrKJqmI1dtnBm0';

  // Phân loại benefit: Trực tiếp vs Truyền thông + gợi ý Yêu cầu
  const categorizeBenefit = (label) => {
    const l = label.toLowerCase();
    // Trực tiếp
    if (/trao|bàn truyền thông|leaflet|brochure|tặng phẩm|lưu niệm|thư cảm ơn|nhắc đến|đại diện|phát.*khóa|buổi lễ|standee|backdrop|poster.*offline|ấn phẩm.*offline/.test(l))
      return 'Trực tiếp';
    // Truyền thông
    if (/google map|đánh giá|5 sao|fanpage|bài viết|recap|video|logo.*ấn phẩm|truyền thông|hình ảnh|sử dụng.*ảnh|group|cộng đồng|facebook|đề xuất/.test(l))
      return 'Truyền thông';
    // Mặc định theo logo/ấn phẩm
    if (/logo/.test(l)) return 'Truyền thông';
    return 'Trực tiếp';
  };

  const getYeuCau = (label) => {
    const l = label.toLowerCase();
    if (/logo/.test(l)) return LOGO_LINK;
    if (/google map|đánh giá|5 sao/.test(l))
      return '. Chỉ cần đánh giá 5 sao, không cần nội dung\n. Mỗi 01 đánh giá dùng 01 email cá nhân khác nhau\n. Dùng 3G để review, không dùng chung 1 wifi\n. Chia timeline review, tối đa 10 reviews/ngày';
    if (/bài viết giới thiệu|bài viết hỗ trợ/.test(l))
      return '. Trước khi đăng: báo lại timeline đăng bài cho PNE\n. Sau khi đăng: gửi link bài viết để PNE nghiệm thu';
    if (/hình ảnh|sử dụng.*ảnh/.test(l))
      return '. Báo thời gian gửi ảnh chương trình cho PNE';
    return '';
  };

  // Nhóm benefits theo category
  const grouped = { 'Trực tiếp': [], 'Truyền thông': [] };
  allBenefits.forEach(b => {
    const cat = categorizeBenefit(b.label);
    grouped[cat].push(b);
  });

  // ── Ghi dữ liệu theo nhóm ──
  let currentRow = 3;
  const BG_TRUC_TIEP = '#fce5cd';
  const BG_TRUYEN_THONG = '#d9ead3';
  const BG_ROW_LIGHT = '#ffffff';
  const BG_ROW_ALT = '#f9f9f9';

  ['Trực tiếp', 'Truyền thông'].forEach(catName => {
    const items = grouped[catName];
    if (items.length === 0) return;

    const catBg = catName === 'Trực tiếp' ? BG_TRUC_TIEP : BG_TRUYEN_THONG;
    const startRow = currentRow;

    items.forEach((b, idx) => {
      sh.setRowHeight(currentRow, 60);

      // Col A: tên category chỉ ở hàng đầu của nhóm
      sh.getRange(currentRow, 1).setValue(idx === 0 ? catName : '')
        .setFontWeight(idx === 0 ? 'bold' : 'normal')
        .setBackground(catBg)
        .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');

      // Col B: trống
      sh.getRange(currentRow, 2).setBackground(catBg);

      // Col C: Chi tiết
      sh.getRange(currentRow, 3).setValue('. ' + b.label)
        .setBackground(idx % 2 === 0 ? BG_ROW_LIGHT : BG_ROW_ALT)
        .setWrap(true).setVerticalAlignment('middle');

      // Col D: Yêu cầu
      sh.getRange(currentRow, 4).setValue(getYeuCau(b.label))
        .setBackground(idx % 2 === 0 ? BG_ROW_LIGHT : BG_ROW_ALT)
        .setFontSize(9).setFontColor('#555555')
        .setWrap(true).setVerticalAlignment('middle');

      // Col E: Ngày thực hiện
      sh.getRange(currentRow, 5).setValue('')
        .setBackground(idx % 2 === 0 ? BG_ROW_LIGHT : BG_ROW_ALT)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');

      // Col F: File minh chứng
      sh.getRange(currentRow, 6).setValue('')
        .setBackground(idx % 2 === 0 ? BG_ROW_LIGHT : BG_ROW_ALT)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');

      // Col G: Tiến độ
      sh.getRange(currentRow, 7).setValue('')
        .setBackground(idx % 2 === 0 ? BG_ROW_LIGHT : BG_ROW_ALT)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');

      currentRow++;
    });

    // Merge cột A cho cả nhóm nếu > 1 dòng
    if (items.length > 1) {
      sh.getRange(startRow, 1, items.length, 1).merge()
        .setBackground(catBg)
        .setFontWeight('bold')
        .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
    }
  });

  // Nếu không có benefits
  if (allBenefits.length === 0) {
    sh.getRange(3, 1, 1, 7).setValues([['(Chưa có dữ liệu)', '', 'Điền thủ công từ hợp đồng', '', '', '', '']]);
    currentRow = 4;
  }

  // ── Dropdown tiến độ ──
  const progressRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Done', 'In progress', 'Pending', '​'], true)
    .build();
  if (currentRow > 3) {
    sh.getRange(3, 7, currentRow - 3, 1).setDataValidation(progressRule);
  }

  // ── Border toàn bộ data ──
  sh.getRange(1, 1, currentRow - 1, 7)
    .setBorder(true, true, true, true, true, true,
      '#cccccc', SpreadsheetApp.BorderStyle.SOLID);

  // ── Freeze row 1+2 ──
  sh.setFrozenRows(2);

  // ── Share + lưu link ──
  const file = DriveApp.getFileById(ss.getId());
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
  const trackingUrl = ss.getUrl();
  updateRecordField(r.id, 'trackingUrl', trackingUrl);

  Logger.log('✅ Tracking sheet: ' + trackingUrl);
  return trackingUrl;
}

// Gọi từ doPost: { action: 'createTracking', id: recordId }
// (đã xử lý trong doPost bên trên)

function fmtMoneyGas(n) {
  if (!n || n == 0) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + 'B VNĐ';
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M VNĐ';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K VNĐ';
  return n + ' VNĐ';
}

/** Chạy thủ công để test: điền recordId muốn tạo tracking */
function testCreateTracking() {
  const records = getAllRecords();
  if (!records.length) { Logger.log('Chưa có record nào'); return; }
  // Lấy record đầu tiên có stage = executing hoặc signing
  const r = records.find(x => x.stage === 'executing' || x.stage === 'signing') || records[0];
  const url = createTrackingSheet(r.id);
  Logger.log('Tracking URL: ' + url);
}

/** Test: giả lập nhận mail hợp đồng */
function testFakeContract() {
  const fakeFrom = 'CLB Văn nghệ BK <vanbk@gmail.com>';
  const fakeSubject = '[Test] Hợp đồng tài trợ Gala 2026 — đính kèm bản ký';
  const fakeDate = new Date();

  const text =
    `📄 <b>Hợp đồng / Tài liệu ký!</b>\n` +
    `🏫 <b>CLB Văn nghệ BK</b>\n` +
    `📌 ${escHtml(fakeSubject)}\n` +
    `📅 ${Utilities.formatDate(fakeDate, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm')}\n` +
    `📩 ${escHtml(fakeFrom)}\n\n` +
    `<i>Vào Gmail → PNE/Hợp đồng để xem đính kèm</i>`;

  tgCall('sendMessage', {
    chat_id:    CONFIG.TG_CHAT_ID,
    text:       text,
    parse_mode: 'HTML',
  });
  Logger.log('✅ Đã gửi test contract notification');
}
