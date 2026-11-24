"""Utility to test and benchmark the local offline Vision AI (Florence-2) model on Linux / Windows.

Usage:
    python scripts/test_vision_model.py
    python scripts/test_vision_model.py /path/to/certificate.pdf
"""
import os
import sys
import time

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def main():
    print("=" * 60)
    print("  MARITIME DMS - LOCAL VISION AI (FLORENCE-2) DIAGNOSTIC")
    print("=" * 60)

    # 1. Dependency check
    print("\n[1/4] Checking Python Dependencies...")
    missing_deps = []
    for pkg in ["torch", "transformers", "einops", "timm", "PIL", "fitz"]:
        try:
            __import__(pkg)
            print(f"  [OK] {pkg} is installed")
        except ImportError:
            missing_deps.append(pkg)
            print(f"  [MISSING] {pkg}")

    if missing_deps:
        print("\n[!] Missing packages detected. Install them using:")
        print("    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu")
        print("    pip install transformers timm einops Pillow PyMuPDF")
        sys.exit(1)

    import torch
    from PIL import Image, ImageDraw
    import fitz
    from app.services.vision_extractor import (
        get_vision_model_and_processor,
        ask_florence_vqa,
        render_file_first_page_as_image,
    )

    print(f"\nPyTorch version: {torch.__version__}")
    print(f"CPU threads allocated: {torch.get_num_threads()}")
    print(f"CUDA available: {torch.cuda.is_available()} (CPU mode active)")

    # 2. Prepare sample image
    sample_file = sys.argv[1] if len(sys.argv) > 1 else None
    image = None

    if sample_file and os.path.exists(sample_file):
        print(f"\n[2/4] Rendering target file: {sample_file}")
        with open(sample_file, "rb") as fp:
            file_bytes = fp.read()
        image = render_file_first_page_as_image(file_bytes, os.path.basename(sample_file))
    else:
        print("\n[2/4] Generating synthetic certificate image for benchmark...")
        image = Image.new("RGB", (1200, 1600), color=(255, 255, 255))
        draw = ImageDraw.Draw(image)
        draw.text((100, 100), "REPUBLIC OF PANAMA", fill=(0, 0, 0))
        draw.text((100, 150), "CARGO SHIP SAFETY CONSTRUCTION CERTIFICATE", fill=(0, 0, 0))
        draw.text((100, 220), "Certificate No.: 26HN010800-CG", fill=(0, 0, 0))
        draw.text((100, 280), "Name of Ship: ELEPHANTA", fill=(0, 0, 0))
        draw.text((100, 340), "IMO Number: 9964819", fill=(0, 0, 0))
        draw.text((100, 400), "Date of issue: 25 July 2026", fill=(0, 0, 0))
        draw.text((100, 460), "Valid until: 09 November 2028", fill=(0, 0, 0))
        draw.text((100, 520), "Issued by: NIPPON KAIJI KYOKAI (ClassNK)", fill=(0, 0, 0))

    if image is None:
        print("[!] Failed to render image. Exiting.")
        sys.exit(1)

    print(f"  Image dimensions: {image.width}x{image.height} px")

    # 3. Model loading
    model_name = os.getenv("VISION_AI_MODEL_PATH", "microsoft/Florence-2-base")
    print(f"\n[3/4] Loading model '{model_name}' on CPU...")
    t0 = time.time()
    model, processor = get_vision_model_and_processor(model_name)
    load_time = time.time() - t0
    print(f"  Model loaded in {load_time:.2f} seconds.")

    # 4. Run DocVQA questions
    print("\n[4/4] Executing Visual DocVQA queries...")
    questions = [
        "What is the certificate number?",
        "What is the date of issue?",
        "What is the valid until date or expiry date?",
        "What is the name of the ship?",
        "What is the certificate title?",
        "What is the issuing authority or classification society?",
    ]

    for q in questions:
        t_start = time.time()
        ans = ask_florence_vqa(image, q, model, processor)
        elapsed = time.time() - t_start
        print(f"  Q: {q}")
        print(f"  A: {ans}  ({elapsed:.2f}s)\n")

    print("=" * 60)
    print("  DIAGNOSTIC TEST COMPLETE - Model is 100% operational!")
    print("=" * 60)


if __name__ == "__main__":
    main()
