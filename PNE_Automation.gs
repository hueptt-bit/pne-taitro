/**
 * ═══════════════════════════════════════════════════════
 * PNE TÀI TRỢ — Google Apps Script Automation
 * ═══════════════════════════════════════════════════════
 *
 * Gồm 3 tính năng chính:
 *   1. Quét Gmail → cảnh báo Telegram khi có email tài trợ mới
 *   2. Đọc hợp đồng Google Docs → tạo file tracking tự động
 *   3. Web App API để dashboard HTML đồng bộ 2 chiều với Google Sheets
 *
 * HƯỚNG DẪN CÀI ĐẶT — đọc kỹ trước khi dùng:
 *
 * Bước 1: Mở Google Apps Script tại script.google.com
 * Bước 2: Tạo project mới, paste toàn bộ code này vào
 * Bước 3: Điền các hằng số trong phần CONFIG bên dưới
 * Bước 4: Chạy hàm setupTriggers() một lần duy nhất để cài đặt trigger
 * Bước 5: Deploy → New deployment → Web app → Execute as "Me" → Who has access: "Anyone"
 *          Copy URL → dán vào biến GAS_URL trong dashboard.html
 * ═══════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════
// CONFIG — Điền thông tin của bạn vào đây
// ═══════════════════════════════════════════════════════
const CONFIG = {
  // --- Telegram Bot ---
  // Tạo bot: nhắn /newbot cho @BotFather trên Telegram
  TELEGRAM_BOT_TOKEN: 'DIEN_BOT_TOKEN_VAO_DAY',
  // Lấy Chat ID: nhắn bất kỳ cho bot, rồi vào
  // https://api.telegram.org/bot<TOKEN>/getUpdates → lấy chat.id
  TELEGRAM_CHAT_ID: 'DIEN_CHAT_ID_VAO_DAY',

  // --- Google Sheets chính (file thống kê) ---
  MASTER_SHEET_ID: '1KK4EthjmcmEJEOXvIxgOX7jOlSinoVMTePvAy51tJL8',
  MASTER_SHEET_NAME: 'Dashboard', // Tên sheet trong file thống kê

  // --- Template tracking sheet ---
  // ID của file tracking mẫu để copy khi tạo tracking mới
  TRACKING_TEMPLATE_ID: '1wYuoIyNEgri2zaEu6L8_pAQiScO_RPjBURtAAw7VVcc',
  // Folder lưu các file tracking mới tạo
  TRACKING_FOLDER_ID: '', // Để trống = lưu vào My Drive gốc

  // --- Gmail filter ---
  // Từ khoá để nhận diện email tài trợ mới
  GMAIL_KEYWORDS: ['tài trợ', 'hợp tác', 'sponsorship', 'tài trợ chương trình', 'hồ sơ tài trợ'],
  // Email đã xử lý sẽ được gán nhãn này (tự tạo nếu chưa có)
  GMAIL_PROCESSED_LABEL: 'PNE/DaXuLy',
  // Chỉ quét email trong N ngày gần nhất
  GMAIL_DAYS_BACK: 1,
};

// ═══════════════════════════════════════════════════════
// 1. GMAIL SCANNER → TELEGRAM ALERT
// ═══════════════════════════════════════════════════════

/**
 * Hàm chính: quét Gmail tìm email tài trợ mới, gửi Telegram
 * Được trigger tự động mỗi giờ sau khi chạy setupTriggers()
 */
