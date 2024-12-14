import { MinHeap } from "../utils/MinHeap";
let audioDecoder: AudioDecoder;
let decoderInitialized = false;
let decodedAudioHeap = new MinHeap<AudioData>();

let audioCollectionStartTime: DOMHighResTimeStamp = 0;
let bufferingTime = 300;
let audioSent = 0;
let audioInterval = 20;
let lastSyncTime = 0;
let timeDriftThreshold = audioInterval * 2;
let syncInterval = 10000;

let chunkReceived = 0;
let chunkDropped = 0;
let droppedBytes = 0;
let buffered = false;
let triggeredPlayback = false;
let jitterBuffer: number[] = [];

let latencyLogging = false; //! testbed: latency test_0

function initDecoder() {
  audioDecoder = new AudioDecoder({
    output: (decodedAudio) => {
      latencyLogging && console.log(`🧪 🔊 obj latency ${decodedAudio.timestamp} #4: ${Date.now()}`);
      decodedAudioHeap.insert(decodedAudio);

      const currentTime = performance.now();
      // buffer for bufferingTime second(s) before triggering audio playback
      if (currentTime - audioCollectionStartTime >= bufferingTime) {
        buffered = true;

        if (!triggeredPlayback) {
          // console.log("audio heap size: ", decodedAudioHeap.size());
          latencyLogging && console.log(`🧪 🔊 obj latency ${decodedAudio.timestamp} #5: ${Date.now()}`);
          const audio = decodedAudioHeap.extractMin();
          postMessage({ action: "playAudio", audio });
          console.log(`Cached for ${bufferingTime} ms, audio playback starts...`);
          audioSent++;
          triggeredPlayback = true;
        }

        // check if it's time to resync every syncInterval
        if (currentTime - lastSyncTime >= syncInterval) {
          console.log("Resyncing... at time: ", currentTime);
          // resync(currentTime);
          calculateJitter();
          lastSyncTime = currentTime;
        }
      }
    },
    error: (error) => {
      console.error(error);
    },
  });
  audioDecoder.configure({
    codec: "opus",
    sampleRate: 48000,
    numberOfChannels: 1,
  });
}

function resync(currentTime: DOMHighResTimeStamp) {
  const expectedAudioTime = audioSent * audioInterval;
  const actualTimePassed = currentTime - audioCollectionStartTime - bufferingTime;
  const timeDrift = actualTimePassed - expectedAudioTime;

  if (Math.abs(timeDrift) > timeDriftThreshold) {
    console.log(`🔄 🔊 Re-syncing, time drift detected: ${timeDrift}ms`);

    if (timeDrift > 0) {
      while (decodedAudioHeap.size() > 0 && timeDrift > timeDriftThreshold) {
        decodedAudioHeap.extractMin();
        audioSent++;
        console.log("🔄 🔊 Dropped audio frame to catch up");
      }
    }
    // this should not happen in normal live streaming
    else if (timeDrift < 0) {
      console.log("🔄 🔊 We're ahead of time, should we insert silence?");
    }
  }
}

self.onmessage = function (e) {
  const { action, audio }: { action: string; audio: EncodedAudioChunk } = e.data;

  if (action === "insertAudio") {
    // console.log(`Inserting audio chunk, buffer size: ${decodedAudioHeap.size()}`);
    chunkReceived++;
    //! build jitter buffer
    jitterBuffer.push(Date.now());
    if (audioCollectionStartTime === 0) {
      audioCollectionStartTime = performance.now();
    }
    // console.log("audio heap size after insertion: ", audioHeap.size());
    if (!decoderInitialized) {
      decoderInitialized = true;
      initDecoder();
      console.log("Audio Decoder Worker initialized");
    }
    try {
      if (buffered) {
        // console.log("Early drop checking...");
        const rootAudio = decodedAudioHeap.peek();
        if (rootAudio) {
          //! early drop
          if (audio.timestamp < rootAudio.timestamp) {
            chunkDropped++;
            //! drop rate
            checkDropRate();
            console.log(
              `🗑️ Dropped audio chunk's timestamp: ${audio.timestamp}, bytes: ${audio.byteLength} ;Date.now(): ${Date.now()}`,
            );
            droppedBytes += audio.byteLength;
          } else {
            audioDecoder.decode(audio);
          }
        } else {
          //! stale time
          postMessage({ action: "staleTime" });
        }
      } else {
        audioDecoder.decode(audio);
      }
    } catch (err) {
      console.log("❌ Failed to decode audio chunk:", err);
    }
  }

  if (action === "retrieveAudio") {
    // console.log(`Extracting audio chunk, buffer size: ${decodedAudioHeap.size()}`);
    if (decodedAudioHeap.size() > 0) {
      const audio = decodedAudioHeap.extractMin();
      // console.log("Audio heap size: ", decodedAudioHeap.size());
      postMessage({ action: "playAudio", audio });
      audioSent++;
    }
  }
};

function checkDropRate() {
  let dropRate = chunkDropped / chunkReceived;
  if (dropRate > 0.1) {
    console.log(`⚠️ High audio chunk drop rate: ${dropRate}, rate adaptation(downwards) triggered`);
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
  console.log(`🔥 Jitter from last 10 seconds: ${jitter}ms`);
  //TODO: rate adaptation based on jitter
  if (jitter > 100) {
    console.log("⚠️ High jitter detected, rate adaptation triggered");
    postMessage({ action: "adaptDown" });
  }
  jitterBuffer = [];
}
