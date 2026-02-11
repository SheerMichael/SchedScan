"""
Integration test script for testing the complete COR upload and extraction flow.
Tests API endpoints, extraction methods, and database persistence.

Usage:
    python test_integration.py --sample-pdf /path/to/sample.pdf
    python test_integration.py --create-test-user
"""

import requests
import json
import argparse
import sys import os
from pathlib import Path

# Configuration
API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:8000/api')
TEST_USER_EMAIL = 'test_extraction@schedscan.com'
TEST_USER_PASSWORD = 'TestPassword123!'


class Colors:
    """ANSI color codes"""
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'


def print_step(step_num, description):
    """Print test step"""
    print(f"\n{Colors.BOLD}Step {step_num}:{Colors.ENDC} {description}")


def print_success(message):
    """Print success message"""
    print(f"{Colors.GREEN}✓{Colors.ENDC} {message}")


def print_warning(message):
    """Print warning message"""
    print(f"{Colors.YELLOW}⚠{Colors.ENDC} {message}")


def print_error(message):
    """Print error message"""
    print(f"{Colors.RED}✗{Colors.ENDC} {message}")


def create_test_user():
    """Create test user account"""
    print_step(1, "Creating test user account")
    
    url = f"{API_BASE_URL}/auth/register/"
    data = {
        'email': TEST_USER_EMAIL,
        'password': TEST_USER_PASSWORD,
        'password2': TEST_USER_PASSWORD,
        'first_name': 'Test',
        'last_name': 'User'
    }
    
    try:
        response = requests.post(url, json=data)
        
        if response.status_code == 201:
            print_success("Test user created successfully")
            return response.json()
        elif response.status_code == 400:
            # User might already exist
            print_warning("User might already exist, attempting login")
            return login_test_user()
        else:
            print_error(f"Failed to create user: {response.status_code}")
            print(response.json())
            return None
    
    except Exception as e:
        print_error(f"Error creating user: {str(e)}")
        return None


def login_test_user():
    """Login with test user credentials"""
    print_step(1, "Logging in test user")
    
    url = f"{API_BASE_URL}/auth/login/"
    data = {
        'email': TEST_USER_EMAIL,
        'password': TEST_USER_PASSWORD
    }
    
    try:
        response = requests.post(url, json=data)
        
        if response.status_code == 200:
            print_success("Login successful")
            return response.json()
        else:
            print_error(f"Login failed: {response.status_code}")
            print(response.json())
            return None
    
    except Exception as e:
        print_error(f"Error logging in: {str(e)}")
        return None


def upload_cor_file(access_token, file_path, upload_type='student'):
    """Upload COR file for extraction"""
    print_step(2, f"Uploading {upload_type} COR file")
    
    url = f"{API_BASE_URL}/upload-cor/{upload_type}/"
    headers = {
        'Authorization': f'Bearer {access_token}'
    }
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': f}
            response = requests.post(url, files=files, headers=headers)
        
        if response.status_code == 201:
            data = response.json()
            print_success(f"File uploaded and processed successfully")
            
            # Print extraction metadata
            if 'extraction_metadata' in data:
                metadata = data['extraction_metadata']
                print(f"  {Colors.BLUE}Extraction Method:{Colors.ENDC} {metadata.get('method', 'N/A')}")
                print(f"  {Colors.BLUE}Confidence:{Colors.ENDC} {metadata.get('confidence', 'N/A')}")
                print(f"  {Colors.BLUE}Processing Time:{Colors.ENDC} {metadata.get('processing_time_seconds', 'N/A')}s")
                print(f"  {Colors.BLUE}Attempts:{Colors.ENDC} {', '.join(metadata.get('attempts', []))}")
            
            print(f"  {Colors.BLUE}Total Courses:{Colors.ENDC} {data.get('total_courses', 0)}")
            
            return data
        else:
            print_error(f"Upload failed: {response.status_code}")
            print(response.json())
            return None
    
    except FileNotFoundError:
        print_error(f"File not found: {file_path}")
        return None
    except Exception as e:
        print_error(f"Error uploading file: {str(e)}")
        return None


def verify_courses(access_token, expected_count=None):
    """Verify courses were created in database"""
    print_step(3, "Verifying courses in database")
    
    url = f"{API_BASE_URL}/courses/"
    headers = {
        'Authorization': f'Bearer {access_token}'
    }
    
    try:
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            courses = response.json()
            print_success(f"Retrieved {len(courses)} courses from database")
            
            if expected_count and len(courses) != expected_count:
                print_warning(f"Expected {expected_count} courses, got {len(courses)}")
            
            # Print sample course
            if courses:
                print(f"\n  {Colors.BOLD}Sample course:{Colors.ENDC}")
                course = courses[0]
                print(f"    Subject Code: {course.get('subject_code')}")
                print(f"    Subject Name: {course.get('subject_name')}")
                print(f"    Time: {course.get('start_time')} - {course.get('end_time')}")
                print(f"    Day: {course.get('day')}")
                print(f"    Location: {course.get('location')}")
            
            return courses
        else:
            print_error(f"Failed to retrieve courses: {response.status_code}")
            return None
    
    except Exception as e:
        print_error(f"Error retrieving courses: {str(e)}")
        return None