function checkNewSponsorEmails() {
  const label = getOrCreateLabel(CONFIG.GMAIL_PROCESSED_LABEL);
  const since = new Date();
  since.setDate(since.getDate() - CONFIG.GMAIL_DAYS_BACK);
  const sinceStr = Utilities.formatDate(since, 'GMT+7', 'yyyy/MM/dd');

  // Tìm email tài trợ chưa xử lý
  const keywordQuery = CONFIG.GMAIL_KEYWORDS.map(k => `"${k}"`).join(' OR ');
  const query = `(${keywordQuery}) after:${sinceStr} -label:${CONFIG.GMAIL_PROCESSED_LABEL} in:inbox`;

  let threads;
  try {
    threads = GmailApp.search(query, 0, 20);
  } catch(e) {
    Logger.log('Gmail search error: ' + e.message);
    return;
  }

  if (threads.length === 0) {
    Logger.log('Không có email tài trợ mới.');
    return;
  }

  Logger.log(`Tìm thấy ${threads.length} email tài trợ mới.`);

  threads.forEach(thread => {
    const messages = thread.getMessages();
    const firstMsg = messages[0];
    const subject = firstMsg.getSubject();
    const from = firstMsg.getFrom();
    const date = Utilities.formatDate(firstMsg.getDate(), 'GMT+7', 'dd/MM/yyyy HH:mm');
    const snippet = thread.getLastMessageDate();
    const body = firstMsg.getPlainBody().slice(0, 300).replace(/\s+/g, ' ');

    // Phân tích nhanh thông tin trong email
    const orgName = extractOrgName(from, subject, body);
    const programName = extractProgramName(subject, body);

    const msg = `🔔 *Email tài trợ mới!*\n\n` +
      `📧 *Từ:* ${from}\n` +
      `📌 *Tiêu đề:* ${subject}\n` +
      `📅 *Ngày:* ${date}\n` +
      (orgName ? `🏫 *Đơn vị:* ${orgName}\n` : '') +
      (programName ? `🎯 *Chương trình:* ${programName}\n` : '') +
      `\n📝 *Nội dung tóm tắt:*\n${body}...\n\n` +
      `👉 Mở Gmail để xem chi tiết và thêm vào dashboard.`;

    sendTelegram(msg);

    // Gán nhãn "đã xử lý"
    thread.addLabel(label);

    // Ghi vào sheet log
    logEmailToSheet(from, subject, date, orgName, programName);
  });
}

function extractOrgName(from, subject, body) {
  // Thử tìm tên CLB/Hội trong subject hoặc body
  const clbMatch = (subject + ' ' + body).match(/CLB\s+[\w\s\(\)]+|Hội\s+[\w\s]+|Đoàn\s+[\w\s]+/i);
  if (clbMatch) return clbMatch[0].trim().slice(0, 60);
  // Fallback: tên từ email
  const nameMatch = from.match(/^"?([^"<]+)"?\s*</);
  return nameMatch ? nameMatch[1].trim() : '';
}

function extractProgramName(subject, body) {
  // Tìm từ khoá chương trình
  const match = (subject + ' ' + body).match(/cuộc thi\s+[""]?([^,.!?\n]+)/i) ||
    (subject + ' ' + body).match(/chương trình\s+[""]?([^,.!?\n]+)/i) ||
    (subject + ' ' + body).match(/sự kiện\s+[""]?([^,.!?\n]+)/i);
  return match ? match[1].trim().slice(0, 80) : '';
}

function logEmailToSheet(from, subject, date, org, program) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);
    let logSheet = ss.getSheetByName('Email Log');
    if (!logSheet) {
      logSheet = ss.insertSheet('Email Log');
      logSheet.appendRow(['Ngày nhận', 'Từ', 'Tiêu đề', 'Đơn vị', 'Chương trình', 'Trạng thái']);
      logSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f1f5f9');
    }
    logSheet.appendRow([date, from, subject, org, program, 'Mới']);
  } catch(e) {
    Logger.log('Lỗi ghi log email: ' + e.message);
  }
}

function getOrCreateLabel(name) {
  const parts = name.split('/');
  let label = GmailApp.getUserLabelByName(name);
  if (!label) {
    // Tạo label cha trước nếu cần
    if (parts.length > 1) {
      const parent = parts.slice(0, -1).join('/');
      let parentLabel = GmailApp.getUserLabelByName(parent);
      if (!parentLabel) GmailApp.createLabel(parent);
    }
    label = GmailApp.createLabel(name);
  }
  return label;
}

// ═══════════════════════════════════════════════════════
// 2. ĐỌC HỢP ĐỒNG GOOGLE DOCS → TẠO TRACKING SHEET
// ═══════════════════════════════════════════════════════

