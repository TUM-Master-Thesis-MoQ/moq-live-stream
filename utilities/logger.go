package utilities

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// A custom logger that prefixes log messages with the caller's file name and line number.
type CustomLogger struct {
	logger *log.Logger
}

// NewCustomLogger creates a new custom logger
func NewCustomLogger() *CustomLogger {
	return &CustomLogger{
		logger: log.New(os.Stdout, "", 0), // No flags, so no timestamp
	}
}

// logMessage logs a message with a given log level
func (cl *CustomLogger) logMessage(message string, opts ...string) {
	level := "INFO"

	// If a log level is provided, use it
	if len(opts) > 0 {
		level = opts[0]
	}

	// Retrieve the file name and line number
	_, file, line, ok := runtime.Caller(2) // Caller(2) to get the caller of log.Print/Error/Info
	if !ok {
		file = "unknown"
		line = 0
	}

	// Extract just the file name from the full path and remove the extension
	shortFile := filepath.Base(file)

	// Remove the file extension
	shortFile = strings.TrimSuffix(shortFile, ".go")

	// Format the log message with file name and line number
	formattedMessage := fmt.Sprintf("%s #%d: %s %s", shortFile, line, message, level)
	cl.logger.Print(formattedMessage)
}

// Print logs a general message
func (cl *CustomLogger) Print(v ...interface{}) {
	cl.logMessage("", fmt.Sprint(v...))
}

// Printf logs a formatted general message
func (cl *CustomLogger) Printf(format string, v ...interface{}) {
	cl.logMessage("", fmt.Sprintf(format, v...))
}

// Println logs a general message with a newline
func (cl *CustomLogger) Println(v ...interface{}) {
	cl.logMessage("", fmt.Sprintln(v...))
}

// Fatal logs a message and calls os.Exit(1)
func (cl *CustomLogger) Fatal(v ...interface{}) {
	cl.logMessage("", fmt.Sprint(v...))
	os.Exit(1)
}

// Fatalf logs a formatted message and calls os.Exit(1)
func (cl *CustomLogger) Fatalf(format string, v ...interface{}) {
	cl.logMessage("", fmt.Sprintf(format, v...))
	os.Exit(1)
}

// Fatalln logs a message with a newline and calls os.Exit(1)
func (cl *CustomLogger) Fatalln(v ...interface{}) {
	cl.logMessage("", fmt.Sprintln(v...))
	os.Exit(1)
}

// Global custom logger instance
var customLogger = NewCustomLogger()

// Override the default log package functions
func init() {
	log.SetFlags(0)             // Remove default flags
	log.SetOutput(customLogger) // Redirect the output

	// Override the default log package functions
	log.SetOutput(customLogger)
}

// Write method to implement io.Writer interface for log.SetOutput
func (cl *CustomLogger) Write(p []byte) (n int, err error) {
	cl.Print(string(p))
	return len(p), nil
}
