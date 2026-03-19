from typing import Callable, Dict, List

from .profiler import profile_document


class StagedExtractionOrchestrator:
    """
    Stage runner for Phase 2 extraction flow.

    Stage order:
    1) profile
    2) primary extraction by input family
    3) fallback branch handled inside PDF stage callback
    """

    def __init__(
        self,
        *,
        extract_pdf: Callable[..., Dict],
        extract_image: Callable[..., Dict],
    ):
        self._extract_pdf = extract_pdf
        self._extract_image = extract_image

    def run(self, *, file_path: str, upload_type: str, force_ocr_fallback: bool = False) -> Dict:
        profile = profile_document(file_path)
        attempts: List[str] = []

        if profile['input_family'] == 'pdf':
            result = self._extract_pdf(
                file_path,
                upload_type,
                attempts,
                force_ocr_fallback=force_ocr_fallback,
            )
        else:
            result = self._extract_image(file_path, upload_type, attempts)

        result['attempts'] = attempts
        result['template_family'] = profile.get('template_family', '')
        return result
