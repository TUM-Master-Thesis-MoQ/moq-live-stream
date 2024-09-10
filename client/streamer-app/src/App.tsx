import { FaSearch } from "react-icons/fa";
import { useState, useRef } from "react";

import { Session } from "moqjs/src/session";
import { Message, MessageType } from "moqjs/src/messages";

import catalogJSON from "./catalog.json";

function App() {
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
              startCapturing();
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

  // ================== ⬇ Media Stream Handlers ⬇️ ==================
  async function videoHandler(mediaStream: MediaStream) {
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
    await encodeVideo(videoReader);
  }

  // 50 FPS: 1(0) key frame + 49 delta frames(1~49)
  let isKeyFrame = true;
  let frameIndex = 0;
  async function encodeVideo(reader: ReadableStreamDefaultReader<VideoFrame>) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (videoEncoderRef.current) {
        if (frameIndex === 0) {
          isKeyFrame = true;
        } else {
          isKeyFrame = false;
        }
        videoEncoderRef.current.encode(value, { keyFrame: isKeyFrame });
        // console.log(`🎥 Encoded video: ${isKeyFrame ? "key" : "delta"} frame ${frameIndex}`);
        frameIndex++;
        if (frameIndex >= 50) {
          frameIndex = 0;
        }
      }
      value.close();
    }
  }

  async function audioHandler(mediaStream: MediaStream) {
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
    await encodeAudio(audioReader);
  }

  async function encodeAudio(reader: ReadableStreamDefaultReader<AudioData>) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (audioEncoderRef.current) {
        // console.log(`🔊 One AudioData obj duration: ${value.duration}`); // 10000 microseconds
        audioEncoderRef.current.encode(value);
      }
      value.close();
    }
  }

  function serializeEncodedChunk(chunk: EncodedVideoChunk | EncodedAudioChunk) {
    const buffer = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(buffer);

    const chunkType = chunk instanceof EncodedVideoChunk ? 1 : 0;
    const key = chunk.type === "key" ? 1 : 0;

    const encodedChunk = {
      type: chunkType, // 1: video, 0: audio
      key: chunk.type, // 1: key, 0: delta
      timestamp: chunk.timestamp,
      duration: 20000,
      data: buffer,
    };

    // if (chunkType === 1) {
    //   console.log(`🔄 video chunk timestamp: ${chunk.timestamp}, frame type ${chunk.type}`);
    // } else {
    //   console.log(
    //     `🔄 audio chunk timestamp: ${chunk.timestamp}, duration: ${chunk.duration}, audio type: ${chunk.type}`,
    //   );
    // }

    const chunkTypeBytes = new Uint8Array([chunkType]);
    const keyBytes = new Uint8Array([key]);
    const timestampBytes = new Float64Array([encodedChunk.timestamp]);
    const durationBytes = new Float64Array([encodedChunk.duration]);
    const dataBytes = new Uint8Array(encodedChunk.data);

    const totalLength = 1 + 1 + 8 + 8 + dataBytes.byteLength;
    const serializeBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(serializeBuffer);

    new Uint8Array(serializeBuffer, 0, 1).set(chunkTypeBytes);
    new Uint8Array(serializeBuffer, 1, 1).set(keyBytes);
    view.setFloat64(2, timestampBytes[0], true);
    view.setFloat64(10, durationBytes[0], true);
    new Uint8Array(serializeBuffer, 18, dataBytes.byteLength).set(dataBytes);

    serializedEncodedChunks(serializeBuffer, chunkType, chunk.type);
  }

  let encodedAudioChunks: ArrayBuffer[] = [];
  let encodedVideoChunks: ArrayBuffer[] = [];
  let audioChunkIndex = 0;
  let videoFrameIndex = 0;
  let keyFrameSet = false;
  // encode 50 frames or 1 sec of audio chunks(100 chunks) into a single ArrayBuffer to send away
  async function serializedEncodedChunks(buffer: ArrayBuffer, chunkType: Number, key: string) {
    if (chunkType === 0) {
      encodedAudioChunks.push(buffer);
      audioChunkIndex++;
      if (audioChunkIndex == 100) {
        await combineChunks(encodedAudioChunks, "audio");
        audioChunkIndex = 0;
        encodedAudioChunks.length = 0;
      }
    } else {
      // key frame at index 0, then add incoming delta frames until another key frame
      if (key === "key" && !keyFrameSet) {
        // console.log("🔑 Key Frame Set at index (init):", videoFrameIndex);
        encodedVideoChunks.push(buffer);
        keyFrameSet = true;
        videoFrameIndex++;
      }

      if (keyFrameSet && key === "key") {
        // add key frame at index 0, then add incoming delta frames until another key frame
        encodedVideoChunks.push(buffer);
        await combineChunks(encodedVideoChunks.slice(0, -1), "hd");

        const newKeyFrame = encodedVideoChunks[encodedVideoChunks.length - 1];
        encodedVideoChunks.length = 0;
        videoFrameIndex = 0;
        encodedVideoChunks.push(newKeyFrame);
        // console.log("🔑 Key Frame Set at index:", videoFrameIndex);
        videoFrameIndex++;
      } else {
        encodedVideoChunks.push(buffer);
        // console.log("🔲 Delta Frame Set at index:", videoFrameIndex);
        videoFrameIndex++;
      }
    }
  }

  async function combineChunks(encodedChunks: ArrayBuffer[], type: string) {
    let totalSize = 0;
    encodedChunks.forEach((frame) => {
      totalSize += 4 + frame.byteLength;
    });

    const totalBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(totalBuffer);

    let offset = 0;
    encodedChunks.forEach((frame) => {
      view.setUint32(offset, frame.byteLength, true);
      offset += 4;
      new Uint8Array(totalBuffer, offset, frame.byteLength).set(new Uint8Array(frame));
      offset += frame.byteLength;
    });
    await sendEncodedChunk(type, totalBuffer);
  }

  let audioGroupId = 0;
  let audioObjId = 0;
  let hdGroupId = 0;
  let hdObjId = 0;
  // send the encoded chunk(1 sec of video or audio) to the server
  async function sendEncodedChunk(mt: string, totalBuffer: ArrayBuffer) {
    let id = mediaType.get(mt);
    if (id) {
      let groupId = mt === "audio" ? audioGroupId : hdGroupId;
      let objId = mt === "audio" ? audioObjId : hdObjId;
      await writeMediaStream(id, id, groupId, objId, 0, 0, new Uint8Array(totalBuffer));
      // console.log(
      //   `${mt === "audio" ? "🔊" : "🎥"} Sent 1 sec of ${mt} chunk: groupId ${groupId}, objId ${objId}, ${totalBuffer.byteLength} bytes`,
      // );

      // 1 group = 60 objs = 1 min
      if (mt === "audio") {
        audioObjId++;
        if (audioObjId >= 60) {
          audioObjId = 0;
          audioGroupId++;
        }
      } else {
        hdObjId++;
        if (hdObjId >= 60) {
          hdObjId = 0;
          hdGroupId++;
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
