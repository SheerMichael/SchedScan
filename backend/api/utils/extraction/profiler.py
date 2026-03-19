import os
from typing import Dict


def profile_document(file_path: str) -> Dict[str, str]:
    """
    Lightweight document profiler used by staged extraction.
    """
    extension = os.path.splitext(file_path)[1].lower()
    is_pdf = extension == '.pdf'
    is_image = extension in {'.png', '.jpg', '.jpeg'}

    if is_pdf:
        template_family = 'pdf_generic'
    elif is_image:
        template_family = 'image_generic'
    else:
        template_family = 'unknown'

    return {
        'file_extension': extension,
        'template_family': template_family,
        'input_family': 'pdf' if is_pdf else 'image' if is_image else 'unknown',
    }
