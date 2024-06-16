package subscriber

import "github.com/google/uuid"

type ChannelInterface interface {
	GetID() uuid.UUID
	GetName() string
	AddSubscriber(sub *Subscriber)
	RemoveSubscriber(sub *Subscriber)
	AddAudience(sub *Subscriber)
	RemoveAudience(sub *Subscriber)
	ChangeResolution(sub *Subscriber, resolution string)
	SendMessage(sub *Subscriber, message string)
}
