// track JSON obj parser
export interface CatalogJSON {
  version: number;
  streamingFormat: number;
  streamingFormatVersion: string;
  commonTrackFields: {
    namespace: string;
    packaging: string;
    renderGroup: number;
  };
  tracks: Track[];
}
interface Track {
  name: string;
  label?: string;
  selectionParams: SelectionParams;
  altGroup?: number;
}
interface SelectionParams {
  codec: string;
  mimeType: string;
  width?: number;
  height?: number;
  framerate?: number;
  bitrate: number;
  samplerate?: number;
  channelConfig?: string;
}
