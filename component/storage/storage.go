package storage

import (
	"encoding/gob"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// save an object to a file
func Save(filePath string, object interface{}) error {
	filePath = ensureGobExtension(filepath.Join("./data", filePath))

	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, os.ModePerm); err != nil {
		return err
	}

	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := gob.NewEncoder(file)
	if err := encoder.Encode(object); err != nil {
		return err
	}

	return nil
}

// load an object from a file
func Load(filePath string, object interface{}) error {
	filePath = ensureGobExtension(filepath.Join("./data", filePath))

	file, err := os.Open(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return errors.New("file does not exist")
		}
		return err
	}
	defer file.Close()

	decoder := gob.NewDecoder(file)
	if err := decoder.Decode(object); err != nil {
		return err
	}

	return nil
}

// ensure the file path has the .gob extension
func ensureGobExtension(filePath string) string {
	if !strings.HasSuffix(filePath, ".gob") {
		filePath += ".gob"
	}
	return filePath
}
