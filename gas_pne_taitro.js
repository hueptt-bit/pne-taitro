// ═══════════════════════════════════════════════════════════════
// PNE TÀI TRỢ — Google Apps Script v2
// Vai trò: API cho Dashboard (flat-table DB) + Gmail Watcher + Telegram Bot
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  TG_TOKEN:          '8883609953:AAEe88AtNr808jQhJ0gZM8ntX7ShSVXfHTI',
  TG_CHAT_ID:        '-5110564753',          // Group chính (nhận hồ sơ mới, liên hệ...)
  TG_EXEC_CHAT_ID:   '-5158615383',           // Group thực thi [Tài trợ] Trả quyền lợi
  TG_VOUCHER_CHAT_ID:'-5285106597',           // Group in voucher (nhận yêu cầu in + xác nhận)
  SHEET_NAME:        'Records',
  DELETED_SHEET:     'Deleted',          // Sheet lưu các ID đã xoá
  SPREADSHEET_ID:    '1zXOliDHlkELXzLE0dIAZc9s5ubbD5Knglfa94Y-hAfs',
  WEB_APP_URL:       'https://script.google.com/macros/s/AKfycbzbj-icBWeMN-_5c7wV1SnAoWgk3dtcwzaSj_j_emrvAibrx_HwFr17s7cSngZVjz_VYQ/exec',
  DASHBOARD_URL:     'https://hueptt-bit.github.io/pne-taitro/dashboard.html',
  GMAIL_QUERY:       '-label:pne-processed newer_than:3d',
  GMAIL_LABEL:       'pne-processed',
};

// ═══════════════════════════════════════════════════════════════
// MAPS REVIEW — hằng số dùng khi tạo tracking
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// VOUCHER — nhãn hiển thị cho từng loại voucher
// ═══════════════════════════════════════════════════════════════

const VOUCHER_TYPE_LABELS = {
  '100%': '100% (9.8M)', '80%': '80% (7.84M)', '50%': '50% (4.9M)',
  '35%': '35% (3.43M)', '30%': '30% (2.94M)', '25%': '25% (2.45M)',
  '20%': '20% (1.96M)', '15%': '15% (1.47M)', 'Gấu bông': 'Gấu bông (180K)',
};

// ═══════════════════════════════════════════════════════════════
// MAPS REVIEW — hằng số dùng khi tạo tracking
// ═══════════════════════════════════════════════════════════════

const MAPS_REVIEW_TARGETS = [
  { name: 'Phuong Nam Education',                  url: 'https://maps.app.goo.gl/RxrX3REuXqztDiJx7' },
  { name: 'Học tiếng Đức - Du học Đức Phương Nam', url: 'https://maps.app.goo.gl/xjq8zhKZvn7tFBZbA' },
  { name: 'Trung Tâm Học Tiếng Pháp Phương Nam',   url: 'https://maps.app.goo.gl/4HaAwbSLyEuhJSGB8' },
];
const MAPS_REVIEW_NOTES = [
  'Chỉ cần đánh giá 5 sao, không cần nội dung',
  'Mỗi 01 đánh giá dùng 01 email cá nhân khác nhau',
  'Dùng 3G để review, không dùng chung 1 wifi',
  'Chia timeline review, tối đa 10 reviews/ngày',
  'BTC soạn timeline + gửi tên tài khoản dùng để review trước, gửi bên PNE check rồi mới tiến hành review',
];

// ═══════════════════════════════════════════════════════════════
// ĐỊNH NGHĨA CỘT — thứ tự này quyết định layout của sheet
// Thêm/bớt cột: chỉ sửa ở đây, toàn bộ code tự theo
// ═══════════════════════════════════════════════════════════════

const COLS = [
  // ── Nhận diện ──────────────────────────────────────────────
  { key: 'id',                label: 'ID' },
  { key: 'track',             label: 'Track' },
  { key: 'year',              label: 'Năm' },
  { key: 'org',               label: 'CLB / Đơn vị' },
  { key: 'event',             label: 'Sự kiện / Chương trình' },
  { key: 'cat',               label: 'Hạng mục' },
  { key: 'stage',             label: 'Giai đoạn' },
  // ── Thời gian ──────────────────────────────────────────────
  { key: 'receivedDate',      label: 'Ngày nhận hồ sơ' },
  { key: 'deadlineDate',      label: 'Deadline sự kiện' },
  // ── Liên hệ ────────────────────────────────────────────────
  { key: 'contact',           label: 'Người liên hệ' },
  { key: 'phone',             label: 'SĐT' },
  { key: 'zaloGroup',         label: 'Zalo Group' },
  { key: 'lienhe_status',     label: 'TT liên hệ' },
  // ── Offer / Tài chính ──────────────────────────────────────
  { key: '_offerTotal',       label: 'Giá trị offer (đề xuất)' },   // computed
  { key: 'final_offer',       label: 'Offer cam kết' },
  { key: 'final_offer_type',  label: 'Loại offer' },
  { key: 'final_offer_note',  label: 'Ghi chú offer' },
  // ── Hợp đồng ───────────────────────────────────────────────
  { key: 'contract_status',   label: 'TT hợp đồng' },
  { key: 'contract_method',   label: 'Phương thức HĐ' },
  { key: 'signing_date',      label: 'Ngày ký' },
  { key: 'contract_link',     label: 'Link hợp đồng' },
  { key: 'contract_note',     label: 'Ghi chú HĐ' },
  // ── Voucher ────────────────────────────────────────────────
  { key: 'mavoucher',              label: 'Mã voucher' },
  { key: 'hanvoucher',             label: 'Hạn voucher' },
  { key: 'voucher_status',         label: 'TT in voucher' },
  { key: 'voucher_print_qty',      label: 'SL in' },
  { key: 'voucher_print_deadline', label: 'Deadline in' },
  // ── Thực thi ───────────────────────────────────────────────
  { key: 'anhsukien',         label: 'Album ảnh sự kiện' },
  { key: 'data',              label: 'Link data' },
  { key: 'trackingUrl',       label: 'Link tracking' },
  // ── Test Online ────────────────────────────────────────────
  { key: 'test_platform',     label: 'Nền tảng thi' },
  { key: 'test_account_type', label: 'Loại tài khoản' },
  { key: 'test_offer_note',   label: 'Ghi chú offer test' },
  { key: 'username',          label: 'Tài khoản' },
  { key: 'expiry',            label: 'Hạn tài khoản' },
  // ── Tài liệu ───────────────────────────────────────────────
  { key: 'proposalUrl',       label: 'Link hồ sơ' },
  { key: 'hangmuc',           label: 'Hạng mục chi tiết' },
  { key: 'hopdong',           label: 'Link HĐ (cũ)' },
  { key: 'notes',             label: 'Ghi chú' },
  // ── Metadata ───────────────────────────────────────────────
  { key: 'source',            label: 'Nguồn' },
  { key: 'gmailId',           label: 'Gmail ID' },
  // ── Dữ liệu phức tạp (JSON — không chỉnh tay) ─────────────
  { key: '_benefits_json',    label: '[JSON] Quyền lợi thực thi' },
  { key: '_offer_json',       label: '[JSON] Offer items' },
  { key: '_clbPackages_json', label: '[JSON] Gói CLB' },
  { key: '_neg_json',         label: '[JSON] Đàm phán' },
  { key: '_approval_json',         label: '[JSON] Duyệt offer' },
  { key: '_mapsReview_json',       label: '[JSON] Maps Review' },
  { key: '_roomSponsorships_json', label: '[JSON] Tài trợ phòng' },
  // ── Timestamp ──────────────────────────────────────────────
  { key: 'updatedAt',              label: 'Cập nhật lúc' },
];

