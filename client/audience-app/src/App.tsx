import { FaSearch } from "react-icons/fa";
import { useState, useRef, useEffect } from "react";

import { Session } from "moqjs/src/session";
import { Message, MessageType } from "moqjs/src/messages";
import { varint } from "moqjs/src/varint";

import VideoDecoderWorker from "./VideoDecoderWorker?worker";
import AudioDecoderWorker from "./AudioDecoderWorker?worker";

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

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;

let sessionInternal: Session | null = null;
// variables used right after value assignment/change
let selectedChannel = "";
let currentTrack = "";

let mediaType = new Map<string, number>(); // tracks the media type (video, audio etc.) for each subscription, possible keys: "hd", "md", "audio"

function App() {
  const [session, setSession] = useState<Session | null>(null); // UI: session

  const [channelListObj, setChannelList] = useState<string[]>([]); // UI: channel list
  const [trackListObj, setTrackList] = useState<string[]>([]); // UI: resolution(track) list
  const [selectedTrack, setSelectedTrack] = useState<string>(""); // UI: selected resolution(track)

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // make sure the canvas is available before initializing the decoder
  useEffect(() => {
    if (canvasRef.current) {
      canvas = canvasRef.current;
      context = canvas.getContext("2d");
    }
  }, [canvasRef.current]);

  async function connect() {
    try {
      const url = "https://localhost:443/webtransport/audience";
      const s = await Session.connect(url); // create new Session and handle handshake internally for control stream
      controlMessageListener(s);
      sessionInternal = s;
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

        // reset UI
        setChannelList([]);
        selectedChannel = "";
        // release resources
        audioContextRef.current?.close();
        canvas = null;
        context = null;
        audioDecoderWorker.terminate();
        videoDecoderWorker.terminate();
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

  let tracksJSON: TracksJSON = { tracks: [] };
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
            let channelList = JSON.parse(text);
            setChannelList(channelList);
            console.log(`🔻 🅾️channelList🅾️: ${channelList}`);
          } catch (error) {
            console.error("❌ Failed to decode channel list:", error);
            return;
          }
          break;

        case 1: //! S2: sub for tracks obj
          const tracksBytes = await getMetaObjectPayload(readableStream);
          const tracksDecoder = new TextDecoder();
          try {
            const text = tracksDecoder.decode(tracksBytes);
            try {
              tracksJSON = await JSON.parse(text);
              console.log("🔻 🅾️tracks🅾️:", tracksJSON);
              // extract track names except audio track
              const trackNames = tracksJSON.tracks.filter((track) => track.name !== "audio").map((track) => track.name);
              setTrackList(trackNames);
              console.log("🔔 Tracks list(trackNames): " + trackNames);
            } catch (err) {
              console.log("❌ Failed to decode tracksJSON:", err);
              return;
            }
          } catch (err) {
            console.log("❌ Failed to decode tracks text:", err);
            return;
          }
          break;

        default: //! S0: regular subscription for media stream
          //register sub type in mediaType
          // there will always be exactly 2 items in this mediaType map: first one is "audio", second one is video("hd"(default) or "md")
          if (!mediaType.has("audio")) {
            mediaType.set("audio", Number(subId));
            console.log(`🔔 Added to mediaType map: (audio,${Number(subId)})`);
          } else {
            if (!mediaType.has(tracksJSON.tracks[0].name) && !mediaType.has(tracksJSON.tracks[1].name)) {
              // add default video track (hd) to mediaType map
              mediaType.set(tracksJSON.tracks[0].name, Number(subId));
              console.log(`🔔 Added to mediaType map: (${tracksJSON.tracks[0].name},${Number(subId)})`);
            } else if (mediaType.has(tracksJSON.tracks[0].name)) {
              // change from hd to md
              // sessionInternal?.unsubscribe(mediaType.get(tracksJSON.tracks[0].name)!); // TODO: server err
              console.log(
                `🔔 Deleting mediaType map: (${tracksJSON.tracks[0].name}, ${mediaType.get(tracksJSON.tracks[0].name)}`,
              );
              mediaType.delete(tracksJSON.tracks[0].name);
              mediaType.set(tracksJSON.tracks[1].name, Number(subId));
              console.log(`🔔 Updated mediaType map: (${tracksJSON.tracks[1].name},${Number(subId)})`);
            } else if (mediaType.has(tracksJSON.tracks[1].name)) {
              // change from md to hd
              // sessionInternal?.unsubscribe(mediaType.get(tracksJSON.tracks[1].name)!); // TODO: server err
              console.log(
                `🔔 Deleting mediaType map: (${tracksJSON.tracks[1].name}, ${mediaType.get(tracksJSON.tracks[1].name)}`,
              );
              mediaType.delete(tracksJSON.tracks[1].name);
              mediaType.set(tracksJSON.tracks[0].name, Number(subId));
              console.log(`🔔 Updated mediaType map: (${tracksJSON.tracks[0].name},${Number(subId)})`);
            }
          }

          const reader = readableStream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (value) {
              // console.log(`🔔 Received chunk: ${value.length} bytes`);
              try {
                deserializeEncodedChunk(value); // Process the chunk asynchronously to avoid blocking the stream
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
                  // just break, then wait for audience to select a channel (UI)
                  break;

                case 1:
                  // subscribe to selected channel's default media tracks
                  console.log("🔔 Sub to selectedChannel's media tracks(defaults): ", selectedChannel);
                  await session.subscribe(selectedChannel, "audio");
                  await session.subscribe(selectedChannel, tracksJSON.tracks[0].name);
                  setSelectedTrack(tracksJSON.tracks[0].name);
                  // currentTrack = tracksJSON.tracks[0].name;
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

  const videoDecoderWorker = new VideoDecoderWorker();
  videoDecoderWorker.onmessage = (e) => {
    const { action, frame } = e.data;
    // console.log("got frame from worker", frame);
    if (action == "renderFrame") {
      try {
        requestAnimationFrame(() => {
          context!.drawImage(frame, 0, 0, canvas!.width, canvas!.height);
          frame.close();
        });
      } catch (err) {
        console.log("❌ Error in rendering frame:", err);
      }
    }
  };

  const audioDecoderWorker = new AudioDecoderWorker();
  audioDecoderWorker.onmessage = (e) => {
    const { action, audio } = e.data;
    if (action == "playAudio") {
      // console.log("🔊 Decoded audio data:", audio);
      if (audioContextRef.current) {
        const audioBuffer = new AudioBuffer({
          numberOfChannels: audio.numberOfChannels,
          length: audio.numberOfFrames,
          sampleRate: audio.sampleRate,
        });
        // console.log(" audio data sample:", audio.numberOfFrames, "audio data # channels:", audio.numberOfChannels);

        for (let i = 0; i < audio.numberOfChannels; i++) {
          const channelData = new Float32Array(audio.numberOfFrames);
          audio.copyTo(channelData, { planeIndex: i });
          audioBuffer.copyToChannel(channelData, i);
        }
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start();
      }
    }
  };

  async function deserializeEncodedChunk(buffer: Uint8Array) {
    let view = new DataView(buffer.buffer);
    const typeBytes = view.getUint8(0);
    const type = typeBytes === 1 ? "video" : "audio";
    const keyBytes = view.getUint8(1);
    const key = keyBytes === 1 ? "key" : "delta";
    const timestamp = view.getFloat64(2, true);

    // discard those chunks that are not video or audio
    try {
      switch (type) {
        case "video":
          const videoData = view.buffer.slice(10);
          const evc = new EncodedVideoChunk({
            type: key,
            timestamp: timestamp,
            data: videoData,
          });
          // console.log(`🎥 Got video frame: ${evc.type}, timestamp: ${timestamp}, ${videoData.byteLength} bytes`);
          try {
            videoDecoderWorker.postMessage({ action: "insertFrame", frame: evc });
          } catch (err) {
            console.log("❌ Error in posting video frame to worker:", err);
            throw err;
          }
          break;
        case "audio":
          const duration = view.getFloat64(10, true); // exist only for audio chunks
          const audioData = view.buffer.slice(18);
          const eac = new EncodedAudioChunk({
            type: key, // always "key" for audio
            timestamp: timestamp,
            duration: duration,
            data: audioData,
          });
          // console.log(
          //   `🔊 Got audio chunk: ${eac.type}, timestamp: ${timestamp},duration: ${duration}, ${audioData.byteLength} bytes`,
          // );
          try {
            audioDecoderWorker.postMessage({ action: "insertAudio", audio: eac });
          } catch (err) {
            console.log("❌ Error in posting audio chunk to worker:", err);
          }
          break;
        default:
          console.log(`❌ Unknown chunk type`);
          break;
      }
    } catch (err) {
      console.log("❌ Error in deserializing chunk:", err);
      throw err;
    }
  }

  const handleChannelChange = (channel: string) => {
    selectedChannel = channel;
    session!.subscribe(channel, "catalogTrack");
    console.log(`🔔 Selected channel: ${selectedChannel}`);
  };

  const handleTrackChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const clickedTrack = event.target.value;
    session!.subscribe(selectedChannel, clickedTrack);
    console.log(`🆕 Subscribed to track: ${clickedTrack} on channel ${selectedChannel}`);
    setSelectedTrack(clickedTrack);
    // currentTrack = clickedTrack;
  };

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
              <button
                className="cursor-pointer bg-blue-300 text-black p-2 hover:bg-red-400 hover:text-white transition-all duration-400"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="col-span-2 flex justify-end">
              <button
                className="cursor-pointer bg-blue-300 text-black p-2 hover:bg-red-400 hover:text-white transition-all duration-400"
                onClick={connect}
              >
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
        <div className="w-64 bg-green-300 flex flex-col gap-1 p-2">
          <div className="h-8 font-bold bg-green-200 flex items-center justify-center">Online Streamer</div>
          <div className="flex-grow bg-green-200 flex items-center ">
            {channelListObj.length === 0 ? (
              <div className="text-center">No streamer online yet, hang on</div>
            ) : (
              <div className="m-2 flex flex-col gap-2 flex-grow">
                {channelListObj.map((channel) => (
                  <button
                    key={channel}
                    onClick={() => handleChannelChange(channel)}
                    className={`cursor-pointer p-2 ${selectedChannel === channel ? "bg-red-500 text-white" : "bg-green-300 text-black"}`}
                  >
                    {channel}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Main View */}
        <div className="flex-grow min-w-[512px]">
          <div className="hidden">Background Image</div>
          <div className="h-full bg-green-300 p-2 flex flex-col gap-2">
            {/* Video View */}
            <div className="flex-grow flex items-center justify-center bg-green-200">
              {selectedChannel !== "" ? (
                <div className="flex-grow w-full relative group">
                  <canvas ref={canvasRef} className="w-full bg-green-100" />
                  <select
                    value={selectedTrack}
                    onChange={handleTrackChange}
                    className="absolute bottom-0 right-0 mb-2 mr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  >
                    {trackListObj.map((track, index) => (
                      <option key={index} value={track}>
                        {track}
                      </option>
                    ))}
                  </select>
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
              {selectedChannel === "" ? (
                <div className="flex-grow flex items-center justify-center bg-green-100 p-2">
                  Choose a streamer to watch
                </div>
              ) : (
                <div className="flex-grow flex items-center justify-center bg-green-100 p-2">
                  Watching: {selectedChannel}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side Bar */}
        {selectedChannel !== "" && (
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
                <button className="cursor-pointer font-bold bg-green-100 hover:bg-green-400 hover:text-white transition-all duration-400">
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
