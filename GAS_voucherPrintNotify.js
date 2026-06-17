/**
 * ══ GAS: Voucher Print Notify + Telegram Action Button ══
 * Thêm vào file Google Apps Script hiện tại của bạn
 *
 * SETUP:
 * 1. Thêm BOT_TOKEN và TELEGRAM_CHAT_ID vào Script Properties
 *    (GAS Editor → Project Settings → Script Properties)
 *    - BOT_TOKEN = token từ @BotFather (dạng: 1234567890:ABCdef...)
 *    - TELEGRAM_CHAT_ID = chat ID nhóm/người nhận in voucher
 *
 * 2. Sau khi deploy GAS (Deploy → Manage → New deployment), copy URL.
 *    Đăng ký URL đó làm Telegram Webhook:
 *    https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<GAS_URL>
 *
 * 3. GAS URL này cũng là GAS_URL trong dashboard.html (đã có sẵn).
 */

// ── Constants ──
const BOT_TOKEN = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN') || '';
const TELEGRAM_CHAT_ID = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID') || '';

// Tên value → label cho các loại voucher
const VOUCHER_TYPE_LABELS = {
  '100%': '100% (9.8M)', '80%': '80% (7.84M)', '50%': '50% (4.9M)',
  '35%': '35% (3.43M)', '30%': '30% (2.94M)', '25%': '25% (2.45M)',
  '20%': '20% (1.96M)', '15%': '15% (1.47M)', 'Gấu bông': 'Gấu bông (180K)',
};