// Tạo lookup nhanh: key → index (1-based)
const COL_IDX = {};
COLS.forEach((c, i) => { COL_IDX[c.key] = i + 1; });

// ═══════════════════════════════════════════════════════════════
// SHEET HELPERS
// ═══════════════════════════════════════════════════════════════

function getSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    _initSheetHeaders(sheet);
  }
  return sheet;
}

function getDeletedSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.DELETED_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.DELETED_SHEET);
    sheet.appendRow(['deleted_id', 'deletedAt']);
    sheet.getRange(1, 1, 1, 2)
      .setFontWeight('bold')
      .setBackground('#fef2f2')
      .setFontColor('#991b1b');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 160);
  }
  return sheet;
}

function _initSheetHeaders(sheet) {
  const headers = COLS.map(c => c.label);
  sheet.appendRow(headers);

  // Style header row
  const hRange = sheet.getRange(1, 1, 1, COLS.length);
  hRange.setFontWeight('bold')
        .setBackground('#C00000')
        .setFontColor('#FFFFFF')
        .setFontSize(10)
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle')
        .setWrap(true);
  sheet.setRowHeight(1, 45);
  sheet.setFrozenRows(1);

  // Column widths
  const widths = {
    id: 120, track: 70, year: 55, org: 180, event: 200, cat: 100, stage: 110,
    receivedDate: 100, deadlineDate: 100,
    contact: 140, phone: 110, zaloGroup: 140, lienhe_status: 100,
    _offerTotal: 110, final_offer: 110, final_offer_type: 90, final_offer_note: 140,
    contract_status: 110, contract_method: 110, signing_date: 90, contract_link: 160,
    contract_note: 140, mavoucher: 110, hanvoucher: 90,
    anhsukien: 160, data: 160, trackingUrl: 180,
    test_platform: 110, test_account_type: 110, test_offer_note: 160,
    username: 120, expiry: 90,
    proposalUrl: 160, hangmuc: 140, hopdong: 140, notes: 200,
    source: 70, gmailId: 140,
    _benefits_json: 80, _offer_json: 80, _clbPackages_json: 80,
    _neg_json: 80, _approval_json: 80, _mapsReview_json: 80, _roomSponsorships_json: 80,
    updatedAt: 140,
  };
  COLS.forEach((c, i) => {
    if (widths[c.key]) sheet.setColumnWidth(i + 1, widths[c.key]);
  });

  // Freeze ID column
  sheet.setFrozenColumns(1);
}

// ── Record ↔ Row conversion ─────────────────────────────────────

function recordToRow(r) {
  // Compute offer total from items
  const offerTotal = (r.offer && Array.isArray(r.offer.items))
    ? r.offer.items.reduce((s, i) => s + (i.isCash ? (+i.cashVal || 0) : (+i.qty || 0) * (+i.maxVal || 0)), 0)
    : 0;

  // Build row array, index matches COLS
  return COLS.map(c => {
    switch(c.key) {
      case '_offerTotal':       return offerTotal || '';
      case '_benefits_json':    return r.benefits && r.benefits.length    ? JSON.stringify(r.benefits)    : '';
      case '_offer_json':       return r.offer                            ? JSON.stringify(r.offer)       : '';
      case '_clbPackages_json': return r.clbPackages && r.clbPackages.length ? JSON.stringify(r.clbPackages) : '';
      case '_neg_json':         return (r.neg_items || r.neg_benefits)
                                  ? JSON.stringify({ items: r.neg_items||[], benefits: r.neg_benefits||[], final_offer: r.final_offer||0, pkg_idx: r.neg_pkg_idx })
                                  : '';
      case '_approval_json':         return r.approval ? JSON.stringify(r.approval) : '';
      case '_mapsReview_json':       return r.mapsReview && r.mapsReview.qty > 0 ? JSON.stringify(r.mapsReview) : '';
      case '_roomSponsorships_json': return r.roomSponsorships && r.roomSponsorships.length ? JSON.stringify(r.roomSponsorships) : '';
      case 'updatedAt':              return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      default:                  return r[c.key] !== undefined ? r[c.key] : '';
    }
  });
}

function rowToRecord(row) {
  const r = {};
  COLS.forEach((c, i) => {
    const val = row[i];
    switch(c.key) {
      case '_offerTotal': break; // computed — bỏ qua
      case '_benefits_json':
        if (val) try { r.benefits = JSON.parse(val); } catch(e) { r.benefits = []; }
        else r.benefits = [];
        break;
      case '_offer_json':
        if (val) try { r.offer = JSON.parse(val); } catch(e) { r.offer = null; }
        else r.offer = null;
        break;
      case '_clbPackages_json':
        if (val) try { r.clbPackages = JSON.parse(val); } catch(e) { r.clbPackages = []; }
        else r.clbPackages = [];
        break;
      case '_neg_json':
        if (val) {
          try {
            const neg = JSON.parse(val);
            r.neg_items    = neg.items    || [];
            r.neg_benefits = neg.benefits || [];
            r.final_offer  = neg.final_offer || 0;
            r.neg_pkg_idx  = neg.pkg_idx;
          } catch(e) {}
        } else {
          r.neg_items = []; r.neg_benefits = []; r.final_offer = 0;
        }
        break;
      case '_approval_json':
        if (val) try { r.approval = JSON.parse(val); } catch(e) { r.approval = null; }
        else r.approval = null;
        break;
      case '_mapsReview_json':
        if (val) try { r.mapsReview = JSON.parse(val); } catch(e) { r.mapsReview = null; }
        else r.mapsReview = null;
        break;
      case '_roomSponsorships_json':
        if (val) try { r.roomSponsorships = JSON.parse(val); } catch(e) { r.roomSponsorships = []; }
        else r.roomSponsorships = [];
        break;
      case 'updatedAt': break; // metadata — bỏ qua
      default:
        if (val !== '' && val !== null && val !== undefined) r[c.key] = String(val);
        else if (r[c.key] === undefined) r[c.key] = '';
    }
  });
  // Đảm bảo year luôn là string
  if (r.year) r.year = String(r.year);
  return r;
}

// ── CRUD ────────────────────────────────────────────────────────

function getAllRecords() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, COLS.length).getValues();
  return data
    .filter(row => row[0]) // bỏ hàng trống (không có id)
    .map(row => rowToRecord(row));
}

function findRowById(id) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const idx = ids.indexOf(id);
  return idx >= 0 ? idx + 2 : -1; // +2 vì hàng 1 là header, mảng 0-indexed
}

function upsertRecord(record) {
  const sheet = getSheet();
  record.updatedAt = new Date().toISOString();
  const row = recordToRow(record);
  const rowIdx = findRowById(record.id);
  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, COLS.length).setValues([row]);
  } else {
    sheet.appendRow(row);
    // Style hàng data (xen kẽ màu nền)
    const newRow = sheet.getLastRow();
    if (newRow % 2 === 0) {
      sheet.getRange(newRow, 1, 1, COLS.length).setBackground('#FFF5F5');
    }
  }
}

function saveAllRecords(records) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, COLS.length).clearContent();
  if (!records.length) return;
  const rows = records.map(r => recordToRow(r));
  sheet.getRange(2, 1, rows.length, COLS.length).setValues(rows);
  // Xen kẽ màu nền
  rows.forEach((_, i) => {
    if ((i + 2) % 2 === 0) {
      sheet.getRange(i + 2, 1, 1, COLS.length).setBackground('#FFF5F5');
    } else {
      sheet.getRange(i + 2, 1, 1, COLS.length).setBackground('#FFFFFF');
    }
  });
}

