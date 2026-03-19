def should_use_fallback(*, quality: float, threshold: float, force_ocr_fallback: bool) -> bool:
    if force_ocr_fallback:
        return True
    return quality < threshold
