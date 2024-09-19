import { MinHeap } from "./MinHeap";
let audioDecoder: AudioDecoder;
let decoding = false;
let decodedAudioHeap = new MinHeap<AudioData>();

let audioCollectionStartTime: DOMHighResTimeStamp = 0;
let audioSent = 0;
let audioInterval = 20;

function initDecoder() {
  audioDecoder = new AudioDecoder({
    output: (decodedAudio) => {
      decodedAudioHeap.insert(decodedAudio);

      if (performance.now() - audioCollectionStartTime >= 1000) {
        // console.log("audio heap size: ", decodedAudioHeap.size());
        // if (audioSent * audioInterval <= performance.now() - audioCollectionStartTime) {
        const audio = decodedAudioHeap.extractMin();
        postMessage({ action: "playAudio", audio });
        // audioSent++;
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

self.onmessage = function (e) {
  const { action, audio } = e.data;

  if (action === "insertAudio") {
    if (audioCollectionStartTime === 0) {
      audioCollectionStartTime = performance.now();
    }
    // console.log("audio heap size after insertion: ", audioHeap.size());
    if (!decoding) {
      decoding = true;
      initDecoder();
      console.log("Audio Decoder Worker initialized");
    }
    try {
      audioDecoder.decode(audio);
    } catch (err) {
      console.log("❌ Failed to decode audio chunk:", err);
    }
  }
};
