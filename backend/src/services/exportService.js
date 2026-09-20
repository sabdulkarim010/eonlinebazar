/********************************************************************
 * Shared export helpers — Excel (xlsx) and PDF (PDFKit).
 ********************************************************************/

const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

function exportToExcel(sheets = []) {
    const workbook = XLSX.utils.book_new();

    sheets.forEach(({ name, rows }) => {
        const sheetName = String(name || 'Sheet').slice(0, 31);
        const worksheet = XLSX.utils.aoa_to_sheet(Array.isArray(rows) ? rows : []);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function exportToPDF(title, sections = []) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            doc.font('Helvetica-Bold').fontSize(18).fillColor('#1e293b')
                .text(String(title || 'Report'), { align: 'left' });
            doc.moveDown(0.5);
            doc.font('Helvetica').fontSize(10).fillColor('#64748b')
                .text(`Generated: ${new Date().toLocaleString('en-GB')}`);
            doc.moveDown(1);

            sections.forEach((section) => {
                doc.font('Helvetica-Bold').fontSize(12).fillColor('#2563eb')
                    .text(String(section.heading || 'Section'));
                doc.moveDown(0.3);
                doc.font('Helvetica').fontSize(10).fillColor('#334155');

                (section.lines || []).forEach((line) => {
                    doc.text(String(line));
                });
                doc.moveDown(0.8);
            });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    exportToExcel,
    exportToPDF
};
