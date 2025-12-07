"""
Timetable Image Generator for SchedScan.
Generates a visual timetable image from course schedule data using Pillow.

This module creates a weekly grid layout showing courses with their times,
locations, and other details that can be downloaded by users.
"""

from PIL import Image, ImageDraw, ImageFont
from typing import List, Dict, Tuple, Optional
import os
import io
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Constants for timetable layout
DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
DAY_CODE_MAP = {
    'SUN': 0, 'S': 6,  # S can be Saturday or Sunday - using Saturday as default
    'MON': 1, 'M': 1,
    'TUE': 2, 'T': 2,
    'WED': 3, 'W': 3,
    'THU': 4, 'TH': 4,
    'FRI': 5, 'F': 5,
    'SAT': 6,
}

# Color scheme
COLORS = {
    'background': (255, 255, 255),  # White
    'header_bg': (153, 1, 0),  # SchedScan red (#990100)
    'header_text': (255, 255, 255),  # White
    'grid_line': (200, 200, 200),  # Light gray
    'day_header_bg': (245, 245, 245),  # Very light gray
    'day_header_text': (50, 50, 50),  # Dark gray
    'time_column_bg': (250, 250, 250),  # Off-white
    'time_text': (100, 100, 100),  # Medium gray
    'course_bg': (255, 235, 235),  # Light red/pink
    'course_border': (153, 1, 0),  # SchedScan red
    'course_text': (50, 50, 50),  # Dark gray
    'course_code': (153, 1, 0),  # SchedScan red
    'watermark': (220, 220, 220),  # Light gray for watermark
}

# Default font path (will try to find system fonts)
DEFAULT_FONT_PATHS = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    'C:\\Windows\\Fonts\\arial.ttf',
]


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """
    Get a font with the specified size, falling back to default if not found.
    
    Args:
        size: Font size in points
        bold: Whether to use bold variant
        
    Returns:
        ImageFont object
    """
    for font_path in DEFAULT_FONT_PATHS:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                continue
    
    # Fallback to default font
    try:
        return ImageFont.load_default()
    except Exception:
        return None


def parse_time(time_str: str) -> Tuple[int, int]:
    """
    Parse a time string like '07:00AM' or '2:30PM' into hours and minutes (24-hour format).
    
    Args:
        time_str: Time string to parse
        
    Returns:
        Tuple of (hour, minute) in 24-hour format
    """
    time_str = time_str.strip().upper()
    
    # Handle various formats
    is_pm = 'PM' in time_str
    is_am = 'AM' in time_str
    
    # Remove AM/PM
    time_str = time_str.replace('AM', '').replace('PM', '').strip()
    
    # Split by colon
    parts = time_str.split(':')
    
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        
        # Convert to 24-hour format
        if is_pm and hour != 12:
            hour += 12
        elif is_am and hour == 12:
            hour = 0
            
        return (hour, minute)
    except (ValueError, IndexError):
        logger.warning(f"Could not parse time: {time_str}")
        return (8, 0)  # Default to 8:00 AM


def get_day_index(day_code: str) -> int:
    """
    Convert a day code to a column index (0-6 for Sun-Sat).
    
    Args:
        day_code: Day code like 'M', 'T', 'TH', etc.
        
    Returns:
        Column index (0-6)
    """
    day_code = day_code.strip().upper()
    return DAY_CODE_MAP.get(day_code, -1)


def time_to_row_position(hour: int, minute: int, start_hour: int, row_height: int, header_height: int) -> int:
    """
    Calculate the Y position for a given time.
    
    Args:
        hour: Hour in 24-hour format
        minute: Minute
        start_hour: The earliest hour shown in the timetable
        row_height: Height per hour in pixels
        header_height: Height of the header area
        
    Returns:
        Y position in pixels
    """
    hours_from_start = (hour - start_hour) + (minute / 60)
    return header_height + int(hours_from_start * row_height)


