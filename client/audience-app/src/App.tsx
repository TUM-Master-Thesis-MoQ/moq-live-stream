import { FaSearch } from "react-icons/fa";
import { useState, useRef } from "react";

import { Session } from "moqjs/src/session";
import { ControlStream } from "moqjs/src/control_stream";
import { Message, MessageType } from "moqjs/src/messages";

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

  const [channelList, setChannelList] = useState<string[]>([]);
  const [tracksRequested, setTracksRequested] = useState<boolean>(false);
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

  function controlMessageListener(session: Session) {
    session.controlStream.onmessage = async (m: Message) => {
      switch (m.type) {
        case MessageType.Announce:
          switch (m.namespace) {
            case "channels": //! A2: announce "channels"
              // // TODO: subs for channel list []string: subscribe("channels", "channelListTrack")
              console.log("🔔 Received Announce msg:", m.namespace);
              session.announceOk(m.namespace);
              console.log("🔔 Sent AnnounceOk msg:", m.namespace);
              // subscribe(session, m.namespace, "channelListTrack"); //! S1: route it to subscribe to channelListTrack
              break;

            default: //! A0: announce {regular channel name}
              // // TODO: handle regular namespace(channel's name) announce
              if (session) {
                session.announceOk(m.namespace);
                if (tracksRequested) {
                  // subscribe(session, m.namespace, "catalogTrack"); //! S2: route it to subscribe to catalogTrack
                } else {
                  // TODO: audience selects a track to subscribe
                  const selectedTrack = "";
                  // subscribe(session, m.namespace, selectedTrack); //! S0: route it to subscribe to selectedTrack
                }
              }
              setWatchingChannel(m.namespace);
              break;
          }
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

        // ? New in Draft # ?
        // case MessageType.TrackStatus:
        //   console.log("🔵 Received TrackStatus on trackId:", m.trackId);
        //   break;

        case MessageType.StreamHeaderGroup:
          console.log("🔵 Received StreamHeaderGroup:", m.groupId);
          break;

        case MessageType.ObjectStream || MessageType.ObjectDatagram:
          session?.conn.close();
          console.log(`❌ ${m.type} on control stream, session closed.`);
          break;

        default:
          session?.conn.close();
          console.log(`❌ Unknown message type: ${m.type}, session closed.`);
          break;
      }
    };
  }

  // subscribe to a track with namespace and trackName
  async function subscribe(session: Session, namespace: string, trackName: string) {
    try {
      const { subscribeId, readableStream } = await session.subscribe(namespace, trackName);
      console.log(`🔔 Subscribed to ${namespace}:${trackName} with subscribeId: ${subscribeId}`);

      const reader = readableStream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          // // TODO: handle data based on trackName
          // TODO: unwrap data to see msg type
          switch (trackName) {
            case "channelListTrack": //! S1: request for channelListTrack obj
              const decoder0 = new TextDecoder();
              try {
                const text = decoder0.decode(value);
                const channelList: string[] = JSON.parse(text);
                setChannelList(channelList);
                console.log(`📜 Channel List: ${channelList}`);
              } catch (error) {
                console.error("❌ Failed to decode channel list:", error);
              }
              session.unsubscribe(subscribeId);
              // after getting the channel list, trigger server to announce selected channel
              // TODO: audience select a channel from the list to subscribe to
              session.subscribe(channelList[0], ""); //! S2: select the first channel from the list, to trigger the server to announce that channel
              setTracksRequested(true);
              break;

            case "": //! S2: request for ANNOUNCE msg with {namespace}
              // no data to received, but should get another ANNOUNCE msg with {namespace}
              session.unsubscribe(subscribeId);
              break;

            case "catalogTrack": //! S3: request for catalog track obj
              // TODO: send catalog JSON to frontend UI and audience selects a track to subscribe
              const decoder1 = new TextDecoder();
              try {
                const text = decoder1.decode(value);
                const tracks: TracksJSON = JSON.parse(text);
                console.log(`📜 Tracks: ${tracks}`);
              } catch (error) {
                console.error("❌ Failed to decode catalog:", error);
              }
              session.unsubscribe(subscribeId);
              break;

            default: //! S0: sub to media stream track
              // // TODO: unwrap the objMsg payload and decode the chunk
              const objMsgPayload = await session.readIncomingUniStream(value);
              // if (objMsgPayload) {
              //   await deserializeEncodedChunk(objMsgPayload);
              // }
              break;
          }
        }
        if (done) {
          break;
        }
      }
    } catch (error) {
      console.log("❌ Failed to subscribe:", error);
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
