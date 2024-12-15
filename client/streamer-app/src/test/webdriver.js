import { Builder, By, logging, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import fs from "fs";
import { spawn } from "child_process";
import readline from "readline";

async function setupChromeDriver() {
  let options = new chrome.Options()
    .setLocalState({
      "browser.enabled_labs_experiments": ["webtransport-developer-mode"],
    })
    // .addArguments("--headless")
    .addArguments("--mute-audio");

  // Enable logging for the browser
  const prefs = new logging.Preferences();
  prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);

  let driver = await new Builder().forBrowser("chrome").setChromeOptions(options).setLoggingPrefs(prefs).build();
  return driver;
}

async function goLive(url) {
  let driver = await setupChromeDriver();

  // Create a log file to save the logs
  const timeStr = new Date()
    .toLocaleString("en-GB", { timeZone: "Europe/Berlin", hour12: false })
    .replace(/:/g, "-")
    .replace(/,/g, "_")
    .replace(/\//g, "-")
    .replace(/ /g, "");
  const logFile = "./src/test/streamer-app-" + timeStr + ".log";
  const logStream = fs.createWriteStream(logFile, { flags: "w" });
  async function captureLogs() {
    let logs = await driver.manage().logs().get(logging.Type.BROWSER);
    logs.forEach((log) => {
      logStream.write(`${log.level.name} ${log.message}\n`);
    });
  }

  try {
    await driver.get(url);
    await driver.wait(until.elementLocated(By.id("goLive")), 5000);
    const goLiveButton = await driver.findElement(By.id("goLive"));
    await goLiveButton.click();
    console.log("🧪 Streamer test case passed!\nSaving streamer logs...");

    // save streamer logs
    let playbackTime = 70000; // in milliseconds
    async function saveStreamerLog(duration) {
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
    saveStreamerLog(playbackTime);

    await driver.sleep(playbackTime);
  } catch (error) {
    console.log("❌ Test case failed, streamer goes live failed:", error);
  } finally {
    console.log("Save final logs...");
    await captureLogs();
    logStream.end();
    await driver.quit();
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
