import { MinHeap } from "../utils/MinHeap";
import { VideoDecoderWorkerMessage } from "../interface/WorkerMessage";
let videoDecoder: VideoDecoder;
let decoderInitialized = false;
let decodedFrameHeap = new MinHeap<VideoFrame>();

let frameCollectionStartTime: DOMHighResTimeStamp = 0;
let frameSent = 0;
// let frameInterval = 1000 / 30;
let lastSyncTime = 0;
// let timeDriftThreshold = frameInterval * 2;
let syncInterval = 10000;

let frameReceived = 0;
let frameDropped = 0;
let droppedBytes = 0;
let buffered = false;
let jitterBuffer: number[] = []; // jitter buffer for storing frames' arrival time (Date.now()) for jitter calculation

let latencyLogging = false; //! testbed: latency test_0

let videoTimestampRef = 0;
let audioTimestampRef = 0;

function initDecoder() {
  videoDecoder = new VideoDecoder({
    output: (decodedFrame) => {
      latencyLogging && console.log(`🧪 🎬 obj latency ${decodedFrame.timestamp} #4: ${Date.now()}`);
      decodedFrameHeap.insert(decodedFrame);

      const currentTime = performance.now();
      // check for jitter every syncInterval
      // console.log("frame heap size: ", decodedFrameHeap.size());
      latencyLogging && console.log(`🧪 🎬 obj latency ${decodedFrame.timestamp} #5: ${Date.now()}`);
      // const frame = decodedFrameHeap.extractMin();
      // postMessage({ action: "renderFrame", frame });
      // frameSent++;

      // check jitter every syncInterval
      if (currentTime - lastSyncTime >= syncInterval) {
        calculateJitter();
        lastSyncTime = currentTime;
      }
    },
    error: (error) => {
      console.error(error);
    },
  });
  videoDecoder.configure({
    codec: "vp8",
    codedWidth: 1920,
    codedHeight: 1080,
  });
}

// // resync the video playback
// function resync(currentTime: DOMHighResTimeStamp) {
//   const expectedFrameTime = frameSent * frameInterval;
//   const actualTimePassed = currentTime - frameCollectionStartTime - bufferingTime;
//   const timeDrift = actualTimePassed - expectedFrameTime;

//   if (Math.abs(timeDrift) > timeDriftThreshold) {
//     console.log(`🔄 🎬 Re-syncing, time drift detected: ${timeDrift}ms`);

//     if (timeDrift > 0) {
//       while (decodedFrameHeap.size() > 0 && timeDrift > timeDriftThreshold) {
//         //! gonna drop frame in syncing video to audio method
//         decodedFrameHeap.extractMin(); // Drop old frames // TODO: should we drop frames selectively? Such as dropping every one of two frames?
//         frameSent++; // Increment the frame count
//         console.log("🔄 🎬 Dropping frame to catch up");
//         frameDropped++;
//         checkDropRate();
//       }
//     }
//     // this should not happen in normal live streaming
//     else if (timeDrift < 0) {
//       console.log("🔄 🎬 Delaying rendering to slow down");
//     }
//   }
// }

