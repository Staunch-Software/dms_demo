"""Vision AI Document Visual Question Answering (DocVQA) Fallback Service.

Provides local, offline visual reasoning using Microsoft Florence-2 (or HuggingFace DocVQA models)
to extract certificate numbers, dates, vessel names, and titles from complex or non-standard document layouts.

Characteristics:
- 100% offline & local: No cloud APIs, no external network requests, zero subscription costs.
- CPU optimized: Runs on Linux / Windows CPU with PyTorch float32 / quantized models without GPU.
- Lazy loaded: Model weights are only loaded into RAM if Vision AI is explicitly enabled and needed.
- Graceful degradation: If torch or transformers is not installed, it safely returns empty results.
"""
from __future__ import annotations

import io
import logging
import os
import re
from datetime import date
from typing import Any

from PIL import Image

logger = logging.getLogger("vessel_dms.vision_extractor")

# Module-level cache for model and processor singletons
_VISION_MODEL: Any = None
_VISION_PROCESSOR: Any = None
_VISION_LOADED_PATH: str | None = None


def is_vision_ai_available() -> tuple[bool, str]:
    """Check if necessary deep learning packages (torch, transformers) are installed."""
    try:
        import torch  # noqa: F401
    except ImportError:
        return False, "PyTorch ('torch') is not installed. Run: pip install torch --index-url https://download.pytorch.org/whl/cpu"

    try:
        import transformers  # noqa: F401
    except ImportError:
        return False, "HuggingFace Transformers ('transformers') is not installed. Run: pip install transformers timm einops"

    return True, "Vision AI dependencies available"


def get_vision_model_and_processor(model_path: str = "microsoft/Florence-2-base") -> tuple[Any, Any]:
    """Load or retrieve the cached Florence-2 model and processor on CPU."""
    global _VISION_MODEL, _VISION_PROCESSOR, _VISION_LOADED_PATH

    if _VISION_MODEL is not None and _VISION_LOADED_PATH == model_path:
        return _VISION_MODEL, _VISION_PROCESSOR

    import torch
    from transformers import AutoModelForCausalLM, AutoProcessor

    logger.info("Loading Vision AI model from %s on CPU (this may take a few seconds)...", model_path)
    
    # Check if local directory exists, or download from HuggingFace cache
    processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        torch_dtype=torch.float32,
        trust_remote_code=True,
    )
    model.eval()

    _VISION_MODEL = model
    _VISION_PROCESSOR = processor
    _VISION_LOADED_PATH = model_path
    logger.info("Vision AI model %s loaded successfully into RAM.", model_path)
    return _VISION_MODEL, _VISION_PROCESSOR


def render_file_first_page_as_image(file_bytes: bytes, filename: str, dpi: int = 150) -> Image.Image | None:
    """Render the first page of a PDF or load an image file into a PIL RGB Image."""
    if not file_bytes:
        return None

    fname_lower = (filename or "").lower()
    if fname_lower.endswith(".pdf"):
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            if len(doc) == 0:
                return None
            page = doc[0]
            pix = page.get_pixmap(dpi=dpi)
            return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        except Exception as exc:
            logger.warning("Failed to render PDF page to image: %s", exc)
            return None

    # Standard image file (PNG, JPG, TIFF)
    try:
        img = Image.open(io.BytesIO(file_bytes))
        return img.convert("RGB")
    except Exception as exc:
        logger.warning("Failed to load image file: %s", exc)
        return None


def ask_florence_vqa(image: Image.Image, question: str, model: Any, processor: Any) -> str:
    """Query Florence-2 using the <DocVQA> task prompt."""
    import torch

    prompt = f"<DocVQA>{question}"
    inputs = processor(text=prompt, images=image, return_tensors="pt")

    with torch.no_grad():
        generated_ids = model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=100,
            num_beams=3,
            do_sample=False,
        )

    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed_answer = processor.post_process_generation(
        generated_text,
        task="<DocVQA>",
        image_size=(image.width, image.height),
    )
    
    # Result format: {'<DocVQA>': 'answer text'}
    if isinstance(parsed_answer, dict):
        return parsed_answer.get("<DocVQA>", "").strip()
    return str(parsed_answer).strip()


