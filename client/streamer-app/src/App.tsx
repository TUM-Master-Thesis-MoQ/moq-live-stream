import { FaSearch } from "react-icons/fa";
import { useState, useRef } from "react";

import { Session } from "moqjs/src/session";
import { Message, MessageType } from "moqjs/src/messages";

import catalogJSON from "./catalog.json";

// groupId and objId for ObjMsg
let groupId = 1; // groupId for ObjMsg：Group ID, 1 group = 1 key frame + 49 delta frames (1 sec of frames)
let objId = 0; // objId for ObjMsg: Object ID

function App() {
  const [session, setSession] = useState<Session | null>();

  // Streaming Config (part of the catalog)
  const [channelName, setChannelName] = useState<string>("");
  const [bitrate1080P, setBitrate1080P] = useState<number>(10);
  const [bitrate720P, setBitrate720P] = useState<number>(5);
  const [streamingConfigError, setStreamingConfigError] = useState<string>("");

  let writeCatalogJSON: (
    subscribeId: number,
    trackAlias: number,
    groupId: number,
    objId: number,
    final: number,
    priority: number,
    data: Uint8Array,
  ) => Promise<void>;
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

  // TODO: save the catalog JSON obj for later use when there's a SUBSCRIBE msg request specific track that the streamer is not encoding / send to the server
  const [newCatalogJSON, setNewCatalogJSON] = useState<object | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoEncoderRef = useRef<VideoEncoder | null>(null);
  const audioEncoderRef = useRef<AudioEncoder | null>(null);
  const videoWriterRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const audioWriterRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

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

      await s.announce("catalog-" + channelName);
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
        videoWriterRef.current?.releaseLock();
        audioWriterRef.current?.releaseLock();
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
          const nsS = m.trackNamespace.split("-");
          // handle different types of SUBSCRIBE messages with reserved trackNamespace
          switch (m.trackName) {
            case "catalogTrack": //! S3: sub to catalogTrack => send catalogJSON
              console.log("🔻 🅾️ SUBSCRIBE 🅾️catalog🅾️:", m);
              if (nsS[0] !== "catalog") {
                await session.subscribeError(
                  Number(m.subscribeId),
                  400, //bad request
                  "Invalid trackNamespace, expect: 'catalog-ns'",
                  Number(m.trackAlias),
                );
              } else {
                try {
                  writeCatalogJSON = await session.subscribeOk(Number(m.subscribeId), 0, 1, false);
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
              }
              break;

            default: //! S0: sub for media track
              console.log("🔻 🅾️ SUBSCRIBE 🅾️media🅾️:", m);
              // handle regular SUBSCRIBE message (subs to media track)
              // get & set the writeMediaStream function
              writeMediaStream = await session.subscribeOk(Number(m.subscribeId), 0, 1, false);
              console.log("🔔 Capturing media...");
              startCapturing();
              break;
          }
          break;

        case MessageType.Unsubscribe: //! unsub from either catalogTrack or media track
          // // TODO: send subscribeDone message to the subscriber (no final obj)
          console.log(`🔻 🟢 UNSUBSCRIBE (${m.subscribeId})`);

          //! question pending on: subscribeDone handler on the go server side
          // await session.subscribeDone(Number(m.subscribeId), 0, "Unsubscribed, final message", false);
          // console.log("🟢 Sent SubscribeDone msg for:", m.subscribeId);

          // trigger announce the channelName
          if (m.subscribeId === 0) {
            //! unannounce not implemented yet
            // await session.unannounce("catalog-" + channelName);
            // console.log("🟢 UnAnnounced namespace: catalog-", channelName);

            await session.announce(channelName);
            console.log("🔺 🔊 ANNOUNCE:", channelName);
          }
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
    catalog.tracks[0].selectionParams.bitrate = bitrate1080P * 1_000_000;
    catalog.tracks[1].selectionParams.bitrate = bitrate720P * 1_000_000;

    setNewCatalogJSON(catalog); // save it for possible later use

    const encoder = new TextEncoder();
    const jsonString = JSON.stringify(catalog);
    // console.log("📤 Serialized catalogJSON string:", jsonString);
    const catalogBytes = encoder.encode(jsonString);

    return catalogBytes;
  }

  async function startCapturing() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      mediaStreamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }

      await Promise.all([videoHandler(mediaStream), audioHandler(mediaStream)]);
    } catch (error) {
      console.error("❌ Failed to start capturing:", error);
    }
  }

  async function stopCapturing() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  }

  // ================== ⬇ Media Stream Handlers ⬇️ ==================
  function videoHandler(mediaStream: MediaStream) {
    const videoEncoder = new VideoEncoder({
      output: serializeEncodedChunk,
      error: (error) => console.error("❌ Video Encoder Error:", error),
    });
    // TODO: pull config from the catalog
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
  // 1 key frame every 50 frames (~1s)
  // // TODO: return group number and obj number for each frame
  // make sure the first obj of a group is the keyframe
  async function encodeVideo(reader: ReadableStreamDefaultReader<VideoFrame>) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (videoEncoderRef.current) {
        // frame 0 is not received on the audience side, not sure why
        if (objId === 1) {
          isKeyFrame = true;
        } else {
          isKeyFrame = false;
        }
        videoEncoderRef.current.encode(value, { keyFrame: isKeyFrame });
        // console.log(`🎥 Encoded video: ${isKeyFrame ? "key" : "delta"} frame ${counter}`);
        objId++;
        if (objId >= 50) {
          groupId++;
          objId = 0;
        }
      }
      value.close();
    }
  }

  function audioHandler(mediaStream: MediaStream) {
    const audioEncoder = new AudioEncoder({
      output: serializeEncodedChunk,
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

    sendSerializedChunk(serializeBuffer, chunkType, timestampBytes);
  }

  async function sendSerializedChunk(buffer: ArrayBuffer, type: string, timestamp: Float64Array) {
    const ua = new Uint8Array(buffer);
    writeMediaStream(1, 1, groupId, objId, 0, 0, ua);
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
              <button className=" bg-red-400 text-white p-2" onClick={stopLive}>
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
                  <video ref={videoRef} className="w-full bg-green-100" autoPlay playsInline muted></video>
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
                <button className="font-bold bg-red-200">Send</button>
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
                        value={"50 (Fixed)"}
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
                        value={"50 (Fixed)"}
                        disabled
                      />
                    </div>
                    <div>FPS</div>
                  </div>
                </fieldset>
              </div>
            </div>
            <div className="text-center">
              <button className=" w-full bg-green-200 font-bold text-red-400" onClick={goLive}>
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
