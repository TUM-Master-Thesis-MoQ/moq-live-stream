import { useState, useRef } from "react";
import { Session } from "moqjs/src/session";
import { ControlStream } from "moqjs/src/control_stream";
import { AnnounceOkEncoder, Message, MessageType } from "moqjs/src/messages";

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
      const url = "https://localhost:443/webtransport/audience";
      const transport = new WebTransport(url);
      await transport.ready;
      console.log("🔗 Connected to WebTransport server!");

      setMessages([]);
      setConnected(true);
      // setTransportState(transport);// !deprecated: webtransport session is now embedded the MOQT Session

      const s = await Session.connect(url); // create new Session and handle handshake internally for control stream
      setTransport(s.conn);
      // handleStream(s.controlStream, s.conn); // read Announce on control stream (bds), obj stream on uds

      initDecoder();

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
        console.log("🎥 Decoded video frame:", frame);
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
        console.log("🔊 Decoded audio data:", audioData);
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

  // ! deprecated: handle CS msgs with respective Handlers
  async function handleStream(cs: ControlStream, s: WebTransport) {
    async function handleControlStream() {
      // ? read incoming bidirectional streams or control stream?

      // read incoming bidirectional streams
      const bds = s.incomingBidirectionalStreams;
      const reader2 = bds.getReader();
      while (true) {
        const { done, value } = await reader2.read();
        if (done) {
          break;
        }
        await handleControlStreamInBDS(value);
      }

      // read control stream
      await cs.runReadLoop();
      cs.onmessage
        ? (m: Message) => {
            switch (m.type) {
              case MessageType.Announce:
                console.log("📢 Received Announce namespace:", m.namespace);
                cs.send(
                  new AnnounceOkEncoder({
                    type: MessageType.AnnounceOk, // ? when is AnnounceError sent?
                    trackNamespace: m.namespace,
                  }),
                );
                break;

              case MessageType.Unannounce:
                console.log("🔕 Received Unannounce trackNamespace:", m.trackNamespace);
                break;

              case MessageType.SubscribeOk:
                console.log("🔔 Received SubscribeOk on subscribedId:", m.subscribeId);
                break;

              case MessageType.SubscribeError:
                console.error("❌ Received SubscribeError on subscribedId:", m.subscribeId);
                break;

              case MessageType.SubscribeDone:
                console.log(
                  `🔕 Received SubscribeDone: subscribeId(${m.subscribeId}), statusCode(${m.statusCode}), reasonPhrase(${m.reasonPhrase})`,
                );
                break;

              // ? New in Draft 5?
              // case MessageType.TrackStatus:
              //   console.log("🔵 Received TrackStatus on trackId:", m.trackId);
              //   break;

              case MessageType.StreamHeaderGroup:
                console.log("🔵 Received StreamHeaderGroup:", m.groupId);
                break;

              case MessageType.ObjectStream || MessageType.ObjectDatagram:
                s.close();
                console.log(`❌ ${m.type} on control stream, session closed.`);
                break;

              default:
                s.close();
                console.log(`❌ Unknown message type: ${m.type}, session closed.`);
                break;
            }
          }
        : null;
    }

    async function handleObjectStream() {
      const uds = s.incomingUnidirectionalStreams;
      const reader = uds.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await handleObjectStreamInUDS(value);
      }
    }

    await Promise.all([handleObjectStream(), handleControlStream()]);
  }

  // ! deprecated: replaced by handleControlStream()
  async function handleControlStreamInBDS(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        // TODO: determine if it's a control message or media chunk
      }
      if (done) {
        break;
      }
    }
  }

  // ! deprecated: replaced by handleObjectStream()
  async function handleObjectStreamInUDS(receiveStream: ReadableStream<Uint8Array>) {
    const reader = receiveStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        await deserializeEncodedChunk(value); // deserialize data stream
      }
      if (done) {
        break;
      }
    }
  }

  // !obsolete, need replacement that write control msgs on control stream instead
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

  let isFirstVideoChunk = true;
  async function deserializeEncodedChunk(buffer: ArrayBuffer | Uint8Array) {
    let view;
    if (buffer instanceof Uint8Array) {
      view = new DataView(buffer.buffer);
    } else {
      view = new DataView(buffer);
    }

    const typeBytes = new Uint8Array(buffer.slice(0, 5));
    const type = new TextDecoder().decode(typeBytes);
    const timestamp = view?.getFloat64(5, true);
    const duration = view?.getFloat64(13, true);
    const data = view?.buffer.slice(21);

    let streamSize = view.byteLength;
    const newMessage = `📩 Received stream size: ${streamSize} bytes`;
    setMessages((prev) => [...prev, newMessage]);

    if (timestamp && duration && data) {
      switch (type) {
        case "video":
          const chunkType = isFirstVideoChunk ? "key" : "delta";
          const evc = new EncodedVideoChunk({
            type: chunkType,
            timestamp: timestamp,
            duration: duration,
            data: data,
          });
          console.log(`🎥 Got video chunk: ${type}, timestamp: ${timestamp}, duration: ${duration}, data: ${data}`);
          await decodeVideoFrame(evc);
          isFirstVideoChunk = false;
          break;
        case "audio":
          const eac = new EncodedAudioChunk({
            type: "key",
            timestamp: timestamp,
            duration: duration,
            data: data,
          });
          console.log(`🔊 Got audio chunk: ${type}, timestamp: ${timestamp}, duration: ${duration}, data: ${data}`);
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
      console.log("🎥 Decoded video chunk:", chunk);
    } catch (error) {
      console.error("❌ Failed to decode video chunk:", error);
    }
  }

  async function decodeAudioFrame(chunk: EncodedAudioChunk) {
    try {
      audioDecoderRef.current?.decode(chunk);
      console.log("🔊 Decoded audio chunk:", chunk);
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
        <canvas ref={canvasRef} width={1920} height={1080} className="border border-gray-300" />
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
