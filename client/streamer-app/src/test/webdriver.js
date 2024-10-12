import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { spawn } from "child_process";
import readline from "readline";

async function setupChromeDriver() {
  let options = new chrome.Options()
    .setLocalState({
      "browser.enabled_labs_experiments": ["webtransport-developer-mode"],
    })
    .addArguments("--headless")
    .addArguments("--mute-audio");
  let driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
  return driver;
}

async function goLive(url) {
  let driver = await setupChromeDriver();
  try {
    await driver.get(url);
    await driver.wait(until.elementLocated(By.id("goLive")), 5000);
    const goLiveButton = await driver.findElement(By.id("goLive"));
    await goLiveButton.click();
    console.log("🧪 Streamer test case passed!");
  } catch (error) {
    console.error("❌ Test case failed, streamer goes live failed:", error);
  }
}

async function startStreamerApp() {
  return new Promise((resolve, reject) => {
    const process = spawn("./src/test/startStreamerApp.sh", { shell: true });
    const rl = readline.createInterface({
      input: process.stdout,
      output: process.stdin,
      terminal: false,
    });
    rl.on("line", (line) => {
      console.log(line); // log the npm start output
      const urlMatch = line.match(/https?:\/\/localhost:\d+\/streamer\//);
      if (urlMatch) {
        resolve(urlMatch[0]);
      }
    });

    process.on("close", (code) => {
      if (code !== 0) {
        reject(`Streamer app process exited with code ${code}`);
      }
    });

    process.on("error", (err) => {
      reject(`Failed to start streamer app: ${err}`);
    });
  });
}

async function runTest() {
  try {
    const streamerAppUrl = await startStreamerApp();
    await goLive(streamerAppUrl);
  } catch (error) {
    console.log("❌ Error running streamer test:", error);
  }
}

runTest();
