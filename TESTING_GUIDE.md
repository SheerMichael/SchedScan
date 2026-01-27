# Comprehensive Testing Guide for Hybrid PDF Extraction System

## Overview

This guide provides complete instructions for testing the hybrid PDF extraction system, including unit tests, integration tests, performance benchmarks, and manual testing procedures.

---

## Quick Start

### 1. Install Dependencies

```bash
cd /home/sheer/Desktop/SchedScan/backend
pip install -r requirements.txt
```

### 2. Run Unit Tests

```bash
# Run all extraction tests
python manage.py test api.tests.test_extraction --verbosity=2

# Run specific test class
python manage.py test api.tests.test_extraction.DayCodeExpansionTestCase

# Run with coverage
pip install coverage
coverage run --source='api' manage.py test api.tests.test_extraction
coverage report
```

### 3. Run Integration Tests

```bash
# Start Django server first
python manage.py runserver

# In another terminal, run integration tests
cd backend
python test_integration.py --create-user --sample-pdf /path/to/sample_cor.pdf --cleanup
```

---

## Test Suite Components

### Unit Tests (`api/tests/test_extraction.py`)

**15+ test cases** covering:

#### 1. Day Code Expansion Tests
- `test_single_day_codes` - Verify single day codes (M, T, W, TH, F, S)
- `test_multi_day_codes` - Verify multi-day expansion (MTH → M, TH)
- `test_case_insensitivity` - Verify case handling

#### 2. Course Splitting Tests
- `test_single_day_no_split` - Single day courses unchanged
- `test_multi_day_split` - Multi-day courses split correctly
- `test_three_day_split` - Three-day courses (MWF)

#### 3. Quality Scoring Tests
- `test_empty_courses` - Empty list returns 0
- `test_perfect_course` - All fields present scores high
- `test_minimal_course` - Required fields only scores acceptable
- `test_incomplete_course` - Missing fields scores low
- `test_multiple_courses_average` - Average quality calculation

#### 4. PDF Extractor Tests
- `test_get_student_extractor` - Factory returns correct type
- `test_get_faculty_extractor` - Faculty extractor creation
- `test_invalid_upload_type` - Error handling
- `test_normalize_time` - Time format normalization

#### 5. Extraction Manager Tests
- `test_initialization_default_threshold` - Default 60% threshold
- `test_initialization_custom_threshold` - Custom threshold support
- `test_pdf_extraction_success` - PDF extraction workflow
- `test_image_extraction_uses_ocr_directly` - Image handling
- `test_pdf_extraction_fallback_to_ocr` - Quality-based fallback

#### 6. View Integration Tests
- `test_upload_student_cor_with_pdf_extraction` - Full API workflow

#### 7. Performance Tests
- `test_pdf_extraction_performance` - Speed validation

**Running unit tests:**
```bash
# All tests
python manage.py test api.tests.test_extraction

# Specific test
python manage.py test api.tests.test_extraction.QualityScoringTestCase.test_perfect_course

# With coverage
coverage run --source='api' manage.py test api.tests.test_extraction
coverage html  # Generate HTML report
```

---

### Integration Tests (`test_integration.py`)

**End-to-end testing** of:
- User authentication (register/login)
- COR file upload
- Extraction processing
- Database persistence
- Schedule creation

**Usage:**

```bash
# Create user and test PDF extraction
python test_integration.py --create-user --sample-pdf /path/to/sample.pdf

# Test both PDF and image extraction
python test_integration.py --sample-pdf /path/to/sample.pdf --sample-image /path/to/sample.jpg

# Include cleanup
python test_integration.py --sample-pdf /path/to/sample.pdf --cleanup

# Custom API URL
python test_integration.py --api-url http://production-server.com/api --sample-pdf /path/to/sample.pdf
```

**Expected Output:**
```
============================================================
SchedScan Extraction Integration Tests
============================================================
API URL: http://localhost:8000/api

Step 1: Logging in test user
✓ Login successful

Step 2: Uploading student COR file
✓ File uploaded and processed successfully
  Extraction Method: pdf_text
  Confidence: 0.95
  Processing Time: 0.3s
  Attempts: pdf_text
  Total Courses: 8

Step 3: Verifying courses in database
✓ Retrieved 8 courses from database
  
  Sample course:
    Subject Code: BSCS125781
    Subject Name: SOFTWARE ENGINEERING
    Time: 07:00AM - 09:00AM
    Day: M
    Location: LR7

...
```