function updateRecordField(id, field, value) {
  const sheet = getSheet();
  const rowIdx = findRowById(id);
  if (rowIdx < 0) return null;
  const row = sheet.getRange(rowIdx, 1, 1, COLS.length).getValues()[0];
  const record = rowToRecord(row);
  record[field] = value;
  sheet.getRange(rowIdx, 1, 1, COLS.length).setValues([recordToRow(record)]);
  return record;
}

function deleteRecordById(id) {
  const sheet = getSheet();
  const rowIdx = findRowById(id);
  if (rowIdx > 0) sheet.deleteRow(rowIdx);
  // Ghi vào sheet Deleted để dashboard biết
  _logDeleted(id);
}

function _logDeleted(id) {
  const dSheet = getDeletedSheet();
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  dSheet.appendRow([id, now]);
}

function getDeletedIds() {
  const dSheet = getDeletedSheet();
  const lastRow = dSheet.getLastRow();
  if (lastRow < 2) return [];
  return dSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════
// WEB APP — API cho Dashboard (GET + POST)
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'getAll';
  if (action === 'getAll') {
    return jsonResponse({
      ok: true,
      records:    getAllRecords(),
      deletedIds: getDeletedIds(),
    });
  }
  if (action === 'ping') {
    return jsonResponse({ ok: true, time: new Date().toISOString() });
  }
  if (action === 'login') {
    const username = String((e.parameter && e.parameter.username) || '').trim().toLowerCase();
    const password = String((e.parameter && e.parameter.password) || '').trim();
    if (!username || !password) return jsonResponse({ ok: false, error: 'Vui lòng nhập đầy đủ thông tin' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Users');

    if (!sheet) {
      sheet = ss.insertSheet('Users');
      sheet.getRange(1, 1, 1, 5).setValues([['username', 'password', 'name', 'role', 'active']]);
      sheet.getRange(2, 1, 3, 5).setValues([
        ['hueptt',   'Pne@2026',   'Hue PTT',    'admin', true],
        ['duonght',  'Pne@2026',   'Thuy Duong', 'admin', true],
        ['pneadmin', 'Admin@2026', 'Admin PNE',  'admin', true]
      ]);
    }

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const [uname, pass, name, role, active] = data[i];
      if (
        String(uname).trim().toLowerCase() === username &&
        String(pass).trim() === password &&
        active !== false && String(active).toUpperCase() !== 'FALSE'
      ) {
        return jsonResponse({ ok: true, user: { username: String(uname).trim(), name: String(name) || String(uname), role: String(role) || 'admin' } });
      }
    }
    return jsonResponse({ ok: false, error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  return jsonResponse({ ok: false, error: 'Unknown GET action: ' + action });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch(err) { return jsonResponse({ ok: false, error: 'Invalid JSON' }); }

  // ── Telegram callback / message ──
  if (body.callback_query) { handleTelegramCallback(body.callback_query); return jsonResponse({ ok: true }); }
  if (body.message && body.message.text) { handleTelegramMessage(body.message); return jsonResponse({ ok: true }); }

  // ── Dashboard API ──
  const action = body.action;

  if (action === 'saveAll') {
    saveAllRecords(body.records || []);
    // Đồng bộ danh sách ID đã xoá nếu có
    if (Array.isArray(body.deletedIds)) {
      body.deletedIds.forEach(id => {
        const existing = getDeletedIds();
        if (!existing.includes(id)) _logDeleted(id);
      });
    }
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
    try { return jsonResponse(createTrackingForRecord(body.id)); }
    catch(e) { return jsonResponse({ ok: false, error: 'createTracking: ' + e.message }); }
  }
  if (action === 'voucherPrintNotify') {
    try { return jsonResponse(handleVoucherPrintNotify(body)); }
    catch(e) { return jsonResponse({ ok: false, error: 'voucherPrintNotify: ' + e.message }); }
  }

  if (action === 'login') {
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    if (!username || !password) return jsonResponse({ ok: false, error: 'Vui lòng nhập đầy đủ thông tin' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Users');

    // Tu dong tao sheet Users voi 3 tai khoan mac dinh neu chua co
    if (!sheet) {
      sheet = ss.insertSheet('Users');
      sheet.getRange(1, 1, 1, 5).setValues([['username', 'password', 'name', 'role', 'active']]);
      sheet.getRange(2, 1, 3, 5).setValues([
        ['hueptt',   'Pne@2026',   'Hue PTT',     'admin', true],
        ['duonght',  'Pne@2026',   'Thuy Duong',  'admin', true],
        ['pneadmin', 'Admin@2026', 'Admin PNE',   'admin', true]
      ]);
      Logger.log('Created Users sheet with default accounts');
    }

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const [uname, pass, name, role, active] = data[i];
      if (
        String(uname).trim().toLowerCase() === username &&
        String(pass).trim() === password &&
        active !== false && String(active).toUpperCase() !== 'FALSE'
      ) {
        return jsonResponse({ ok: true, user: { username: String(uname).trim(), name: String(name) || String(uname), role: String(role) || 'admin' } });
      }
    }
    return jsonResponse({ ok: false, error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }

  return jsonResponse({ ok: false, error: 'Unknown POST action: ' + action });
}

// ═══════════════════════════════════════════════════════════════
// TRACKING — Tạo file Google Sheet tracking quyền lợi
// ═══════════════════════════════════════════════════════════════

function createTrackingForRecord(id) {
  if (!id) return { ok: false, error: 'Missing id' };
  const records = getAllRecords();
  const record  = records.find(r => r.id === id);
  if (!record) return { ok: false, error: 'Record not found: ' + id };

  let benefitRows = [];
  const docUrl = record.contract_link || record.hopdong || '';
  if (docUrl && docUrl.includes('docs.google.com')) {
    try { benefitRows = extractBenefitsFromDoc(docUrl); } catch(e) {}
  }
  if (!benefitRows.length && record.neg_benefits && record.neg_benefits.length) {
    benefitRows = record.neg_benefits
      .filter(b => b.text && !b.isHeader && !isPricingText(b.text))
      .map(b => ({ category: classifyBenefit(b.text), name: b.text, chiTiet: getChiTietForBenefit(b.text), yeuCau: getYeuCauForBenefit(b.text) }));
  }
  if (!benefitRows.length && record.benefits && record.benefits.length) {
    benefitRows = record.benefits
      .filter(b => b.text && !isPricingText(b.text))
      .map(b => ({ category: classifyBenefit(b.text), name: b.text, chiTiet: getChiTietForBenefit(b.text), yeuCau: getYeuCauForBenefit(b.text) }));
  }
  if (!benefitRows.length) {
    benefitRows = [{ category: 'Trực tiếp', name: '(Chưa có quyền lợi — thêm thủ công)', chiTiet: '', yeuCau: '' }];
  }

  // Inject maps review rows nếu có (chỉ hiện map nếu count > 0)
  if (record.mapsReview && record.mapsReview.qty > 0) {
    const mr = record.mapsReview;
    const pm = mr.perMap || [0, 0, 0];
    const yeuCau = MAPS_REVIEW_NOTES.map(n => '. ' + n).join('\n');
    const activeSubs = MAPS_REVIEW_TARGETS
      .map(function(m, i) { return { count: pm[i] || 0, chiTiet: '. ' + (pm[i] || 0) + ' lượt ' + m.name + ': ' + m.url }; })
      .filter(function(sr) { return sr.count > 0; });
    benefitRows.push({
      category: 'Truyền thông',
      name: '. ' + mr.qty + ' lượt đánh giá 5 sao trên nền tảng Google Maps',
      yeuCau: yeuCau,
      subRows: activeSubs.length > 0 ? activeSubs : undefined,
      chiTiet: activeSubs.length === 0 ? '' : undefined,
    });
  }

  const url = buildTrackingSpreadsheet(record.org || 'Nhà tài trợ', record.event || 'Sự kiện', benefitRows);
  updateRecordField(id, 'trackingUrl', url);
  return { ok: true, trackingUrl: url };
}

function extractBenefitsFromDoc(docUrl) {
  const match = docUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return [];
  let doc;
  try { doc = DocumentApp.openById(match[1]); } catch(e) { return []; }
  const text = doc.getBody().getText();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let startIdx = -1, endIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (startIdx === -1 && low.includes('quyền lợi') &&
        (low.match(/điều\s*[45ivxIVX]/) || low.includes('bên b') || low.match(/^\d+\./))) {
      startIdx = i + 1; continue;
    }
    if (startIdx !== -1 && i > startIdx + 1) {
      if (low.match(/^điều\s+\d+/) || low.match(/^\s*[ivx]+\.\s/i) ||
          low.match(/^chương\s+/i) || low.match(/^phần\s+/i)) { endIdx = i; break; }
    }
  }
  if (startIdx === -1) return [];
  const benefits = [];
  lines.slice(startIdx, endIdx).forEach(line => {
    if (!line.match(/^[-•–\d\.\)a-z]\s*.{4,}/) && line.length < 10) return;
    const cleaned = line.replace(/^[-•–]\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim();
    if (!cleaned || cleaned.length < 5) return;
    benefits.push({ category: classifyBenefit(cleaned), name: cleaned, chiTiet: getChiTietForBenefit(cleaned), yeuCau: getYeuCauForBenefit(cleaned) });
  });
  return benefits;
}

// Trả về true nếu text trông như dòng giá gói (không phải quyền lợi thực sự)
// VD: "50.000.000 VNĐ Gói Vàng: ..." hoặc "Gói Vàng: 25M ..."
function isPricingText(text) {
  if (!text) return false;
  const t = text.trim();
  // Bắt đầu bằng số tiền: "50.000.000 VNĐ" hoặc "50,000,000đ"
  if (/^\d[\d\.,]+\s*(VNĐ|vnđ|đồng|đ)\b/i.test(t)) return true;
  // Chứa nhiều mức giá gói liên tiếp: "Gói Vàng.*Gói Bạc" hoặc "Gói Đồng"
  const pkgCount = (t.match(/Gói\s*(Vàng|Bạc|Đồng|Kim cương|Bạch kim|Đồng hành)/gi) || []).length;
  if (pkgCount >= 2) return true;
  return false;
}

function classifyBenefit(text) {
  const low = text.toLowerCase();
  const kws = ['logo','banner','website','mạng xã hội','facebook','fanpage','ấn phẩm','tờ rơi','standee','backdrop','roll-up','rollup','poster','livestream','clip','video','quảng bá','truyền thông','pr ','tiktok','instagram','youtube','bài đăng','story','reels','mention','hashtag'];
  return kws.some(k => low.includes(k)) ? 'Truyền thông' : 'Trực tiếp';
}

function getChiTietForBenefit(text) {
  if (text.toLowerCase().includes('logo'))
    return 'File logo: https://drive.google.com/drive/u/2/folders/1pJm8-GusWi7KUGMK-QUrKJqmI1dtnBm0';
  return '';
}

function getYeuCauForBenefit(text) {
  const low = text.toLowerCase();
  if (low.includes('google') && (low.includes('review') || low.includes('đánh giá') || low.includes('maps')))
    return 'Review 5 sao, dùng tài khoản cá nhân riêng biệt, bật 3G/4G, đúng thời hạn cam kết';
  return '';
}

function buildTrackingSpreadsheet(org, event, benefitRows) {
  const RED = '#C00000', WHITE = '#FFFFFF', ORANGE = '#FCE4D6';
  const ss = SpreadsheetApp.create('Tracking - ' + org + ' - ' + event);
  try {
    const folderIter = DriveApp.getFoldersByName('PNE - Hồ sơ tài trợ');
    const folder = folderIter.hasNext() ? folderIter.next() : DriveApp.createFolder('PNE - Hồ sơ tài trợ');
    const file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch(e) {}

  const sheet = ss.getActiveSheet();
  sheet.setName('Tracking');

  sheet.getRange('A1:B2').merge().setValue('Quyền lợi\nNhà tài trợ')
    .setBackground(RED).setFontColor(WHITE).setFontWeight('bold').setFontSize(11)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.getRange('C1:D1').merge().setValue('Phuong Nam Education (PNE)')
    .setBackground(RED).setFontColor(WHITE).setFontWeight('bold').setFontSize(11)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.getRange('E1:G1').merge().setValue('Hội sinh viên (HSV)')
    .setBackground(RED).setFontColor(WHITE).setFontWeight('bold').setFontSize(11)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  [['C2','Chi tiết'],['D2','Yêu cầu'],['E2','Ngày thực hiện'],['F2','File minh chứng'],['G2','Tiến độ hoàn thành']]
    .forEach(([cell, label]) => sheet.getRange(cell).setValue(label)
      .setBackground(RED).setFontColor(WHITE).setFontWeight('bold').setFontSize(10)
      .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true));

  const catMap = {};
  benefitRows.forEach(b => { const cat = b.category || 'Trực tiếp'; if (!catMap[cat]) catMap[cat]=[]; catMap[cat].push(b); });
  const ordered = ['Trực tiếp','Truyền thông'].filter(c => catMap[c])
    .concat(Object.keys(catMap).filter(c => c !== 'Trực tiếp' && c !== 'Truyền thông'));

  let currentRow = 3;
  ordered.forEach(cat => {
    const rows = catMap[cat], startCatRow = currentRow;
    rows.forEach(b => {
      const bStartRow = currentRow;
      const hasSub = b.subRows && b.subRows.length > 0;
      const numRows = hasSub ? b.subRows.length : 1;

      // Col A — category label (styled/merged at category level below)
      sheet.getRange(currentRow, 1).setValue(cat);
      // Col H — category metadata (hidden; used by GAS to read progress per row)
      for (var _ri = 0; _ri < numRows; _ri++) {
        sheet.getRange(bStartRow + _ri, 8).setValue(cat);
      }
      // Col B — benefit name (merged across subRows if applicable)
      sheet.getRange(currentRow, 2).setValue(b.name || '').setWrap(true);
      // Col D — yêu cầu (first row; merged across subRows if applicable)
      sheet.getRange(currentRow, 4).setValue(b.yeuCau || '').setWrap(true);

      if (hasSub) {
        // Col C — one chiTiet per sub-row
        b.subRows.forEach(function(sr, si) {
          sheet.getRange(bStartRow + si, 3).setValue(sr.chiTiet || '').setWrap(true);
        });
        // Merge col B and col D across all sub-rows of this benefit
        if (numRows > 1) {
          sheet.getRange(bStartRow, 2, numRows, 1).merge().setVerticalAlignment('middle');
          sheet.getRange(bStartRow, 4, numRows, 1).merge().setVerticalAlignment('top');
        }
        currentRow += numRows;
      } else {
        sheet.getRange(currentRow, 3).setValue(b.chiTiet || '').setWrap(true);
        currentRow++;
      }
    });

    // Style and merge col A across all rows in this category
    const totalCatRows = currentRow - startCatRow;
    if (totalCatRows > 1) sheet.getRange(startCatRow, 1, totalCatRows, 1).merge();
    sheet.getRange(startCatRow, 1, totalCatRows, 1).setBackground(ORANGE).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
    sheet.getRange(startCatRow, 2, totalCatRows, 6).setVerticalAlignment('top').setWrap(true);
  });

  // Dropdown [Chưa làm / Đang làm / Hoàn thành] cho toàn bộ col G data rows
  const totalDataRows = currentRow - 3;
  if (totalDataRows > 0) {
    const dropRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Chưa làm', 'Đang làm', 'Hoàn thành'], true)
      .setAllowInvalid(false)
      .build();
    const gRange = sheet.getRange(3, 7, totalDataRows, 1);
    gRange.setDataValidation(dropRule);
    gRange.setValue('Chưa làm');
  }
  // Ẩn col H (metadata — không hiện cho người dùng)
  sheet.hideColumns(8);

  const totalRows = currentRow - 1;
  sheet.getRange(1, 1, totalRows, 7).setBorder(true,true,true,true,true,true,'#000000',SpreadsheetApp.BorderStyle.SOLID);
  [120,230,200,180,130,160,150].forEach((w,i) => sheet.setColumnWidth(i+1,w));
  sheet.setRowHeight(1,50); sheet.setRowHeight(2,40);
  for (let r = 3; r < currentRow; r++) sheet.setRowHeight(r, 60);
  try { DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
  return ss.getUrl();
}

// ═══════════════════════════════════════════════════════════════
// TRACKING PROGRESS — đọc tiến độ & auto-complete
// ═══════════════════════════════════════════════════════════════

/**
 * Đọc tiến độ hoàn thành từ file tracking.
 * Col G = status (Chưa làm / Đang làm / Hoàn thành)
 * Col H = category (metadata ẩn)
 * @returns {total, done, pct, pending[], byCategory{}} hoặc null nếu lỗi
 */
function readTrackingProgress(ssUrl) {
  try {
    const match = ssUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    const ss = SpreadsheetApp.openById(match[1]);
    const sheet = ss.getSheetByName('Tracking');
    if (!sheet) return null;

    const lastRow = sheet.getLastRow();
    if (lastRow < 3) return { total: 0, done: 0, pct: 0, pending: [], byCategory: {} };

    const numDataRows = lastRow - 2;
    // Đọc cols B(2)..H(8) — range width = 7, index trong mảng: B=0, C=1, G=5, H=6
    const data = sheet.getRange(3, 2, numDataRows, 7).getValues();

    let total = 0, done = 0;
    const pending = [], byCategory = {};

    data.forEach(function(row) {
      const category = String(row[6] || '').trim(); // col H
      if (!category) return; // hàng không có metadata → bỏ qua
      const status   = String(row[5] || '').trim(); // col G
      const nameB    = String(row[0] || '').trim(); // col B (merged → empty for sub-rows)
      const chiTietC = String(row[1] || '').trim(); // col C

      total++;
      if (!byCategory[category]) byCategory[category] = { total: 0, done: 0 };
      byCategory[category].total++;

      if (status === 'Hoàn thành') {
        done++;
        byCategory[category].done++;
      } else {
        // Dùng tên quyền lợi (B) hoặc chi tiết (C) cho danh sách chưa xong
        const label = nameB || chiTietC;
        if (label) pending.push(label.substring(0, 60));
      }
    });

    return {
      total,
      done,
      pct: total > 0 ? Math.round(done / total * 100) : 0,
      pending,
      byCategory,
    };
  } catch (e) {
    Logger.log('readTrackingProgress error: ' + e.message);
    return null;
  }
}

/**
 * Sau ngày sự kiện: tự động đánh dấu "Hoàn thành" cho toàn bộ
 * quyền lợi "Trực tiếp" (xảy ra tại sự kiện — đã qua = done).
 */
function autoCompleteDirectBenefits(ssUrl) {
  try {
    const match = ssUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return 0;
    const ss = SpreadsheetApp.openById(match[1]);
    const sheet = ss.getSheetByName('Tracking');
    if (!sheet) return 0;

    const lastRow = sheet.getLastRow();
    if (lastRow < 3) return 0;

    const numDataRows = lastRow - 2;
    const hVals = sheet.getRange(3, 8, numDataRows, 1).getValues(); // col H
    const gVals = sheet.getRange(3, 7, numDataRows, 1).getValues(); // col G

    let updated = 0;
    hVals.forEach(function(row, i) {
      if (row[0] === 'Trực tiếp' && gVals[i][0] !== 'Hoàn thành') {
        sheet.getRange(i + 3, 7).setValue('Hoàn thành');
        updated++;
      }
    });
    return updated;
  } catch (e) {
    Logger.log('autoCompleteDirectBenefits error: ' + e.message);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// GMAIL WATCHER — chạy mỗi 5 phút
// ═══════════════════════════════════════════════════════════════

function checkNewEmails() {
  let label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL);
  if (!label) label = GmailApp.createLabel(CONFIG.GMAIL_LABEL);

  const threads = GmailApp.search(CONFIG.GMAIL_QUERY, 0, 10);
  threads.forEach(thread => {
    const messages = thread.getMessages();
    const msg = messages[messages.length - 1];
    const gmailId = msg.getId();

    const existing = getAllRecords();
    if (existing.find(r => r.gmailId === gmailId)) { thread.addLabel(label); return; }

    const subject = msg.getSubject();
    const from    = msg.getFrom();
    const body    = msg.getPlainBody().substring(0, 800);
    const date    = msg.getDate();

    // ── Loại trừ email hệ thống (noreply, Google Docs comments, v.v.) ──
    const fromLower = from.toLowerCase();
    const systemSenders = ['noreply', 'no-reply', 'mailer-daemon', 'comments-noreply', 'notifications-noreply'];
    if (systemSenders.some(s => fromLower.indexOf(s) !== -1)) {
      thread.addLabel(label); // đánh dấu processed để không xét lại
      return;
    }

    // ── Loại trừ Re: (reply loop) ──
    if (/^Re\s*:/i.test(subject)) {
      thread.addLabel(label);
      return;
    }

    // ── Chỉ xử lý email tài trợ/hợp tác — bỏ qua email không liên quan ──
    const subjLower = subject.toLowerCase();
    const sponsorKeywords = [
      'tài trợ', 'hợp tác', 'thư mời', 'thư ngỏ',
      'tai tro', 'hop tac', 'thu moi', 'thu ngo',
      'sponsorship', 'sponsor', 'partner'
    ];
    const isSponsorship = sponsorKeywords.some(kw => subjLower.indexOf(kw) !== -1);
    if (!isSponsorship) {
      thread.addLabel(label);
      return;
    }

    const nameMatch = from.match(/^"?([^"<@]+)"?\s*</);
    const fromName  = nameMatch ? nameMatch[1].trim() : from;

    // ── Xử lý email Fwd (chuyển tiếp) — lấy tên CLB gốc từ body ──
    let orgName    = fromName;
    let orgContact = from;
    let orgEvent   = subject;
    const isFwd = /^(Fwd|FW|Chuyển tiếp)\s*:/i.test(subject);
    if (isFwd) {
      // Trích tên + email người gửi gốc từ block "---------- Forwarded message"
      const fwdFrom = body.match(/(?:Từ|From)\s*:\s*([^\n<]+?)\s*[<\[]([\w._%+\-]+@[\w.\-]+\.\w+)[>\]]/i);
      if (fwdFrom) {
        orgName    = fwdFrom[1].trim().replace(/^["']|["']$/g, '');
        orgContact = fwdFrom[2].trim();
      }
      // Trích subject gốc (bỏ tiền tố Fwd/FW)
      const fwdSubj = body.match(/(?:Subject|Chủ đề)\s*:\s*([^\n]+)/i);
      if (fwdSubj) {
        orgEvent = fwdSubj[1].trim().replace(/^(Fwd|FW|Chuyển tiếp)\s*:\s*/i, '');
      } else {
        orgEvent = subject.replace(/^(Fwd|FW|Chuyển tiếp)\s*:\s*/i, '');
      }
    }

    let proposalUrl = '';
    try {
      const folders = DriveApp.getFoldersByName('PNE - Hồ sơ tài trợ');
      const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('PNE - Hồ sơ tài trợ');
      outerLoop:
      for (const m of messages) {
        const atts = m.getAttachments({ includeInlineImages: false, includeAttachments: true });
        for (const att of atts) {
          const name = att.getName().toLowerCase(), type = att.getContentType();
          if (type === 'application/pdf' || name.endsWith('.pdf')) {
            const file = folder.createFile(att);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            proposalUrl = file.getUrl();
            break outerLoop;
          }
        }
      }
    } catch(e) {}

    const record = {
      id:            'mail_' + gmailId.substring(0, 10),
      org:           orgName, event: orgEvent, track: 'voucher', cat: '',
      stage:         'received', year: String(date.getFullYear()),
      receivedDate:  Utilities.formatDate(date, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'),
      deadlineDate:  '', proposalUrl, hangmuc: '', contact: orgContact,
      notes:         body, proposalText: '', benefits: [], offer: null,
      clbPackages:   [], approval: null, hopdong: '', mavoucher: '',
      hanvoucher:    '', anhsukien: '', data: '', tracking: '',
      lienhe_status: 'moi', zaloGroup: '', source: 'gmail', gmailId,
    };

    upsertRecord(record);
    sendTelegramNewMail(record);
    thread.addLabel(label);

    // ── Gán nhãn phân loại PNE/Hợp đồng hoặc PNE/Lời mời ──
    const contractKeywords = ['hợp đồng', 'hop dong', 'ký kết', 'ky ket', 'thỏa thuận', 'thoa thuan', 'biên bản', 'bien ban', 'contract', 'agreement'];
    const inviteKeywords   = ['thư mời', 'thư ngỏ', 'thu moi', 'thu ngo', 'lời mời', 'loi moi'];
    const fullText = (subject + ' ' + body).toLowerCase();

    const isContract = contractKeywords.some(kw => fullText.indexOf(kw) !== -1);
    const isInvite   = inviteKeywords.some(kw => fullText.indexOf(kw) !== -1);

    if (isContract) {
      const contractLabel = getOrCreateNestedLabel('PNE/Hợp đồng');
      if (contractLabel) thread.addLabel(contractLabel);
    } else if (isInvite) {
      const inviteLabel = getOrCreateNestedLabel('PNE/Lời mời');
      if (inviteLabel) thread.addLabel(inviteLabel);
    }

    thread.markRead();
  });
}

function getOrCreateNestedLabel(fullName) {
  // Tạo label con trong Gmail (ví dụ: "PNE/Hợp đồng")
  // Gmail tự tạo parent "PNE" nếu chưa có khi tạo label con
  try {
    let lbl = GmailApp.getUserLabelByName(fullName);
    if (!lbl) lbl = GmailApp.createLabel(fullName);
    return lbl;
  } catch(e) {
    Logger.log('Lỗi tạo label ' + fullName + ': ' + e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM — gửi thông báo + xử lý callback
// ═══════════════════════════════════════════════════════════════

function sendTelegramNewMail(record) {
  const dashUrl = CONFIG.DASHBOARD_URL + '?open=' + record.id;
  const pdfLine = record.proposalUrl ? `\n📎 <a href="${record.proposalUrl}">Hồ sơ PDF</a>` : '';
  const text =
    `📧 <b>Mail tài trợ mới!</b>\n` +
    `🏫 <b>${escHtml(record.org)}</b>\n` +
    `📌 ${escHtml(record.event)}\n` +
    `📅 ${escHtml(record.receivedDate)}\n` +
    `📩 ${escHtml(record.contact)}` + pdfLine +
    `\n\n🔗 <a href="${dashUrl}">Xem hồ sơ trên dashboard</a>`;

  const payload = {
    chat_id: CONFIG.TG_CHAT_ID, text, parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '✅ Đã liên hệ', callback_data: 'contacted:' + record.id }]] }
  };
  try {
    const res = tgCall('sendMessage', payload);
    const result = JSON.parse(res.getContentText());
    if (result.ok) {
      updateRecordField(record.id, 'tgMessageId', result.result.message_id);
      updateRecordField(record.id, 'tgChatId', result.result.chat.id);
    }
  } catch(e) { Logger.log('sendTelegramNewMail error: ' + e.message); }
}

function handleTelegramCallback(cq) {
  const parts = cq.data.split(':');
  const action = parts[0], recordId = parts[1];
  const chatId = cq.message.chat.id, msgId = cq.message.message_id;

  if (action === 'contacted') {
    updateRecordField(recordId, 'lienhe_status', 'lien_he');
    updateRecordField(recordId, 'stage', 'reviewing');
    editTgMessage(chatId, msgId,
      `✅ <b>Đã liên hệ — chuyển sang Đang xét</b>\n\n` +
      `💬 <i>Nhập tên group Zalo để lưu:</i>\n<i>(Gõ /skip nếu chưa tạo Zalo)</i>`);
    const props = PropertiesService.getScriptProperties();
    props.setProperty('pending_zalo_' + chatId, recordId);
    props.setProperty('pending_zalo_time_' + chatId, String(Math.floor(Date.now() / 1000)));
    tgCall('answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }

  if (action === 'close_record') {
    const rec = getAllRecords().find(r => r.id === recordId);
    updateRecordField(recordId, 'stage', 'done');
    editTgMessage(chatId, msgId,
      `✅ <b>Hồ sơ đã được đóng!</b>\n\n` +
      (rec ? `🏫 ${escHtml(rec.org)}\n📌 ${escHtml(rec.event)}\n` : '') +
      `📋 Trạng thái → <b>Hoàn thành</b>`);
    tgCall('answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }

  // ── Voucher: xác nhận đã in ──
  if (action === 'confirm_print') {
    // Kiểm tra xem đã xác nhận trước đó chưa — tránh spam khi bấm nhiều lần
    const rowIdx = findRowById(recordId);
    if (rowIdx > 0) {
      const row = getSheet().getRange(rowIdx, 1, 1, COLS.length).getValues()[0];
      if (rowToRecord(row).voucher_status === 'da_in') {
        tgCall('answerCallbackQuery', { callback_query_id: cq.id, text: '⚠️ Đã xác nhận trước đó rồi!', show_alert: true });
        // Xoá nút trên tin này luôn (nếu chưa xoá)
        tgCall('editMessageReplyMarkup', { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } });
        return;
      }
    }
    updateRecordField(recordId, 'voucher_status', 'da_in');
    tgCall('answerCallbackQuery', { callback_query_id: cq.id, text: '✅ Đã xác nhận!' });
    const userName = (cq.from && cq.from.first_name) || 'ai đó';
    // Xoá nút inline keyboard (tránh xung đột parse_mode giữa Markdown và HTML)
    tgCall('editMessageReplyMarkup', {
      chat_id: chatId, message_id: msgId,
      reply_markup: { inline_keyboard: [] }
    });
    // Gửi tin xác nhận mới
    tgCall('sendMessage', {
      chat_id: chatId,
      text: `✅ *Đã in* — xác nhận bởi ${userName}\nHồ sơ: \`${recordId}\``,
      parse_mode: 'Markdown',
    });
    return;
  }

  // ── Voucher: báo lỗi in ──
  if (action === 'print_error') {
    tgCall('answerCallbackQuery', { callback_query_id: cq.id, text: '❗ Đã ghi nhận lỗi' });
    const userName = (cq.from && cq.from.first_name) || 'ai đó';
    tgCall('editMessageReplyMarkup', {
      chat_id: chatId, message_id: msgId,
      reply_markup: { inline_keyboard: [] }
    });
    tgCall('sendMessage', {
      chat_id: chatId,
      text: `❗ *Báo lỗi in* từ ${userName}\nHồ sơ: \`${recordId}\`\nVui lòng kiểm tra lại yêu cầu.`,
      parse_mode: 'Markdown',
    });
    return;
  }

  tgCall('answerCallbackQuery', { callback_query_id: cq.id });
}

function handleTelegramMessage(msg) {
  const chatId = String(msg.chat.id), text = (msg.text || '').trim();
  const props = PropertiesService.getScriptProperties();
  const pendingKey = 'pending_zalo_' + chatId;
  const pendingId  = props.getProperty(pendingKey);
  if (!pendingId) return;
  const pendingTime = parseInt(props.getProperty('pending_zalo_time_' + chatId) || '0');
  if (msg.date < pendingTime) return;
  props.deleteProperty(pendingKey);
  props.deleteProperty('pending_zalo_time_' + chatId);
  if (text === '/skip' || text.startsWith('/')) { sendTgText(chatId, '👍 OK — bỏ qua Zalo.'); return; }
  updateRecordField(pendingId, 'zaloGroup', text);
  updateRecordField(pendingId, 'lienhe_status', 'zalo');
  const rec = getAllRecords().find(r => r.id === pendingId);
  sendTgText(chatId,
    `💬 <b>Đã tạo group Zalo!</b>\n` +
    (rec ? `🏫 ${escHtml(rec.org)}\n` : '') +
    `📌 Group: <b>${escHtml(text)}</b>\n✅ TT liên hệ → <b>Đã tạo Zalo</b>`);
}

function checkTelegramUpdates() {
  const MAX_RUN_MS = 50 * 1000, start = Date.now();
  const props = PropertiesService.getScriptProperties();
  while (Date.now() - start < MAX_RUN_MS) {
    const lastId = parseInt(props.getProperty('tg_last_update_id') || '0');
    try {
      const res = UrlFetchApp.fetch(
        'https://api.telegram.org/bot' + CONFIG.TG_TOKEN +
        '/getUpdates?offset=' + (lastId + 1) + '&limit=10&timeout=5',
        { muteHttpExceptions: true, deadline: 10 });
      const data = JSON.parse(res.getContentText());
      if (data.ok && data.result.length) {
        data.result.forEach(update => {
          if (update.callback_query) handleTelegramCallback(update.callback_query);
          else if (update.message && update.message.text) handleTelegramMessage(update.message);
        });
        props.setProperty('tg_last_update_id', String(Math.max(...data.result.map(u => u.update_id))));
      }
    } catch(e) { Utilities.sleep(1000); }
  }
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM UTILS
// ═══════════════════════════════════════════════════════════════

function tgCall(method, payload) {
  return UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + CONFIG.TG_TOKEN + '/' + method,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
}
function editTgMessage(chatId, msgId, text) {
  tgCall('editMessageText', { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } });
}
function sendTgText(chatId, text) {
  tgCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════
// VOUCHER PRINT NOTIFY — gửi yêu cầu in vào Group in voucher
// ═══════════════════════════════════════════════════════════════

/**
 * Gửi thông báo yêu cầu in voucher vào TG_VOUCHER_CHAT_ID.
 * Payload từ dashboard: { id, org, event, school, mavoucher,
 *   voucher_print_qty, voucher_print_deadline, neg_items }
 */
function handleVoucherPrintNotify(payload) {
  const { id, org, event, school, mavoucher, voucher_print_qty, voucher_print_deadline, neg_items } = payload;

  // Rate-limit: không gửi lại trong vòng 5 phút (tránh spam khi dashboard gửi trùng)
  const cache = CacheService.getScriptCache();
  const cacheKey = 'voucher_notify_' + id;
  if (cache.get(cacheKey)) return { ok: true, skipped: true };
  cache.put(cacheKey, '1', 300); // 5 phút

  // Build breakdown chi tiết voucher theo loại
  const breakdown = (neg_items || [])
    .filter(i => !i.isCash && (+i.qty || 0) > 0)
    .map(i => `  • ${i.qty}× ${VOUCHER_TYPE_LABELS[i.type] || i.type}`)
    .join('\n');

  // Format deadline dd/mm/yyyy
  const dlFormatted = voucher_print_deadline
    ? voucher_print_deadline.split('-').reverse().join('/')
    : '(chưa xác định)';

  // Format dải mã: prefix.01 → prefix.NN
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
    `\n⏰ *Deadline in:* ${dlFormatted}`,
  ].filter(Boolean).join('\n');

  const res = tgCall('sendMessage', {
    chat_id: CONFIG.TG_VOUCHER_CHAT_ID,
    text: msg,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Xác nhận đã in', callback_data: `confirm_print:${id}` },
        { text: '❌ Báo lỗi',        callback_data: `print_error:${id}` },
      ]]
    },
  });

  const result = JSON.parse(res.getContentText());
  if (!result.ok) throw new Error('Telegram: ' + (result.description || 'unknown'));
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// SETUP — chạy từng bước một lần duy nhất
// ═══════════════════════════════════════════════════════════════

/** Bước 1 — Khởi tạo sheet headers (chạy 1 lần) */
function setupSheets() {
  getSheet();        // tạo sheet Records với headers
  getDeletedSheet(); // tạo sheet Deleted
  Logger.log('✅ Đã tạo/kiểm tra sheets: Records + Deleted');
}

/** Bước 2 — Deploy Web App → lấy URL /exec → dán vào CONFIG.WEB_APP_URL, rồi chạy hàm này */
function setupWebhook() {
  const webAppUrl = CONFIG.WEB_APP_URL;
  if (!webAppUrl || webAppUrl.includes('PASTE')) { Logger.log('❌ Chưa điền WEB_APP_URL!'); return; }
  const res = tgCall('setWebhook', { url: webAppUrl });
  Logger.log('setWebhook: ' + res.getContentText());
}

// ═══════════════════════════════════════════════════════════════
// EXECUTION PROGRESS SCHEDULER — chạy mỗi ngày 8h sáng
// ═══════════════════════════════════════════════════════════════

/**
 * Quét tất cả hồ sơ đang ở stage "executing", kiểm tra mốc thời gian
 * so với ngày sự kiện (deadlineDate) và gửi báo cáo Telegram.
 *
 * Mốc hoạt động:
 *  T-5  → nhắc chuẩn bị quyền lợi trực tiếp
 *  T-2  → checklist lần cuối trước sự kiện
 *  T+1  → auto-complete quyền lợi Trực tiếp (không thông báo)
 *  T+3  → nhắc hoàn thiện quyền lợi hậu kỳ
 *  T+14 → tổng kết; nếu ≥80% → nút "Đóng hồ sơ"
 */
function checkExecutingRecords() {
  const records = getAllRecords().filter(function(r) {
    return r.stage === 'executing' && r.trackingUrl && r.deadlineDate;
  });
  if (!records.length) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const props = PropertiesService.getScriptProperties();

  const MILESTONES = [
    { key: 'T-5',  diffDay: -5  },
    { key: 'T-2',  diffDay: -2  },
    { key: 'T+1',  diffDay:  1  },
    { key: 'T+3',  diffDay:  3  },
    { key: 'T+14', diffDay:  14 },
  ];

  records.forEach(function(r) {
    const eventDate = new Date(r.deadlineDate);
    eventDate.setHours(0, 0, 0, 0);
    const diff = Math.round((today - eventDate) / 864e5); // âm = trước sự kiện

    const sentKey  = 'exec_sent_' + r.id;
    const sentList = JSON.parse(props.getProperty(sentKey) || '[]');

    MILESTONES.forEach(function(m) {
      if (diff !== m.diffDay) return;       // chưa đến mốc này hôm nay
      if (sentList.indexOf(m.key) !== -1) return; // đã gửi rồi

      _handleExecMilestone(r, m.key);
      sentList.push(m.key);
      props.setProperty(sentKey, JSON.stringify(sentList));
    });
  });
}

function _handleExecMilestone(record, milestoneKey) {
  // T+1: auto-complete Trực tiếp (silent)
  if (milestoneKey === 'T+1') {
    const updated = autoCompleteDirectBenefits(record.trackingUrl);
    if (updated > 0) {
      sendTgText(CONFIG.TG_EXEC_CHAT_ID,
        `⚙️ <b>Tự động hoàn thành ${updated} quyền lợi Trực tiếp</b>\n` +
        `🏫 ${escHtml(record.org)} — ${escHtml(record.event)}\n` +
        `<i>(Sự kiện đã diễn ra — quyền lợi tại chỗ được đánh dấu Hoàn thành)</i>`);
    }
    return;
  }

  const progress = readTrackingProgress(record.trackingUrl);
  const progLine = progress
    ? `\n\n📊 Tiến độ: <b>${progress.done}/${progress.total}</b> (${progress.pct}%)`
    : '';
  const pendingLine = (progress && progress.pending.length)
    ? '\n⏳ Chưa xong: ' + progress.pending.slice(0, 3).map(escHtml).join(', ') +
      (progress.pending.length > 3 ? ` (+${progress.pending.length - 3} mục)` : '')
    : '';

  let title, advice;
  if (milestoneKey === 'T-5') {
    title  = '⚠️ Còn 5 ngày trước sự kiện';
    advice = 'Kiểm tra logo/banner/backdrop, xác nhận booth, chuẩn bị tài liệu phát tay.';
  } else if (milestoneKey === 'T-2') {
    title  = '🔔 Còn 2 ngày trước sự kiện';
    advice = 'Checklist lần cuối: xác nhận vị trí booth, backdrop đã gửi, người phụ trách đã sắp xếp.';
  } else if (milestoneKey === 'T+3') {
    title  = '📋 3 ngày sau sự kiện';
    advice = 'Hoàn thiện quyền lợi hậu kỳ: album ảnh sự kiện, bài đăng mạng xã hội, data, Google Maps review.';
  } else if (milestoneKey === 'T+14') {
    title  = '📊 2 tuần sau sự kiện — Tổng kết';
    advice = progress && progress.pct >= 80
      ? `Đã hoàn thành ${progress.pct}% quyền lợi. Có thể đóng hồ sơ.`
      : `Còn ${progress ? 100 - progress.pct : '?'}% quyền lợi chưa hoàn thành.`;
  }

  const text =
    `${title}\n\n` +
    `🏫 <b>${escHtml(record.org)}</b>\n` +
    `📌 ${escHtml(record.event)}\n` +
    `📅 Sự kiện: ${escHtml(record.deadlineDate)}` +
    progLine + pendingLine +
    `\n\n💬 ${escHtml(advice)}`;

  const buttons = [];
  if (milestoneKey === 'T+14' && progress && progress.pct >= 80) {
    buttons.push([{ text: '✅ Đóng hồ sơ', callback_data: 'close_record:' + record.id }]);
  }
  buttons.push([{ text: '📊 Xem tracking', url: record.trackingUrl }]);
  buttons.push([{ text: '🗂 Mở dashboard', url: CONFIG.DASHBOARD_URL + '?open=' + record.id }]);

  try {
    tgCall('sendMessage', {
      chat_id: CONFIG.TG_EXEC_CHAT_ID,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  } catch(e) {
    Logger.log('_handleExecMilestone send error: ' + e.message);
  }
}

/** Bước 3 — Tạo trigger tự động */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkNewEmails').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('checkTelegramUpdates').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('checkExecutingRecords').timeBased().everyDays(1).atHour(8).create();
  Logger.log('✅ Triggers: checkNewEmails (5p) + checkTelegramUpdates (1p) + checkExecutingRecords (8h daily)');
}

/** Migrate dữ liệu cũ từ JSON blob sang flat table */
function migrateFromJsonBlobs() {
  const ss = getSpreadsheet();
  const oldSheet = ss.getSheetByName('Records_old') || ss.getSheetByName('Records');
  if (!oldSheet) { Logger.log('Không tìm thấy sheet cũ'); return; }

  // Đọc dữ liệu cũ (format: id | JSON | updatedAt)
  const oldData = oldSheet.getDataRange().getValues();
  const records = [];
  for (let i = 1; i < oldData.length; i++) {
    if (!oldData[i][0]) continue;
    try {
      // Thử parse cột 2 như JSON
      const r = JSON.parse(oldData[i][1]);
      if (r && r.id) records.push(r);
    } catch(e) {
      // Nếu không parse được, bỏ qua
      Logger.log('Bỏ qua hàng ' + (i+1) + ': ' + e.message);
    }
  }

  if (!records.length) { Logger.log('Không có record nào để migrate'); return; }

  // Đổi tên sheet cũ để bảo toàn
  oldSheet.setName('Records_old_backup');

  // Tạo sheet mới
  const newSheet = ss.insertSheet('Records');
  _initSheetHeaders(newSheet);

  // Ghi dữ liệu
  const rows = records.map(r => recordToRow(r));
  if (rows.length) newSheet.getRange(2, 1, rows.length, COLS.length).setValues(rows);

  Logger.log(`✅ Migrate xong: ${records.length} records → sheet Records mới`);
}

/** Test: gửi Telegram */
function testTelegram() {
  sendTgText(CONFIG.TG_CHAT_ID, '✅ <b>PNE Bot đang hoạt động!</b>\n<i>Flat-table DB v2 sẵn sàng.</i>');
}

/** Test: fake email mới */
function testFakeEmail() {
  const fakeRecord = {
    id: 'test_' + Date.now().toString(36), org: 'CLB Âm nhạc UTE',
    event: '[Test] Đêm nhạc Acoustic 2026', track: 'voucher', cat: '',
    stage: 'received', year: '2026',
    receivedDate: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'),
    deadlineDate: '', proposalUrl: '', hangmuc: '', contact: 'clbamnhacute@gmail.com',
    notes: 'Test notification.', proposalText: '', benefits: [], offer: null,
    clbPackages: [], approval: null, hopdong: '', mavoucher: '', hanvoucher: '',
    anhsukien: '', data: '', tracking: '', lienhe_status: 'moi', zaloGroup: '',
    source: 'test', gmailId: 'test_id',
  };
  upsertRecord(fakeRecord);
  sendTelegramNewMail(fakeRecord);
  Logger.log('✅ Test notification đã gửi');
}
