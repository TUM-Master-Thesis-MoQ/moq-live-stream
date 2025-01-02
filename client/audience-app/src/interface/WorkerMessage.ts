export interface MetaWorkerMessage {
  action: string;
  channelList?: string[];
  trackNames?: string[];
}

export interface VideoDecoderWorkerMessage {
  action: string;
  frame?: EncodedVideoChunk;
  timestamp?: number;
}
