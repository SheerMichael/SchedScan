"""
OCR Utility for extracting course information from Certificate of Registration (COR) documents.
Uses the doctr library for document processing and text extraction.
"""

from doctr.io import DocumentFile
from doctr.models import kie_predictor
import re
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)


class CORExtractor:
    """
    Extracts course information from Certificate of Registration (COR) documents.
    Supports both PDF and image formats.
    """
    
    def __init__(self, model=None):
        """
        Initialize the CORExtractor with a doctr KIE predictor model.
        
        Args:
            model: Pre-loaded doctr KIE predictor model. If None, will load default model.
        """
        if model is None:
            logger.info("Loading KIE predictor model...")
            self.model = kie_predictor(
                det_arch='db_resnet50', 
                reco_arch='crnn_vgg16_bn',
                pretrained=True
            )
            logger.info("Model loaded successfully!")
        else:
            self.model = model

    def extract_from_document(self, file_path: str) -> List[Dict]:
        """
        Extract course information from a document (PDF or image).
        
        Args:
            file_path: Path to the document file
            
        Returns:
            List of dictionaries containing course information
        """
        try:
            # Load document with appropriate method
            if file_path.lower().endswith('.pdf'):
                logger.info("Loading PDF at 300 DPI (higher quality)...")
                scale_factor = 300 / 72  # Calculate scale for 300 DPI
                doc = DocumentFile.from_pdf(file_path, scale=scale_factor)
            else:
                doc = DocumentFile.from_images(file_path)
            
            # Process document with model
            result = self.model(doc)
            
            # Parse and return results
            return self._parse_document_elements(result)
        
        except Exception as e:
            logger.error(f"Error extracting from document: {str(e)}")
            raise

    def _parse_document_elements(self, result) -> List[Dict]:
        """
        Parse the model output into structured elements.
        
        Args:
            result: Output from the doctr model
            
        Returns:
            List of course dictionaries
        """
        all_elements = []
        
        # Extract all text elements from all pages
        for page in result.pages:
            predictions = page.predictions
            for class_name, pred_list in predictions.items():
                for pred in pred_list:
                    all_elements.append({
                        'text': pred.value.strip(),
                        'geometry': pred.geometry
                    })
        
        # Sort elements by position (Y coordinate first, then X)
        all_elements.sort(
            key=lambda x: (x['geometry'][0][1], x['geometry'][0][0]) 
            if x['geometry'] else (0, 0)
        )
        
        # Group elements into courses
        return self._group_into_courses(all_elements)

    def _group_into_courses(self, elements: List[Dict]) -> List[Dict]:
        """
        Group text elements into structured course information.
        Uses geometric/spatial parsing approach:
        1. Find anchors (subject codes)
        2. Find subject name spatially (to the right of anchor on same row)
        3. Collect details vertically below anchor (until next anchor)
        4. Parse details blob with regex
        
        Args:
            elements: Sorted list of text elements with geometry
            
        Returns:
            List of course dictionaries
        """
        courses = []
        
        # Define regex patterns for parsing
        subject_code_pattern = re.compile(r'^[A-Z]{4,}\d{5,}$')
        time_pattern = re.compile(r'([0-9]{2}:[0-9]{2}[AP]M)')
        day_pattern = re.compile(r'\b(M|T|W|TH|F|S|TF|MW|MWF|MTH|TTH)\b')
        location_pattern = re.compile(r'\b(LR\d*|LAB\d*|CLA\d*|COM\s?LAB\d*)\b', re.IGNORECASE)
        is_number_pattern = re.compile(r'^\d+(\.\d{1,2})?$')
        
        # Geometric tolerance for matching elements on same row
        Y_TOLERANCE = 0.02
        
        # Find all subject code anchors
        anchors = []
        for i, elem in enumerate(elements):
            if subject_code_pattern.match(elem['text']):
                anchors.append({
                    'index': i,
                    'text': elem['text'],
                    'geometry': elem['geometry']
                })
        
        # Memory for repeated subject codes
        subject_name_map = {}
        
        # Process each anchor
        for anchor_idx, anchor in enumerate(anchors):
            subject_code = anchor['text']
            anchor_geom = anchor['geometry']
            anchor_y = anchor_geom[0][1]  # min_y of anchor
            anchor_x_max = anchor_geom[1][0]  # max_x of anchor
            
            # Determine the range of elements for this anchor
            start_index = anchor['index']
            end_index = anchors[anchor_idx + 1]['index'] if anchor_idx + 1 < len(anchors) else len(elements)
            
            # STEP 1: Find Subject Name Spatially
            current_subject_name = ''
            subject_name_parts = []
            
            for i in range(start_index + 1, end_index):
                elem = elements[i]
                elem_geom = elem['geometry']
                elem_y = elem_geom[0][1]
                elem_x = elem_geom[0][0]
                
                # Check if on same row (Y overlaps)
                if abs(elem_y - anchor_y) < Y_TOLERANCE:
                    # Check if to the right of anchor
                    if elem_x > anchor_x_max:
                        text = elem['text']
                        
                        # Stop collecting if we hit time/location/day patterns
                        if time_pattern.match(text):
                            break
                        if is_number_pattern.match(text):
                            continue
                        if location_pattern.match(text):
                            break
                        if day_pattern.match(text):
                            break
                        
                        # Collect this text as part of subject name
                        subject_name_parts.append(text)
            
            # Join collected parts to form complete subject name
            if subject_name_parts:
                current_subject_name = ' '.join(subject_name_parts)
            
            # Fallback to memory if no name found
            if not current_subject_name:
                current_subject_name = subject_name_map.get(subject_code, '')
            else:
                subject_name_map[subject_code] = current_subject_name
            
            # STEP 2: Collect Details Blob (vertically below anchor)
            details_blob = []
            for i in range(start_index + 1, end_index):
                elem = elements[i]
                if elem['text'] != current_subject_name:
                    details_blob.append(elem['text'])
            
            # STEP 3: Parse Details Blob with Regex
            blob_text = ' '.join(details_blob)
            
            time_matches = time_pattern.findall(blob_text)
            day_matches = day_pattern.findall(blob_text)
            location_matches = location_pattern.findall(blob_text)
            
            # Clean up locations (remove spaces, uppercase)
            location_list = [re.sub(r'\s+', '', loc.upper()) for loc in location_matches]
            
            # STEP 4: Build Time Pairs
            pairs = []
            for j in range(len(time_matches) // 2):
                pairs.append((time_matches[j*2], time_matches[j*2+1]))
            if not pairs and len(time_matches) >= 2:
                pairs.append((time_matches[0], time_matches[1]))
            
            if not pairs:  # No time found, skip this entry
                continue
            
            # STEP 5: Assemble Course Entries
            for idx_pair, (start_time, end_time) in enumerate(pairs):
                course = {
                    'subject_code': subject_code,
                    'subject_name': current_subject_name,
                    'start_time': start_time,
                    'end_time': end_time,
                    'day': day_matches[idx_pair] if idx_pair < len(day_matches) else (day_matches[0] if day_matches else ''),
                    'location': location_list[idx_pair] if idx_pair < len(location_list) else (location_list[0] if location_list else '')
                }
                courses.append(course)
        
        logger.info(f"Extracted {len(courses)} courses from document")
        return courses
