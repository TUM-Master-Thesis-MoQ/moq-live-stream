import { FaSearch } from "react-icons/fa";
import { useState, useRef, useEffect } from "react";

import { Session } from "moqjs/src/session";
import { Message, MessageType } from "moqjs/src/messages";
import { varint } from "moqjs/src/varint";

import { MetaWorkerMessage } from "./interface/WorkerMessage";

import MetaObjectPayloadWorker from "./worker/MetaObjectPayloadWorker?worker";
import VideoDecoderWorker from "./worker/VideoDecoderWorker?worker";
import AudioDecoderWorker from "./worker/AudioDecoderWorker?worker";

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;

// variables used right after value assignment/change
let sessionInternal: Session | null = null;
let selectedChannel = "";
let selectedTrackInternal = "";
let videoTracks: string[] = [];

let mediaType = new Map<string, number>(); // tracks the media type (video, audio etc.) for each subscription, possible keys: "hd", "md", "audio"

let audioTimestampRef = 0; // reference timestamp for audio chunks (first audio chunk timestamp)
let videoTimestampRef = 0; // reference timestamp for video frames (first video frame timestamp)

function App() {
  let latencyLogging = false; //! testbed: latency test_0

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
      const url = "https://10.0.2.1:443/webtransport/audience";
      const s = await Session.connect(url); // create new Session and handle handshake internally for control stream
      controlMessageListener(s);
      sessionInternal = s;
      setSession(s);
      console.log("🔗 Connected to WebTransport server!");

      // init audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      } else if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
      }
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
        setTrackList([]);
        setSelectedTrack("");

        // release resources
        sessionInternal = null;
        selectedChannel = "";
        videoTracks = [];
        audioContextRef.current?.close();
        canvas = null;
        context = null;
        audioDecoderWorker.terminate();
        videoDecoderWorker.terminate();
        console.log("🗑️ All resources released!");
      }
    }
  }

  async function handleSubscription(s: Session, subId: varint) {
    const readableStream = await s.subscriptions.get(subId)?.getReadableStream();
    console.log(`🔔 Handling subscription (${subId})`);
    if (readableStream) {
      switch (subId) {
        case 0: //! S1: get channelList obj
          const channelListWorker = new MetaObjectPayloadWorker();
          console.log(`🔔 Meta Worker (channelList) created for subscription (${subId})`);
          channelListWorker.onmessage = async (e: { data: MetaWorkerMessage }) => {
            const { action, channelList }: MetaWorkerMessage = e.data;
            if (action == "channelList" && channelList) {
              setChannelList(channelList);
              console.log(`🔻 🅾️channelList🅾️: ${channelList}`);
            }
          };
          channelListWorker.postMessage({ action: "channels", readableStream }, [readableStream]);
          break;

        case 1: //! S2: get tracks obj
          const tracksWorker = new MetaObjectPayloadWorker();
          console.log(`🔔 Meta Worker (tracks) created for subscription (${subId})`);
          tracksWorker.onmessage = async (e: { data: MetaWorkerMessage }) => {
            const { action, trackNames }: MetaWorkerMessage = e.data;
            if (action == "trackNames" && trackNames) {
              videoTracks = trackNames;
              setTrackList(trackNames);
              console.log(`🔻 🅾️tracks🅾️: ${trackNames}`);

              // subscribe to selected channel's default media tracks
              console.log("🔔 Sub to selectedChannel's media tracks(defaults): ", selectedChannel);
              await sessionInternal?.subscribe(selectedChannel, "audio");
              console.log(" tracks[0]:", videoTracks[0]); // default video track "hd"

              const defaultVideoTrack = videoTracks[0]; // videoTracks: ["hd", "md", "hd-ra", "md-ra"]
              await sessionInternal?.subscribe(selectedChannel, defaultVideoTrack);
              setSelectedTrack(defaultVideoTrack);
              selectedTrackInternal = defaultVideoTrack;
            }
          };
          tracksWorker.postMessage({ action: "tracks", readableStream }, [readableStream]);
          break;

        default: //! S0: get media stream objs
          // register sub type in mediaType
          // there will always be exactly 2 items in this mediaType map: first one is "audio", second one is video("hd"(default) or "md")
          if (!mediaType.has("audio")) {
            mediaType.set("audio", Number(subId));
            console.log(`🔔 Added to mediaType map: (audio,${Number(subId)})`);
          } else {
            if (!mediaType.has("hd") && !mediaType.has("md") && !mediaType.has("hd-ra") && !mediaType.has("md-ra")) {
              // add default video track (hd) to mediaType map
              mediaType.set("hd", Number(subId));
              console.log(`🔔 Added to mediaType map: (${"hd"},${Number(subId)})`);
            } else if (mediaType.has("hd")) {
              // change from hd to md
              console.log(`🔔 Deleting mediaType map: (hd, ${mediaType.get("hd")}`);
              mediaType.delete("hd");
              if (selectedTrackInternal === "hd-ra") {
                mediaType.set(selectedTrackInternal, Number(subId));
                console.log(`🔔 Updated mediaType map: (hd-ra,${Number(subId)})`);
              } else if (selectedTrackInternal === "md") {
                mediaType.set("md", Number(subId));
                console.log(`🔔 Updated mediaType map: (md,${Number(subId)})`);
              } else {
                console.log(`❌ Invalid track change from hd to ${selectedTrackInternal})`);
              }
            } else if (mediaType.has("md")) {
              // change from md to hd
              console.log(`🔔 Deleting mediaType map: (md, ${mediaType.get("md")}`);
              mediaType.delete("md");
              if (selectedTrackInternal === "md-ra") {
                mediaType.set(selectedTrackInternal, Number(subId));
                console.log(`🔔 Updated mediaType map: (md-ra,${Number(subId)})`);
              } else if (selectedTrackInternal === "hd") {
                mediaType.set("hd", Number(subId));
                console.log(`🔔 Updated mediaType map: (hd,${Number(subId)})`);
              } else {
                console.log(`❌ Invalid track change from md to ${selectedTrackInternal}`);
              }
            } else if (mediaType.has("hd-ra")) {
              // change from hd-ra to hd
              console.log(`🔔 Deleting mediaType map: (hd-ra, ${mediaType.get("hd-ra")}`);
              mediaType.delete("hd-ra");
              if (selectedTrackInternal === "hd") {
                mediaType.set("hd", Number(subId));
                console.log(`🔔 Updated mediaType map: (hd,${Number(subId)})`);
              } else if (selectedTrackInternal === "md") {
                mediaType.set("md", Number(subId));
                console.log(`🔔 Updated mediaType map: (md,${Number(subId)})`);
              } else {
                console.log(`❌ Invalid track change from hd-ra to ${selectedTrackInternal}`);
              }
            } else if (mediaType.has("md-ra")) {
              // change from md-ra to md
              console.log(`🔔 Deleting mediaType map: (md-ra, ${mediaType.get("md-ra")}`);
              mediaType.delete("md-ra");
              if (selectedTrackInternal === "md") {
                mediaType.set("md", Number(subId));
                console.log(`🔔 Updated mediaType map: (md,${Number(subId)})`);
              } else if (selectedTrackInternal === "hd") {
                mediaType.set("hd", Number(subId));
                console.log(`🔔 Updated mediaType map: (hd,${Number(subId)})`);
              } else {
                console.log(`❌ Invalid track change from md-ra to ${selectedTrackInternal}`);
              }
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
            case "channels": //! A1: announce "channels"
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
          // changing video track resolution
          if (mediaType.get("hd")) {
            if (selectedTrackInternal === "hd-ra") {
              session.subscribe(selectedChannel, selectedTrackInternal);
              console.log(`🆕 RA-down, subscribed to track: ${selectedTrackInternal} on channel ${selectedChannel}`);
            } else if (selectedTrackInternal === "md") {
              session.subscribe(selectedChannel, selectedTrackInternal);
              console.log(`🆕 Subscribed to track: ${selectedTrackInternal} on channel ${selectedChannel}`);
            } else {
              console.log(`❌ Invalid track change from hd to ${selectedTrackInternal}`);
            }
          }
          if (mediaType.get("md")) {
            if (selectedTrackInternal === "md-ra") {
              session.subscribe(selectedChannel, selectedTrackInternal);
              console.log(`🆕 RA-down, subscribed to track: ${selectedTrackInternal} on channel ${selectedChannel}`);
            } else if (selectedTrackInternal === "hd") {
              session.subscribe(selectedChannel, selectedTrackInternal);
              console.log(`🆕 Subscribed to track: ${selectedTrackInternal} on channel ${selectedChannel}`);
            } else {
              console.log(`❌ Invalid track change from md to ${selectedTrackInternal}`);
            }
          }
          if (mediaType.get("hd-ra")) {
            if (selectedTrackInternal === "hd") {
              session.subscribe(selectedChannel, selectedTrackInternal);
              console.log(`🆕 RA-up, subscribed to track: ${selectedTrackInternal} on channel ${selectedChannel}`);
            } else if (selectedTrackInternal === "md") {
              session.subscribe(selectedChannel, selectedTrackInternal);
              console.log(`🆕 Cross-subscribed from hd-ra to ${selectedTrackInternal} on channel ${selectedChannel}`);
            } else {
              console.log(`❌ Invalid track change from hd-ra to ${selectedTrackInternal}`);
            }
          }
          if (mediaType.get("md-ra")) {
            if (selectedTrackInternal === "md") {
              session.subscribe(selectedChannel, selectedTrackInternal);
              console.log(`🆕 RA-up, subscribed to track: ${selectedTrackInternal} on channel ${selectedChannel}`);
            } else if (selectedTrackInternal === "hd") {
              session.subscribe(selectedChannel, selectedTrackInternal);
              console.log(`🆕 Cross-subscribed from md-ra to ${selectedTrackInternal} on channel ${selectedChannel}`);
            } else {
              console.log(`❌ Invalid track change from md-ra to ${selectedTrackInternal}`);
            }
          }
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
    const { action, frame }: { action: string; frame: VideoFrame } = e.data;
    // console.log("got frame from worker", frame);
    if (action == "renderFrame") {
      try {
        // requestAnimationFrame(() => {
        context!.drawImage(frame, 0, 0, canvas!.width, canvas!.height);
        latencyLogging && console.log(`🧪 🎬 obj latency ${frame.timestamp} #6: ${Date.now()}`);
        frame.close();
        // });
      } catch (err) {
        console.log("❌ Error in rendering frame:", err);
      }
    }
    if (action == "adaptUp") {
      console.log("Adapt upwards triggered in video track.");
      rateAdapt("up");
    }
    if (action == "adaptDown") {
      console.log("Adapt downwards triggered in video track.");
      rateAdapt("down");
    }
    if (action == "stableTime") {
      console.log("Stable time reached for video playback.");
      rateAdapt("down");
    }
  };

  let audioChunkPlayedCounter = 0;
  const audioDecoderWorker = new AudioDecoderWorker();
  audioDecoderWorker.onmessage = (e) => {
    const { action, audio }: { action: string; audio: AudioData } = e.data;
    if (action == "playAudio") {
      audioChunkPlayedCounter++;
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
        source.start(0, 0, audio.duration / 1000000);
        source.onended = () => {
          audioDecoderWorker.postMessage({ action: "retrieveAudio" });
          // console.log("🔔 Triggered next audio chunk retrieval");
          // post message to videoDecoderWorker to trigger next frame rendering every 3 audio chunks
          if (audioChunkPlayedCounter % 3 === 0) {
            const timestamp = audio.timestamp;
            videoDecoderWorker.postMessage({ action: "retrieveFrame", timestamp });
            // console.log("🔔 Triggered next frame rendering");
          }
        };
        latencyLogging && console.log(`🧪 🔊 obj latency ${audio.timestamp} #6: ${Date.now()}`);
      }
    }
    if (action == "adaptDown") {
      console.log("Adapt downwards triggered in audio track.");
      rateAdapt("down");
    }
    if (action == "staleTime") {
      console.log("Stale time reached for audio playback.");
      rateAdapt("down");
    }
    if (action == "adaptUp") {
      console.log("Adapt upwards triggered.");
      rateAdapt("up");
    }
  };

  async function deserializeEncodedChunk(buffer: Uint8Array) {
    let view = new DataView(buffer.buffer);
    const chunkSize = view.getUint32(0, true);
    const type = view.getUint8(4) === 1 ? "video" : "audio";
    const key = view.getUint8(5) === 1 ? "key" : "delta";
    const timestamp = view.getFloat64(6, true);

    // type === "video" &&
    console.log(`🔔 Deserializing chunk: ${type}, ${key}, timestamp: ${timestamp}, size: ${chunkSize}`);
    // return;

    // discard those chunks that are not video or audio
    try {
      switch (type) {
        case "video":
          const videoData = view.buffer.slice(14, chunkSize + 4);
          const evc = new EncodedVideoChunk({
            type: key,
            timestamp: timestamp,
            data: videoData,
          });
          latencyLogging && console.log(`🧪 🎬 obj latency ${timestamp} #3: ${Date.now()}`);
          if (videoTimestampRef === 0 || timestamp < videoTimestampRef) {
            videoTimestampRef = timestamp;
            // console.log(`🔔 Reference timestamp for video frames: ${videoTimestampRef} @ ${Date.now()}`);
            try {
              videoDecoderWorker.postMessage({ action: "videoTimestampRef", timestamp });
            } catch (err) {
              throw new Error(`❌ Error in posting videoTimestampRef to worker: ${err}`);
            }
          }
          // console.log(`🎥 Got video frame: ${evc.type}, timestamp: ${timestamp}, ${videoData.byteLength} bytes`);
          try {
            videoDecoderWorker.postMessage({ action: "insertFrame", frame: evc });
          } catch (err) {
            throw new Error(`❌ Error in posting video frame to worker: ${err}`);
          }
          break;
        case "audio":
          const duration = view.getFloat64(14, true); // exist only for audio chunks
          const audioData = view.buffer.slice(22, chunkSize + 4);
          const eac = new EncodedAudioChunk({
            type: key, // always "key" for audio
            timestamp: timestamp,
            duration: duration,
            data: audioData,
          });
          latencyLogging && console.log(`🧪 🔊 obj latency ${timestamp} #3: ${Date.now()}`);
          if (audioTimestampRef === 0 || timestamp < audioTimestampRef) {
            audioTimestampRef = timestamp;
            // console.log(`🔔 Reference timestamp for audio chunks: ${audioTimestampRef} @ ${Date.now()}`);
            try {
              videoDecoderWorker.postMessage({ action: "audioTimestampRef", timestamp });
            } catch (err) {
              throw new Error(`❌ Error in posting audioTimestampRef to worker: ${err}`);
            }
          }
          // console.log(
          //   `🔊 Got audio chunk: ${eac.type}, timestamp(ms): ${Math.floor(timestamp! / 1000)},duration: ${duration}, ${audioData.byteLength} bytes`,
          // );
          try {
            audioDecoderWorker.postMessage({ action: "insertAudio", audio: eac });
          } catch (err) {
            throw new Error(`❌ Error in posting audio chunk to worker: ${err}`);
          }
          break;
        default:
          console.log(`❌ Unknown chunk type`);
          break;
      }
    } catch (err) {
      throw new Error(`❌ Error in deserializing chunk: ${err}`);
    }
  }

  const handleChannelChange = (channel: string) => {
    selectedChannel = channel;
    session!.subscribe(channel, "catalogTrack");
    console.log(`🔔 Selected channel: ${selectedChannel}`);
  };

  const handleTrackChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const targetTrack = event.target.value;
    console.log(`🔔 Selected track (previous track state): ${selectedTrack}`);
    const previousTrackId = mediaType.get(selectedTrack);
    if (previousTrackId) {
      session!.unsubscribe(previousTrackId);
      console.log(`🔔 Unsubscribed from previous track: ${selectedTrack}`);
      setSelectedTrack(targetTrack); // state update for UI rendering
      selectedTrackInternal = targetTrack;
    }
  };

  function rateAdapt(direction: string) {
    console.log(`🔔 Rate adaptation triggered: ${direction}`);
    console.log(`🔔 Selected track: ${selectedTrackInternal}`);
    let previousTrackId = mediaType.get(selectedTrackInternal);
    console.log(`🔔 MediaType: (${selectedTrackInternal},${previousTrackId})`);
    if (previousTrackId) {
      let adaptDownTrack = selectedTrackInternal === "hd" ? "hd-ra" : "md-ra";
      let adaptUpTrack = selectedTrackInternal === "hd-ra" ? "hd" : "md";

      if (direction === "down" && selectedTrackInternal !== "hd-ra" && selectedTrackInternal !== "md-ra") {
        sessionInternal!.unsubscribe(previousTrackId);
        console.log(`🔔 Unsubscribed from current track: ${selectedTrackInternal}`);
        setSelectedTrack(adaptDownTrack); // state update for UI rendering
        selectedTrackInternal = adaptDownTrack;
        console.log(`🔔 Adapted down to track: ${adaptDownTrack}`);
        return;
      } else {
        console.log(`🔔 Already at ra track ${selectedTrackInternal}, cannot adapt down`);
      }

      if (direction === "up" && selectedTrackInternal !== "hd" && selectedTrackInternal !== "md") {
        sessionInternal!.unsubscribe(previousTrackId);
        console.log(`🔔 Unsubscribed from current track: ${selectedTrackInternal}`);
        setSelectedTrack(adaptUpTrack); // state update for UI rendering
        selectedTrackInternal = adaptUpTrack;
        console.log(`🔔 Adapted up to track: ${adaptUpTrack}`);
        return;
      } else {
        console.log(`🔔 Already at normal track ${selectedTrackInternal}, cannot adapt up`);
      }
    } else {
      console.log(`❌ Track ${selectedTrackInternal} is not registered in mediaType map, invalid subscription id`);
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
              <button
                className="cursor-pointer bg-blue-300 text-black p-2 hover:bg-red-400 hover:text-white transition-all duration-400"
                id="disconnect"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="col-span-2 flex justify-end">
              <button
                className="cursor-pointer bg-blue-300 text-black p-2 hover:bg-red-400 hover:text-white transition-all duration-400"
                id="connect"
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
                    id={channel}
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
