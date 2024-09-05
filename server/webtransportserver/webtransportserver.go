package webtransportserver

import (
	"errors"
	"moqlivestream/utilities"
	"net/http"
	"regexp"

	"moqlivestream/component/audiencemanager"
	"moqlivestream/component/channelmanager"

	"github.com/mengelbart/moqtransport"
	"github.com/mengelbart/moqtransport/webtransportmoq"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"
)

var log = utilities.NewCustomLogger()

func StartServer() {

	wtS := webtransport.Server{
		H3: http3.Server{
			Addr:      ":443",
			TLSConfig: utilities.LoadTLSConfig(),
		},
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	// webtransport endpoint for streamers
	http.HandleFunc("/webtransport/streamer", func(w http.ResponseWriter, r *http.Request) {
		session, err := originCheckAndSessionUpgrade(&wtS, w, r)
		if err != nil {
			log.Printf("❌ error upgrading session: %s", err)
			return
		}

		// init with uuid string as name, will be updated when the streamer sends the ANNOUNCE(catalog-ns) message
		streamer, err := channelmanager.InitStreamer()
		if err != nil {
			log.Printf("❌ error creating channel: %s", err)
		}
		log.Printf("🆕 Streamer created (channel name): %s", streamer.Channel.Name)

		sm := newSessionManager(streamer, nil) // save current streamer to the session manager for easier retrieval
		moqSession := &moqtransport.Session{
			Conn:                webtransportmoq.New(session),
			EnableDatagrams:     false,
			LocalRole:           moqtransport.RoleSubscriber,
			RemoteRole:          moqtransport.RolePublisher,
			AnnouncementHandler: sm,
			SubscriptionHandler: nil,
		}
		if err := moqSession.RunServer(r.Context()); err != nil {
			log.Printf("failed to run server: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		streamer.Channel.SetSession(moqSession)
		log.Println("🪵 streamer moqt session initialized")
	})

	// webtransport endpoint for the audience
	http.HandleFunc("/webtransport/audience", func(w http.ResponseWriter, r *http.Request) {
		session, err := originCheckAndSessionUpgrade(&wtS, w, r)
		if err != nil {
			log.Printf("❌ error upgrading session: %s", err)
			return
		}

		audience, err := audiencemanager.NewAudience()
		if err != nil {
			log.Printf("❌ error creating audience: %s", err)
			return
		}
		log.Printf("🆕 Audience created: %s,", audience.Name)

		sm := newSessionManager(nil, audience) // save current audience to the session manager for easier retrieval
		moqSession := &moqtransport.Session{
			Conn:                webtransportmoq.New(session),
			EnableDatagrams:     false,
			LocalRole:           moqtransport.RolePublisher,
			RemoteRole:          moqtransport.RoleSubscriber,
			AnnouncementHandler: nil,
			SubscriptionHandler: sm,
		}
		if err := moqSession.RunServer(r.Context()); err != nil {
			log.Printf("failed to run audience server: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		} else {
			log.Println("🪵 moqt audience client running...")
		}
		audience.SetSession(moqSession)
		log.Println("🪵 audience moqt session initialized")

		if err := moqSession.Announce(r.Context(), "channels"); err != nil {
			log.Printf("❌ error announcing ns 'channels': %s", err)
		} else {
			log.Println("📢 Announced namespace: 'channels'")
		}
	})

	if err := wtS.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func originCheckAndSessionUpgrade(wtS *webtransport.Server, w http.ResponseWriter, r *http.Request) (*webtransport.Session, error) {
	origin := r.Header.Get("Origin")
	matchOrigin, _ := regexp.MatchString(`^https://localhost:`, origin)
	if origin == "" || matchOrigin {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		w.WriteHeader(http.StatusOK)
	} else {
		log.Printf("❌ Origin not allowed: %s", origin)
		http.Error(w, "Origin not allowed", http.StatusForbidden)
		return nil, errors.New("origin not allowed")
	}

	session, err := wtS.Upgrade(w, r)
	if err != nil {
		log.Printf("❌ wts upgrading failed: %s", err)
		return nil, errors.New("wts upgrading failed")
	}

	return session, nil
}
