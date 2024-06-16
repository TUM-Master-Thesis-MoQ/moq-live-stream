package streamer

import (
	"errors"
	"moq-end2end/component/channel"

	"github.com/google/uuid"
)

type Streamer struct {
	ID      uuid.UUID
	Name    string
	Channel *channel.Channel
}

func NewStreamer(name string) *Streamer {
	return &Streamer{
		ID:      uuid.New(),
		Name:    name,
		Channel: nil,
	}
}

// start streaming, obtain a Channel from ChannelManager
func (s *Streamer) StartStreaming(ch *channel.Channel) error {
	if s == nil {
		return errors.New("streamer is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	s.Channel = ch
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

	s.Channel.Status = false
	return nil
}