/**
 * Tạo file tracking từ hợp đồng Google Docs
 * Cách dùng: gọi hàm này với link Google Docs hợp đồng
 *
 * @param {string} contractUrl - Link Google Docs hợp đồng
 * @param {string} orgName     - Tên đơn vị tài trợ
 * @param {string} programName - Tên chương trình
 * @returns {string} Link file tracking vừa tạo
 */
function createTrackingFromContract(contractUrl, orgName, programName) {
  Logger.log(`Đang tạo tracking cho: ${orgName} — ${programName}`);

  // Trích ID từ URL
  const docId = extractGoogleId(contractUrl);
  if (!docId) {
    const msg = 'Không tìm được ID từ URL: ' + contractUrl;
    Logger.log(msg);
    sendTelegram('⚠️ ' + msg);
    return null;
  }

  // Đọc nội dung hợp đồng
  let docText = '';
  try {
    const doc = DocumentApp.openById(docId);
    docText = doc.getBody().getText();
    Logger.log('Đọc hợp đồng thành công, ' + docText.length + ' ký tự');
  } catch(e) {
    Logger.log('Lỗi đọc doc: ' + e.message);
    sendTelegram(`⚠️ Không đọc được hợp đồng: ${e.message}`);
    return null;
  }

  // Trích quyền lợi từ nội dung
  const benefits = extractBenefits(docText);
  Logger.log(`Trích được ${benefits.length} quyền lợi`);

  // Copy file tracking từ template
  const newSheetUrl = createTrackingSheet(orgName, programName, benefits);

  // Thông báo Telegram
  const msg = `✅ *Đã tạo file tracking!*\n\n` +
    `🏫 *Đơn vị:* ${orgName}\n` +
    `🎯 *Chương trình:* ${programName}\n` +
    `📋 *Số quyền lợi trích được:* ${benefits.length}\n\n` +
    `📊 *Link tracking:* ${newSheetUrl}\n\n` +
    (benefits.length > 0 ? `*Quyền lợi đã trích:*\n${benefits.slice(0,8).map((b,i)=>`${i+1}. ${b}`).join('\n')}${benefits.length>8?`\n...và ${benefits.length-8} mục khác`:''}` : '');

  sendTelegram(msg);
  return newSheetUrl;
}

/**
 * Trích danh sách quyền lợi từ văn bản hợp đồng
 * Tìm phần "Quyền lợi" và liệt kê các mục dạng gạch đầu dòng
 */
function extractBenefits(text) {
  const benefits = [];

  // Tìm vùng "Quyền lợi Nhà Tài Trợ"
  const sectionMatch = text.match(/quy[eê]n l[oợ]i.{0,50}nh[aà] t[aà]i tr[oợ]/i);
  if (!sectionMatch) {
    Logger.log('Không tìm thấy phần "Quyền lợi NTT" trong hợp đồng');
    return extractBenefitsFallback(text);
  }

  const startIdx = sectionMatch.index;
  // Lấy khoảng 3000 ký tự sau tiêu đề quyền lợi
  const section = text.slice(startIdx, startIdx + 3000);

  // Tìm các dòng có dạng bullet: -, •, ✓, *, số thứ tự
  const lines = section.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Nhận diện dòng quyền lợi
    const isBullet = /^[-•✓✔*▪▸►]/.test(trimmed);
    const isNumbered = /^\d+[\.\)]\s+/.test(trimmed);
    const isLetter = /^[a-z]\)\s+/i.test(trimmed);

    if (isBullet || isNumbered || isLetter) {
      // Loại bỏ ký tự bullet/số
      let clean = trimmed.replace(/^[-•✓✔*▪▸►]\s*/, '')
                         .replace(/^\d+[\.\)]\s+/, '')
                         .replace(/^[a-z]\)\s+/i, '')
                         .trim();
      if (clean.length > 5 && clean.length < 200) {
        benefits.push(clean);
      }
    }
  }

  // Nếu không tìm được bằng bullet, thử cách khác
  if (benefits.length === 0) return extractBenefitsFallback(text);

  return benefits;
}

/**
 * Phương pháp dự phòng: tìm các dòng có từ khoá quyền lợi phổ biến
 */
