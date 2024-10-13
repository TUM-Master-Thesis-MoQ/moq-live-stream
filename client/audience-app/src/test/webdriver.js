import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { spawn } from "child_process";
import readline from "readline";

async function setupChromeDriver() {
  let options = new chrome.Options().setLocalState({
    "browser.enabled_labs_experiments": ["webtransport-developer-mode"],
  });
  // .addArguments("--headless");
  // .addArguments("--mute-audio");
  let driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
  return driver;
}

async function connect(url) {
  let driver = await setupChromeDriver();
  try {
    await driver.get(url);
    try {
      await driver.wait(until.elementLocated(By.id("connect")), 5000);
      const connectButton = await driver.findElement(By.id("connect"));
      await connectButton.click();
    } catch (err) {
      throw new Error("❌ Test case failed, audience failed to connect to server:", err);
    }
    try {
      await driver.wait(until.elementLocated(By.id("ninja")), 5000); //wait for channel ninja to show up
      const ninjaButton = await driver.findElement(By.id("ninja"));
      await ninjaButton.click();
    } catch (err) {
      throw new Error("❌ Test case failed, failed to find channel 'ninja':", err);
    }
    console.log("🧪 Audience test case passed!");
  } catch (error) {
    throw new Error("❌ Test case failed:", error);
  }
}

async function startAudienceApp() {
  return new Promise((resolve, reject) => {
    const process = spawn("./src/test/startAudienceApp.sh", { shell: true });
    const rl = readline.createInterface({
      input: process.stdout,
      output: process.stdin,
      terminal: false,
    });
    rl.on("line", (line) => {
      console.log(line); // log the npm start output
      const urlMatch = line.match(/https?:\/\/localhost:\d+\/audience\//);
      if (urlMatch) {
        resolve(urlMatch[0]);
      }
    });

    process.on("close", (code) => {
      if (code !== 0) {
        reject(`Audience app process exited with code ${code}`);
      }
    });

    process.on("error", (err) => {
      reject(`Failed to start audience app: ${err}`);
    });
  });
}

async function runTest() {
  try {
    const audienceAppUrl = await startAudienceApp();
    await connect(audienceAppUrl);
  } catch (error) {
    console.log("❌ Error running audience test:", error);
  }
}

runTest();
