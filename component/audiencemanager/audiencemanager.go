package audiencemanager

import (
	"errors"
	"moqlivestream/component/audience"
	"moqlivestream/utilities"
	"sync"

	"github.com/google/uuid"
	"github.com/mengelbart/moqtransport"
)

var log = utilities.NewCustomLogger()

type AudienceManager struct {
	Audiences []*audience.Audience
	Mutex     sync.Mutex
}

var (
	am     *AudienceManager
	amOnce sync.Once
)

func InitAudienceManager() *AudienceManager {
	amOnce.Do(func() {
		am = &AudienceManager{
			Audiences: []*audience.Audience{},
		}
		log.Println("🪵 AudienceManager initialized")
	})
	return am
}

// create a new Audience and add it to the AudienceManager's Audiences list
func NewAudience() (*audience.Audience, error) {
	am := InitAudienceManager()

	am.Mutex.Lock()
	defer am.Mutex.Unlock()

	newAudience := audience.NewAudience()
	am.Audiences = append(am.Audiences, newAudience)
	return newAudience, nil
}

// remove an Audience from the AudienceManager's Audiences list
func RemoveAudience(id uuid.UUID) error {
	am := InitAudienceManager()

	am.Mutex.Lock()
	defer am.Mutex.Unlock()

	for i, a := range am.Audiences {
		if a.ID == id {
			am.Audiences = append(am.Audiences[:i], am.Audiences[i+1:]...)
			return nil
		}
	}
	return errors.New("audience not found")
}

// get a list of names of all Audiences in the AudienceManager
func GetAudienceNames() []string {
	am := InitAudienceManager()

	audienceNames := make([]string, len(am.Audiences))
	for i, a := range am.Audiences {
		audienceNames[i] = a.Name
	}
	return audienceNames
}

// get an Audience by ID from the AudienceManager
func GetAudienceByID(id uuid.UUID) (*audience.Audience, error) {
	am := InitAudienceManager()

	for _, a := range am.Audiences {
		if a.ID == id {
			return a, nil
		}
	}
	return nil, errors.New("audience not found")
}

// get an Audience by name from the AudienceManager
func GetAudienceByName(name string) (*audience.Audience, error) {
	am := InitAudienceManager()

	for _, a := range am.Audiences {
		if a.Name == name {
			return a, nil
		}
	}
	return nil, errors.New("audience not found")
}

// get an Audience by its session from the AudienceManager
func GetAudienceBySession(session *moqtransport.Session) (*audience.Audience, error) {
	am := InitAudienceManager()

	am.Mutex.Lock()
	defer am.Mutex.Unlock()

	for _, a := range am.Audiences {
		if a.Session == session {
			return a, nil
		}
	}
	return nil, errors.New("audience not found")
}

// check if an Audience(ID) is unique in the AudienceManager
func AudienceUnique(id uuid.UUID) bool {
	am := InitAudienceManager()

	for _, a := range am.Audiences {
		if a.ID == id {
			return false
		}
	}
	return true
}
