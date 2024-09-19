package catalog

import "encoding/json"

type Catalog struct {
	Version                int               `json:"version"`
	StreamingFormat        int               `json:"streamingFormat"`
	StreamingFormatVersion string            `json:"streamingFormatVersion"`
	CommonTrackFields      CommonTrackFields `json:"commonTrackFields"`
	Tracks                 []Track           `json:"tracks"`
}

type CommonTrackFields struct {
	Namespace   string `json:"namespace"`
	Packaging   string `json:"packaging"`
	RenderGroup int    `json:"renderGroup"`
}

type Track struct {
	Name            string          `json:"name"`
	Label           string          `json:"label,omitempty"` // omitempty to handle cases where "label" might not be present
	SelectionParams SelectionParams `json:"selectionParams"`
	AltGroup        int             `json:"altGroup,omitempty"` // omitempty to handle cases where "altGroup" might not be present
}

type SelectionParams struct {
	Codec         string `json:"codec"`
	MimeType      string `json:"mimeType"`
	Width         int    `json:"width,omitempty"` // omitempty for fields that might not be present (e.g., in audio tracks)
	Height        int    `json:"height,omitempty"`
	Framerate     int    `json:"framerate,omitempty"`
	Bitrate       int    `json:"bitrate"`
	Samplerate    int    `json:"samplerate,omitempty"`
	ChannelConfig string `json:"channelConfig,omitempty"`
}

// serialize a Catalog struct into bytes
func (c *Catalog) Serialize() ([]byte, error) {
	catalogBytes, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	return catalogBytes, nil
}

// parse catalog bytes into a Catalog struct
func ParseCatalog(catalogBytes []byte) (*Catalog, error) {
	var catalog Catalog
	err := json.Unmarshal(catalogBytes, &catalog)
	if err != nil {
		return nil, err
	}
	return &catalog, nil
}

// serialize a Track struct into bytes
func (t *Track) Serialize() ([]byte, error) {
	trackBytes, err := json.Marshal(t)
	if err != nil {
		return nil, err
	}
	return trackBytes, nil
}

type TracksWrapper struct {
	Tracks []Track `json:"tracks"`
}

// serialize all tracks in a Catalog struct into bytes
func (c *Catalog) SerializeTracks() ([]byte, error) {
	wrapper := TracksWrapper{Tracks: c.Tracks}
	tracksBytes, err := json.Marshal(wrapper)
	if err != nil {
		return nil, err
	}
	return tracksBytes, nil
}

// parse track bytes into a Track struct
func ParseTrack(trackBytes []byte) (*Track, error) {
	var track Track
	err := json.Unmarshal(trackBytes, &track)
	if err != nil {
		return nil, err
	}
	return &track, nil
}

// parse all track bytes into Track structs
func ParseTracks(trackBytes []byte) ([]Track, error) {
	var tracks []Track
	err := json.Unmarshal(trackBytes, &tracks)
	if err != nil {
		return nil, err
	}
	return tracks, nil
}
