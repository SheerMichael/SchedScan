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

# Run gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "core.wsgi:application"]
