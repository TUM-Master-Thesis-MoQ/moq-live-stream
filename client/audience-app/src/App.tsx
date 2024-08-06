import { useState, useRef } from "react";

function App() {
  const [messages, setMessages] = useState<string[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [transport, setTransport] = useState<WebTransport | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const videoDecoderRef = useRef<VideoDecoder | null>(null);
  const audioDecoderRef = useRef<AudioDecoder | null>(null);

  async function connectWTS() {
    try {
      const transport = new WebTransport("https://localhost:443/webtransport/audience");
      await transport.ready;

      setMessages([]);
      setConnected(true);
      setTransport(transport);

      initDecoder();

      readStream(transport);

      // writeStream(transport);
    } catch (error) {
      console.error("❌ Failed to connect:", error);
    }
  }

  async function disconnectWTS() {
    if (transport && connected) {
      try {
        await transport.close();
        console.log("🔌 Disconnected from WebTransport server!");
      } catch (error) {
        console.error("❌ Failed to disconnect:", error);
      } finally {
        setMessages([]);
        setConnected(false);
        setTransport(null);

        // release resources
        audioContextRef.current?.close();
        videoDecoderRef.current?.close();
        audioDecoderRef.current?.close();

        transport.close();
      }
    }
  }

  async function initDecoder() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const videoDecoder = new VideoDecoder({
      output: (frame) => {
        // console.log("🎥 Decoded video frame:", frame);
        if (context && canvas) {
          context.drawImage(frame, 0, 0, canvas.width, canvas.height);
          frame.close();
        }
      },
      error: (error) => console.error("Video Decoder Init Error:", error),
    });
    videoDecoder.configure({
      codec: "vp8",
      codedWidth: 640,
      codedHeight: 480,
    });
    videoDecoderRef.current = videoDecoder;

    audioContextRef.current = new AudioContext();
    const audioDecoder = new AudioDecoder({
      output: (audioData) => {
        // console.log("🔊 Decoded audio data:", audioData);
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

  async function readStream(transport: WebTransport) {
    const uds = transport.incomingUnidirectionalStreams;
    const reader = uds.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      await readStreamData(value);
    }
  }
  async function readStreamData(receiveStream: ReadableStream<Uint8Array>) {
    const reader = receiveStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        await deserializeEncodedChunk(value);
      }
      if (done) {
        break;
      }
    }
  }

  async function writeStream(transport: WebTransport) {
    const { readable, writable } = await transport.createBidirectionalStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Generate message stream
    setInterval(() => {
      const message = "Hello from WebTransport client!";
      writer.write(encoder.encode(message));
      console.log("📤 Sent:", message);
    }, 1000);

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

  async function deserializeEncodedChunk(buffer: ArrayBuffer | Uint8Array) {
    let view;
    if (buffer instanceof Uint8Array) {
      view = new DataView(buffer.buffer);
    } else {
      view = new DataView(buffer);
    }

    const typeBytes = new Uint8Array(buffer.slice(0, 5));
    const type = new TextDecoder().decode(typeBytes);
    const frameTypeBytes = new Uint8Array(buffer.slice(5, 10));
    const frameType = new TextDecoder().decode(frameTypeBytes);
    const timestamp = view?.getFloat64(10, true);
    const duration = view?.getFloat64(18, true);
    const data = view?.buffer.slice(26);

    // let streamSize = view.byteLength;
    // const newMessage = `📩 Received stream size: ${streamSize} bytes`;
    // setMessages((prev) => [...prev, newMessage]);

    if (frameType && timestamp && duration && data) {
      switch (type) {
        case "video":
          const evc = new EncodedVideoChunk({
            type: "key",
            timestamp: timestamp,
            duration: duration,
            data: data,
          });
          // console.log(
          //   `🎥 Got video frame: ${frameType}, timestamp: ${timestamp}, duration: ${duration}, data: ${data}`,
          // );
          await decodeVideoFrame(evc);
          break;
        case "audio":
          const eac = new EncodedAudioChunk({
            type: "key",
            timestamp: timestamp,
            duration: duration,
            data: data,
          });
          // console.log(`🔊 Got audio chunk: ${type}, timestamp: ${timestamp}, duration: ${duration}, data: ${data}`);
          await decodeAudioFrame(eac);
          break;
        default:
          console.error("❌ Unknown chunk type:", type);
          break;
      }
    }
  }

  async function decodeVideoFrame(chunk: EncodedVideoChunk) {
    try {
      videoDecoderRef.current?.decode(chunk);
      // console.log("🎥 Decoded video chunk:", chunk);
    } catch (error) {
      console.error("❌ Failed to decode video chunk:", error);
    }
  }

  async function decodeAudioFrame(chunk: EncodedAudioChunk) {
    try {
      audioDecoderRef.current?.decode(chunk);
      // console.log("🔊 Decoded audio chunk:", chunk);
    } catch (error) {
      console.error("❌ Failed to decode audio chunk:", error);
    }
  }

  return (
    <div>
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
            <button className="bg-red-500 font-bold text-center my-1 p-1 rounded-md text-white" onClick={disconnectWTS}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-center items-center">
        <canvas ref={canvasRef} width={640} height={480} className="border border-gray-300" />
      </div>

      <div className="text-3xl font-bold underline text-center my-2">
        Received Message from WebTransport Session streams:
      </div>

      <div className="grid grid-cols-5 text-center font-bold gap-1">
        {messages.map((message, index) => (
          <div key={index}>
            <div className="bg-purple-300 border-spacing-1 rounded-md inline-block">{message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