self.onmessage = function (e) {
  const { action, frame, timestamp } = e.data as VideoDecoderWorkerMessage;

  // get the reference timestamp from audio and video for syncing purpose later
  if (action === "videoTimestampRef") {
    videoTimestampRef = timestamp!;
    console.log("videoTimestampRef: ", videoTimestampRef);
  }
  if (action === "audioTimestampRef") {
    audioTimestampRef = timestamp!;
    console.log("audioTimestampRef: ", audioTimestampRef);
  }

  if (action === "insertFrame") {
    // console.log(`Inserting video frame, buffer size: ${decodedFrameHeap.size()}`);
    frameReceived++;
    //! build jitter buffer
    jitterBuffer.push(Date.now()); // build jitter buffer
    if (frameCollectionStartTime === 0) {
      frameCollectionStartTime = performance.now();
    }
    // console.log("frame heap size after insertion: ", frameHeap.size());
    if (!decoderInitialized) {
      decoderInitialized = true;
      initDecoder();
      console.log("Video Decoder Worker initialized");
    }
    try {
      if (buffered) {
        // console.log("Early drop checking...");
        const rootFrame = decodedFrameHeap.peek();
        if (rootFrame) {
          //! early drop
          if (frame!.timestamp < rootFrame.timestamp) {
            frameDropped++;
            //! drop rate
            checkDropRate();
            console.log(
              `🗑️ Dropped frame's timestamp: ${frame!.timestamp}, bytes: ${frame!.byteLength} ;Date.now(): ${Date.now()}`,
            );
            droppedBytes += frame!.byteLength;
          } else {
            videoDecoder.decode(frame!);
          }
        } else {
          //! stale time
          postMessage({ action: "staleTime" });
        }
      } else {
        videoDecoder.decode(frame!);
      }
    } catch (err) {
      console.error("❌ Failed to decode video frame:", err);
    }
  }
  if (action === "retrieveFrame") {
    if (!buffered) {
      // set buffered to true after main thread is retrieving frames
      buffered = true;
    }
    // console.log(`Extracting video frame, buffer size: ${decodedFrameHeap.size()}`);
    if (decodedFrameHeap.size() > 0) {
      // syncing video to audio by timestamp
      const baseTimestampDiff = audioTimestampRef - videoTimestampRef;

      const frame = decodedFrameHeap.peek();
      let currentTimestampDiff = timestamp! - frame!.timestamp;
      // at least 1 frame is ahead for delaying
      if (currentTimestampDiff - baseTimestampDiff < -33333) {
        // console.log(
        //   "⏳ Delayed rendering new frame that is at least 33333 μs ahead, base diff: ",
        //   currentTimestampDiff - baseTimestampDiff,
        // );
      } else {
        while (true) {
          // at lease 1 frame is behind for dropping
          if (currentTimestampDiff - baseTimestampDiff > 33333) {
            const frame = decodedFrameHeap.extractMin();
            console.log(
              "🗑️ Dropped frame that is at least 33333μs late, dropped frame's timestamp: ",
              frame!.timestamp,
            );
            frameDropped++;
            currentTimestampDiff = timestamp! - frame!.timestamp;
          } else {
            const frame = decodedFrameHeap.extractMin();
            postMessage({ action: "renderFrame", frame });
            frameSent++;
            break;
          }
        }
      }
      // // check if it's time to resync every syncInterval
      // const currentTime = performance.now();
      // if (currentTime - lastSyncTime >= syncInterval) {
      //   console.log("Checking for resyncing... at time: ", currentTime);
      //   resync(currentTime);
      //   calculateJitter(); // check jitter every syncInterval
      //   lastSyncTime = currentTime;
      // }
    }
  }
};

function checkDropRate() {
  let dropRate = frameDropped / frameReceived;
  if (dropRate > 0.1) {
    console.log(`⚠️ High frame drop rate: ${dropRate}, rate adaptation(downwards) triggered`);
    postMessage({ action: "adaptDown" });
  }
}

// jitter calculation: variation in packet arrival time difference
function calculateJitter() {
  let differenceBuffer: number[] = [];
  for (let i = 1; i < jitterBuffer.length; i++) {
    differenceBuffer.push(jitterBuffer[i] - jitterBuffer[i - 1]);
  }
  let n = differenceBuffer.length;
  let mean = differenceBuffer.reduce((sum, value) => sum + value) / n;
  let variance = differenceBuffer.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / n;
  let jitter = Math.sqrt(variance);
  //TODO: rate adaptation based on jitter
  console.log(`🔥 Jitter from last 10 seconds: ${jitter}ms`);
  if (jitter > 100) {
    console.log("⚠️ High jitter detected, rate adaptation triggered");
    postMessage({ action: "adaptDown" });
  }
  jitterBuffer = [];
}
