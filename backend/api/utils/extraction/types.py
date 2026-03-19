from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class CandidateCourse:
    subject_code: str = ""
    subject_name: str = ""
    day: str = ""
    start_time: str = ""
    end_time: str = ""
    location: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ScoreResult:
    confidence: float
    breakdown: Dict[str, float]


@dataclass
class ValidationResult:
    courses: List[Dict[str, Any]]
    errors: List[str]
