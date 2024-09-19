import { MinHeap } from "./MinHeap";
let videoDecoder: VideoDecoder;
let decoding = false;
let decodedFrameHeap = new MinHeap<VideoFrame>();

let frameCollectionStartTime: DOMHighResTimeStamp = 0;
let frameSent = 0;
let frameInterval = 1000 / 30;

function initDecoder() {
  videoDecoder = new VideoDecoder({
    output: (decodedFrame) => {
      decodedFrameHeap.insert(decodedFrame);

      if (performance.now() - frameCollectionStartTime >= 1000) {
        // console.log("frame heap size: ", decodedFrameHeap.size());
        // if (frameSent * frameInterval <= performance.now() - frameCollectionStartTime) {
        const frame = decodedFrameHeap.extractMin();
        postMessage({ action: "renderFrame", frame });
        // frameSent++;
        // }
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
