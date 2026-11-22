import io
import os
import sys
import json
import base64
import time
import argparse

# Save real stdout for pure JSON response only, and redirect standard stdout to stderr
# so that no PyTorch, Hugging Face, or tqdm prints can ever pollute stdout.
REAL_STDOUT = sys.stdout
sys.stdout = sys.stderr

# Suppress HuggingFace / PyTorch noise
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["PYTHONWARNINGS"] = "ignore"

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, CURRENT_DIR)

from PIL import Image, ImageOps
import torch

from main import (
    CLASS_NAMES,
    DISEASE_METADATA,
    MODEL_WEIGHTS_PATH,
    PREPROCESS_TRANSFORM,
    get_vision_model,
    clean_and_prepare_image,
    apply_botanical_intelligence,
)

def run_inference(image, crop_hint=None):
    start_time = time.time()
    model = get_vision_model()
    
    if isinstance(image, bytes):
        prepared_image = clean_and_prepare_image(image)
    elif isinstance(image, Image.Image):
        try:
            prepared_image = ImageOps.exif_transpose(image)
        except Exception:
            prepared_image = image
        if prepared_image.mode != "RGB":
            prepared_image = prepared_image.convert("RGB")
    else:
        raise ValueError("Invalid image type")

    tensor = PREPROCESS_TRANSFORM(prepared_image).unsqueeze(0)

    with torch.no_grad():
        raw_logits = model(tensor)
        logits = apply_botanical_intelligence(prepared_image, raw_logits, crop_hint=crop_hint)
        probabilities = torch.softmax(logits, dim=1)[0]

    top_probs, top_indices = torch.topk(probabilities, k=min(3, len(CLASS_NAMES)))
    best_idx = top_indices[0].item()
    best_class = CLASS_NAMES[best_idx]
    confidence_pct = round(top_probs[0].item() * 100, 2)

    metadata = DISEASE_METADATA.get(best_class, {
        "title": best_class.replace("___", " - ").replace("__", " - ").replace("_", " "),
        "crop": "Cultures générales",
        "category": "Pathologie végétale",
        "severity": "Moyen",
        "symptoms": "Anomalies foliaires observées.",
        "impact": "Surveillance conseillée.",
        "urgency": "Consulter un conseiller agronomique.",
        "biological_treatment": "Isoler la plante et appliquer un traitement préventif biologique.",
        "tunisian_advice": {
            "arabic_summary": "« تم رصد إصابة في الأوراق - تابع حالة الحقل »",
            "voice_script": "فحصنا الورقة وثمة بداية مرض. نظف الحقل وراقب بقية النباتات."
        }
    })

    top_3 = []
    for p, idx in zip(top_probs, top_indices):
        c_name = CLASS_NAMES[idx.item()]
        meta = DISEASE_METADATA.get(c_name, {})
        top_3.append({
            "class_raw": c_name,
            "title": meta.get("title", c_name),
            "crop": meta.get("crop", "Inconnu"),
            "confidence_pct": round(p.item() * 100, 2)
        })

    elapsed_ms = round((time.time() - start_time) * 1000, 2)
    return {
        "status": "success",
        "model": "kizuna-dinov2-vit",
        "inference_time_ms": elapsed_ms,
        "prediction": {
            "class_raw": best_class,
            "title": metadata.get("title", best_class),
            "crop": metadata.get("crop", "Cultures générales"),
            "category": metadata.get("category", ""),
            "severity": metadata.get("severity", ""),
            "confidence_pct": confidence_pct,
            "symptoms": metadata.get("symptoms", ""),
            "impact": metadata.get("impact", ""),
            "urgency": metadata.get("urgency", ""),
            "biological_treatment": metadata.get("biological_treatment", ""),
            "tunisian_advice": metadata.get("tunisian_advice", {})
        },
        "top_3": top_3
    }

def main():
    parser = argparse.ArgumentParser(description="Kizuna Vision Model CLI inference")
    parser.add_argument("input", nargs="?", default=None, help="Image path or omit if using --base64")
    parser.add_argument("--base64", dest="base64_mode", action="store_true", help="Read base64 from stdin")
    parser.add_argument("--crop", dest="crop", default=None, help="Optional crop hint (e.g. Olive, Tomato, Citrus)")
    
    args = parser.parse_args()
    
    try:
        if args.base64_mode or args.input == "--base64" or args.input is None:
            raw = sys.stdin.read().strip()
            if not raw:
                raise ValueError("No input data provided on stdin")
            if "," in raw:
                raw = raw.split(",", 1)[1]
            img_bytes = base64.b64decode(raw)
            result = run_inference(img_bytes, crop_hint=args.crop)
        else:
            with open(args.input, "rb") as f:
                img_bytes = f.read()
            result = run_inference(img_bytes, crop_hint=args.crop)
            
        REAL_STDOUT.write(json.dumps(result, ensure_ascii=False) + "\n")
        REAL_STDOUT.flush()
    except Exception as e:
        REAL_STDOUT.write(json.dumps({"status": "error", "message": str(e)}) + "\n")
        REAL_STDOUT.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
