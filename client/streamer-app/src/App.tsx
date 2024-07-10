import { useState, useRef } from "react";

function App() {
  const [messages, setMessages] = useState<string[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [transportState, setTransportState] = useState<WebTransport | null>(null);

  const [capturing, setCapturing] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoEncoderRef = useRef<VideoEncoder | null>(null);
  const audioEncoderRef = useRef<AudioEncoder | null>(null);
  const videoWriterRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const audioWriterRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  async function connectWTS() {
    try {
      const transport = new WebTransport("https://localhost:443/webtransport");
      await transport.ready;
      console.log("🔗 Connected to WebTransport server!");

      setMessages([]);
      setConnected(true);
      setTransportState(transport);

      readStream(transport);
      writeStream(transport);

      setupMediaStream(transport);
    } catch (error) {
      console.error("❌ Failed to connect:", error);
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

  async function writeStream(transport: WebTransport) {
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

  async function setupMediaStream(transport: WebTransport) {
    try {
      const videoStream = await transport.createBidirectionalStream();
      const audioStream = await transport.createBidirectionalStream();

      videoWriterRef.current = videoStream.writable.getWriter();
      audioWriterRef.current = audioStream.writable.getWriter();
    } catch (error) {
      console.log("❌ Failed to create bidirectional stream for setup media stream:", error);
    }
  }

  async function disconnectWTS() {
    if (transportState && connected) {
      // TODO: formally close the transport?
      try {
        await transportState.close();
        console.log("🔌 Disconnected from WebTransport server!");
      } catch (error) {
        console.error("❌ Failed to disconnect:", error);
      } finally {
        setMessages([]);
        setConnected(false);
        setTransportState(null);
        setCapturing(false);
        audioWriterRef.current?.releaseLock();
        videoWriterRef.current?.releaseLock();
      }
    }
  }

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

      videoHandler(mediaStream);
      audioHandler(mediaStream);
    } catch (error) {}
  }

  function videoHandler(mediaStream: MediaStream) {
    const videoEncoder = new VideoEncoder({
      output: sendEncodedVideo,
      error: (error) => console.error("❌ Video Encoder Error:", error),
    });
    videoEncoder.configure({
      codec: "vp8",
      width: 640,
      height: 480,
      bitrate: 1_000_000,
      framerate: 30,
    });
    videoEncoderRef.current = videoEncoder;

    const videoTrack = mediaStream.getVideoTracks()[0];
    const videoReader = new MediaStreamTrackProcessor(videoTrack).readable.getReader();
    encodeVideo(videoReader);
  }

  function audioHandler(mediaStream: MediaStream) {
    const audioEncoder = new AudioEncoder({
      output: sendEncodedAudio,
      error: (error) => console.error("Audio Encoder Error:", error),
    });
    audioEncoder.configure({
      codec: "opus",
      sampleRate: 48000,
      bitrate: 128_000,
      numberOfChannels: 1,
    });
    audioEncoderRef.current = audioEncoder;
    const audioTrack = mediaStream.getAudioTracks()[0];
    const audioReader = new MediaStreamTrackProcessor(audioTrack).readable.getReader();
    encodeAudio(audioReader);
  }

  async function encodeVideo(reader: ReadableStreamDefaultReader<VideoFrame>) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (videoEncoderRef.current) {
        videoEncoderRef.current.encode(value);
      }
      value.close();
    }
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

  async function sendEncodedVideo(chunk: EncodedVideoChunk) {
    if (videoWriterRef.current) {
      const buffer = new ArrayBuffer(chunk.byteLength);
      chunk.copyTo(buffer);
      videoWriterRef.current.write(new Uint8Array(buffer));
    }
  }

  async function sendEncodedAudio(chunk: EncodedAudioChunk) {
    if (audioWriterRef.current) {
      const buffer = new ArrayBuffer(chunk.byteLength);
      chunk.copyTo(buffer);
      audioWriterRef.current.write(new Uint8Array(buffer));
    }
  }

  async function stopCapturing() {
    setCapturing(false);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  }

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
            <div>
              <div key={index} className="bg-purple-300 border-spacing-1 rounded-md inline-block">
                {message}
              </div>
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

        {/* Streaming Preview */}
        <div>
          <div>
            <video ref={videoRef} className="w-full h-auto m-2" autoPlay playsInline muted></video>
          </div>
        </div>
        {!capturing && <div>Waiting for MediaStream to start capturing...</div>}
      </div>
    </div>
  );
}

export default App;
