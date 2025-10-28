import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
dotenv.config();
import fs from "fs";

puppeteer.use(StealthPlugin());

export const codeforces_submitted_code = async (submissionUrl) => {
  const cookiesString = process.env.COOKIES_BASE64
    && Buffer.from(process.env.COOKIES_BASE64, "base64").toString("utf-8");
  let cookies = JSON.parse(cookiesString);

  cookies = cookies.map((c) => {
    if (typeof c.sameSite !== "string") delete c.sameSite;
    return c;
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1280,800",
    ],
  });

  const page = await browser.newPage();
  await page.setCookie(...cookies);


  await page.goto(submissionUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // Sometimes Cloudflare shows a "checking" page — wait for bypass
  await page
    .waitForFunction(
      () => !document.querySelector("div[data-translate='checking_browser']"),
      { timeout: 30000 }
    )
    .catch(() => console.log("Cloudflare check skipped or passed quickly."));

  // Wait for the code element
  await page.waitForSelector("#program-source-text", { timeout: 60000 });
  const code = await page.$eval("#program-source-text", (el) => el.innerText);


  await browser.close();
  return code;
};
