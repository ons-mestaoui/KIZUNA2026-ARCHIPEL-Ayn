import io
import os
import sys
import json
import base64
import time
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, CURRENT_DIR)

from main import CLASS_NAMES, DISEASE_METADATA, MODEL_WEIGHTS_PATH, PREPROCESS_TRANSFORM, get_vision_model

def run_inference(image: Image.Image):
    start_time = time.time()
    model = get_vision_model()
    tensor = PREPROCESS_TRANSFORM(image.convert("RGB")).unsqueeze(0)
    
    with torch.no_grad():
        logits = model(tensor)
        probabilities = torch.softmax(logits, dim=1)[0]
    
    top_probs, top_indices = torch.topk(probabilities, k=min(3, len(CLASS_NAMES)))
    best_idx = top_indices[0].item()
    best_class = CLASS_NAMES[best_idx]
    confidence_pct = round(top_probs[0].item() * 100, 2)
    
    metadata = DISEASE_METADATA.get(best_class, {
        "title": best_class.replace("___", " - "),
        "crop": "Tomate",
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
            "confidence_pct": round(p.item() * 100, 2)
        })
    
    elapsed_ms = round((time.time() - start_time) * 1000, 2)
    return {
        "status": "success",
        "model": "kizuna-mobilenetv3",
        "inference_time_ms": elapsed_ms,
        "prediction": {
            "class_raw": best_class,
            "title": metadata.get("title", best_class),
            "crop": metadata.get("crop", "Tomate"),
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
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "Usage: python infer.py <image_path | --base64>"}))
        sys.exit(1)
        
    arg = sys.argv[1]
    try:
        if arg == "--base64":
            raw = sys.stdin.read().strip()
            if "," in raw:
                raw = raw.split(",", 1)[1]
            img_bytes = base64.b64decode(raw)
            image = Image.open(io.BytesIO(img_bytes))
        else:
            image = Image.open(arg)
            
        result = run_inference(image)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