def create_schedule_with_courses(access_token, title, courses_data):
    """Create a schedule with extracted courses"""
    print_step(4, "Creating schedule with courses")
    
    url = f"{API_BASE_URL}/schedules/"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    # Format courses for schedule creation
    formatted_courses = []
    for course in courses_data[:5]:  # Take first 5 courses
        formatted_courses.append({
            'subject_code': course.get('subject_code'),
            'subject_name': course.get('subject_name', ''),
            'start_time': course.get('start_time'),
            'end_time': course.get('end_time'),
            'day': course.get('day'),
            'location': course.get('location', '')
        })
    
    data = {
        'title': title,
        'upload_type': 'student',
        'is_active': True,
        'courses': formatted_courses
    }
    
    try:
        response = requests.post(url, json=data, headers=headers)
        
        if response.status_code == 201:
            schedule = response.json()
            print_success(f"Schedule created: {schedule.get('title')}")
            print(f"  {Colors.BLUE}Schedule ID:{Colors.ENDC} {schedule.get('id')}")
            print(f"  {Colors.BLUE}Course Count:{Colors.ENDC} {len(schedule.get('courses', []))}")
            return schedule
        else:
            print_error(f"Failed to create schedule: {response.status_code}")
            print(response.json())
            return None
    
    except Exception as e:
        print_error(f"Error creating schedule: {str(e)}")
        return None


def test_extraction_methods(access_token, pdf_file, image_file=None):
    """Test different extraction methods"""
    print(f"\n{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"{Colors.BOLD}Testing Extraction Methods{Colors.ENDC}")
    print(f"{Colors.BOLD}{'='*60}{Colors.ENDC}")
    
    results = {}
    
    # Test PDF extraction
    if pdf_file and os.path.exists(pdf_file):
        print(f"\n{Colors.BOLD}Test 1: PDF Extraction{Colors.ENDC}")
        result = upload_cor_file(access_token, pdf_file)
        if result:
            results['pdf'] = result
            
            # Verify extraction method
            metadata = result.get('extraction_metadata', {})
            method = metadata.get('method')
            
            if method == 'pdf_text':
                print_success("Used fast PDF text extraction method")
            elif method == 'ocr_fallback':
                print_warning("Fell back to OCR (PDF quality might be low)")
            else:
                print_warning(f"Used method: {method}")
    
    # Test image extraction if provided
    if image_file and os.path.exists(image_file):
        print(f"\n{Colors.BOLD}Test 2: Image Extraction{Colors.ENDC}")
        result = upload_cor_file(access_token, image_file)
        if result:
            results['image'] = result
            
            metadata = result.get('extraction_metadata', {})
            method = metadata.get('method')
            
            if method == 'ocr':
                print_success("Used OCR for image file (expected)")
            else:
                print_warning(f"Unexpected method for image: {method}")
    
    return results


def cleanup_test_data(access_token):
    """Clean up test courses and schedules"""
    print_step(5, "Cleaning up test data")
    
    # Delete all courses (admin operation)
    url = f"{API_BASE_URL}/courses/delete-all/"
    headers = {
        'Authorization': f'Bearer {access_token}'
    }
    
    try:
        response = requests.delete(url, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Deleted {data.get('deleted_count', 0)} courses")
        else:
            print_warning(f"Cleanup might have failed: {response.status_code}")
    
    except Exception as e:
        print_warning(f"Error during cleanup: {str(e)}")


def main():
    """Main integration test function"""
    parser = argparse.ArgumentParser(description='Integration tests for COR extraction')
    parser.add_argument('--sample-pdf', help='Path to sample PDF COR file')
    parser.add_argument('--sample-image', help='Path to sample image COR file')
    parser.add_argument('--create-user', action='store_true', help='Create test user')
    parser.add_argument('--cleanup', action='store_true', help='Clean up after tests')
    parser.add_argument('--api-url', default=API_BASE_URL, help='API base URL')
    
    args = parser.parse_args()
    
    global API_BASE_URL
    API_BASE_URL = args.api_url
    
    print(f"\n{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"{Colors.BOLD}SchedScan Extraction Integration Tests{Colors.ENDC}")
    print(f"{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"API URL: {API_BASE_URL}")
    
    # Step 1: Authenticate
    if args.create_user:
        auth_data = create_test_user()
    else:
        auth_data = login_test_user()
    
    if not auth_data:
        print_error("Authentication failed - cannot continue tests")
        return 1
    
    access_token = auth_data.get('tokens', {}).get('access')
    if not access_token:
        print_error("No access token received - cannot continue tests")
        return 1
    
    # Step 2: Test extraction
    results = test_extraction_methods(
        access_token,
        args.sample_pdf,
        args.sample_image
    )
    
    if not results:
        print_error("No successful extractions")
        return 1
    
    # Step 3: Verify courses
    courses = verify_courses(access_token)
    
    # Step 4: Create schedule if we have courses
    if courses:
        schedule = create_schedule_with_courses(
            access_token,
            "Integration Test Schedule",
            courses
        )
    
    # Step 5: Cleanup if requested
    if args.cleanup:
        cleanup_test_data(access_token)
    
    # Print summary
    print(f"\n{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"{Colors.BOLD}Test Summary{Colors.ENDC}")
    print(f"{Colors.BOLD}{'='*60}{Colors.ENDC}")
    
    for test_type, result in results.items():
        metadata = result.get('extraction_metadata', {})
        print(f"\n{test_type.upper()} Extraction:")
        print(f"  Method: {metadata.get('method')}")
        print(f"  Time: {metadata.get('processing_time_seconds')}s")
        print(f"  Courses: {result.get('total_courses')}")
        print(f"  Confidence: {metadata.get('confidence')}")
    
    print(f"\n{Colors.GREEN}All tests completed!{Colors.ENDC}")
    return 0


if __name__ == '__main__':
    exit(main())
