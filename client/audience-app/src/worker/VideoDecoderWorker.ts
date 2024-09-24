import { MinHeap } from "../utils/MinHeap";
let videoDecoder: VideoDecoder;
let decoding = false;
let decodedFrameHeap = new MinHeap<VideoFrame>();

let frameCollectionStartTime: DOMHighResTimeStamp = 0;
let bufferingTime = 1000;
let frameSent = 0;
let frameInterval = 1000 / 30;
let lastSyncTime = 0;
let timeDriftThreshold = frameInterval * 2;
let syncInterval = 10000;

function initDecoder() {
  videoDecoder = new VideoDecoder({
    output: (decodedFrame) => {
      decodedFrameHeap.insert(decodedFrame);

      const currentTime = performance.now();

      // buffer for bufferingTime second(s) before sending to main thread for rendering
      if (currentTime - frameCollectionStartTime >= bufferingTime) {
        // console.log("frame heap size: ", decodedFrameHeap.size());
        const frame = decodedFrameHeap.extractMin();
        postMessage({ action: "renderFrame", frame });
        frameSent++;

        // check if it's time to resync every syncInterval
        if (currentTime - lastSyncTime >= syncInterval) {
          console.log("Checking for resyncing... at time: ", currentTime);
          resync(currentTime);
          lastSyncTime = currentTime;
        }
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

// resync the video playback
function resync(currentTime: DOMHighResTimeStamp) {
  const expectedFrameTime = frameSent * frameInterval;
  const actualTimePassed = currentTime - frameCollectionStartTime - bufferingTime;
  const timeDrift = actualTimePassed - expectedFrameTime;

  if (Math.abs(timeDrift) > timeDriftThreshold) {
    console.log(`🔄 🎬 Re-syncing, time drift detected: ${timeDrift}ms`);

    if (timeDrift > 0) {
      while (decodedFrameHeap.size() > 0 && timeDrift > timeDriftThreshold) {
        decodedFrameHeap.extractMin(); // Drop old frames // TODO: should we drop frames selectively? Such as dropping every one of two frames?
        frameSent++; // Increment the frame count
        console.log("🔄 🎬 Dropping frame to catch up");
      }
    }
    // this should not happen in normal live streaming
    else if (timeDrift < 0) {
      console.log("🔄 🎬 Delaying rendering to slow down");
    }
  }
}

self.onmessage = function (e) {
  const { action, frame } = e.data;

  if (action === "insertFrame") {
    if (frameCollectionStartTime === 0) {
      frameCollectionStartTime = performance.now();
    }
    // console.log("frame heap size after insertion: ", frameHeap.size());
    if (!decoding) {
      decoding = true;
      initDecoder();
      console.log("Video Decoder Worker initialized");
    }
    try {
      videoDecoder.decode(frame);
    } catch (err) {
      console.error("❌ Failed to decode video frame:", err);
    }
  }
};
