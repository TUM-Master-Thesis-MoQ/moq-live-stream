import { FaSearch } from "react-icons/fa";
import { useState, useRef } from "react";

import { Session } from "moqjs/src/session";
import { Message, MessageType } from "moqjs/src/messages";

import catalogJSON from "./catalog.json";
import { CatalogJSON } from "./interface/CatalogJSON";

import videoSource from "./video/bbb_vp8_opus_mono.webm";

import VideoEncoderWorker from "./worker/VideoEncoderWorker?worker";
import AudioEncoderWorker from "./worker/AudioEncoderWorker?worker";

import { VideoEncoderConfig } from "./interface/VideoEncoderConfig";
import { AudioEncoderConfig } from "./interface/AudioEncoderConfig";

function App() {
  let latencyLogging = false; //! testbed: latency test_0

  let mediaType = new Map<string, number>(); // tracks the media type (video, audio etc.) for each subscription, possible keys: "hd", "md", "audio"

  const [session, setSession] = useState<Session | null>();

  // Streaming Config (part of the catalog)
  const [channelName, setChannelName] = useState<string>("ninja");
  const [bitrate1080P, setBitrate1080P] = useState<number>(10);
  const [bitrate720P, setBitrate720P] = useState<number>(5);
  const [streamingConfigError, setStreamingConfigError] = useState<string>("");

  let writeMediaStream: (
    subscribeId: number,
    trackAlias: number,
    groupId: number,
    objId: number,
    final: number,
    priority: number,
    data: Uint8Array,
  ) => Promise<void>;

  // TODO: load tracks info from the catalog JSON and show them as config opts in the front-end
  // const [tracksInfo, setTracksInfo] = useState(catalogJSON.tracks.map((track) => track.selectionParams));

  let newCatalogJSON: CatalogJSON;

  const videoRef = useRef<HTMLVideoElement | null>(null); // For: video preview
  const mediaStreamRef = useRef<MediaStream | null>(null); // For: clean up media stream

  async function validateStreamingConfig() {
    if (!channelName) {
      setStreamingConfigError("Required!");
      throw new Error("❌ Channel name is required!");
    }
    // check if the channel name is unique
  }

  async function goLive() {
    try {
      await validateStreamingConfig();
      await connect();
    } catch (error) {
      console.error("❌ Failed to go live:", error);
    }
  }

  async function stopLive() {
    try {
      await disconnect();
      await stopCapturing();
    } catch (error) {
      console.error("❌ Failed to stop live:", error);
    }
  }

  async function connect() {
    try {
      const url = "https://localhost:443/webtransport/streamer";
      const s = await Session.connect(url); // const hash = "9b8a96046d47f2523bec35d334b984d99b6beff16b2e477a0aa23da3db116562"; // hash is optional in connect(url, hash)
      controlMessageListener(s);
      setSession(s);
      console.log("🔗 Connected to WebTransport server!");

      await s.announce(channelName); //! A0
      console.log("🔊 First announce msg sent!");
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
        console.log("🗑️ All resources released!");
      }
    }
  }

  function controlMessageListener(session: Session) {
    session.controlStream.onmessage = async (m: Message) => {
      switch (m.type) {
        case MessageType.AnnounceOk:
          console.log("🔻 ✅ ANNOUNCE_OK");
          break;

        case MessageType.AnnounceError:
          console.error("🔻 ❌ ANNOUNCE_ERROR:", m);
          break;

        case MessageType.Subscribe:
          // handle different types of SUBSCRIBE messages with reserved trackNamespace
          switch (m.trackName) {
            case "catalogTrack": //! S2: sub to catalogTrack => send catalogJSON
              console.log("🔻 🅾️ SUBSCRIBE 🅾️catalog🅾️:", m);
              try {
                let writeCatalogJSON = await session.subscribeOk(Number(m.subscribeId), 0, 1, false);
                console.log(
                  `🔺 ✅ SUBSCRIBE_OK(${m.subscribeId}): ns = ${m.trackNamespace}, trackName = ${m.trackName}`,
                );
                try {
                  const catalogBytes = await serializeCatalogJSON();
                  await writeCatalogJSON(Number(m.subscribeId), Number(m.trackAlias), 0, 0, 0, 0, catalogBytes);
                  console.log(`🔺 🅾️ catalogJSON (${catalogBytes.length} bytes) to server.`);
                } catch (err) {
                  console.log("❌ Failed to send catalogJSON:", err);
                }
              } catch (err) {
                console.log("❌ Failed to send SubscribeOk msg:", err);
              }
              break;

            default: //! S0: sub for media track
              console.log("🔻 🅾️ SUBSCRIBE 🅾️media🅾️:", m);
              // handle regular SUBSCRIBE message (subs to media track)
              // get & set the writeMediaStream function
              writeMediaStream = await session.subscribeOk(Number(m.subscribeId), 0, 1, false);
              console.log(`🔺 ✅ SUBSCRIBE_OK(${m.subscribeId}): ns = ${m.trackNamespace}, trackName = ${m.trackName}`);
              mediaType.set(m.trackName, Number(m.subscribeId));
              console.log("🔔 Capturing media...");
              // only start capturing when all media tracks are subscribed => easier for synchronization tracks
              if (mediaType.size === newCatalogJSON.tracks.length) {
                // if (mediaType.size === 2) { //! testbed latency test_0
                startCapturing();
              }
              break;
          }
          break;

        case MessageType.Unsubscribe:
          console.log(`🔻 🟢 UNSUBSCRIBE (${m.subscribeId})`);
          // TODO: send subscribeDone message to the subscriber (no final obj)
          // await session.subscribeDone(Number(m.subscribeId), 0, "Unsubscribed, final message", false);
          // console.log("🟢 Sent SubscribeDone msg for:", m.subscribeId);

          break;

        default:
          console.log(`🔻 ❌ Unknown Message Type: ${m}`);
          break;
      }
    };
  }

  async function serializeCatalogJSON() {
    const catalog = { ...catalogJSON };
    catalog.commonTrackFields.namespace = channelName;
    catalog.tracks[1].selectionParams.bitrate = bitrate1080P * 1_000_000;
    catalog.tracks[1].selectionParams.framerate = frameRate;
    catalog.tracks[2].selectionParams.bitrate = bitrate720P * 1_000_000;
    catalog.tracks[2].selectionParams.framerate = frameRate;

    newCatalogJSON = catalog;

    // add two fallback tracks for the two video tracks
    const hdRateAdaptation = { ...catalog.tracks[1] };
    hdRateAdaptation.name += "-ra";
    hdRateAdaptation.selectionParams.bitrate *= 0.5;
    // console.log("🔔 hd-ra track:", hdRateAdaptation);

    const mdRateAdaptation = { ...catalog.tracks[2] };
    mdRateAdaptation.name += "-ra";
    mdRateAdaptation.selectionParams.bitrate *= 0.5;
    // console.log("🔔 md-ra track:", mdRateAdaptation);

    catalog.tracks.push(hdRateAdaptation);
    catalog.tracks.push(mdRateAdaptation);
    // console.log("🔔 Updated catalogJSON:", catalog);

    const encoder = new TextEncoder();
    const jsonString = JSON.stringify(catalog);
    // console.log("📤 Serialized catalogJSON string:", jsonString);
    const catalogBytes = encoder.encode(jsonString);

    return catalogBytes;
  }

  async function createMediaStreamFromVideo(videoSrc: string): Promise<MediaStream> {
    const videoElement = videoRef.current!;
    videoElement.src = videoSrc;
    videoElement.play();

    return new Promise<MediaStream>((resolve) => {
      const stream = (videoElement as any).captureStream();
      videoElement.addEventListener(
        "loadedmetadata",
        () => {
          resolve(stream);
        },
        { once: true },
      );
    });
  }

  // video encoder config: highest quality the hardware supports
  let frameRate: number;
  // audio encoder config: highest quality the hardware supports
  let audioBitrate = 32_000;
  let sampleRate = 48_000;
  let numberOfChannels = 1;
  let frameDuration = 10_000;
  async function startCapturing() {
    try {
      const mediaStream = await createMediaStreamFromVideo(videoSource);

      const videoTrack = mediaStream.getVideoTracks()[0];
      const videoTrackSettings = videoTrack.getSettings();
      frameRate = videoTrackSettings.frameRate!;
      console.log("🔔 Video Track framerate:", videoTrackSettings);

      const audioTrack = mediaStream.getAudioTracks()[0];
      const audioTrackSettings = audioTrack.getSettings();
      // numberOfChannels = audioTrackSettings.channelCount!; // undefined
      console.log("🔔 Audio Track settings:", audioTrackSettings);

      // worker for each track
      for (let i = 0; i < newCatalogJSON.tracks.length; i++) {
        // for (let i = 0; i < 2; i++) { //! testbed latency test_0
        initWorker(
          newCatalogJSON.tracks[i].name,
          i,
          newCatalogJSON.tracks[i].name === "audio" ? audioTrack : videoTrack,
        );
      }
    } catch (error) {
      console.error("❌ Failed to start capturing:", error);
    }
  }

  function initWorker(trackName: string, trackIndex: number, track: MediaStreamTrack) {
    let worker: Worker;
    worker = trackName === "audio" ? new AudioEncoderWorker() : new VideoEncoderWorker();
    worker.onmessage = (e) => {
      const encodedChunk = e.data;
      serializeEncodedChunk(encodedChunk, trackName);
    };
    let config: VideoEncoderConfig | AudioEncoderConfig;
    if (trackName === "audio") {
      config = {
        codec: newCatalogJSON.tracks[trackIndex].selectionParams.codec,
        sampleRate: sampleRate, // newCatalogJSON.tracks[trackIndex].selectionParams.samplerate!, // hardware dependent
        bitrate: audioBitrate, // newCatalogJSON.tracks[trackIndex].selectionParams.bitrate, // hardware dependent
        numberOfChannels: numberOfChannels, // Number(newCatalogJSON.tracks[trackIndex].selectionParams.channelConfig), // hardware dependent
        opus: {
          frameDuration: frameDuration, // In us. Lower latency than default 20000
        },
      };
    } else {
      config = {
        codec: newCatalogJSON.tracks[trackIndex].selectionParams.codec,
        width: newCatalogJSON.tracks[trackIndex].selectionParams.width!,
        height: newCatalogJSON.tracks[trackIndex].selectionParams.height!,
        bitrate: newCatalogJSON.tracks[trackIndex].selectionParams.bitrate,
        framerate: frameRate, // newCatalogJSON.tracks[trackIndex].selectionParams.framerate!, // hardware dependent
        latencyMode: "realtime", // send 1 chunk per frame
      };
    }
    const readableStream = new MediaStreamTrackProcessor(track).readable;
    worker.postMessage({ config: config, readableStream: readableStream }, [readableStream]);
  }

  async function stopCapturing() {
    mediaType.clear();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    mediaStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.pause();
    }
  }

  function serializeEncodedChunk(chunk: EncodedVideoChunk | EncodedAudioChunk, trackName: string) {
    const buffer = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(buffer);

    const chunkType = chunk instanceof EncodedVideoChunk ? 1 : 0;
    const key = chunk.type === "key" ? 1 : 0;

    const encodedChunk: any = {
      type: chunkType, // 1: video, 0: audio
      key: chunk.type, // 1: key, 0: delta
      timestamp: chunk.timestamp,
      data: buffer,
    };
    if (chunkType === 0) {
      encodedChunk.duration = chunk.duration; // exist only in audio chunks
    }

    // console.log(
    //   `${chunkType === 1 ? "🎬 video" : "🔊 audio"} chunk timestamp: ${chunk.timestamp}, ${chunkType === 1 ? "frame" : "audio"} type: ${chunk.type}, duration: ${chunk.duration} microseconds`,
    // );

    const chunkTypeBytes = new Uint8Array([chunkType]);
    const keyBytes = new Uint8Array([key]);
    const timestampBytes = new Float64Array([encodedChunk.timestamp]);
    const durationBytes = new Float64Array([encodedChunk.duration!]); // exist only in audio chunks
    const dataBytes = new Uint8Array(encodedChunk.data);

    const totalLength =
      chunk instanceof EncodedVideoChunk ? 1 + 1 + 8 + dataBytes.byteLength : 1 + 1 + 8 + 8 + dataBytes.byteLength;
    const serializeBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(serializeBuffer);

    new Uint8Array(serializeBuffer, 0, 1).set(chunkTypeBytes);
    new Uint8Array(serializeBuffer, 1, 1).set(keyBytes);
    view.setFloat64(2, timestampBytes[0], true);
    if (chunk instanceof EncodedVideoChunk) {
      new Uint8Array(serializeBuffer, 10, dataBytes.byteLength).set(dataBytes);
    } else {
      view.setFloat64(10, durationBytes[0], true);
      new Uint8Array(serializeBuffer, 18, dataBytes.byteLength).set(dataBytes);
    }

    sendEncodedChunk(serializeBuffer, trackName, chunk.type, chunk.duration!, chunk.timestamp);
  }

  let keyFrameSet = false;
  let audioGroupId = 0;
  let audioObjId = 0;
  let videoGroupId = 0;
  let videoObjectId = 0;
  async function sendEncodedChunk(
    buffer: ArrayBuffer,
    trackName: string,
    key: string,
    duration: number,
    timestamp: number, //! testbed latency test_0
  ) {
    if (trackName === "audio") {
      // audio chunk
      let id = mediaType.get(trackName);
      // 1 sec of audio chunks in a group
      if (audioObjId < 1000000 / duration) {
        await writeMediaStream(id!, id!, audioGroupId, audioObjId, 0, 0, new Uint8Array(buffer));
        latencyLogging && console.log(`🧪 🔊 obj latency ${timestamp} #2: ${Date.now()}`);
        // console.log(
        //   `🔊 Audio Chunk: groupId ${audioGroupId}, objId ${audioObjId}, chunk size: ${buffer.byteLength} bytes`,
        // );
        audioObjId++;
      } else {
        audioObjId = 0;
        audioGroupId++;
        await writeMediaStream(id!, id!, audioGroupId, audioObjId, 0, 0, new Uint8Array(buffer));
        latencyLogging && console.log(`🧪 🔊 obj latency ${timestamp} #2: ${Date.now()}`);
        // console.log(
        //   `🔊 Audio Chunk: groupId ${audioGroupId}, objId ${audioObjId}, chunk size: ${buffer.byteLength} bytes`,
        // );
        audioObjId++;
      }
    } else {
      // video chunk
      let subId = mediaType.get(trackName);
      // key frame first, then delta frames
      if (key === "key" && !keyFrameSet) {
        keyFrameSet = true;
        await writeMediaStream(subId!, subId!, videoGroupId, videoObjectId, 0, 0, new Uint8Array(buffer));
        latencyLogging && console.log(`🧪 🎬 obj latency ${timestamp} #2: ${Date.now()}`);
        // console.log(`🔑 Key Frame: groupId ${videoGroupId}, objId ${videoObjectId}, frame size: ${buffer.byteLength} bytes`);
        videoObjectId++;
      }
      if (keyFrameSet) {
        if (key === "delta") {
          await writeMediaStream(subId!, subId!, videoGroupId, videoObjectId, 0, 0, new Uint8Array(buffer));
          latencyLogging && console.log(`🧪 🎬 obj latency ${timestamp} #2: ${Date.now()}`);
          // console.log(`🔲 Delta Frame: groupId ${videoGroupId}, objId ${videoObjectId}, frame size: ${buffer.byteLength} bytes`);
          videoObjectId++;
        } else {
          // key frame
          videoGroupId++;
          videoObjectId = 0;
          await writeMediaStream(subId!, subId!, videoGroupId, videoObjectId, 0, 0, new Uint8Array(buffer));
          latencyLogging && console.log(`🧪 🎬 obj latency ${timestamp} #2: ${Date.now()}`);
          // console.log(`🔑 Key Frame: groupId ${videoGroupId}, objId ${videoObjectId}, frame size: ${buffer.byteLength} bytes`);
          videoObjectId++;
        }
      }
    }
  }

  return (
    <div className="flex flex-col gap-2 w-full h-full min-w-[1024px] min-h-[700px]">
      {/* Nav Bar */}
      <div className="grid grid-cols-12 items-center text-center font-bold h-18 w-full bg-blue-400 p-2 gap-2">
        {/* Logo & MOT Live Stream */}
        <div className="col-span-3 grid grid-cols-3 gap-1">
          <div className="col-span-1 bg-blue-300">logo</div>
          <div className="col-span-2 bg-blue-300">MOT Live Stream</div>
        </div>
        {/* Search Bar */}
        <div className="col-span-6 items-center flex justify-center">
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
        {/* End Live Button & Streamer Icon */}
        <div className="col-span-3 grid grid-cols-3 gap-1">
          {session ? (
            <div className="col-span-2 flex justify-end">
              <button className="cursor-pointer bg-red-400 text-white p-2" onClick={stopLive}>
                Stop Live
              </button>
            </div>
          ) : (
            <div className="col-span-2"></div>
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
                  <video ref={videoRef} className="w-full bg-green-100" autoPlay playsInline></video>
                </div>
              ) : (
                <div>waiting for stream to start...</div>
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
        {session ? (
          <div className="w-64 bg-red-400 flex flex-col gap-1 p-2">
            <div className="h-8 font-bold text-center bg-red-300 flex items-center justify-center">Chat</div>
            <div className="flex-grow bg-red-300">Chat History</div>
            <div className="h-8 bg-red-300 flex items-center justify-center gap-2">
              <div>
                <input
                  className="placeholder:italic bg-red-200 flex items-center justify-center"
                  type="text"
                  placeholder="Send a message..."
                />
              </div>
              <div>
                <button className="cursor-pointer font-bold bg-red-200">Send</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-64 bg-green-300 flex flex-col gap-1 p-2">
            <div className="h-8 font-bold text-center bg-green-200 flex items-center justify-center">
              Streaming Config
            </div>
            <div className="flex-grow flex flex-col justify-center gap-2 bg-green-200 p-2">
              <div className="bg-green-100">
                <fieldset className="border-2 p-2">
                  <legend className="font-bold">Channel</legend>
                  <div className="flex flex-row gap-2">
                    <div>Name:</div>
                    <div>
                      <input
                        className="w-full border-b-2 text-center placeholder:italic placeholder:text-red-400 bg-green-100"
                        type="text"
                        id="channelName"
                        value={channelName}
                        placeholder={streamingConfigError}
                        onChange={(e) => setChannelName(e.target.value)}
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
              <div className="bg-green-100">
                <fieldset className="border-2 p-2">
                  <legend className="font-bold">1080P</legend>
                  <div className="flex flex-row gap-2">
                    <div>Bitrate:</div>
                    <div>
                      <input
                        className="w-full border-b-2 text-center bg-green-100"
                        type="number"
                        value={bitrate1080P}
                        onChange={(e) => setBitrate1080P(Number(e.target.value))}
                        id="1080PBitrate"
                      />
                    </div>
                    <div>Mbps</div>
                  </div>
                  <div className="flex flex-row gap-2">
                    <div>Framerate:</div>
                    <div>
                      <input
                        className="w-full border-b-2 text-center italic bg-green-100"
                        type="text"
                        value={30 + " (Fixed)"}
                        disabled
                      />
                    </div>
                    <div>FPS</div>
                  </div>
                </fieldset>
              </div>
              <div className="bg-green-100">
                <fieldset className="border-2 p-2">
                  <legend className="font-bold">720P</legend>
                  <div className="flex flex-row gap-2">
                    <div>Bitrate:</div>
                    <div>
                      <input
                        className="w-full border-b-2 text-center bg-green-100"
                        type="number"
                        value={bitrate720P}
                        onChange={(e) => setBitrate720P(Number(e.target.value))}
                        id="720PBitrate"
                      />
                    </div>
                    <div>Mbps</div>
                  </div>
                  <div className="flex flex-row gap-2">
                    <div>Framerate:</div>
                    <div>
                      <input
                        className="w-full border-b-2 text-center italic bg-green-100"
                        type="text"
                        value={30 + " (Fixed)"}
                        disabled
                      />
                    </div>
                    <div>FPS</div>
                  </div>
                </fieldset>
              </div>
            </div>
            <div className="text-center">
              <button
                className="cursor-pointer w-full bg-green-200 font-bold text-red-400 hover:bg-red-400 hover:text-white transition-all duration-400"
                onClick={goLive}
              >
                Go Live
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
