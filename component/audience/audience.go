package audience

import (
	"github.com/google/uuid"
)

// obsolete for now, since there isn't any complex meta linked to a Audience
type Audience struct {
	ID   uuid.UUID
	Name string
}

// create a new Subscriber
func NewAudience(name string) *Audience {
	return &Audience{
		ID:   uuid.New(),
		Name: name,
	}
}
