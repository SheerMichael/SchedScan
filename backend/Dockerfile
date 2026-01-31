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
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Debug: Verify tesseract installation
RUN echo "=== Verifying tesseract installation ===" && \
    which tesseract && \
    tesseract --version && \
    echo "=== Tesseract OK ==="

# Debug: List files to verify manage.py exists
RUN echo "=== Listing /app contents ===" && ls -la /app/

# Collect static files
RUN python manage.py collectstatic --noinput

# Expose port
EXPOSE 8080

# Run gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "core.wsgi:application"]