function extractBenefitsFallback(text) {
  const keywords = ['lượt đánh giá', 'logo', 'bài viết', 'bài đăng', 'hình ảnh', 'kỷ niệm chương',
    'database', 'video', 'tvc', 'standee', 'booth', 'gian hàng', 'thư cảm ơn', 'mc giới thiệu',
    'tri ân', 'data sinh viên', 'phát biểu', 'lượt like', 'lượt theo dõi'];
  const benefits = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 10 || trimmed.length > 200) continue;
    if (keywords.some(kw => trimmed.toLowerCase().includes(kw))) {
      benefits.push(trimmed.replace(/^[-•✓✔*▪▸►\d\.]\s*/, '').trim());
    }
  }
  return [...new Set(benefits)]; // Bỏ trùng
}

/**
 * Tạo file tracking Google Sheets mới từ template
 */
function createTrackingSheet(orgName, programName, benefits) {
  const today = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy');
  const fileName = `[Tracking] ${orgName.slice(0,40)} — ${programName.slice(0,40)}`;

  let newFile;
  try {
    // Copy từ template nếu có
    if (CONFIG.TRACKING_TEMPLATE_ID) {
      const template = DriveApp.getFileById(CONFIG.TRACKING_TEMPLATE_ID);
      newFile = template.makeCopy(fileName);
    } else {
      // Tạo sheet mới từ đầu
      const ss = SpreadsheetApp.create(fileName);
      newFile = DriveApp.getFileById(ss.getId());
    }

    // Di chuyển vào folder nếu có
    if (CONFIG.TRACKING_FOLDER_ID) {
      const folder = DriveApp.getFolderById(CONFIG.TRACKING_FOLDER_ID);
      folder.addFile(newFile);
      DriveApp.getRootFolder().removeFile(newFile);
    }

    // Mở và điền dữ liệu
    const ss = SpreadsheetApp.openById(newFile.getId());
    populateTrackingSheet(ss, orgName, programName, benefits, today);

  } catch(e) {
    Logger.log('Lỗi tạo tracking sheet: ' + e.message);
    // Tạo sheet mới từ đầu nếu copy thất bại
    const ss = SpreadsheetApp.create(fileName);
    populateTrackingSheet(ss, orgName, programName, benefits, today);
    newFile = DriveApp.getFileById(ss.getId());
  }

  return `https://docs.google.com/spreadsheets/d/${newFile.getId()}`;
}

/**
 * Điền dữ liệu vào tracking sheet
 */
