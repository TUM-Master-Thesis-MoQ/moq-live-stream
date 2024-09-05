import { FaSearch } from "react-icons/fa";
import { useState, useRef } from "react";

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

  async function connect() {
    try {
      const url = "https://localhost:443/webtransport/audience";
      const s = await Session.connect(url); // create new Session and handle handshake internally for control stream
      controlMessageListener(s);
      setSession(s);
      console.log("🔗 Connected to WebTransport server!");

      initDecoder();
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
              console.log(`🔔 Received chunk: ${value.length} bytes`);
              await deserializeEncodedChunk(value); //? TODO: do not await to allow frame drop?
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
                  session.subscribe(channelList[0], tracks.tracks[0].name); // TODO: ns should be watchingChannel, track should be selectedTrack or default track
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

  async function deserializeEncodedChunk(buffer: ArrayBuffer | Uint8Array) {
    let view;
    if (buffer instanceof Uint8Array) {
      view = new DataView(buffer.buffer);
    } else {
      view = new DataView(buffer);
    }

    const typeBytes = new Uint8Array(buffer.slice(0, 5));
    const type = new TextDecoder().decode(typeBytes);

    // discord those chunks that are not video or audio
    if (type === "video" || type === "audio") {
      const timestamp = view?.getFloat64(5, true);
      const duration = view?.getFloat64(13, true);
      const data = view?.buffer.slice(21);

      if (timestamp && duration && data) {
        switch (type) {
          case "video":
            const evc = new EncodedVideoChunk({
              type: "key",
              timestamp: timestamp,
              duration: duration,
              data: data,
            });
            console.log(
              `🎥 Got video frame: ${(evc as EncodedVideoChunk).type}, timestamp: ${timestamp}, duration: ${duration}, size ${data.byteLength} bytes`,
            );
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
            // console.log(`❌ Unknown chunk ${data.byteLength} bytes`);
            break;
        }
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
