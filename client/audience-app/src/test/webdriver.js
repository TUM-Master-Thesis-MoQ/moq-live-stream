import { Builder, By, logging, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import fs from "fs";
import { spawn } from "child_process";
import readline from "readline";

async function setupChromeDriver() {
  let options = new chrome.Options().setLocalState({
    "browser.enabled_labs_experiments": ["webtransport-developer-mode"],
  });
  // .addArguments("--headless");
  // .addArguments("--mute-audio");

  // Enable logging for the browser
  const prefs = new logging.Preferences();
  prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);

  let driver = await new Builder().forBrowser("chrome").setChromeOptions(options).setLoggingPrefs(prefs).build();
  return driver;
}

async function connect(url) {
  let driver = await setupChromeDriver();

  // Create a log file to save the logs
  const timeStr = new Date()
    .toLocaleString("en-GB", { timeZone: "Europe/Berlin", hour12: false })
    .replace(/:/g, "-")
    .replace(/,/g, "_")
    .replace(/\//g, "-")
    .replace(/ /g, "");
  const logFile = "./src/test/audience-app-" + timeStr + ".log";
  const logStream = fs.createWriteStream(logFile, { flags: "w" });
  async function captureLogs() {
    let logs = await driver.manage().logs().get(logging.Type.BROWSER);
    logs.forEach((log) => {
      logStream.write(`${log.level.name} ${log.message}\n`);
    });
  }

  try {
    await driver.get(url);
    try {
      await driver.wait(until.elementLocated(By.id("connect")), 5000);
      const connectButton = await driver.findElement(By.id("connect"));
      await connectButton.click();
    } catch (err) {
      throw new Error("❌ Test case failed, audience failed to connect to server:", err);
    }

    // save connection logs
    await captureLogs();

    try {
      await driver.wait(until.elementLocated(By.id("ninja")), 5000); //wait for channel ninja to show up
      const ninjaButton = await driver.findElement(By.id("ninja"));
      await ninjaButton.click();
    } catch (err) {
      throw new Error("❌ Test case failed, failed to find channel 'ninja':", err);
    }

    // save subscription logs, and save media object logs periodically
    let playbackTime = 60000; // in milliseconds
    async function saveMediaLogs(duration) {
      const startTime = Date.now();

      async function run() {
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > duration) {
          return;
        }
        await captureLogs();
        setTimeout(run, 1000);
      }
      run();
    }
    saveMediaLogs(playbackTime);

    //  Wait for the video to play for a while
    await driver.sleep(playbackTime);
    await driver.wait(until.elementLocated(By.id("disconnect")), 5000);
    const disconnectButton = await driver.findElement(By.id("disconnect"));
    await disconnectButton.click();

    // save disconnect logs
    await captureLogs();

    console.log("🧪 Audience test case passed!");
  } catch (error) {
    throw new Error("❌ Test case failed:", error);
  } finally {
    console.log("Save final logs...");
    await captureLogs();
    logStream.end();
    await driver.quit();
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
