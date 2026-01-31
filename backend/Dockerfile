# Use official Python image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies for OCR
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
# Note: DigitalOcean builds from repo root, so use backend/ path
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code only
COPY backend/ .

# Verify files are in place
RUN echo "=== App directory contents ===" && ls -la && \
    echo "=== manage.py check ===" && \
    test -f manage.py && echo "manage.py found!" || (echo "manage.py missing!" && exit 1)

# Verify tesseract installation
RUN which tesseract && tesseract --version

# Collect static files
RUN python manage.py collectstatic --noinput

# Expose port
EXPOSE 8080

# Run gunicorn with extended timeout for OCR processing
# --timeout 300: Allow requests to take up to 5 minutes (OCR can be slow)
# --workers 2: Use 2 worker processes
# --threads 2: Use 2 threads per worker
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--timeout", "300", "--workers", "2", "--threads", "2", "core.wsgi:application"]
