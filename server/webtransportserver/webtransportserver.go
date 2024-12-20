package webtransportserver

import (
	"errors"
	"moqlivestream/utilities"
	"net/http"
	"os"
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

	err := os.Setenv("QLOGDIR", "log/qlog")
	if err != nil {
		log.Fatalf("❌ error setting qlog dir: %v", err)
	}

	if _, err := os.Stat("log/qlog"); os.IsNotExist(err) {
		os.Mkdir("log/qlog", 0755)
	}

	TracerManager := NewTracerManager()
	EntityManager := NewEntityManager()
	wtS := webtransport.Server{
		H3: http3.Server{
			Addr:       "10.0.2.1:443",
			TLSConfig:  utilities.LoadTLSConfig(),
			QUICConfig: NewQuicConfig(TracerManager, EntityManager),
		},
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	// webtransport endpoint for the streamer
	http.HandleFunc("/webtransport/streamer", func(w http.ResponseWriter, r *http.Request) {
		session, err := originCheckAndSessionUpgrade(&wtS, w, r)
		if err != nil {
			log.Printf("❌ error upgrading session: %v", err)
			return
		}

		// init with uuid string as name, updated when the streamer sends the ANNOUNCE(channel name) message
		streamer, err := channelmanager.InitStreamer()
		if err != nil {
			log.Printf("❌ error creating streamer: %v", err)
		}
		log.Printf("🆕 Streamer & channel created: %s", streamer.Channel.Name)

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
			log.Printf("failed to run streamer server: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		streamer.Channel.SetSession(moqSession)
		log.Println("🪵 streamer moqt session initialized & running")

		EntityManager.AddEntity(streamer)
	})

	// webtransport endpoint for the audience
	http.HandleFunc("/webtransport/audience", func(w http.ResponseWriter, r *http.Request) {
		session, err := originCheckAndSessionUpgrade(&wtS, w, r)
		if err != nil {
			log.Printf("❌ error upgrading session: %v", err)
			return
		}

		// init with uuid string as name, can be updated later if needed
		audience, err := audiencemanager.NewAudience()
		if err != nil {
			log.Printf("❌ error creating audience: %v", err)
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
		log.Println("🪵 audience moqt session initialized & running")

		EntityManager.AddEntity(audience)

		if err := moqSession.Announce(r.Context(), "channels"); err != nil {
			log.Printf("❌ error announcing ns 'channels': %v", err)
		} else {
			log.Println("📢 Announced namespace: channels")
		}
	})

	if err := wtS.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func originCheckAndSessionUpgrade(wtS *webtransport.Server, w http.ResponseWriter, r *http.Request) (*webtransport.Session, error) {
	origin := r.Header.Get("Origin")
	matchOrigin, _ := regexp.MatchString(`^https://(10\.0\.\d+\.\d+|localhost)`, origin)
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
