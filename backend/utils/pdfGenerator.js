const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

async function generatePdfFromHtml(data) {
  const templatePath = path.join(__dirname, "..", "templates", "taxDeclaration.html");
  let html = fs.readFileSync(templatePath, "utf8");

  // абсолютний шлях до шрифта (ВАЖЛИВО для Windows)
  const fontPath = path
    .join(__dirname, "..", "assets", "fonts", "DejaVuSans.ttf")
    .replace(/\\/g, "/");

  html = html.replaceAll("{{FONT_PATH}}", fontPath);

  Object.keys(data).forEach((key) => {
    html = html.replaceAll(`{{${key}}}`, data[key] ?? "");
  });

  const browser = await puppeteer.launch({
    headless: "new",
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
  });

  await browser.close();
  return pdf;
}

module.exports = { generatePdfFromHtml };
