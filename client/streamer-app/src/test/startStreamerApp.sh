#!/bin/bash

# 2>&1 ensures that both stdout and stderr are captured
npm start 2>&1 &

PID=$!

# sleep 5

# Keep the process running in the background
wait $PID
