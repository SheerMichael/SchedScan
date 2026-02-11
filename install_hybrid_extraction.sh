#!/bin/bash
# Installation and Testing Script for Hybrid PDF Extraction System
# Run this script to install dependencies and verify the implementation

set -e  # Exit on error

echo "========================================="
echo "SchedScan Hybrid PDF Extraction Setup"
echo "========================================="
echo ""

# Navigate to backend directory
cd "$(dirname "$0")/backend"

echo "Step 1: Installing Python dependencies..."
pip install -r requirements.txt

echo ""
echo "Step 2: Verifying installations..."

# Check pdfplumber
python -c "import pdfplumber; print('✓ pdfplumber installed:', pdfplumber.__version__)"

# Check tabulate
python -c "import tabulate; print('✓ tabulate installed:', tabulate.__version__)"

# Check new modules
python -c "from api.utils.pdf_extractor import StudentPDFExtractor; print('✓ PDF Extractor module: OK')"
python -c "from api.utils.extraction_manager import ExtractionManager; print('✓ Extraction Manager module: OK')"

# Check OCR still works (fallback)
python -c "from api.utils.ocr import get_cor_extractor; print('✓ OCR Extractor (fallback): OK')"

echo ""
echo "Step 3: Running database migrations (if needed)..."
python manage.py migrate --check || python manage.py migrate

echo ""
echo "========================================="
echo "✓ Installation Complete!"
echo "========================================="
echo ""
echo "Next Steps:"
echo "1. Start the development server:"
echo "   cd backend && python manage.py runserver"
echo ""
echo "2. Test the extraction endpoint:"
echo "   POST /api/upload-cor/student/"
echo "   Upload a COR PDF and check the 'extraction_metadata' in the response"
echo ""
echo "3. Expected response fields:"
echo "   - extraction_metadata.method: 'pdf_text' (for digital PDFs)"
echo "   - extraction_metadata.confidence: 0.6-1.0"
echo "   - extraction_metadata.processing_time_seconds: < 1.0 (for PDFs)"
echo ""
echo "For more details, see:"
echo "  - walkthrough.md"
echo "  - IMPLEMENTATION_SUMMARY.md"
echo "========================================="
