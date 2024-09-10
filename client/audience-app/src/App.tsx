import { FaSearch } from "react-icons/fa";
import { useState, useRef, useEffect } from "react";

import { Session } from "moqjs/src/session";
import { Message, MessageType } from "moqjs/src/messages";
import { varint } from "moqjs/src/varint";

// track JSON obj parser
interface TracksJSON {
  tracks: Track[];
}
interface Track {
  name: string;
  label?: string;
  selectionParams: SelectionParams;
  altGroup?: Number;
}
interface SelectionParams {
  codec: string;
  mimeType: string;
  width?: Number;
  height?: Number;
  framerate?: Number;
  bitrate: Number;
  samplerate?: Number;
  channelConfig?: string;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);

  const [channelListObj, setChannelList] = useState<string[]>([]);
  const [tracksObj, setTracksJSON] = useState<TracksJSON>({ tracks: [] });
  const [selectedTrack, setSelectedTrack] = useState<string>("");
  const [watchingChannel, setWatchingChannel] = useState<string>(""); //? set the title in frontend as "Watching {namespace}"

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const videoDecoderRef = useRef<VideoDecoder | null>(null);
  const audioDecoderRef = useRef<AudioDecoder | null>(null);

  // make sure the canvas is available before initializing the decoder
  useEffect(() => {
    if (canvasRef.current) {
      initDecoder();
    }
  }, [canvasRef.current]);

  async function connect() {
    try {
      const url = "https://localhost:443/webtransport/audience";
      const s = await Session.connect(url); // create new Session and handle handshake internally for control stream
      controlMessageListener(s);
      setSession(s);
      console.log("🔗 Connected to WebTransport server!");
    } catch (error) {
      console.error("❌ Failed to connect:", error);
    }
  }

  async function disconnect() {
    if (session) {
      try {
        session.conn.close();
        console.log("🔌 Disconnected from WebTransport server!\nReleasing resources...");
      } catch (error) {
        console.error("❌ Failed to disconnect:", error);
      } finally {
        setSession(null);

        // release resources
        audioContextRef.current?.close();
        videoDecoderRef.current?.close();
        audioDecoderRef.current?.close();
        console.log("🗑️ All resources released!");
      }
    }
  }

  async function getMetaObjectPayload(readableStream: ReadableStream<Uint8Array>) {
    const reader = readableStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        console.log(`📜 Received meta obj: ${value.length} bytes`);
        return value;
      }
      if (done) {
        break;
      }
    }
  }

  let channelList: string[] = [];
  let tracks: TracksJSON = { tracks: [] };
  async function handleSubscription(s: Session, subId: varint) {
    const readableStream = await s.subscriptions.get(subId)?.getReadableStream();
    console.log(`🔔 Handling subscription (${subId})`);
    if (readableStream) {
      switch (subId) {
        case 0: //! S1: sub for channelList obj
          const channelListBytes = await getMetaObjectPayload(readableStream);
          const channelListDecoder = new TextDecoder();
          try {
            const text = channelListDecoder.decode(channelListBytes);
            channelList = JSON.parse(text);
            setChannelList(channelList);
            console.log(`🔻 🅾️channelList🅾️: ${channelList}`);
          } catch (error) {
            console.error("❌ Failed to decode channel list:", error);
            return;
          }

          // TODO: audience selects a channel from the list to subscribe
          setWatchingChannel(channelList[0]);
          console.log("🔔 Watching channel (empty expected until React rerendered):", watchingChannel);
          break;

        case 1: //! S2: sub for tracks obj
          const tracksBytes = await getMetaObjectPayload(readableStream);
          const tracksDecoder = new TextDecoder();
          try {
            const text = tracksDecoder.decode(tracksBytes);
            try {
              tracks = await JSON.parse(text);
              setTracksJSON(tracks);
              console.log("🔻 🅾️tracks🅾️:", tracks);
            } catch (err) {
              console.log("❌ Failed to decode tracksJSON:", err);
              return;
            }
          } catch (err) {
            console.log("❌ Failed to decode tracks text:", err);
            return;
          }
          // TODO: audience selects a channel & subscribe to default media track
          setSelectedTrack(tracks.tracks[0].name);
          console.log("🔔 Selected track (empty expected until React rerendered):", selectedTrack);
          break;

        default: //! S0: regular subscription for media stream
          const reader = readableStream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (value) {
              // console.log(`🔔 Received chunk: ${value.length} bytes`);
              try {
                deserializeEncodedChunks(value); // Process the chunk asynchronously to avoid blocking the stream
              } catch (err) {
                console.log("❌ Error in deserializing chunks (extracting video frames/audio chunks):", err);
              }
            }
          }
          break;
      }
    }
  }

  function controlMessageListener(session: Session) {
    session.controlStream.onmessage = async (m: Message) => {
      switch (m.type) {
        case MessageType.Announce:
          switch (m.namespace) {
            case "channels": //! A2: announce "channels"
              console.log("🔻 🔊 ANNOUNCE:", m.namespace);

              // session.announceOk(m.namespace);
              // console.log("🔔 Sent AnnounceOk msg:", m.namespace);

              session.subscribe("channels", "channelListTrack"); // trackName: "channelListTrack" in "channels" sub is obsolete
              break;

            default: //! A0: announce {regular channel name}
              //! deprecated until there's a second ns ANNOUNCE from server
              break;
          }
          break;

        case MessageType.Unannounce:
          console.log("🔻 🔇 UNANNOUNCE (namespace):", m.trackNamespace);
          break;

        case MessageType.SubscribeOk:
          console.log("🔻 ✅ SUBSCRIBE_OK (subscribedId):", m.subscribeId);
          console.log("⏳ Resolving subscription:", m.subscribeId);
          try {
            const subscription = session.subscriptions.get(m.subscribeId);
            if (subscription) {
              subscription.subscribeOk();
              console.log("🔔 Resolved subscription:", m.subscribeId);
              await handleSubscription(session, m.subscribeId);
              switch (m.subscribeId) {
                case 0:
                  // subscribe to get the tracks of selected channel (watchingChannel)
                  // s.subscribe(watchingChannel, "catalogTrack");
                  session.subscribe(channelList[0], "catalogTrack"); // TODO: ns should be watchingChannel
                  break;

                case 1:
                  // subscribe to get the default media track
                  // s.subscribe(watchingChannel, selectedTrack);
                  // TODO: concurrent subscriptions are blocking: first one is blocking the second one
                  await session.subscribe(channelList[0], "audio"); // TODO: ns should be watchingChannel, track should be selectedTrack or default track
                  await session.subscribe(channelList[0], tracks.tracks[0].name); // TODO: ns should be watchingChannel, track should be selectedTrack or default track
                  break;

                default:
                  break;
              }
            }
          } catch (err) {
            console.log("❌ Error in getting subscription:", err);
          }
          break;

        case MessageType.SubscribeError:
          console.log("🔻 ❌ SUBSCRIBE_ERROR:", m);
          break;

        case MessageType.SubscribeDone:
          console.log("🔻 🏁 SUBSCRIBE_DONE:", m);
          break;

        // ? New in Draft # ?
        // case MessageType.TrackStatus:
        //   console.log("🔵 Received TrackStatus on trackId:", m.trackId);
        //   break;

        case MessageType.StreamHeaderGroup:
          console.log("🔻 🔵 STREAM_HEADER_GROUP:", m);
          break;

        case MessageType.ObjectStream || MessageType.ObjectDatagram:
          session.conn.close();
          console.log("🔻 ❌ OBJECT_STREAM on control stream, Protocol Violation! Close session. ");
          break;

        default:
          console.log(`🔻 ❌ Unknown Message Type: ${m}`);
          break;
      }
    };
  }

  async function initDecoder() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      console.error("Canvas or context is not available");
      return;
    }
    const videoDecoder = new VideoDecoder({
      output: (frame) => {
        // console.log("🎥 Got decoded video frame:", frame);
        if (context && canvas) {
          requestAnimationFrame(() => {
            context.drawImage(frame, 0, 0, canvas.width, canvas.height);
            frame.close();
          });
        } else {
          console.error("Canvas or context is not available");
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
          // const playbackTime = audioContextRef.current.currentTime + audioData.duration;
          // source.start(playbackTime);
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

  async function deserializeEncodedChunks(buffer: ArrayBuffer | Uint8Array) {
    let views;
    if (buffer instanceof Uint8Array) {
      views = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      views = new DataView(buffer);
    }

    let offset = 0;
    while (offset < buffer.byteLength) {
      const chunkSize = views.getUint32(offset, true);
      // console.log(`frameSize: ${chunkSize} bytes`);
      offset += 4;

      const frameData =
        buffer instanceof Uint8Array
          ? buffer.slice(offset, offset + chunkSize)
          : new Uint8Array(buffer, offset, chunkSize);
      offset += chunkSize;
      // console.log(`frame: ${frameData.byteLength} bytes`);
      try {
        await deserializeEncodedChunk(frameData);
      } catch (err) {
        console.log("❌ Error in deserializing chunk:", err);
      }
    }
  }

  let frameCounter = 0;
  async function deserializeEncodedChunk(buffer: Uint8Array) {
    let view = new DataView(buffer.buffer);
    const typeBytes = view.getUint8(0);
    const type = typeBytes === 1 ? "video" : "audio";
    const keyBytes = view.getUint8(1);
    const key = keyBytes === 1 ? "key" : "delta";
    const timestamp = view.getFloat64(2, true);
    const duration = view.getFloat64(10, true);
    const data = view.buffer.slice(18);

    // discord those chunks that are not video or audio
    try {
      if (type === "video" || type === "audio") {
        switch (type) {
          case "video":
            const evc = new EncodedVideoChunk({
              type: key,
              timestamp: timestamp,
              duration: duration,
              data: data,
            });
            // console.log(
            //   `🎥 Got video frame: ${evc.type} ${(frameCounter = key === "key" ? 0 : frameCounter)}, timestamp: ${timestamp}, duration: ${duration}, ${data.byteLength} bytes`,
            // );
            frameCounter++;
            try {
              await decodeVideoFrame(evc);
            } catch (err) {
              console.log("❌ Error in decoding video frame:", err);
              throw err;
            }
            break;
          case "audio":
            const eac = new EncodedAudioChunk({
              type: key, // always "key" for audio
              timestamp: timestamp,
              duration: duration,
              data: data,
            });
            // console.log(
            //   `🔊 Got audio chunk: ${eac.type}, timestamp: ${timestamp}, duration: ${duration}, ${data.byteLength} bytes`,
            // );
            try {
              await decodeAudioFrame(eac);
            } catch (err) {
              console.log("❌ Error in decoding audio chunk:", err);
              throw err;
            }
            break;
          default:
            console.log(`❌ Unknown chunk ${data.byteLength} bytes`);
            break;
        }
      } else {
        console.log(`❌ Unknown chunk type ${type}`);
      }
    } catch (err) {
      console.log("❌ Error in deserializing chunk:", err);
      throw err;
    }
  }

  async function decodeVideoFrame(chunk: EncodedVideoChunk) {
    try {
      videoDecoderRef.current?.decode(chunk);
      // console.log("🎥 Decoded video chunk:", chunk);
    } catch (error) {
      console.error("❌ Failed to decode video chunk:", error);
      throw error;
    }
  }

  async function decodeAudioFrame(chunk: EncodedAudioChunk) {
    try {
      audioDecoderRef.current?.decode(chunk);
      // console.log("🔊 Decoded audio chunk:", chunk);
    } catch (error) {
      console.error("❌ Failed to decode audio chunk:", error);
      throw error;
    }
  }

  return (
    <div className="flex flex-col gap-2 w-full h-full min-w-[1024px] min-h-[700px]">
      {/* Nav Bar */}
      <div className="grid grid-cols-12 items-center text-center font-bold h-18 w-full bg-blue-400 gap-2 p-2">
        {/* Logo & MOT Live Stream */}
        <div className="col-span-3 grid grid-cols-3 gap-1">
          <div className="col-span-1 bg-blue-300">logo</div>
          <div className="col-span-2 bg-blue-300">MOT Live Stream</div>
        </div>
        {/* Search Bar */}
        <div className="col-span-6 items-center flex justify-center ">
          <div className="w-1/2 bg-blue-300 flex flex-row items-center p-1">
            <div className="flex-grow">
              <input
                className="w-full placeholder:italic placeholder:text-gray-400 pr-10 bg-blue-300"
                type="text"
                placeholder="Search..."
              />
            </div>
            <div>
              <FaSearch />
            </div>
          </div>
        </div>
        {/* Connect && Disconnect Button */}
        <div className="col-span-3 grid grid-cols-3 gap-1">
          {session ? (
            <div className="col-span-2 flex justify-end">
              <button className=" bg-red-400 text-white p-2" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <div className="col-span-2 flex justify-end">
              <button className=" bg-red-400 text-white p-2" onClick={connect}>
                Connect
              </button>
            </div>
          )}
          <div className="col-span-1 flex justify-end">
            <div className=" bg-blue-300 w-12 rounded-full aspect-square text-[8px] flex items-center justify-center overflow-hidden">
              User Icon
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-grow w-full bg-green-400 p-2 flex flex-row gap-2">
        {/* Left Side Bar */}
        <div className="w-64 text-center bg-green-300 flex flex-col gap-1 p-2">
          <div className="h-8 font-bold bg-green-200 flex items-center justify-center">Following</div>
          <div className="flex-grow flex items-center bg-green-200">Following Streamer List</div>
        </div>
        {/* Main View */}
        <div className="flex-grow min-w-[512px]">
          <div className="hidden">Background Image</div>
          <div className="h-full bg-green-300 p-2 flex flex-col gap-2">
            {/* Video View */}
            <div className="flex-grow flex items-center justify-center bg-green-200">
              {session ? (
                <div className="flex-grow w-full">
                  <canvas ref={canvasRef} className="w-full bg-green-100" />
                </div>
              ) : (
                <div>choose a channel to watch...</div>
              )}
            </div>
            {/* Streamer Info */}
            <div className="h-24 bg-green-200 p-2 flex flex-row gap-1">
              <div className="col-span-1 bg-green-100 h-20 rounded-full aspect-square text-xs flex items-center text-center overflow-hidden">
                Streamer Icon
              </div>
              <div className="flex-grow flex items-center justify-center bg-green-100 p-2">Streamer Info</div>
            </div>
          </div>
        </div>

        {/* Right Side Bar */}
        {session && (
          <div className="w-64 bg-green-300 flex flex-col gap-1 p-2">
            <div className="h-8 font-bold text-center bg-green-200 flex items-center justify-center">Chat</div>
            <div className="flex-grow bg-green-200">Chat History</div>
            <div className="h-8 bg-green-200 flex items-center justify-center gap-2">
              <div>
                <input
                  className="placeholder:italic bg-green-100 flex items-center justify-center"
                  type="text"
                  placeholder="Send a message..."
                />
              </div>
              <div>
                <button className="font-bold bg-green-100">Send</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
