package channel

import "github.com/google/uuid"

type SubscriberInterface interface {
	GetID() uuid.UUID
	GetName() string
	Subscribe(ch *Channel)
	Unsubscribe(ch *Channel)
	ChangeResolution(ch *Channel, resolution string)
	SendMessage(ch *Channel, message string)
}