def generate_timetable_image(
    courses: List[Dict],
    title: str = "My Schedule",
    upload_type: str = "student",
    user_name: str = None
) -> io.BytesIO:
    """
    Generate a timetable image from course data.
    
    Args:
        courses: List of course dictionaries with keys:
            - subject_code: Course code (e.g., 'BSCS125781')
            - subject_name: Course name (e.g., 'SOFTWARE ENGINEERING')
            - start_time: Start time (e.g., '07:00AM')
            - end_time: End time (e.g., '09:00AM')
            - day: Day code (e.g., 'M', 'T', 'TH', 'MW')
            - location: Room/location (e.g., 'LR7')
        title: Title for the timetable
        upload_type: Type of schedule ('student' or 'faculty')
        user_name: Name of the user (optional, for header)
        
    Returns:
        BytesIO object containing the PNG image
    """
    if not courses:
        logger.warning("No courses provided for timetable generation")
        courses = []
    
    # Calculate time range from courses
    all_times = []
    for course in courses:
        start = parse_time(course.get('start_time', '08:00AM'))
        end = parse_time(course.get('end_time', '09:00AM'))
        all_times.append(start[0])
        all_times.append(end[0] + (1 if end[1] > 0 else 0))
    
    # Determine time range (with some padding)
    if all_times:
        start_hour = max(6, min(all_times) - 1)  # At least 6 AM
        end_hour = min(22, max(all_times) + 1)  # At most 10 PM
    else:
        start_hour = 7
        end_hour = 18
    
    num_hours = end_hour - start_hour
    
    # Image dimensions
    time_column_width = 70
    day_column_width = 120
    header_height = 80
    day_header_height = 40
    row_height = 60  # Height per hour
    
    total_width = time_column_width + (day_column_width * 7) + 20  # +20 for margins
    total_height = header_height + day_header_height + (row_height * num_hours) + 40  # +40 for footer
    
    # Create image
    img = Image.new('RGB', (total_width, total_height), COLORS['background'])
    draw = ImageDraw.Draw(img)
    
    # Get fonts
    title_font = get_font(24, bold=True)
    subtitle_font = get_font(14)
    day_font = get_font(14, bold=True)
    time_font = get_font(11)
    course_code_font = get_font(10, bold=True)
    course_detail_font = get_font(9)
    watermark_font = get_font(10)
    
    # Draw header background
    draw.rectangle(
        [(0, 0), (total_width, header_height)],
        fill=COLORS['header_bg']
    )
    
    # Draw title
    title_text = f"{upload_type.capitalize()} Schedule"
    if title_font:
        draw.text((20, 15), title_text, font=title_font, fill=COLORS['header_text'])
    
    # Draw subtitle (schedule name and date)
    subtitle_text = f"{title} • Generated {datetime.now().strftime('%b %d, %Y')}"
    if user_name:
        subtitle_text = f"{user_name} • {subtitle_text}"
    if subtitle_font:
        draw.text((20, 48), subtitle_text, font=subtitle_font, fill=COLORS['header_text'])
    
    # Draw day headers
    y_day_header = header_height
    draw.rectangle(
        [(0, y_day_header), (total_width, y_day_header + day_header_height)],
        fill=COLORS['day_header_bg']
    )
    
    # Time column header
    if time_font:
        draw.text(
            (time_column_width // 2 - 15, y_day_header + 12),
            "Time",
            font=time_font,
            fill=COLORS['time_text']
        )
    
    # Day column headers
    for i, day in enumerate(DAYS_OF_WEEK):
        x = time_column_width + (i * day_column_width) + (day_column_width // 2) - 15
        if day_font:
            draw.text(
                (x, y_day_header + 10),
                day,
                font=day_font,
                fill=COLORS['day_header_text']
            )
    
    # Draw grid
    grid_start_y = header_height + day_header_height
    
    # Horizontal lines for hours
    for h in range(num_hours + 1):
        y = grid_start_y + (h * row_height)
        draw.line([(0, y), (total_width, y)], fill=COLORS['grid_line'], width=1)
    
    # Vertical lines for days
    for d in range(8):  # 8 lines for 7 columns
        x = time_column_width + (d * day_column_width)
        draw.line([(x, grid_start_y), (x, grid_start_y + (num_hours * row_height))], fill=COLORS['grid_line'], width=1)
    
    # Draw time labels
    for h in range(num_hours):
        hour = start_hour + h
        y = grid_start_y + (h * row_height) + 5
        
        # Format time
        if hour == 0:
            time_label = "12:00 AM"
        elif hour < 12:
            time_label = f"{hour}:00 AM"
        elif hour == 12:
            time_label = "12:00 PM"
        else:
            time_label = f"{hour - 12}:00 PM"
        
        if time_font:
            draw.text((5, y), time_label, font=time_font, fill=COLORS['time_text'])
    
    # Draw courses
    for course in courses:
        day_code = course.get('day', '')
        day_idx = get_day_index(day_code)
        
        if day_idx < 0:
            logger.warning(f"Unknown day code: {day_code}")
            continue
        
        start_time = parse_time(course.get('start_time', '08:00AM'))
        end_time = parse_time(course.get('end_time', '09:00AM'))
        
        # Calculate position
        x1 = time_column_width + (day_idx * day_column_width) + 2
        x2 = x1 + day_column_width - 4
        
        y1 = time_to_row_position(start_time[0], start_time[1], start_hour, row_height, grid_start_y)
        y2 = time_to_row_position(end_time[0], end_time[1], start_hour, row_height, grid_start_y)
        
        # Ensure minimum height
        if y2 - y1 < 30:
            y2 = y1 + 30
        
        # Draw course block
        draw.rectangle([(x1, y1), (x2, y2)], fill=COLORS['course_bg'], outline=COLORS['course_border'], width=2)
        
        # Draw course details
        padding = 4
        text_y = y1 + padding
        
        # Subject code
        subject_code = course.get('subject_code', 'N/A')
        if course_code_font:
            draw.text((x1 + padding, text_y), subject_code[:15], font=course_code_font, fill=COLORS['course_code'])
            text_y += 14
        
        # Time
        time_str = f"{course.get('start_time', '')} - {course.get('end_time', '')}"
        if course_detail_font and (y2 - y1) > 45:
            draw.text((x1 + padding, text_y), time_str[:18], font=course_detail_font, fill=COLORS['course_text'])
            text_y += 12
        
        # Location
        location = course.get('location', '')
        if location and course_detail_font and (y2 - y1) > 60:
            draw.text((x1 + padding, text_y), location[:15], font=course_detail_font, fill=COLORS['course_text'])
    
    # Draw watermark/footer
    footer_y = total_height - 25
    watermark_text = "Generated by SchedScan"
    if watermark_font:
        draw.text(
            (total_width // 2 - 60, footer_y),
            watermark_text,
            font=watermark_font,
            fill=COLORS['watermark']
        )
    
    # Save to BytesIO
    buffer = io.BytesIO()
    img.save(buffer, format='PNG', quality=95)
    buffer.seek(0)
    
    logger.info(f"Generated timetable image: {total_width}x{total_height} with {len(courses)} courses")
    
    return buffer


def generate_and_save_timetable(
    schedule_id: int,
    courses: List[Dict],
    title: str,
    upload_type: str,
    user_id: int,
    user_name: str = None
) -> str:
    """
    Generate a timetable image and save it to the media directory.
    Returns the relative path to the saved image.
    
    Args:
        schedule_id: ID of the schedule
        courses: List of course dictionaries
        title: Schedule title
        upload_type: 'student' or 'faculty'
        user_id: ID of the user
        user_name: Name of the user (optional)
        
    Returns:
        Relative path to the saved image file
    """
    from django.conf import settings
    
    # Generate the image
    image_buffer = generate_timetable_image(
        courses=courses,
        title=title,
        upload_type=upload_type,
        user_name=user_name
    )
    
    # Create filename
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"timetable_user{user_id}_schedule{schedule_id}_{timestamp}.png"
    
    # Ensure timetables directory exists
    timetables_dir = os.path.join(settings.MEDIA_ROOT, 'timetables')
    os.makedirs(timetables_dir, exist_ok=True)
    
    # Save the file
    filepath = os.path.join(timetables_dir, filename)
    with open(filepath, 'wb') as f:
        f.write(image_buffer.getvalue())
    
    logger.info(f"Saved timetable image: {filepath}")
    
    # Return relative path for model field
    return f"timetables/{filename}"
