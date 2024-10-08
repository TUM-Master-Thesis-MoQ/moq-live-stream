import { VideoEncoderConfig } from "../interface/VideoEncoderConfig";

let latencyLogging = false; //! testbed: latency test_0

function send(chunk: EncodedVideoChunk) {
  latencyLogging && console.log(`🧪 🎬 obj latency ${chunk.timestamp} #1: ${Date.now()}`);
  postMessage(chunk);
}

self.onmessage = function (e) {
  const { config, readableStream } = e.data;
  const videoEncoder: VideoEncoder = new VideoEncoder({
    output: send,
    error: (error) => {
      console.error(error);
    },
  });
  try {
    videoEncoder.configure(config);
    encodeVideo(readableStream.getReader(), videoEncoder, config);
    console.log("Video Encoder Worker Initialized");
  } catch (err) {
    console.log("Failed to configure video encoder: ", err);
  }
};

// 30 FPS: 1 [0] key frame + 29 delta frames [1,29]
let isKeyFrame = true;
let frameIndex = 0;
async function encodeVideo(
  reader: ReadableStreamDefaultReader<VideoFrame>,
  videoEncoder: VideoEncoder,
  config: VideoEncoderConfig,
) {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (videoEncoder) {
      if (frameIndex === 0) {
        isKeyFrame = true;
      } else {
        isKeyFrame = false;
      }
      latencyLogging && console.log(`🧪 🎬 obj latency ${value.timestamp} #0: ${Date.now()}`);
      videoEncoder.encode(value, { keyFrame: isKeyFrame });
      // console.log(`🎥 Encoded video: ${isKeyFrame ? "key" : "delta"} frame ${frameIndex}`);
      frameIndex++;
      if (frameIndex >= config.framerate) {
        frameIndex = 0;
      }
    }
    value.close();
  }
}
