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
      codedWidth: 640,
      codedHeight: 480,
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
      let streamSize = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          await streamHandler(value);
        }
        if (done) {
          break;
        }
        streamSize = value.length;
        const newMessage = `📩 Received stream size: ${streamSize} bytes`;
        // const newMessage = new TextDecoder().decode(value);
        setMessages((prev) => [...prev, newMessage]);
        // console.log(`📩 Received stream size: ${streamSize} bytes`);
      }
    }
  }

  function deserializeEncodedChunk(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    let offset = 0;

    const typeBytes = new Uint8Array(buffer.slice(offset, offset + 5));
    const type = new TextDecoder().decode(typeBytes);
    if (type === "audio" || type === "video") {
      console.log("🔍 Decoded type:", type);
    }
    offset += 5;

    const timestamp = view.getFloat64(offset, true);
    offset += 8;
    if (type === "audio" || type === "video") {
      console.log("🔍 Decoded timestamp:", timestamp);
    }

    const data = buffer.slice(offset);

    offset = 0;
    return { type, timestamp, data };
  }

  let isFirstVideoChunk = true;
  async function streamHandler(data: Uint8Array) {
    const { type, timestamp, data: encodedData } = deserializeEncodedChunk(data.buffer);

    if (type === "video" && videoDecoderRef.current !== null) {
      const chunkType = isFirstVideoChunk ? "key" : "delta";
      const chunk = new EncodedVideoChunk({
        type: chunkType,
        timestamp,
        data: encodedData,
      });
      try {
        videoDecoderRef.current.decode(chunk);
        console.log("🎥 Decoded video chunk:", chunk);
        isFirstVideoChunk = false;
      } catch (error) {
        console.error("❌ Failed to decode video chunk:", error);
      }
    }
    if (type === "audio" && audioDecoderRef.current) {
      const chunk = new EncodedAudioChunk({
        type: "key",
        timestamp,
        data: encodedData,
      });
      try {
        audioDecoderRef.current.decode(chunk);
        console.log("🔊 Decoded audio chunk:", chunk);
      } catch (error) {
        console.error("❌ Failed to decode audio chunk:", error);
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

  async function disconnectWTS() {
    if (transport && connected) {
      // TODO: formally close the transport?
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
      }
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
