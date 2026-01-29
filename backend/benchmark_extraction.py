"""
Performance benchmark script for comparing PDF extraction vs OCR extraction.
Measures processing time and extraction quality for different file types.

Usage:
    python benchmark_extraction.py --pdf /path/to/sample.pdf
    python benchmark_extraction.py --image /path/to/sample.jpg
    python benchmark_extraction.py --both /path/to/sample.pdf
"""

import time
import argparse
import sys
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
import django
django.setup()

from api.utils.pdf_extractor import StudentPDFExtractor, calculate_quality_score
from api.utils.ocr import StudentCORExtractor
from api.utils.extraction_manager import ExtractionManager


class Colors:
    """ANSI color codes for terminal output"""
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def print_header(text):
    """Print colored header"""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{text}{Colors.ENDC}")
    print("=" * len(text))


def print_success(text):
    """Print success message"""
    print(f"{Colors.GREEN}✓ {text}{Colors.ENDC}")


def print_warning(text):
    """Print warning message"""
    print(f"{Colors.YELLOW}⚠ {text}{Colors.ENDC}")


def print_error(text):
    """Print error message"""
    print(f"{Colors.RED}✗ {text}{Colors.ENDC}")


def print_info(key, value, color=Colors.CYAN):
    """Print key-value info"""
    print(f"  {color}{key}:{Colors.ENDC} {value}")


def benchmark_pdf_extraction(file_path, verbose=True):
    """
    Benchmark PDF text extraction.
    
    Args:
        file_path: Path to PDF file
        verbose: Print detailed output
        
    Returns:
        Dictionary with benchmark results
    """
    if verbose:
        print_header("PDF Text Extraction Benchmark")
    
    extractor = StudentPDFExtractor()
    
    # Warm-up run
    try:
        _ = extractor.extract_from_pdf(file_path)
    except Exception as e:
        if verbose:
            print_error(f"Warm-up failed: {str(e)}")
    
    # Actual benchmark
    start_time = time.time()
    try:
        courses = extractor.extract_from_pdf(file_path)
        elapsed_time = time.time() - start_time
        quality = calculate_quality_score(courses)
        
        result = {
            'method': 'PDF Text Extraction',
            'success': True,
            'courses': courses,
            'course_count': len(courses),
            'processing_time': elapsed_time,
            'quality_score': quality,
            'error': None
        }
        
        if verbose:
            print_success(f"Extraction completed in {elapsed_time:.3f} seconds")
            print_info("Courses extracted", len(courses))
            print_info("Quality score", f"{quality:.2f}")
            print_info("Avg time per course", f"{(elapsed_time / max(len(courses), 1)):.3f}s")
            
            if courses:
                print(f"\n  {Colors.BOLD}Sample course:{Colors.ENDC}")
                course = courses[0]
                print_info("  Subject Code", course.get('subject_code', 'N/A'))
                print_info("  Subject Name", course.get('subject_name', 'N/A'))
                print_info("  Time", f"{course.get('start_time', 'N/A')} - {course.get('end_time', 'N/A')}")
                print_info("  Day", course.get('day', 'N/A'))
                print_info("  Location", course.get('location', 'N/A'))
        
        return result
        
    except Exception as e:
        elapsed_time = time.time() - start_time
        result = {
            'method': 'PDF Text Extraction',
            'success': False,
            'courses': [],
            'course_count': 0,
            'processing_time': elapsed_time,
            'quality_score': 0.0,
            'error': str(e)
        }
        
        if verbose:
            print_error(f"Extraction failed: {str(e)}")
        
        return result


def benchmark_ocr_extraction(file_path, verbose=True):
    """
    Benchmark OCR extraction.
    
    Args:
        file_path: Path to file
        verbose: Print detailed output
        
    Returns:
        Dictionary with benchmark results
    """
    if verbose:
        print_header("OCR Extraction Benchmark")
    
    extractor = StudentCORExtractor()
    
    start_time = time.time()
    try:
        courses = extractor.extract_from_document(file_path)
        elapsed_time = time.time() - start_time
        quality = calculate_quality_score(courses)
        
        result = {
            'method': 'OCR Extraction',
            'success': True,
            'courses': courses,
            'course_count': len(courses),
            'processing_time': elapsed_time,
            'quality_score': quality,
            'error': None
        }
        
        if verbose:
            print_success(f"Extraction completed in {elapsed_time:.3f} seconds")
            print_info("Courses extracted", len(courses))
            print_info("Quality score", f"{quality:.2f}")
            print_info("Avg time per course", f"{(elapsed_time / max(len(courses), 1)):.3f}s")
            
            if courses:
                print(f"\n  {Colors.BOLD}Sample course:{Colors.ENDC}")
                course = courses[0]
                print_info("  Subject Code", course.get('subject_code', 'N/A'))
                print_info("  Subject Name", course.get('subject_name', 'N/A'))
                print_info("  Time", f"{course.get('start_time', 'N/A')} - {course.get('end_time', 'N/A')}")
                print_info("  Day", course.get('day', 'N/A'))
                print_info("  Location", course.get('location', 'N/A'))
        
        return result
        
    except Exception as e:
        elapsed_time = time.time() - start_time
        result = {
            'method': 'OCR Extraction',
            'success': False,
            'courses': [],
            'course_count': 0,
            'processing_time': elapsed_time,
            'quality_score': 0.0,
            'error': str(e)
        }
        
        if verbose:
            print_error(f"Extraction failed: {str(e)}")
        
        return result