---

### Performance Benchmarks (`benchmark_extraction.py`)

**Detailed performance testing** with metrics:
- Processing time comparison
- Course extraction accuracy
- Quality scoring
- Speedup calculations

**Usage:**

```bash
# Test PDF extraction only
python benchmark_extraction.py --pdf /path/to/sample.pdf

# Test OCR extraction only
python benchmark_extraction.py --ocr /path/to/sample.pdf

# Compare both methods
python benchmark_extraction.py --both /path/to/sample.pdf

# Test hybrid manager
python benchmark_extraction.py --hybrid /path/to/sample.pdf

# Run all benchmarks
python benchmark_extraction.py --all /path/to/sample.pdf

# Quiet mode (less verbose)
python benchmark_extraction.py --both /path/to/sample.pdf --quiet
```

**Expected Output:**
```
============================================================
PDF Text Extraction Benchmark
============================================================
✓ Extraction completed in 0.284 seconds
  Courses extracted: 8
  Quality score: 0.95
  Avg time per course: 0.036s

  Sample course:
  Subject Code: BSCS125781
  Subject Name: SOFTWARE ENGINEERING
  ...

============================================================
OCR Extraction Benchmark
============================================================
✓ Extraction completed in 6.742 seconds
  Courses extracted: 8
  Quality score: 0.88
  Avg time per course: 0.843s
  ...

============================================================
Performance Comparison
============================================================

Method                         Time (s)     Courses    Quality    Status
---------------------------------------------------------------------------
PDF Text Extraction           0.284        8          0.95       ✓ Success
OCR Extraction                6.742        8          0.88       ✓ Success

Speedup: PDF extraction is 23.7x faster than OCR
```

---

## Manual Testing Procedures

### Test 1: Digital PDF Extraction

**Objective:** Verify fast PDF text extraction for digital CORs

**Steps:**
1. Start Django server: `python manage.py runserver`
2. Get authentication token:
   ```bash
   curl -X POST http://localhost:8000/api/auth/login/ \
     -H "Content-Type: application/json" \
     -d '{"email":"your@email.com","password":"yourpassword"}'
   ```
3. Upload digital PDF:
   ```bash
   curl -X POST http://localhost:8000/api/upload-cor/student/ \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -F "file=@/path/to/digital_cor.pdf"
   ```

**Expected Results:**
- Response status: `201 Created`
- `extraction_metadata.method`: `"pdf_text"`
- `extraction_metadata.processing_time_seconds`: < 1.0
- `extraction_metadata.confidence`: ≥ 0.6
- Courses array with extracted data

### Test 2: Scanned PDF (OCR Fallback)

**Steps:**
1. Upload scanned or poor-quality PDF
2. Same curl command as Test 1

**Expected Results:**
- Response status: `201 Created`
- `extraction_metadata.method`: `"ocr_fallback"`
- `extraction_metadata.attempts`: `["pdf_text", "ocr_fallback"]`
- `extraction_metadata.processing_time_seconds`: 3-10 seconds
- Courses extracted with reasonable accuracy

### Test 3: Image File (JPG/PNG)

**Steps:**
1. Upload image file (photo of COR)
2. Same curl command

**Expected Results:**
- Response status: `201 Created`
- `extraction_metadata.method`: `"ocr"`
- `extraction_metadata.attempts`: `["ocr"]` (no PDF attempt)
- Courses extracted

### Test 4: Edge Cases

#### Empty/Invalid PDF
```bash
curl -X POST http://localhost:8000/api/upload-cor/student/ \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@/path/to/empty.pdf"
```
**Expected:** Graceful error handling, possibly OCR fallback

#### Unsupported File Type
```bash
curl -X POST http://localhost:8000/api/upload-cor/student/ \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@/path/to/document.docx"
```
**Expected:** `400 Bad Request` with error message

---

## Test Data Requirements

### Sample PDF Files Needed

