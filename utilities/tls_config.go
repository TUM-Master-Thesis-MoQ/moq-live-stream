package utilities

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"math/big"
	"time"
)

var logger = NewCustomLogger()

func LoadTLSConfig() *tls.Config {
	// load key and cert from files
	cert, err := tls.LoadX509KeyPair("./utilities/localhost.pem", "./utilities/localhost-key.pem")
	if err != nil {
		logger.Fatal(err)
	}

	// certHash := sha256.Sum256(cert.Certificate[0])

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		// NextProtos:   []string{"h3, moq-00"}, // NextProtos: []string{"h3", "moq-00"}, is obsolete if the client is web client (via moqjs)
	}

	// return tlsConfig, certHash[:]
	return tlsConfig
}

func GenerateTLSConfig() (*tls.Config, []byte) {
	key, cert := generateKeyAndCert()
	certPem, keyPem := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Raw}), pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})

	tlsCert, err := tls.X509KeyPair(certPem, keyPem)
	if err != nil {
		logger.Fatal(err)
	}

	certHash := sha256.Sum256(cert.Raw)

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{tlsCert},
		NextProtos:   []string{"quic-echo-example"}, // NextProtos: []string{"h3", "moq-00"}, is obsolete if the client is web client (via moqjs)
	}

	return tlsConfig, certHash[:]
}

func generateKeyAndCert() (*rsa.PrivateKey, *x509.Certificate) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		logger.Fatal(err)
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
		logger.Fatal(err)
	}

	return priv, &x509.Certificate{Raw: certBytes}
}
