import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
dotenv.config();

puppeteer.use(StealthPlugin());

export const codeforces_submitted_code = async (submissionUrl) => {
  try {
    const cookiesString =
      process.env.COOKIES_BASE64 &&
      Buffer.from(process.env.COOKIES_BASE64, "base64").toString("utf-8");
    let cookies = cookiesString ? JSON.parse(cookiesString) : [];
    console.log("Cookies count:", cookies.length);
    cookies = cookies.map((c) => {
      if (typeof c.sameSite !== "string") delete c.sameSite;
      return c;
    });

    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,800",
      ],
    });

    const page = await browser.newPage();

    if (cookies.length) await page.setCookie(...cookies);

    await page
      .goto(submissionUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      })
      .catch(() => {
        console.log("Navigation failed, returning empty code.");
      });

    // Wait for Cloudflare bypass, optional
    try {
      await page.waitForFunction(
        () => !document.querySelector("div[data-translate='checking_browser']"),
        { timeout: 30000 }
      );
    } catch {
      console.log("Cloudflare check skipped or timed out.");
    }

    let code = "";
    try {
      await page.waitForSelector("#program-source-text", { timeout: 5000 });
      code = await page.$eval("#program-source-text", (el) => el.innerText);
    } catch {
      console.log("Code element not found, returning empty string.");
    }
    await page
      .screenshot({ path: "debug.png", fullPage: true })
      .catch(() => {});

    await browser.close();
    console.log(code ? "Code fetched successfully." : "No code found.");
    console.log("-----");
    console.log(code);
    console.log("-----");
    return code || "";
  } catch (err) {
    console.log("Unexpected error in code fetch:", err.message);
    return "";
  }
};