1. **Digital COR PDF** (for PDF text extraction testing)
   - Digitally generated (from student information system)
   - Contains table or structured text
   - Has clear subject codes, times, days, locations

2. **Scanned COR PDF** (for OCR fallback testing)
   - Scanned or image-based PDF
   - Lower quality than digital PDF
   - Tests OCR fallback mechanism

3. **Image Files** (JPG/PNG) (for OCR testing)
   - Photo or scan of COR document
   - Tests direct OCR path

### Expected COR Format

The extraction system looks for:
- **Subject Code**: `[A-Z]{4,}\d{5,}` (e.g., BSCS125781)
- **Time**: `HH:MM AM/PM` format
- **Day**: M, T, W, TH, F, S, or combinations (MTH, MWF, etc.)
- **Location**: LR#, LAB#, CLA#, ROOM #, etc.

---

## Continuous Integration

### GitHub Actions Workflow (Optional)

Create `.github/workflows/test-extraction.yml`:

```yaml
name: Test Extraction System

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Set up Python
      uses: actions/setup-python@v2
      with:
        python-version: '3.10'
    
    - name: Install dependencies
      run: |
        cd backend
        pip install -r requirements.txt
    
    - name: Run unit tests
      run: |
        cd backend
        python manage.py test api.tests.test_extraction --verbosity=2
```

---

## Performance Benchmarks

### Expected Performance Metrics

| Metric | PDF Text | OCR | Target |
|--------|----------|-----|--------|
| Digital PDF | 0.1-0.5s | N/A | < 1s |
| Scanned PDF | 0.3s (failed) + 5s (OCR) | 5-8s | < 10s |
| Image File | N/A | 7-10s | < 15s |
| Speedup | 10-50x faster | Baseline | >10x |

### Quality Metrics

| Metric | PDF Text | OCR | Target |
|--------|----------|-----|--------|
| Accuracy | 95-99% | 80-95% | >90% |
| Confidence | 0.8-1.0 | 0.6-0.9 | >0.6 |
| Field Completeness | 90-100% | 70-90% | >70% |

---

## Troubleshooting

### Issue: Unit tests fail with import errors

**Solution:**
```bash
cd /home/sheer/Desktop/SchedScan/backend
export PYTHONPATH=$PYTHONPATH:$(pwd)
python manage.py test api.tests.test_extraction
```

### Issue: pdfplumber not found

**Solution:**
```bash
pip install pdfplumber==0.11.0
```

### Issue: OCR tests timeout

**Cause:** doctr model loading takes time on first run

**Solution:** Increase test timeout or run OCR tests separately

### Issue: Integration tests fail with connection error

**Solution:** Ensure Django server is running:
```bash
python manage.py runserver
```

---

## Test Coverage Goals

- **Unit Test Coverage**: > 80%
- **Integration Test Coverage**: All critical API endpoints
- **Performance Tests**: All extraction methods
- **Edge Case Coverage**: Invalid inputs, errors, fallbacks

**Check coverage:**
```bash
coverage run --source='api' manage.py test api.tests.test_extraction
coverage report
coverage html  # Open htmlcov/index.html
```

---

## Next Steps After Testing

1. **Review test results** - Ensure all tests pass
2. **Analyze performance** - Confirm speedup metrics
3. **Test with real COR files** - Validate with actual university CORs
4. **Adjust quality threshold** - Based on real-world data
5. **Deploy to staging** - Test in production-like environment
6. **Monitor extraction metrics** - Track method usage and success rates

---

## Additional Resources

- [Unit Tests](file:///home/sheer/Desktop/SchedScan/backend/api/tests/test_extraction.py)
- [Integration Tests](file:///home/sheer/Desktop/SchedScan/backend/test_integration.py)
- [Performance Benchmark](file:///home/sheer/Desktop/SchedScan/backend/benchmark_extraction.py)
- [Walkthrough](file:///home/sheer/.gemini/antigravity/brain/d168a181-78b0-418b-993d-ecfc81b5c9a1/walkthrough.md)
- [Implementation Summary](file:///home/sheer/.gemini/antigravity/brain/d168a181-78b0-418b-993d-ecfc81b5c9a1/IMPLEMENTATION_SUMMARY.md)