function populateTrackingSheet(ss, orgName, programName, benefits, today) {
  // Tìm hoặc tạo sheet "Tracking"
  let sheet = ss.getSheetByName('Tracking') || ss.getActiveSheet();
  sheet.setName('Tracking');
  sheet.clearContents();

  // Header
  const headers = [
    ['PNE — FILE THEO DÕI QUYỀN LỢI NHÀ TÀI TRỢ'],
    ['Đơn vị tài trợ:', orgName],
    ['Chương trình:', programName],
    ['Ngày tạo:', today],
    [''],
    ['STT', 'Quyền lợi', 'Trạng thái', 'Ngày hoàn thành', 'Ghi chú', 'Bằng chứng (Link)'],
  ];

  sheet.getRange(1, 1, headers.length, 6).setValues(
    headers.map((row, i) => {
      while (row.length < 6) row.push('');
      return row;
    })
  );

  // Styling header
  sheet.getRange(1, 1, 1, 6).merge()
    .setValue('PNE — FILE THEO DÕI QUYỀN LỢI NHÀ TÀI TRỢ')
    .setBackground('#2563eb').setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center');

  sheet.getRange(2, 1, 3, 1).setFontWeight('bold');
  sheet.getRange(6, 1, 1, 6)
    .setBackground('#f1f5f9').setFontWeight('bold').setFontSize(10);

  // Điền quyền lợi
  if (benefits.length > 0) {
    const rows = benefits.map((b, i) => [i + 1, b, '⏳ Chưa xong', '', '', '']);
    sheet.getRange(7, 1, rows.length, 6).setValues(rows);

    // Dropdown Trạng thái
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['✅ Hoàn thành', '⏳ Chưa xong', '🔄 Đang thực hiện', '❌ Bỏ qua'], true)
      .build();
    sheet.getRange(7, 3, rows.length, 1).setDataValidation(rule);

    // Conditional formatting: xanh khi hoàn thành
    const range = sheet.getRange(7, 1, rows.length, 6);
    const rule2 = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=$C7="✅ Hoàn thành"`)
      .setBackground('#f0fdf4').build();
    sheet.setConditionalFormatRules([rule2]);
  } else {
    sheet.getRange(7, 1).setValue('(Chưa trích được quyền lợi — vui lòng nhập thủ công)');
  }

  // Format cột
  sheet.setColumnWidth(1, 45);
  sheet.setColumnWidth(2, 350);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(6, 200);
  sheet.setFrozenRows(6);

  // Thêm sheet tóm tắt voucher
  let voucherSheet = ss.getSheetByName('Voucher');
  if (!voucherSheet) voucherSheet = ss.insertSheet('Voucher');
  voucherSheet.clearContents();
  voucherSheet.getRange(1, 1, 1, 4).setValues([['Mã voucher', 'Mức giảm', 'Người nhận', 'Ngày giao']]);
  voucherSheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#f1f5f9');
}

// ═══════════════════════════════════════════════════════
// 3. WEB APP — SYNC 2 CHIỀU VỚI DASHBOARD
// ═══════════════════════════════════════════════════════

/**
 * Xử lý GET request từ dashboard
 * Dashboard gọi: fetch(GAS_URL + '?action=getData&year=2026')
 */
function doGet(e) {
  const action = e.parameter.action || 'getData';
  let result;

  try {
    if (action === 'getData') {
      result = getSponsorsFromSheet(e.parameter.year);
    } else if (action === 'ping') {
      result = { ok: true, time: new Date().toISOString() };
    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Xử lý POST request từ dashboard (cập nhật stage, benefit)
 * Dashboard gọi: fetch(GAS_URL, {method:'POST', body: JSON.stringify({...})})
 */
function doPost(e) {
  let result;
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'updateStage') {
      result = updateStageInSheet(data.id, data.stage);
    } else if (action === 'updateBenefit') {
      result = updateBenefitInSheet(data.id, data.benefitId, data.done);
    } else if (action === 'addRecord') {
      result = addRecordToSheet(data.record);
    } else if (action === 'createTracking') {
      const url = createTrackingFromContract(data.contractUrl, data.orgName, data.programName);
      result = { ok: true, trackingUrl: url };
    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Đọc dữ liệu từ Google Sheets về cho dashboard
 */
function getSponsorsFromSheet(yearFilter) {
  const ss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);
  if (!sheet) return { error: `Sheet "${CONFIG.MASTER_SHEET_NAME}" không tồn tại` };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { sponsors: [] };

  const headers = data[0];
  const colIdx = {};
  headers.forEach((h, i) => colIdx[String(h).toLowerCase().trim()] = i);

  const sponsors = data.slice(1).map(row => {
    const get = (col) => {
      const i = colIdx[col];
      return i !== undefined ? row[i] : '';
    };
    return {
      id: get('id') || ('sp-' + Date.now() + Math.random()),
      year: String(get('year') || '2026'),
      org: get('org') || get('đơn vị') || '',
      prog: get('prog') || get('chương trình') || '',
      date: get('date') || get('thời gian') || '',
      cat: get('cat') || get('hạng mục') || 'Khác',
      stage: get('stage') || get('giai đoạn') || 'new',
      totalValue: Number(get('totalvalue') || get('giá trị') || 0),
      cashValue: Number(get('cashvalue') || get('hiện kim') || 0),
      voucherCode: get('vouchercode') || get('mã voucher') || '',
      voucherExpiry: get('voucherexpiry') || get('hạn voucher') || '',
      trackingUrl: get('trackingurl') || get('tracking') || '',
      contractUrl: get('contracturl') || get('hợp đồng') || '',
      notes: get('notes') || get('ghi chú') || '',
      benefits: [],
    };
  }).filter(s => s.org); // Bỏ dòng trống

  const filtered = yearFilter && yearFilter !== 'all'
    ? sponsors.filter(s => s.year === yearFilter)
    : sponsors;

  return { sponsors: filtered, total: filtered.length };
}

/**
 * Cập nhật giai đoạn trong Google Sheets
 */
function updateStageInSheet(id, newStage) {
  const ss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);
  if (!sheet) return { error: 'Sheet not found' };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.findIndex(h => String(h).toLowerCase() === 'id');
  const stageCol = headers.findIndex(h => String(h).toLowerCase() === 'stage');

  if (idCol < 0 || stageCol < 0) return { error: 'Không tìm thấy cột id hoặc stage' };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.getRange(i + 1, stageCol + 1).setValue(newStage);
      return { ok: true, updated: id };
    }
  }
  return { error: 'Không tìm thấy hồ sơ: ' + id };
}

/**
 * Thêm hồ sơ mới vào Google Sheets
 */
function addRecordToSheet(record) {
  const ss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);
  if (!sheet) return { error: 'Sheet not found' };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => {
    const key = String(h).toLowerCase().trim();
    return record[key] !== undefined ? record[key] : '';
  });

  sheet.appendRow(row);
  return { ok: true };
}

/**
 * Cập nhật trạng thái quyền lợi (ghi vào sheet tracking tương ứng)
 * Nếu có trackingUrl thì ghi vào đó, không thì ghi log vào master sheet
 */
function updateBenefitInSheet(sponsorId, benefitId, done) {
  // Tính năng này cần trackingUrl của hồ sơ để biết ghi vào sheet nào
  // Tạm thời: log vào sheet "Benefit Updates" trong master file
  const ss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);
  let logSheet = ss.getSheetByName('Benefit Updates');
  if (!logSheet) {
    logSheet = ss.insertSheet('Benefit Updates');
    logSheet.appendRow(['Thời gian', 'Sponsor ID', 'Benefit ID', 'Trạng thái']);
    logSheet.getRange(1,1,1,4).setFontWeight('bold').setBackground('#f1f5f9');
  }
  const now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');
  logSheet.appendRow([now, sponsorId, benefitId, done ? '✅ Hoàn thành' : '⏳ Chưa xong']);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════
// TELEGRAM HELPER
// ═══════════════════════════════════════════════════════

function sendTelegram(message) {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || CONFIG.TELEGRAM_BOT_TOKEN === 'DIEN_BOT_TOKEN_VAO_DAY') {
    Logger.log('[Telegram] Token chưa được cài đặt. Message:\n' + message);
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: CONFIG.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
    };
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    Logger.log('Telegram: Đã gửi thông báo.');
  } catch(e) {
    Logger.log('Telegram error: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════
// TRIGGER SETUP
// ═══════════════════════════════════════════════════════

/**
 * Chạy hàm này MỘT LẦN để cài đặt tự động hoá
 * Sau khi chạy, Gmail sẽ được kiểm tra tự động mỗi giờ
 */
function setupTriggers() {
  // Xoá triggers cũ
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Trigger mỗi giờ: quét Gmail
  ScriptApp.newTrigger('checkNewSponsorEmails')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('✅ Đã cài đặt trigger: checkNewSponsorEmails (mỗi giờ)');
  Logger.log('✅ Setup hoàn tất! Chạy kiểm tra thử với checkNewSponsorEmails()');

  // Test ngay lập tức
  sendTelegram('✅ *PNE Tài Trợ Bot đã sẵn sàng!*\n\nBot sẽ thông báo khi có email tài trợ mới.\nChạy mỗi giờ một lần.');
}

// ═══════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════

function extractGoogleId(url) {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Test gửi Telegram thủ công
 */
function testTelegram() {
  sendTelegram('🔔 Test thành công từ PNE Tài Trợ Script!\n\n⏰ ' + new Date().toLocaleString('vi-VN'));
}

/**
 * Test quét Gmail ngay lập tức (không đợi trigger)
 */
function testGmailScan() {
  checkNewSponsorEmails();
}

/**
 * Test tạo tracking từ contract (thay URL thật vào)
 */
function testCreateTracking() {
  const testContractUrl = 'https://docs.google.com/document/d/YOUR_DOC_ID_HERE';
  const url = createTrackingFromContract(testContractUrl, 'CLB Test', 'Sự kiện Test 2026');
  Logger.log('Tracking URL: ' + url);
}