// ── Xử lý POST từ dashboard ──
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // ── Telegram webhook callback_query (nút "Xác nhận đã in") ──
    if (payload.callback_query) {
      return handleTelegramCallback(payload.callback_query);
    }

    // ── Gửi thông báo Chuyển in ──
    if (payload.action === 'voucherPrintNotify') {
      return handleVoucherPrintNotify(payload);
    }

    // ── Các action khác (saveAll, createTracking, v.v.) ──
    // ... (giữ nguyên code hiện tại của bạn ở đây)
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Gửi Telegram: thông báo yêu cầu in voucher ──
function handleVoucherPrintNotify(payload) {
  const { id, org, event, school, mavoucher, hanvoucher, voucher_print_qty, voucher_print_deadline, neg_items } = payload;

  // Build breakdown theo giá trị
  const breakdown = (neg_items || [])
    .filter(i => !i.isCash && (+i.qty || 0) > 0)
    .map(i => `  • ${i.qty}× ${VOUCHER_TYPE_LABELS[i.type] || i.type}`)
    .join('\n');

  // Format deadline
  const dlFormatted = voucher_print_deadline
    ? voucher_print_deadline.split('-').reverse().join('/')
    : '(chưa xác định)';
  const hanFormatted = hanvoucher
    ? hanvoucher.split('-').reverse().join('/')
    : '(chưa xác định)';

  // Format mã — prefix.01 → prefix.NN
  const vPrefix = (mavoucher || '').replace(/\.\d{2}$/, '');
  const qty = parseInt(voucher_print_qty) || 0;
  const codeRange = vPrefix && qty > 0
    ? `\`${vPrefix}.01\` → \`${vPrefix}.${String(qty).padStart(2, '0')}\``
    : mavoucher ? `\`${mavoucher}\`` : '(chưa có mã)';

  const msg = [
    '🎟️ *YÊU CẦU IN VOUCHER*',
    '',
    `📌 *Chương trình:* ${org} — ${event}`,
    school ? `🏫 *Trường:* ${school}` : null,
    `🆔 *Mã:* ${codeRange}`,
    `📦 *Tổng:* ${qty} voucher`,
    breakdown ? `\n*Chi tiết:*\n${breakdown}` : null,
    `\n📅 *Hạn voucher:* ${hanFormatted}`,
    `⏰ *Deadline in:* ${dlFormatted}`,
  ].filter(Boolean).join('\n');

  const keyboard = {
    inline_keyboard: [[
      {
        text: '✅ Xác nhận đã in',
        callback_data: `confirm_print:${id}`
      },
      {
        text: '❌ Báo lỗi',
        callback_data: `print_error:${id}`
      }
    ]]
  };

  const result = sendTelegram(TELEGRAM_CHAT_ID, msg, keyboard);

  // Lưu message_id để sau có thể edit tin (mark done)
  if (result && result.result && result.result.message_id) {
    storeMessageId(id, result.result.message_id);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Xử lý callback: nút "Xác nhận đã in" / "Báo lỗi" ──
function handleTelegramCallback(cbq) {
  const data = cbq.data || '';
  const chatId = cbq.message.chat.id;
  const messageId = cbq.message.message_id;
  const userName = cbq.from.first_name || 'ai đó';

  if (data.startsWith('confirm_print:')) {
    const recordId = data.replace('confirm_print:', '');

    // Cập nhật voucher_status → da_in trong Google Sheets
    const updated = updateRecordVoucherStatus(recordId, 'da_in');

    // Trả lời callback (xóa spinner trên nút)
    answerCallbackQuery(cbq.id, '✅ Đã xác nhận!');

    if (updated) {
      // Edit lại tin nhắn cũ: thêm xác nhận
      editTelegramMessage(chatId, messageId,
        cbq.message.text + `\n\n✅ *Đã in* — xác nhận bởi ${userName}`);
    } else {
      sendTelegram(chatId, `⚠️ Không tìm thấy hồ sơ ID: \`${recordId}\` để cập nhật.`);
    }
  }

  if (data.startsWith('print_error:')) {
    const recordId = data.replace('print_error:', '');
    answerCallbackQuery(cbq.id, '❗ Đã ghi nhận lỗi');
    sendTelegram(chatId,
      `❗ *Báo lỗi in* từ ${userName}\nHồ sơ: \`${recordId}\`\nVui lòng kiểm tra lại yêu cầu.`);
  }

  return ContentService.createTextOutput('OK');
}

// ── Cập nhật voucher_status trong Google Sheets ──
function updateRecordVoucherStatus(recordId, newStatus) {
  try {
    // Điều chỉnh tên sheet nếu cần
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Records') || ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const idCol = headers.indexOf('id');
    const statusCol = headers.indexOf('voucher_status');
    const updatedAtCol = headers.indexOf('updatedAt');

    if (idCol === -1 || statusCol === -1) {
      // Nếu dùng JSON store thay vì columns → dùng cách khác
      return updateRecordVoucherStatusJSON(recordId, newStatus);
    }

    for (let i = 1; i < data.length; i++) {
      if (data[i][idCol] === recordId) {
        sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
        if (updatedAtCol !== -1) {
          sheet.getRange(i + 1, updatedAtCol + 1).setValue(new Date().toISOString());
        }
        return true;
      }
    }
    return false;
  } catch (e) {
    Logger.log('updateRecordVoucherStatus error: ' + e.message);
    return false;
  }
}

// ── Fallback: nếu GAS dùng JSON blob (1 cell chứa toàn bộ records) ──
function updateRecordVoucherStatusJSON(recordId, newStatus) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Data') || ss.getSheets()[0];
    const cell = sheet.getRange('A1'); // Điều chỉnh ô chứa JSON
    const records = JSON.parse(cell.getValue() || '[]');
    const idx = records.findIndex(r => r.id === recordId);
    if (idx === -1) return false;
    records[idx].voucher_status = newStatus;
    records[idx].updatedAt = new Date().toISOString();
    cell.setValue(JSON.stringify(records));
    return true;
  } catch (e) {
    Logger.log('updateRecordVoucherStatusJSON error: ' + e.message);
    return false;
  }
}

// ── Lưu message_id để track tin nhắn Telegram ──
function storeMessageId(recordId, messageId) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put('tg_msg_' + recordId, String(messageId), 86400); // 24h
  } catch (e) { /* ignore */ }
}

// ── Telegram API helpers ──
function sendTelegram(chatId, text, replyMarkup) {
  if (!BOT_TOKEN || !chatId) return null;
  try {
    const body = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const res = UrlFetchApp.fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true }
    );
    return JSON.parse(res.getContentText());
  } catch (e) {
    Logger.log('sendTelegram error: ' + e.message);
    return null;
  }
}

function editTelegramMessage(chatId, messageId, newText) {
  if (!BOT_TOKEN) return;
  try {
    UrlFetchApp.fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`,
      {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ chat_id: chatId, message_id: messageId, text: newText, parse_mode: 'Markdown' })
      }
    );
  } catch (e) { Logger.log('editTelegramMessage error: ' + e.message); }
}

function answerCallbackQuery(callbackQueryId, text) {
  if (!BOT_TOKEN) return;
  try {
    UrlFetchApp.fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`,
      {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ callback_query_id: callbackQueryId, text: text, show_alert: false })
      }
    );
  } catch (e) { Logger.log('answerCallbackQuery error: ' + e.message); }
}
