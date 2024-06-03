package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"math/big"
	"sync"
	"time"

	"github.com/quic-go/quic-go"
)

type connection struct {
	sessions map[string]quic.Connection
	mutex    sync.Mutex
}

func newConnection() *connection {
	return &connection{
		sessions: make(map[string]quic.Connection),
	}
}

// addSession adds a new session to the connection map
func (c *connection) addSession(conn quic.Connection) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	clientAddr := conn.RemoteAddr().String()
	c.sessions[clientAddr] = conn
}

// removeSession removes a session from the connection map
func (c *connection) removeSession(conn quic.Connection) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	clientAddr := conn.RemoteAddr().String()
	delete(c.sessions, clientAddr)
}

func (c *connection) handleSession(conn quic.Connection) {
	defer c.removeSession(conn)
	fmt.Println("New session accepted from", conn.RemoteAddr())

	for {
		stream, err := conn.AcceptStream(context.Background())
		if err != nil {
			log.Printf("Error accepting stream from %s: %v\n", conn.RemoteAddr(), err)
			return
		}

		go c.handleStream(stream, conn)
	}
}

func (c *connection) handleStream(stream quic.Stream, conn quic.Connection) {
	defer stream.Close()
	buf := make([]byte, 1024)
	for {
		n, err := stream.Read(buf)
		if err != nil {
			if err == io.EOF {
				// EOF is expected when the client closes the stream
				fmt.Printf(" [Stream closed by %s]\n", conn.RemoteAddr())
				return
			}
			log.Printf(" [Error reading from stream of session %s: %v]", conn.RemoteAddr(), err)
			return
		}

		fmt.Printf("[msg] %s: %s", conn.RemoteAddr(), string(buf[:n]))

		_, err = stream.Write([]byte("Message sent!✅"))
		if err != nil {
			log.Printf("Error writing to stream of session %s: %v", conn.RemoteAddr(), err)
			return
		}

	}
}

func main() {
	// Initialize the QUIC server
	listener, err := quic.ListenAddr("localhost:4242", generateTLSConfig(), nil)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("Server is listening on port 4242")

	// Accept incoming connections
	connMgr := newConnection()
	for {
		conn, err := listener.Accept(context.Background())
		if err != nil {
			log.Println("Error accepting session:", err)
			continue
		}
		connMgr.addSession(conn)
		go connMgr.handleSession(conn)
	}
}

func generateTLSConfig() *tls.Config {
	key, cert := generateKeyAndCert()
	certPem, keyPem := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Raw}), pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})

	tlsCert, err := tls.X509KeyPair(certPem, keyPem)
	if err != nil {
		log.Fatal(err)
	}

	return &tls.Config{
		Certificates: []tls.Certificate{tlsCert},
		NextProtos:   []string{"quic-echo-example"},
	}
}

func generateKeyAndCert() (*rsa.PrivateKey, *x509.Certificate) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		log.Fatal(err)
	}

	template := x509.Certificate{
		SerialNumber:          big.NewInt(1),
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	certBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		log.Fatal(err)
	}

	return priv, &x509.Certificate{Raw: certBytes}
}