def benchmark_hybrid_extraction(file_path, verbose=True):
    """
    Benchmark hybrid extraction manager.
    
    Args:
        file_path: Path to file
        verbose: Print detailed output
        
    Returns:
        Dictionary with benchmark results
    """
    if verbose:
        print_header("Hybrid Extraction Manager Benchmark")
    
    manager = ExtractionManager()
    
    start_time = time.time()
    try:
        result_data = manager.extract_schedule(file_path, 'student')
        
        result = {
            'method': 'Hybrid Extraction',
            'success': True,
            'courses': result_data['courses'],
            'course_count': len(result_data['courses']),
            'processing_time': result_data['processing_time'],
            'quality_score': result_data['confidence'],
            'extraction_method': result_data['extraction_method'],
            'attempts': result_data.get('attempts', []),
            'error': None
        }
        
        if verbose:
            print_success(f"Extraction completed in {result_data['processing_time']:.3f} seconds")
            print_info("Method used", result_data['extraction_method'], Colors.YELLOW)
            print_info("Attempts", ', '.join(result_data.get('attempts', [])))
            print_info("Courses extracted", len(result_data['courses']))
            print_info("Quality score", f"{result_data['confidence']:.2f}")
        
        return result
        
    except Exception as e:
        elapsed_time = time.time() - start_time
        result = {
            'method': 'Hybrid Extraction',
            'success': False,
            'courses': [],
            'course_count': 0,
            'processing_time': elapsed_time,
            'quality_score': 0.0,
            'error': str(e)
        }
        
        if verbose:
            print_error(f"Extraction failed: {str(e)}")
        
        return result


def compare_results(results):
    """
    Compare multiple benchmark results and print comparison table.
    
    Args:
        results: List of benchmark result dictionaries
    """
    print_header("Performance Comparison")
    
    # Print table header
    print(f"\n{'Method':<30} {'Time (s)':<12} {'Courses':<10} {'Quality':<10} {'Status'}")
    print("-" * 75)
    
    # Print each result
    for result in results:
        method = result['method']
        time_str = f"{result['processing_time']:.3f}"
        courses = str(result['course_count'])
        quality = f"{result['quality_score']:.2f}"
        status = f"{Colors.GREEN}✓ Success{Colors.ENDC}" if result['success'] else f"{Colors.RED}✗ Failed{Colors.ENDC}"
        
        print(f"{method:<30} {time_str:<12} {courses:<10} {quality:<10} {status}")
    
    # Calculate speedup if both PDF and OCR succeeded
    pdf_result = next((r for r in results if 'PDF' in r['method'] and r['success']), None)
    ocr_result = next((r for r in results if r['method'] == 'OCR Extraction' and r['success']), None)
    
    if pdf_result and ocr_result:
        speedup = ocr_result['processing_time'] / pdf_result['processing_time']
        print(f"\n{Colors.BOLD}Speedup:{Colors.ENDC} PDF extraction is {Colors.GREEN}{speedup:.1f}x faster{Colors.ENDC} than OCR")


def main():
    """Main benchmark function"""
    parser = argparse.ArgumentParser(
        description='Benchmark PDF extraction performance',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
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
        """
    )
    
    parser.add_argument('--pdf', help='Run PDF extraction benchmark only')
    parser.add_argument('--ocr', help='Run OCR extraction benchmark only')
    parser.add_argument('--hybrid', help='Run hybrid manager benchmark only')
    parser.add_argument('--both', help='Compare PDF and OCR extraction')
    parser.add_argument('--all', help='Run all benchmarks including hybrid')
    parser.add_argument('--quiet', action='store_true', help='Suppress detailed output')
    
    args = parser.parse_args()
    
    verbose = not args.quiet
    results = []
    
    if args.pdf:
        result = benchmark_pdf_extraction(args.pdf, verbose)
        results.append(result)
    
    elif args.ocr:
        result = benchmark_ocr_extraction(args.ocr, verbose)
        results.append(result)
    
    elif args.hybrid:
        result = benchmark_hybrid_extraction(args.hybrid, verbose)
        results.append(result)
    
    elif args.both:
        pdf_result = benchmark_pdf_extraction(args.both, verbose)
        results.append(pdf_result)
        
        ocr_result = benchmark_ocr_extraction(args.both, verbose)
        results.append(ocr_result)
        
        if verbose and len(results) > 1:
            compare_results(results)
    
    elif args.all:
        pdf_result = benchmark_pdf_extraction(args.all, verbose)
        results.append(pdf_result)
        
        ocr_result = benchmark_ocr_extraction(args.all, verbose)
        results.append(ocr_result)
        
        hybrid_result = benchmark_hybrid_extraction(args.all, verbose)
        results.append(hybrid_result)
        
        if verbose and len(results) > 1:
            compare_results(results)
    
    else:
        parser.print_help()
        return 1
    
    return 0


if __name__ == '__main__':
    exit(main())
