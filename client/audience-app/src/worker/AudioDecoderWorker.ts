import { MinHeap } from "../utils/MinHeap";
let audioDecoder: AudioDecoder;
let decoderInitialized = false;
let decodedAudioHeap = new MinHeap<AudioData>();

let audioCollectionStartTime: DOMHighResTimeStamp = 0;
let bufferingTime = 1000;
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

      // buffer for bufferingTime second(s) before sending to main thread for rendering
      if (currentTime - audioCollectionStartTime >= bufferingTime) {
        buffered = true;

        if (!triggeredPlayback) {
          // console.log("audio heap size: ", decodedAudioHeap.size());
          latencyLogging && console.log(`🧪 🔊 obj latency ${decodedAudio.timestamp} #5: ${Date.now()}`);
          const audio = decodedAudioHeap.extractMin();
          postMessage({ action: "playAudio", audio });
          console.log("Cached for 1 sec, audio playback starts...");
          audioSent++;
          triggeredPlayback = true;
        }

        // // check if it's time to resync every syncInterval
        // if (currentTime - lastSyncTime >= syncInterval) {
        //   console.log("Checking for resyncing... at time: ", currentTime);
        //   resync(currentTime);
        //   lastSyncTime = currentTime;
        // }
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
    chunkReceived++;
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
      // TODO: early dropping
      audioDecoder.decode(audio);
    } catch (err) {
      console.log("❌ Failed to decode audio chunk:", err);
    }
  }

  if (action === "retrieveAudio") {
    if (decodedAudioHeap.size() > 0) {
      const audio = decodedAudioHeap.extractMin();
      // console.log("Audio heap size: ", decodedAudioHeap.size());
      postMessage({ action: "playAudio", audio });
      audioSent++;
    }
  }
};
