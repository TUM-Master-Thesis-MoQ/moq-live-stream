package streamer

import (
	"errors"
	"moqlivestream/component/channel"

	"github.com/google/uuid"
)

type Streamer struct {
	ID      uuid.UUID
	Name    string
	Channel *channel.Channel
}

func NewStreamer() *Streamer {
	id := uuid.New()
	return &Streamer{
		ID:      id,
		Name:    id.String(),
		Channel: nil,
	}
}

// start streaming, obtain a Channel from ChannelManager
func (s *Streamer) StartStreaming() error {
	if s == nil {
		return errors.New("streamer is nil")
	}
	if s.Channel == nil {
		return errors.New("channel is nil")
	}

	s.Channel.Status = true
	return nil
}

// stop streaming, set Channel status to false
func (s *Streamer) StopStreaming() error {
	if s == nil {
		return errors.New("streamer is nil")
	}
	if s.Channel == nil {
		return errors.New("channel is nil")
	}

	s.Channel.RemoveSession()
	return nil
}
