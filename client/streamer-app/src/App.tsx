import { FaSearch } from "react-icons/fa";
import { useState, useRef } from "react";

import {
  MessageType,
  Announce,
  AnnounceEncoder,
  Message,
  SubscribeOkEncoder,
  SubscribeErrorEncoder,
  SubscribeDoneEncoder,
} from "moqjs/src/messages";
import { Session } from "moqjs/src/session";
import { ControlStream } from "moqjs/src/control_stream";

import catalogJSON from "./catalog.json";

let groupId = 0; // groupId for ObjMsg：Group ID, 1 group = 1 key frame + 49 delta frames (1 sec of frames)
let objId = 0; // objId for ObjMsg: Object ID
let subscribeId = 0; // subscribeId for SubscribeOk msg
let trackAlias = 0; // trackAlias for SubscribeError msg

function App() {
  const [live, setLive] = useState<boolean>(false);
  const [session, setSession] = useState<Session | null>(null);

  // Streaming Config (part of the catalog)
  const [channelName, setChannelName] = useState<string>("");
  const [bitrate1080P, setBitrate1080P] = useState<number>(10);
  const [bitrate720P, setBitrate720P] = useState<number>(5);
  const [streamingConfigError, setStreamingConfigError] = useState<string>("");

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
      if (session) {
        const cs = session.controlStream;
        controlMessageListener(cs); // keep listening for control messages in the background
        await Announce(cs, "catalog-" + channelName);
        // ? need unannounce the above announce after done?
        await Announce(cs, channelName); // ? redundant, since we already embedded the channelName in previous announce
      }
    } catch (error) {
      console.error("❌ Failed to go live:", error);
    }
  }

  async function stopLive() {
    try {
      await disconnect();
      await stopCapturing();
      // ? might be further cleanup or data backup later
    } catch (error) {
      console.error("❌ Failed to stop live:", error);
    }
  }

  async function connect() {
    try {
      const url = "https://localhost:443/webtransport/streamer";
      // const hash = "9b8a96046d47f2523bec35d334b984d99b6beff16b2e477a0aa23da3db116562";
      const s = await Session.connect(url); // hash is optional in connect(url, hash)
      setLive(true);
      setSession(s);
      console.log("🔌 Connected to WebTransport server!");
    } catch (error) {
      console.error("❌ Failed to connect:", error);
      // throw new Error("❌ Failed to connect to WebTransport server in MOQT:" + error);
    }
  }

  async function disconnect() {
    if (session) {
      try {
        session.conn.close();
        console.log("🔌 Disconnected from WebTransport server!");
      } catch (error) {
        console.error("❌ Failed to disconnect:", error);
      } finally {
        setLive(false);
        setSession(null);
        videoWriterRef.current?.releaseLock();
        audioWriterRef.current?.releaseLock();
      }
    }
  }

  async function controlMessageListener(cs: ControlStream) {
    while (true) {
      // cs.runReadLoop(); //? do we need to call it again? since it's in session constructor already
      cs.onmessage
        ? (m: Message) => {
            switch (m.type) {
              case MessageType.AnnounceOk:
                console.log("🟢 AnnounceOk received!");
                break;
              case MessageType.AnnounceError:
                console.error(`🔴 AnnounceError received:${m},\n try ANNOUNCE again`);
                Announce(cs, m.trackNamespace); // ? should we try announce again?
                break;

              case MessageType.Subscribe:
                const nsS = m.trackNamespace.split("-");
                // TODO: handle different types of SUBSCRIBE messages with reserved trackNamespace
                switch (m.trackName) {
                  case "catalogTrack": //! S3: sub to catalogTrack
                    if (nsS[0] !== "catalog") {
                      // // TODO: send subscribeError msg
                      SubscribeError(cs, `Invalid trackNamespace, expect: 'catalog-ns', got ${m.trackNamespace}`);
                    } else {
                      // TODO: send catalogJSON: prepare catalogTrack for the server to get the catalog JSON
                      // ? add LocalTrack to the streamer session? then write the catalog JSON to the LocalTrack
                      const catalogBytes = serializeCatalogJSON();

                      subscribeId = Number(m.subscribeId);
                      trackAlias = Number(m.trackAlias);
                      subscribeId++;
                      trackAlias++;
                      SubscribeOk(cs, Number(m.subscribeId));
                    }
                    break;

                  default: //! S0: sub for media track
                    // TODO: handle regular SUBSCRIBE message (subs to media track)
                    // 1. init LocalTrack for media track
                    // 2. write captured video/audio data to the LocalTrack

                    subscribeId = Number(m.subscribeId);
                    trackAlias = Number(m.trackAlias);
                    subscribeId++;
                    trackAlias++;
                    SubscribeOk(cs, Number(m.subscribeId));
                    startCapturing();
                    break;
                }
                break;

              case MessageType.Unsubscribe: //! unsub from either catalogTrack or media track
                // TODO: send subscribeDone message to the subscriber (no final obj)
                SubscribeDone(cs, "Unsubscribed, final message");
                break;

              default:
                console.log(`❌ Unsupported msg type received: ${m.type}, content: ${m}`);
                break;
            }
          }
        : null;
    }
  }

  //! all moqt msg sending functions are CapitalizedLikeSo

  // send announce message in the control stream
  async function Announce(cs: ControlStream, namespace: string) {
    const announceMsg: Announce = {
      type: MessageType.Announce,
      namespace: "",
      parameters: [],
    };
    announceMsg.namespace = namespace;
    const announceEncoder = new AnnounceEncoder(announceMsg);
    try {
      cs.send(announceEncoder);
      console.log("📤 Sent announce message in controlStream:", announceMsg);
    } catch (error) {
      console.error("❌ Failed to encode announce message:", error);
    }
  }

  // send subscribeOk message in the control stream
  async function SubscribeOk(cs: ControlStream, subscribeId: number) {
    // send subscribeOk message in the control stream
    const subscribeOkMsg: Message = {
      type: MessageType.SubscribeOk,
      subscribeId: subscribeId, //? very first subscribeId
      expires: 0, //? no expiration,
      groupOrder: 0, //? no groupOrder
      contentExists: true,
    };
    const subscribeOkEncoder = new SubscribeOkEncoder(subscribeOkMsg);
    try {
      await cs.send(subscribeOkEncoder);
      console.log("📤 Sent subscribeOk message in controlStream:", subscribeOkMsg);
    } catch (error) {
      console.error("❌ Failed to send subscribeOk message:", error);
    }
  }

  // send subscribeError message in the control stream
  async function SubscribeError(cs: ControlStream, reasonPhrase: string) {
    // send subscribeError message in the control stream
    const subscribeErrorMsg: Message = {
      type: MessageType.SubscribeError,
      subscribeId: 0, // very first subscribeId
      errorCode: 400,
      reasonPhrase: reasonPhrase,
      trackAlias: 0, // catalogTrack
    };
    const subscribeErrorEncoder = new SubscribeErrorEncoder(subscribeErrorMsg);
    try {
      await cs.send(subscribeErrorEncoder);
      console.log("📤 Sent subscribeError message in controlStream:", subscribeErrorMsg);
    } catch (error) {
      console.error("❌ Failed to send subscribeError message:", error);
    }
  }

  // send subscribeDone message in the control stream
  async function SubscribeDone(cs: ControlStream, reasonPhrase: string) {
    const subscribeDoneMsg: Message = {
      type: MessageType.SubscribeDone,
      subscribeId: 0,
      statusCode: 200,
      reasonPhrase: reasonPhrase,
      contentExists: true,
    };
    const subscribeDoneEncoder = new SubscribeDoneEncoder(subscribeDoneMsg);
    try {
      await cs.send(subscribeDoneEncoder);
      console.log("📤 Sent subscribeDone message in controlStream:", subscribeDoneMsg);
    } catch (error) {
      console.error("❌ Failed to send subscribeDone message:", error);
    }
  }

  // streamer-app sends the catalog to the server (including the namespace)
  async function serializeCatalogJSON() {
    const catalog = { ...catalogJSON };
    catalog.commonTrackFields.namespace = channelName;
    catalog.tracks[0].selectionParams.bitrate = bitrate1080P * 1_000_000;
    catalog.tracks[1].selectionParams.bitrate = bitrate720P * 1_000_000;

    setNewCatalogJSON(catalog); // save it for possible later use

    const encoder = new TextEncoder();
    const jsonString = JSON.stringify(catalog);
    // console.log("📤 Passed catalog JSON string to server:", jsonString);
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

  // // TODO: deprecated: write obj msg
  async function sendSerializedChunk(buffer: ArrayBuffer, type: string, timestamp: Float64Array) {
    // const uds = await session?.conn.createUnidirectionalStream();
    // const writer = uds?.getWriter();
    const ua = new Uint8Array(buffer);
    // await writer?.write(ua);
    // console.log(`📤 Sent ${type} chunk: ${ua.length} bytes with timestamp ${timestamp}`);
    // await writer?.close();

    session?.writeObjUniStream(subscribeId, trackAlias, groupId, objId, 0, 0, ua);
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
          {live ? (
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
              {live ? (
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
        {live ? (
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
