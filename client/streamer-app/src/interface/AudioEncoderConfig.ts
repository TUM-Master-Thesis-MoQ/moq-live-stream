export interface AudioEncoderConfig {
  codec: string;
  sampleRate: number;
  bitrate: number;
  numberOfChannels: number;
  opus: {
    frameDuration: number;
  };
}
