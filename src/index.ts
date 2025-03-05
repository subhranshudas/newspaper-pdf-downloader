import { chromium } from "playwright";
import * as fs from "fs/promises";
import * as path from "path";
import { PDFDocument } from "pdf-lib";
import { getFormattedDate } from "./utils";
import dotenv from "dotenv";
import { sendPDFToSlack } from "./utils";

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.NEWSPAPER_BASE_URL) {
  throw new Error("NEWSPAPER_BASE_URL is required in .env file");
}

const NEWSPAPER_BASE_URL = process.env.NEWSPAPER_BASE_URL;
const OUTPUT_DIR = path.join(__dirname, "../downloads");

async function downloadNewspaperPDFs() {
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const dateStr = getFormattedDate();
  const NEWSPAPER_URL = `${NEWSPAPER_BASE_URL}/${dateStr}/1`;

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true, // Enable downloads
  });
  const page = await context.newPage();

  try {
    console.log("🚀 Starting newspaper download process...");
    console.log(`📅 Date: ${dateStr}`);
    console.log(`📄 URL: ${NEWSPAPER_URL}`);

    await page.goto(NEWSPAPER_URL, { waitUntil: "networkidle" });

    // Get total number of pages from the dropdown
    const totalPages = await page.$eval(
      "#tpgnumber",
      (select) => (select as HTMLSelectElement).options.length
    );
    console.log(`📚 Total pages in this issue: ${totalPages}`);
    const pdfFiles: string[] = [];

    // Process each page sequentially using the dropdown
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`\n📄 Processing page ${pageNum}/${totalPages}...`);

      // Select the page using the dropdown
      await page.$eval(
        "#tpgnumber",
        (select, value) => {
          (select as HTMLSelectElement).value = value;
          select.dispatchEvent(new Event("change"));
        },
        pageNum.toString()
      );

      // Wait for the flipbook viewport to be ready
      await page.waitForSelector(".flipbook-viewport");

      // Verify the selected page matches
      const selectedPage = await page.$eval(
        "#tpgnumber",
        (select) => (select as HTMLSelectElement).value
      );

      if (selectedPage !== pageNum.toString()) {
        console.error(
          `❌ Page mismatch: Expected ${pageNum}, got ${selectedPage}`
        );
        continue;
      }

      // Wait for and find the download button span
      await page.waitForSelector('span.teIcoImg[onclick*="currentissues"]');

      // Set up download handler before clicking
      const downloadPromise = page.waitForEvent("download");
      await page.click('span.teIcoImg[onclick*="currentissues"]');

      // Wait for the download to start
      const download = await downloadPromise;

      // Save the file with our desired name
      const filePath = path.join(OUTPUT_DIR, `${dateStr}_page-${pageNum}.pdf`);
      await download.saveAs(filePath);

      pdfFiles.push(filePath);
      console.log(`✅ Page ${pageNum} downloaded successfully`);
    }

    // Validate total downloads
    if (pdfFiles.length !== totalPages) {
      console.warn(
        `⚠️ Warning: Downloaded ${pdfFiles.length} pages out of ${totalPages} total pages`
      );
    }

    console.log(`\n📥 Download complete! Total files: ${pdfFiles.length}`);
    return { pdfFiles, dateStr };
  } catch (error) {
    console.error("❌ Error downloading PDFs:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function mergePDFs(pdfFiles: string[], dateStr: string): Promise<string> {
  const mergedPdfPath = path.join(OUTPUT_DIR, `${dateStr}_odiya_news.pdf`);

  try {
    console.log("\n🔄 Starting PDF merge process...");
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < pdfFiles.length; i++) {
      console.log(`📄 Merging page ${i + 1}/${pdfFiles.length}...`);
      const pdfBytes = await fs.readFile(pdfFiles[i]);
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();
    await fs.writeFile(mergedPdfPath, mergedPdfBytes);
    console.log(`\n✅ PDF merge complete! Saved as: ${mergedPdfPath}`);
    return mergedPdfPath;
  } catch (error) {
    console.error("❌ Error merging PDFs:", error);
    throw error;
  }
}

async function cleanupIndividualFiles(pdfFiles: string[]): Promise<void> {
  try {
    console.log("\n🧹 Cleaning up individual PDF files...");
    for (const file of pdfFiles) {
      await fs.unlink(file);
      console.log(`✅ Deleted: ${path.basename(file)}`);
    }
    console.log("✅ Cleanup complete!");
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    // Don't throw here, as cleanup is not critical
  }
}

async function cleanupDownloadsFolder(): Promise<void> {
  try {
    console.log("\n🧹 Cleaning up downloads folder...");
    const files = await fs.readdir(OUTPUT_DIR);
    for (const file of files) {
      const filePath = path.join(OUTPUT_DIR, file);
      await fs.unlink(filePath);
      console.log(`✅ Deleted: ${file}`);
    }
    console.log("✅ Downloads folder cleanup complete!");
  } catch (error) {
    console.error("❌ Error during downloads folder cleanup:", error);
    // Don't throw here, as cleanup is not critical
  }
}

(async () => {
  try {
    console.log("=".repeat(50));
    console.log("📰 Newspaper PDF Downloader and Merger");
    console.log("=".repeat(50));

    // Clean up downloads folder before starting
    await cleanupDownloadsFolder();

    const { pdfFiles, dateStr } = await downloadNewspaperPDFs();
    const mergedFilePath = await mergePDFs(pdfFiles, dateStr);

    // Clean up individual files after successful merge
    await cleanupIndividualFiles(pdfFiles);

    // Validate Slack credentials
    if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) {
      throw new Error(
        "SLACK_BOT_TOKEN and SLACK_CHANNEL_ID are required in .env file"
      );
    }

    // Send the merged PDF to Slack
    console.log("\n💬 Sending PDF to Slack...");
    const slackResult = await sendPDFToSlack(
      mergedFilePath,
      process.env.SLACK_CHANNEL_ID,
      process.env.SLACK_BOT_TOKEN
    );

    if (slackResult.status === "success") {
      console.log("✅ PDF sent successfully to Slack!");
      console.log(`📎 File ID: ${slackResult.messageId}`);

      // Clean up the merged PDF file after successful Slack upload
      await cleanupDownloadsFolder();
    } else {
      console.error("❌ Failed to send PDF to Slack:", slackResult.error);
    }

    console.log("\n✨ All tasks completed successfully!");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Process failed:", error);
    process.exit(1);
  }
})();
