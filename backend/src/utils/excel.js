import ExcelJS from 'exceljs';

function cellToValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object') {
    if (value.hyperlink) return value.hyperlink;
    if (value.text) return value.text;
    if (value.result) return value.result;
    if (value.richText) return value.richText.map((part) => part.text).join('');
  }
  return value || '';
}

export async function readRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers = [];
  sheet.getRow(1).eachCell((cell, index) => {
    headers[index] = String(cellToValue(cell)).trim();
  });
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    headers.forEach((header, index) => {
      if (!header) return;
      item[header] = cellToValue(row.getCell(index));
    });
    rows.push(item);
  });
  return rows;
}

export async function workbookBuffer(rows, sheetName = 'Students') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const headers = Object.keys(rows[0] || { Empty: '' });
  sheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(14, header.length + 4) }));
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
