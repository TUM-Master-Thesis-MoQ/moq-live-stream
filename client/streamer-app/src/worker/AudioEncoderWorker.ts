let latencyLogging = false; //! testbed: latency test_0

function send(chunk: EncodedAudioChunk) {
  latencyLogging && console.log(`🧪 🔊 obj latency ${chunk.timestamp} #1: ${Date.now()}`);
  postMessage(chunk);
}

self.onmessage = function (e) {
  const { config, readableStream } = e.data;
  const audioEncoder: AudioEncoder = new AudioEncoder({
    output: send,
    error: (error) => {
      console.error(error);
    },
  });
  try {
    audioEncoder.configure(config);
    encodeAudio(readableStream.getReader(), audioEncoder);
    console.log("Audio Encoder Worker Initialized");
  } catch (err) {
    console.log("Failed to configure audio encoder: ", err);
  }
};

async function encodeAudio(reader: ReadableStreamDefaultReader<AudioData>, audioEncoder: AudioEncoder) {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (audioEncoder) {
      latencyLogging && console.log(`🧪 🔊 obj latency ${value.timestamp} #0: ${Date.now()}}`);
      audioEncoder.encode(value);
      // console.log(`🔊 Encoded audio: ${value.timestamp}`);
    }
    value.close();
  }
}
