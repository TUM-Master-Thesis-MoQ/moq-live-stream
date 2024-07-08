// src/types/webcodecs.d.ts
declare global {
  interface MediaStreamTrackProcessor {
    readable: ReadableStream;
    // Add any other properties or methods you need
  }

  interface MediaStreamTrackProcessorConstructor {
    new (track: MediaStreamTrack): MediaStreamTrackProcessor;
  }

  var MediaStreamTrackProcessor: MediaStreamTrackProcessorConstructor;
}

export {};
