// track JSON obj parser
export interface TracksJSON {
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
