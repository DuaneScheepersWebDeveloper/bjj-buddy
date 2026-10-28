#!/bin/bash

echo "Checking if Docker is running..."
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker Desktop is not running. Please open it and try again."
  exit 1
fi

echo "Checking Database..."
# Check if the container exists
if [ "$(docker ps -a -q -f name=bjj-postgres)" ]; then
    # If it exists, just start it
    echo "Starting existing database..."
    docker start bjj-postgres > /dev/null
else
    # If it doesn't exist, create it
    echo "Creating new database..."
    docker run --name bjj-postgres -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=bjjbuddy -p 5432:5432 -d postgres:16 > /dev/null
    echo "Waiting for database to initialize..."
    sleep 3
fi

echo "Activating environment..."
source .venv/Scripts/activate

echo "Starting API..."
# --host 0.0.0.0 lets phones on your Wi-Fi reach the API (not just this PC)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000