package message

import (
	"time"

	"github.com/google/uuid"
)

type Message struct {
	ID           uuid.UUID
	SubscriberID uuid.UUID
	TimeStamp    time.Time
	MsgContent   string
}

func NewMessage(subscriberID uuid.UUID, msgContent string) *Message {
	return &Message{
		ID:           uuid.New(),
		SubscriberID: subscriberID,
		TimeStamp:    time.Now(),
		MsgContent:   msgContent,
	}
}
