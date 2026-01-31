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

# Debug: Show what was copied
RUN echo "=== Build context contents ===" && \
    ls -la && \
    echo "=== Checking for manage.py ===" && \
    if [ -f manage.py ]; then echo "manage.py found!"; else echo "ERROR: manage.py NOT FOUND!" && exit 1; fi

# Verify tesseract installation
RUN which tesseract && tesseract --version

# Collect static files
RUN python manage.py collectstatic --noinput

# Expose port
EXPOSE 8080

# Run gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "core.wsgi:application"]
