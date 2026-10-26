// Minimal .xlsx writer — enough of the OOXML spreadsheet format to emit a
// styled, multi-sheet workbook from the browser with no build step and no
// external library (the site has neither, and a CDN script wouldn't load).
//
// Supported: inline strings, numbers, a fixed style palette, merged ranges,
// column widths, row heights, freeze panes. Not supported: formulas, shared
// strings, images, conditional formatting — none of which the trade export
// needs, since it exports a computed snapshot rather than a live model.
//
// Usage:
//   XLSXMini.download('trade.xlsx', [{ name, cols, rows, merges, freeze }])
// where a row is an array of cells, each `null` (blank), a string/number, or
// { v, s } with `s` a key from XLSXMini.S.

(function (global) {
  'use strict';

  // ── Style palette ───────────────────────────────────────────────────────────
  // Indices into the cellXfs list built below. Named so the sheet-building code
  // reads as intent ("this is a section header") rather than a magic number.
  const S = {
    DEFAULT: 0,
    TITLE: 1,        // big white-on-dark banner
    TEAM: 2,         // team name band above each block
    SECTION: 3,      // "Players" / "Draft Picks" / "Trade Exceptions"
    COL_HEAD: 4,     // sub-header inside a section
    TEXT: 5,         // ordinary body text
    TEXT_CENTER: 6,
    PLACEHOLDER: 7,  // greyed italic filler in an unused slot
    MONEY: 8,
    MONEY_BOLD: 9,
    LABEL: 10,       // right-aligned summary label
    VALID: 11,
    INVALID: 12,
    WARN: 13,
    NOTE: 14,        // wrapped prose (rules sheet)
    NOTE_HEAD: 15,
  };

  const FONTS = [
    { sz: 11, color: 'FF1F2937' },                            // 0 default
    { sz: 20, b: 1, color: 'FFFFFFFF' },                      // 1 title
    { sz: 13, b: 1, color: 'FFFFFFFF' },                      // 2 team band
    { sz: 11, b: 1, color: 'FF111827' },                      // 3 section / label
    { sz: 11, color: 'FF374151' },                            // 4 body
    { sz: 10, i: 1, color: 'FF9CA3AF' },                      // 5 placeholder
    { sz: 11, b: 1, color: 'FF065F46' },                      // 6 valid
    { sz: 11, b: 1, color: 'FF7F1D1D' },                      // 7 invalid
    { sz: 11, b: 1, color: 'FF78350F' },                      // 8 warn
    { sz: 12, b: 1, color: 'FF111827' },                      // 9 note head
  ];

  const FILLS = [
    { pattern: 'none' },                                      // 0 (required)
    { pattern: 'gray125' },                                   // 1 (required)
    { pattern: 'solid', fg: 'FF111827' },                     // 2 title
    { pattern: 'solid', fg: 'FF374151' },                     // 3 team band
    { pattern: 'solid', fg: 'FFE5E7EB' },                     // 4 section
    { pattern: 'solid', fg: 'FFF3F4F6' },                     // 5 sub-header
    { pattern: 'solid', fg: 'FFD1FAE5' },                     // 6 valid
    { pattern: 'solid', fg: 'FFFEE2E2' },                     // 7 invalid
    { pattern: 'solid', fg: 'FFFEF3C7' },                     // 8 warn
  ];

  // 0 = none, 1 = thin grey box.
  const BORDERS = [null, 'FFD1D5DB'];

  // numFmtId 164+ are custom; 0 is General.
  const NUMFMTS = [
    { id: 164, code: '"$"#,##0;[Red]-"$"#,##0' },
  ];

  // [fontIdx, fillIdx, borderIdx, numFmtId, align, wrap]
  const XFS = [
    [0, 0, 0, 0, null, 0],          // DEFAULT
    [1, 2, 0, 0, 'center', 0],      // TITLE
    [2, 3, 0, 0, 'center', 0],      // TEAM
    [3, 4, 1, 0, 'left', 0],        // SECTION
    [3, 5, 1, 0, 'center', 0],      // COL_HEAD
    [4, 0, 1, 0, 'left', 0],        // TEXT
    [4, 0, 1, 0, 'center', 0],      // TEXT_CENTER
    [5, 0, 1, 0, 'center', 0],      // PLACEHOLDER
    [4, 0, 1, 164, 'right', 0],     // MONEY
    [3, 0, 1, 164, 'right', 0],     // MONEY_BOLD
    [3, 0, 0, 0, 'right', 0],       // LABEL
    [6, 6, 1, 0, 'center', 0],      // VALID
    [7, 7, 1, 0, 'center', 0],      // INVALID
    [8, 8, 1, 0, 'center', 0],      // WARN
    [4, 0, 0, 0, 'left', 1],        // NOTE
    [9, 0, 0, 0, 'left', 0],        // NOTE_HEAD
  ];

  // ── XML helpers ─────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Control characters are illegal in XML 1.0 and corrupt the whole file.
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  // 0-based column index -> spreadsheet letters (0 -> A, 26 -> AA).
  function colName(n) {
    let s = '';
    n += 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
    return s;
  }
  function cellRef(r, c) { return colName(c) + (r + 1); }

  function stylesXml() {
    const numFmts = `<numFmts count="${NUMFMTS.length}">` +
      NUMFMTS.map(f => `<numFmt numFmtId="${f.id}" formatCode="${esc(f.code)}"/>`).join('') + '</numFmts>';
    const fonts = `<fonts count="${FONTS.length}">` + FONTS.map(f =>
      `<font><sz val="${f.sz}"/>${f.b ? '<b/>' : ''}${f.i ? '<i/>' : ''}` +
      `<color rgb="${f.color}"/><name val="Calibri"/></font>`).join('') + '</fonts>';
    const fills = `<fills count="${FILLS.length}">` + FILLS.map(f =>
      `<fill><patternFill patternType="${f.pattern}">` +
      (f.fg ? `<fgColor rgb="${f.fg}"/><bgColor indexed="64"/>` : '') +
      '</patternFill></fill>').join('') + '</fills>';
    const borders = `<borders count="${BORDERS.length}">` + BORDERS.map(b => b
      ? `<border>${['left', 'right', 'top', 'bottom'].map(s =>
          `<${s} style="thin"><color rgb="${b}"/></${s}>`).join('')}<diagonal/></border>`
      : '<border><left/><right/><top/><bottom/><diagonal/></border>').join('') + '</borders>';
    const xfs = `<cellXfs count="${XFS.length}">` + XFS.map(([fo, fi, bo, nf, al, wrap]) =>
      `<xf numFmtId="${nf}" fontId="${fo}" fillId="${fi}" borderId="${bo}" xfId="0"` +
      ` applyFont="1" applyFill="1" applyBorder="1"${nf ? ' applyNumberFormat="1"' : ''}` +
      `${al || wrap ? ' applyAlignment="1"' : ''}>` +
      (al || wrap
        ? `<alignment${al ? ` horizontal="${al}"` : ''} vertical="center"${wrap ? ' wrapText="1"' : ''}/>`
        : '') +
      '</xf>').join('') + '</cellXfs>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      numFmts + fonts + fills + borders +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      xfs +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function sheetXml(sheet) {
    const rowsXml = (sheet.rows || []).map((row, r) => {
      if (!row || !row.length) return '';
      const cells = row.map((cell, c) => {
        if (cell === null || cell === undefined || cell === '') {
          // A blank cell still needs to exist if it carries a style (that's how
          // a fill spans the unused columns of a merged banner).
          const st = (cell && cell.s !== undefined) ? cell.s : null;
          return st ? `<c r="${cellRef(r, c)}" s="${st}"/>` : '';
        }
        const obj = (typeof cell === 'object') ? cell : { v: cell };
        if (obj.v === null || obj.v === undefined || obj.v === '') {
          return obj.s ? `<c r="${cellRef(r, c)}" s="${obj.s}"/>` : '';
        }
        const s = obj.s ? ` s="${obj.s}"` : '';
        if (typeof obj.v === 'number' && isFinite(obj.v)) {
          return `<c r="${cellRef(r, c)}"${s}><v>${obj.v}</v></c>`;
        }
        return `<c r="${cellRef(r, c)}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(obj.v)}</t></is></c>`;
      }).join('');
      if (!cells) return '';
      const ht = sheet.rowHeights && sheet.rowHeights[r]
        ? ` ht="${sheet.rowHeights[r]}" customHeight="1"` : '';
      return `<row r="${r + 1}"${ht}>${cells}</row>`;
    }).join('');

    const colsXml = (sheet.cols && sheet.cols.length)
      ? '<cols>' + sheet.cols.map((w, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>'
      : '';

    const merges = sheet.merges || [];
    const mergeXml = merges.length
      ? `<mergeCells count="${merges.length}">` +
        merges.map(m => `<mergeCell ref="${esc(m)}"/>`).join('') + '</mergeCells>'
      : '';

    const paneXml = sheet.freeze
      ? `<pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/>`
      : '';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${paneXml}</sheetView></sheetViews>` +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      colsXml +
      `<sheetData>${rowsXml}</sheetData>` +
      mergeXml +
      '</worksheet>';
  }

  function workbookXml(sheets) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) =>
        // Sheet names can't contain : \ / ? * [ ] and cap at 31 chars.
        `<sheet name="${esc(String(s.name || `Sheet${i + 1}`).replace(/[:\\/?*[\]]/g, '-').slice(0, 31))}"` +
        ` sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>';
  }

  // ── ZIP (store, no compression) ──────────────────────────────────────────────

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Raw DEFLATE via CompressionStream — a workbook is almost entirely repetitive
  // XML, so this cuts an export to roughly a sixth of its stored size. Falls back
  // to stored (method 0) where CompressionStream isn't available; both are valid
  // zip, so an older browser still gets a working file, just a bigger one.
  const CAN_DEFLATE = typeof CompressionStream === 'function';

  async function deflateRaw(bytes) {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }

  async function zip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;

    const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
    const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

    for (const { name, data } of files) {
      const nameBytes = enc.encode(name);
      const raw = enc.encode(data);
      const crc = crc32(raw);                    // CRC is always of the UNcompressed bytes
      let body = raw, method = 0;
      if (CAN_DEFLATE) {
        const packed = await deflateRaw(raw);
        // Tiny parts can deflate larger than they started; keep whichever is smaller.
        if (packed.length < raw.length) { body = packed; method = 8; }
      }
      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
        u32(crc), u32(body.length), u32(raw.length),
        u16(nameBytes.length), u16(0));
      parts.push(new Uint8Array(local), nameBytes, body);
      central.push({ name: nameBytes, crc, method, csize: body.length, usize: raw.length, offset });
      offset += local.length + nameBytes.length + body.length;
    }

    const dirParts = [];
    let dirSize = 0;
    central.forEach(e => {
      const hdr = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(e.method), u16(0), u16(0),
        u32(e.crc), u32(e.csize), u32(e.usize),
        u16(e.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset));
      dirParts.push(new Uint8Array(hdr), e.name);
      dirSize += hdr.length + e.name.length;
    });

    const end = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(dirSize), u32(offset), u16(0)));

    const all = parts.concat(dirParts, [end]);
    const total = all.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    all.forEach(a => { out.set(a, p); p += a.length; });
    return out;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async function build(sheets) {
    const files = [
      {
        name: '[Content_Types].xml',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml"` +
            ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '</Types>',
      },
      {
        name: '_rels/.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      },
      { name: 'xl/workbook.xml', data: workbookXml(sheets) },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          sheets.map((_, i) => `<Relationship Id="rId${i + 1}"` +
            ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"' +
            ` Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
          `<Relationship Id="rId${sheets.length + 1}"` +
          ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"' +
          ' Target="styles.xml"/></Relationships>',
      },
      { name: 'xl/styles.xml', data: stylesXml() },
    ];
    sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }));
    return new Blob([await zip(files)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  async function download(filename, sheets) {
    const url = URL.createObjectURL(await build(sheets));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.XLSXMini = { S, build, download, colName, cellRef };
})(window);
