import { TracksJSON } from "../interface/TracksJSON";
import { MetaWorkerMessage } from "../interface/WorkerMessage";

self.onmessage = async function (e: any) {
  const { action, readableStream } = e.data;
  const reader = readableStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      console.log(`📜 Received meta obj: ${value.length} bytes`);
      if (action === "channels") {
        const channelListDecoder = new TextDecoder();
        try {
          const text = channelListDecoder.decode(value);
          let channelList: string[] = JSON.parse(text);
          console.log(`🔻 Worker: 🅾️channelList🅾️: ${channelList}`);
          const msg: MetaWorkerMessage = { action: "channelList", channelList };
          postMessage(msg);
        } catch (error) {
          console.error("❌ Failed to decode channel list:", error);
          return;
        }
      } else if (action === "tracks") {
        const tracksDecoder = new TextDecoder();
        try {
          const text = tracksDecoder.decode(value);
          try {
            const tracksJSON: TracksJSON = await JSON.parse(text);
            console.log("🔻 Worker: 🅾️tracks🅾️:", tracksJSON);
            // extract track names except audio track
            const trackNames = tracksJSON.tracks
              .filter((track) => track.name !== "audio") // filter out audio and keep video rate adaptation tracks // && !track.name.endsWith("-ra")
              .map((track) => track.name);
            console.log("🔔 Tracks list(trackNames): " + trackNames);
            const msg: MetaWorkerMessage = { action: "trackNames", trackNames };
            postMessage(msg);
          } catch (err) {
            console.log("❌ Failed to decode tracksJSON:", err);
            return;
          }
        } catch (err) {
          console.log("❌ Failed to decode tracks text:", err);
          return;
        }
      }
    }
    if (done) {
      break;
    }
  }
};
