const puppeteer = require('puppeteer');
const fs = require('fs');

async function generatePdf() {
  const [,, htmlPath, pdfPath] = process.argv;

  if (!htmlPath || !pdfPath) {
    console.error('Usage: node render_pdf.cjs <htmlPath> <pdfPath>');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    const content = fs.readFileSync(htmlPath, 'utf8');
    await page.setContent(content, { waitUntil: 'networkidle0' });

    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
    });

    console.log('PDF Generated successfully:', pdfPath);
  } finally {
    await browser.close();
  }
}

generatePdf().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
