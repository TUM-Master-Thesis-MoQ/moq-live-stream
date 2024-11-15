package audience

import (
	"errors"
	"sync"

	"github.com/google/uuid"
	"github.com/mengelbart/moqtransport"
)

// obsolete for now, since there isn't any complex meta linked to a Audience
type Audience struct {
	ID      uuid.UUID // 128 bit hex string
	Name    string
	Session *moqtransport.Session
	Mutex   sync.Mutex
}

// create a new Subscriber
func NewAudience() *Audience {
	id := uuid.New()
	return &Audience{
		ID:      id, // temporary, will be updated when the audience sends the SUBSCRIBE message
		Name:    id.String(),
		Session: nil, // list of Audience's WebTransport sessions (one audience has one session)
	}
}

// add a WebTransport session to the Channel's Sessions list
func (au *Audience) SetSession(session *moqtransport.Session) error {
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
