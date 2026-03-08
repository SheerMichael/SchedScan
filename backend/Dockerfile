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

# Expose port
EXPOSE 8080

# Run migrations, collect static files, then start gunicorn
# collectstatic runs here (not during build) so it has access to environment variables
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && gunicorn --bind 0.0.0.0:8080 --timeout 300 --workers 2 --threads 2 core.wsgi:application"]
