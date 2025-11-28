#!/bin/bash
# SchedScan Backend Startup Script

echo "🚀 Starting SchedScan Backend Server..."
echo "========================================="

# Navigate to project root
cd "$(dirname "$0")"

# Activate virtual environment
echo "📦 Activating virtual environment..."
source .venv/bin/activate

# Navigate to backend directory
cd backend

# Display network info
echo ""
echo "🌐 Network Configuration:"
IP=$(hostname -I | awk '{print $1}')
echo "   Local IP: $IP"
echo "   Server will be accessible at:"
echo "   - http://127.0.0.1:8000 (localhost)"
echo "   - http://10.0.2.2:8000 (Android emulator)"
echo "   - http://$IP:8000 (physical devices on same network)"
echo ""

# Start Django server on all interfaces
echo "🔥 Starting Django development server..."
echo "   Press CTRL+C to stop"
echo ""
python manage.py runserver 0.0.0.0:8000
