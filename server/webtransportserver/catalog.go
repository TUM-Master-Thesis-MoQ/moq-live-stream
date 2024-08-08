package webtransportserver

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
