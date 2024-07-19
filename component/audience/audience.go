package audience

import (
	"errors"
	"sync"

	"github.com/google/uuid"
	"github.com/quic-go/webtransport-go"
)

// obsolete for now, since there isn't any complex meta linked to a Audience
type Audience struct {
	ID      uuid.UUID
	Name    string
	Session *webtransport.Session
	Mutex   sync.Mutex
}

// create a new Subscriber
func NewAudience(name string) *Audience {
	return &Audience{
		ID:      uuid.New(),
		Name:    name,
		Session: nil, // list of Audience's WebTransport sessions (one audience has one session)
	}
}

// add a WebTransport session to the Channel's Sessions list
func (au *Audience) AddSession(session *webtransport.Session) error {
	if session == nil {
		return errors.New("session is nil")
	}
	if au == nil {
		return errors.New("channel is nil")
	}

	au.Mutex.Lock()
	defer au.Mutex.Unlock()

	au.Session = session
	return nil
}

// remove a WebTransport session from the Channel's Sessions list
func (au *Audience) RemoveSession() error {
	if au == nil {
		return errors.New("channel is nil")
	}

	au.Mutex.Lock()
	defer au.Mutex.Unlock()

	au.Session = nil

	return nil
}
