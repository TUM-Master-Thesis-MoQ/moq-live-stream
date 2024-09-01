package audiencemanager

import (
	"errors"
	"moqlivestream/component/audience"
	"moqlivestream/utilities"
	"sync"
)

var log = utilities.NewCustomLogger()

type AudienceManager struct {
	Audiences []*audience.Audience
	mutex     sync.Mutex
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
func NewAudience(name string) (*audience.Audience, error) {
	am := InitAudienceManager()

	am.mutex.Lock()
	defer am.mutex.Unlock()

	// check if audience name is unique
	if !AudienceUnique(name) {
		return nil, errors.New("audience registration currently not available, tempAudience name in use")
	}

	newAudience := audience.NewAudience(name)
	am.Audiences = append(am.Audiences, newAudience)
	return newAudience, nil
}

// remove an Audience from the AudienceManager's Audiences list
func RemoveAudience(name string) error {
	am := InitAudienceManager()

	am.mutex.Lock()
	defer am.mutex.Unlock()

	for i, a := range am.Audiences {
		if a.Name == name {
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

// check if an Audience name is unique in the AudienceManager
func AudienceUnique(name string) bool {
	am := InitAudienceManager()

	for _, a := range am.Audiences {
		if a.Name == name {
			return false
		}
	}
	return true
}