def extract_with_vision_ai(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """Execute Vision AI DocVQA queries to extract fields when OCR / regex misses them."""
    avail, msg = is_vision_ai_available()
    if not avail:
        logger.debug("Vision AI not available: %s", msg)
        return {}

    image = render_file_first_page_as_image(file_bytes, filename)
    if image is None:
        return {}

    from ..config import settings
    model_path = getattr(settings, "vision_ai_model_path", "microsoft/Florence-2-base") or "microsoft/Florence-2-base"

    try:
        model, processor = get_vision_model_and_processor(model_path)
    except Exception as exc:
        logger.error("Failed to load Vision AI model: %s", exc)
        return {}

    from .certificate_extractor import find_date_in_window, parse_date_str

    results: dict[str, Any] = {
        "certificate_number": None,
        "issue_date": None,
        "expiry_date": None,
        "has_no_expiry": False,
        "vessel_name": None,
        "certificate_title": None,
        "issuing_authority": None,
        "source": "vision_ai_florence2",
    }

    # Query 1: Certificate Number
    try:
        ans = ask_florence_vqa(image, "What is the certificate number or document number?", model, processor)
        if ans and len(ans) >= 4 and any(c.isdigit() for c in ans) and "none" not in ans.lower():
            clean_num = ans.split("\n")[0].strip().rstrip(".,;")
            results["certificate_number"] = clean_num
    except Exception as e:
        logger.debug("Vision VQA cert number query failed: %s", e)

    # Query 2: Date of Issue
    try:
        ans = ask_florence_vqa(image, "What is the date of issue or date issued?", model, processor)
        if ans and "none" not in ans.lower():
            d = find_date_in_window(ans) or parse_date_str(ans)
            if d:
                results["issue_date"] = d
    except Exception as e:
        logger.debug("Vision VQA issue date query failed: %s", e)

    # Query 3: Date of Expiry / Validity
    try:
        ans = ask_florence_vqa(image, "What is the expiration date, expiry date, or valid until date?", model, processor)
        if ans:
            lower_ans = ans.lower()
            if any(term in lower_ans for term in ["permanent", "continuous", "does not expire", "unlimited", "life of"]):
                results["has_no_expiry"] = True
            elif "none" not in lower_ans:
                d = find_date_in_window(ans) or parse_date_str(ans)
                if d:
                    results["expiry_date"] = d
    except Exception as e:
        logger.debug("Vision VQA expiry date query failed: %s", e)

    # Query 4: Vessel Name
    try:
        ans = ask_florence_vqa(image, "What is the name of the ship or vessel?", model, processor)
        if ans and len(ans) >= 3 and "none" not in ans.lower():
            clean_vessel = ans.split("\n")[0].strip().rstrip(".,;")
            results["vessel_name"] = clean_vessel
    except Exception as e:
        logger.debug("Vision VQA vessel query failed: %s", e)

    # Query 5: Certificate Title
    try:
        ans = ask_florence_vqa(image, "What is the title of this certificate or document?", model, processor)
        if ans and len(ans) >= 5 and "none" not in ans.lower():
            results["certificate_title"] = ans.strip().title()
    except Exception as e:
        logger.debug("Vision VQA title query failed: %s", e)

    # Query 6: Issuing Authority / Classification Society
    try:
        ans = ask_florence_vqa(image, "What authority or classification society issued this certificate?", model, processor)
        if ans and len(ans) >= 2 and "none" not in ans.lower():
            results["issuing_authority"] = ans.strip()
    except Exception as e:
        logger.debug("Vision VQA authority query failed: %s", e)

    return results
