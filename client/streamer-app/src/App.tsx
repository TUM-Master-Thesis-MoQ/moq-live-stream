import { useState, useRef } from "react";
import { MessageType, Announce, AnnounceEncoder, Parameter } from "moqjs/src/messages";
import { Session } from "moqjs/src/session";
import { ControlStream } from "moqjs/src/control_stream";

function App() {
  const [messages, setMessages] = useState<string[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [transport, setTransport] = useState<WebTransport | null>(null);

  const [capturing, setCapturing] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoEncoderRef = useRef<VideoEncoder | null>(null);
  const audioEncoderRef = useRef<AudioEncoder | null>(null);
  const videoWriterRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const audioWriterRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  //===================== ⬇️ TEST Decoding & Deserialization ⬇️ =====================
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const videoDecoderRef = useRef<VideoDecoder | null>(null);
  const audioDecoderRef = useRef<AudioDecoder | null>(null);
  //===================== ⬆️ TEST Decoding & Deserialization ⬆️ =====================

  async function connectWTS() {
    try {
      const url = "https://localhost:443/webtransport";
      const hash = "9b8a96046d47f2523bec35d334b984d99b6beff16b2e477a0aa23da3db116562";
      const s = await Session.connect(url); // hash is optional in connect(url, hash)
      setTransport(s.conn);

      setMessages([]);
      setConnected(true);
      // announce(s.controlStream);

      // readStream(transport);
      // writeMsgStream(transport);

      initDecoder();

      // setupMediaStream(transport);
      console.log("🔗 Connected to WebTransport server!");
    } catch (error) {
      console.error("❌ Failed to connect:", error);
    }
  }

  async function disconnectWTS() {
    if (transport && connected) {
      try {
        transport.close();
        console.log("🔌 Disconnected from WebTransport server!");
      } catch (error) {
        console.error("❌ Failed to disconnect:", error);
      } finally {
        setMessages([]);
        setConnected(false);
        setTransport(null);
        setCapturing(false);
        audioWriterRef.current?.releaseLock();
        videoWriterRef.current?.releaseLock();
      }
    }
  }
  // ! deprecated: move to WARP Streaming (catalog obj transfer in parallel to MOQT)
  //   // open a bidirectional stream to send the catalog to the server
  //   // ? frontend determines partial/full catalog configuration?
  //   // ? or server defined catalog configuration?
  //   // ? offload msg communication to the MOQT server?
  async function announce(cs: ControlStream) {
    const announceMsg: Announce = {
      type: MessageType.Announce,
      namespace: "",
      parameters: [],
    };

    const catalog = await readJSON("catalog.json");
    if (catalog.commonTrackFields.namespace) {
      announceMsg.namespace = catalog.commonTrackFields.namespace;
      console.log("🚀 ✅ announce ✅ catalog.commonTrackFields.namespace:", catalog.commonTrackFields.namespace);
    } else if (catalog.tracks[0].namespace) {
      announceMsg.namespace = catalog.tracks[0].namespace;
      console.log("🚀 ✅ announce ✅ catalog.tracks[0].namespace:", catalog.tracks[0].namespace);
    } else if (catalog.catalogs.namespace) {
      announceMsg.namespace = catalog.catalogs.namespace;
      console.log("🚀 ✅ announce ✅ catalog.catalogs.namespace:", catalog.catalogs);
    } else {
      console.error("❌ Failed to find namespace in catalog: catalog structure error");
    }

    const parameters: Parameter = {
      type: 1, // ? what's it used for?
      // ? missing length field?
      value: new Uint8Array([]),
    };
    parameters.value = await readJSONBytes("catalog.json");

    announceMsg.parameters.push(parameters);
    console.log("🚀 ✅ announce ✅ parameters.value.length;:", parameters.value.length);

    const announceEncoder = new AnnounceEncoder(announceMsg);
    try {
      cs.send(announceEncoder);
      console.log("📤 Sent announce message in a bds:", announceMsg);
    } catch (error) {
      console.error("❌ Failed to encode announce message:", error);
    }

    while (true) {
      await cs.runReadLoop();
      // TODO: decode & read AnnounceOk or AnnounceError message
      // const message = controlStream.onmessage();
    }
  }

  async function readJSON(dir: string) {
    try {
      const res = await fetch(dir);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${dir}`);
      }
      const data = await res.json();
      return data;
    } catch (error) {
      console.error("❌ Failed to read JSON:", error);
    }
  }

  async function readJSONBytes(dir: string): Promise<Uint8Array> {
    try {
      const res = await fetch(dir);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${dir}`);
      }
      const data = await res.json();
      const jsonString = JSON.stringify(data);
      const encoder = new TextEncoder();
      const unit8Array = encoder.encode(jsonString);
      return unit8Array;
    } catch (error) {
      console.error("❌ Failed to read JSON:", error);
      throw error;
    }
  }

  async function readStream(transport: WebTransport) {
    const bds = transport.incomingBidirectionalStreams;
    const reader = bds.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("🛑 Stream is done!");
        break;
      }
      await readData(value.readable);
    }
    async function readData(readable: ReadableStream<Uint8Array>) {
      const reader = readable.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        const newMessage = new TextDecoder().decode(value);
        setMessages((prev) => [...prev, newMessage]);
        console.log("📩 Received rs:", newMessage);
      }
    }
  }

  async function writeMsgStream(transport: WebTransport) {
    const { readable, writable } = await transport.createBidirectionalStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Generate message stream for ten seconds
    const intervalId = setInterval(() => {
      const message = `Hello from WebTransport client! ${new Date().toISOString()}`;
      writer.write(encoder.encode(message));
      console.log("📤 Sent rs:", message);
    }, 1000);
    setTimeout(() => {
      clearInterval(intervalId);
    }, 10000);

    // read res from the same bidirectional stream
    const reader = readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      const newMessage = new TextDecoder().decode(value);
      console.log("📩 Received rs from bds:", newMessage);
    }
  }

  // // ! deprecated: we are now using uds on demand
  // async function setupMediaStream(transport: WebTransport) {
  //   try {
  //     const videoStream = await transport.createBidirectionalStream();
  //     const audioStream = await transport.createBidirectionalStream();
  //     videoWriterRef.current = videoStream.writable.getWriter();
  //     audioWriterRef.current = audioStream.writable.getWriter();

  //     async function sendInitialMetadata(writer: any, type: string) {
  //       const encoder = new TextEncoder();
  //       const data = encoder.encode(type);
  //       await writer.write(data);
  //     }

  //     // sendInitialMetadata(videoWriterRef.current, "video bds");
  //     // sendInitialMetadata(audioWriterRef.current, "audio bds");
  //   } catch (error) {
  //     console.log("❌ Failed to create bidirectional stream for setup media stream:", error);
  //   }
  // }

  async function startCapturing() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      mediaStreamRef.current = mediaStream;
      setCapturing(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }

      await Promise.all([videoHandler(mediaStream), audioHandler(mediaStream)]);
    } catch (error) {
      console.error("❌ Failed to start capturing:", error);
      setCapturing(false);
    }
  }

  async function stopCapturing() {
    setCapturing(false);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  }

  function videoHandler(mediaStream: MediaStream) {
    const videoEncoder = new VideoEncoder({
      output: serializeEncodedChunk,
      // output: decodeVideoFrame,
      // output: sendEncodedVideo,
      error: (error) => console.error("❌ Video Encoder Error:", error),
    });
    videoEncoder.configure({
      codec: "vp8",
      width: 1920,
      height: 1080,
      bitrate: 1_000_000,
      framerate: 50, //mediaStream.getVideoTracks()[0].getSettings().frameRate?.valueOf() || 60,
    });
    videoEncoderRef.current = videoEncoder;

    const videoTrack = mediaStream.getVideoTracks()[0];
    const videoReader = new MediaStreamTrackProcessor(videoTrack).readable.getReader();
    encodeVideo(videoReader);
  }

  let isKeyFrame = true;
  let counter = 0;
  // 1 key frame every 500 frames (~10s)
  async function encodeVideo(reader: ReadableStreamDefaultReader<VideoFrame>) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (videoEncoderRef.current) {
        // frame 0 is not received on the audience side, not sure why
        if (counter === 1) {
          isKeyFrame = true;
        } else {
          isKeyFrame = false;
        }
        videoEncoderRef.current.encode(value, { keyFrame: isKeyFrame });
        // console.log(`🎥 Encoded video: ${isKeyFrame ? "key" : "delta"} frame ${counter}`);
        counter++;
        if (counter >= 500) {
          counter = 0;
        }
      }
      value.close();
    }
  }

  function audioHandler(mediaStream: MediaStream) {
    const audioEncoder = new AudioEncoder({
      output: serializeEncodedChunk,
      // output: decodeAudioFrame,
      // output: sendEncodedAudio,
      error: (error) => console.error("Audio Encoder Error:", error),
    });
    audioEncoder.configure({
      codec: "opus",
      sampleRate: 48000,
      bitrate: 128_000,
      numberOfChannels: 1, //mediaStream.getAudioTracks()[0].getSettings().channelCount?.valueOf() || 2,
    });
    audioEncoderRef.current = audioEncoder;

    const audioTrack = mediaStream.getAudioTracks()[0];
    const audioReader = new MediaStreamTrackProcessor(audioTrack).readable.getReader();
    encodeAudio(audioReader);
  }

  async function encodeAudio(reader: ReadableStreamDefaultReader<AudioData>) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (audioEncoderRef.current) {
        audioEncoderRef.current.encode(value);
      }
      value.close();
    }
  }

  function serializeEncodedChunk(chunk: EncodedVideoChunk | EncodedAudioChunk) {
    const buffer = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(buffer);

    const chunkType = chunk instanceof EncodedVideoChunk ? "video" : "audio";

    const encodedChunk = {
      type: chunkType,
      keyFrame: chunkType === "video" ? (chunk as EncodedVideoChunk).type : undefined,

      timestamp: chunk.timestamp,
      duration: 20000,
      data: buffer,
    };
    // if (chunkType === "video") {
    // console.log(`🎥 Encoded video chunk type: ${encodedChunk.keyFrame}, timestamp: ${encodedChunk.timestamp}`);
    // }

    const chunkTypeBytes = new TextEncoder().encode(encodedChunk.type);
    const timestampBytes = new Float64Array([encodedChunk.timestamp]);
    const durationBytes = new Float64Array([encodedChunk.duration]);
    const dataBytes = new Uint8Array(encodedChunk.data);

    const totalLength = 5 + 8 + 8 + dataBytes.byteLength;
    const serializeBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(serializeBuffer);

    new Uint8Array(serializeBuffer, 0, 5).set(chunkTypeBytes);
    view.setFloat64(5, timestampBytes[0], true);
    view.setFloat64(13, durationBytes[0], true);
    new Uint8Array(serializeBuffer, 21, dataBytes.byteLength).set(dataBytes);

    deserializeEncodedChunk(serializeBuffer);
    sendSerializedChunk(serializeBuffer, chunkType, timestampBytes);
  }

  async function sendSerializedChunk(buffer: ArrayBuffer, type: string, timestamp: Float64Array) {
    const uds = await transport?.createUnidirectionalStream();
    const writer = uds?.getWriter();
    const ua = new Uint8Array(buffer);
    await writer?.write(ua);
    console.log(`📤 Sent ${type} chunk: ${ua.length} bytes with timestamp ${timestamp}`);
    await writer?.close();
  }

  //===================== ⬇️ TEST Decoding & Deserialization ⬇️ =====================
  async function initDecoder() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const videoDecoder = new VideoDecoder({
      output: (frame) => {
        if (context && canvas) {
          context.drawImage(frame, 0, 0, canvas.width, canvas.height);
          frame.close();
        }
      },
      error: (error) => console.error("Video Decoder Init Error:", error),
    });
    videoDecoder.configure({
      codec: "vp8",
      codedWidth: 1920,
      codedHeight: 1080,
    });
    videoDecoderRef.current = videoDecoder;

    audioContextRef.current = new AudioContext();
    const audioDecoder = new AudioDecoder({
      output: (audioData) => {
        if (audioContextRef.current) {
          const audioBuffer = audioContextRef.current.createBuffer(
            audioData.numberOfChannels,
            audioData.numberOfFrames,
            audioData.sampleRate,
          );
          for (let i = 0; i < audioData.numberOfChannels; i++) {
            const channelData = new Float32Array(audioData.numberOfFrames);
            audioData.copyTo(channelData, { planeIndex: i });
            audioBuffer.copyToChannel(channelData, i);
          }
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);
          source.start();
        }
      },
      error: (error) => console.error("Audio Decoder Error:", error),
    });
    audioDecoder.configure({
      codec: "opus",
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    audioDecoderRef.current = audioDecoder;
  }

  function deserializeEncodedChunk(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    const typeBytes = new Uint8Array(buffer.slice(0, 5));
    const type = new TextDecoder().decode(typeBytes);
    const timestamp = view.getFloat64(5, true);
    const duration = view.getFloat64(13, true);
    const data = view.buffer.slice(21);

    switch (type) {
      case "video":
        const evc = new EncodedVideoChunk({
          type: "key", // ? "key" required for decoding(even for encoded video chunk)?
          timestamp: timestamp,
          duration: duration,
          data: data,
        });
        decodeVideoFrame(evc);
        break;
      case "audio":
        const eac = new EncodedAudioChunk({
          type: "key",
          timestamp: timestamp,
          duration: duration,
          data: data,
        });
        decodeAudioFrame(eac);
        break;
      default:
        console.error("❌ Unknown chunk type:", type);
        break;
    }
  }

  function decodeVideoFrame(chunk: EncodedVideoChunk) {
    try {
      videoDecoderRef.current?.decode(chunk);
      // console.log("🎥 Decoded video chunk:", chunk);
    } catch (error) {
      console.error("❌ Failed to decode video chunk:", error);
    }
  }

  function decodeAudioFrame(chunk: EncodedAudioChunk) {
    try {
      audioDecoderRef.current?.decode(chunk);
      // console.log("🔊 Decoded audio chunk:", chunk);
    } catch (error) {
      console.error("❌ Failed to decode audio chunk:", error);
    }
  }
  //===================== ⬆️ TEST Decoding & Deserialization ⬆️ =====================

  return (
    <div className="grid grid-cols-2 text-center gap-2">
      {/* WebTransport Server */}
      <div>
        {/* Connect/Disconnect to/from Server */}
        <div className="text-center">
          {!connected ? (
            <button className="bg-blue-500 font-bold text-center my-1 p-1 rounded-md text-white" onClick={connectWTS}>
              Connect
            </button>
          ) : (
            <div>
              <span className="font-bold text-center my-1 p-1 rounded-md text-green-500">
                Connected to WebTransport server!
              </span>
              <button
                className="bg-red-500 font-bold text-center my-1 p-1 rounded-md text-white"
                onClick={disconnectWTS}
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Title */}
        <div className="text-3xl font-bold text-center my-2">Received Messages from WebTransport Session streams:</div>

        {/* Server Msgs */}
        <div className="grid grid-cols-3 text-center font-bold gap-1">
          {messages.map((message, index) => (
            <div key={index}>
              <div className="bg-purple-300 border-spacing-1 rounded-md inline-block">{message}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Streaming */}
      <div>
        {/* Start/Stop Streaming  */}
        <div className="text-center">
          {!connected ? (
            <button
              className="bg-red-500 font-bold text-center my-1 p-1 rounded-md text-white cursor-not-allowed"
              disabled
            >
              WebTransport Server Not Connected
            </button>
          ) : (
            <div>
              {!capturing ? (
                <div>
                  <button
                    className="bg-green-500 font-bold text-center my-1 p-1 rounded-md text-white"
                    onClick={startCapturing}
                  >
                    Start Capturing
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    className="bg-red-500 font-bold text-center my-1 p-1 rounded-md text-white"
                    onClick={stopCapturing}
                  >
                    Stop Capturing
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Title */}
        <div className="text-3xl font-bold text-center my-2">Streaming to WebTransport server:</div>

        <div className="grid grid-flow-row">
          {/* Streaming Preview */}
          {capturing && <div>Source Video:</div>}
          <div>
            <video ref={videoRef} width={1920} height={1080} className="w-full" autoPlay playsInline muted></video>
          </div>
          {!capturing && <div>Waiting for MediaStream to start capturing...</div>}
          {capturing && <div>Decoded Video:</div>}
          <div className="flex justify-center items-center">
            <canvas ref={canvasRef} width={1920} height={1080} className="w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
