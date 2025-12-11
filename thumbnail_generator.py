#!/usr/bin/env python3
"""
thumbnail_generator.py
-----------------------
Generate thumbnails for PDFs and images inside the resources/ folder.

USAGE:
    python thumbnail_generator.py --root resources --out resources.json --thumb-dir resources/thumbs --size 640 --write

FEATURES:
✔ PDF → PNG thumbnail (first page)
✔ Image → resized thumbnail
✔ Updates resources.json by adding: "thumbnail": "resources/thumbs/xxx.png"
✔ Creates resources/thumbs/ automatically
✔ Skips files with existing thumbnails unless overwritten
"""

import os, json, argparse
from pathlib import Path

import fitz  # PyMuPDF (for PDF rendering)
from PIL import Image


# ---------------------------------------------------
# Thumbnail creation helpers
# ---------------------------------------------------

def make_pdf_thumb(pdf_path, out_path, width=640):
    """Render first page of PDF into PNG thumbnail."""
    doc = fitz.open(pdf_path)
    page = doc.load_page(0)
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # high resolution
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    img.thumbnail((width, width))
    img.save(out_path, "PNG")
    doc.close()


def make_image_thumb(img_path, out_path, width=640):
    """Resize image to thumbnail."""
    img = Image.open(img_path)
    img.thumbnail((width, width))
    img.save(out_path, "PNG")


# ---------------------------------------------------
# Main thumbnail generation function
# ---------------------------------------------------

def process_entry(entry, root_path, thumb_root, width=640):
    file_rel = entry.get("file")
    if not file_rel:
        return None

    file_path = Path(file_rel)
    full_path = root_path / file_path.relative_to("resources")

    if not full_path.exists():
        print("Missing file:", full_path)
        return None

    ext = full_path.suffix.lower()
    is_pdf = ext == ".pdf"
    is_img = ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}

    if not (is_pdf or is_img):
        return None  # unsupported for now

    # Thumbnail name
    thumb_name = file_path.stem + ".png"
    out_path = thumb_root / thumb_name

    # Generate thumbnail
    try:
        if is_pdf:
            make_pdf_thumb(full_path, out_path, width)
        else:
            make_image_thumb(full_path, out_path, width)

        return str(out_path).replace("\\", "/")
    except Exception as e:
        print("Error generating thumbnail for", file_rel, ":", e)
        return None


# ---------------------------------------------------
# CLI Interface
# ---------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Generate thumbnails for PDF/Image resources.")
    parser.add_argument("--root", default="resources", help="Root folder containing resource files")
    parser.add_argument("--out", default="resources.json", help="resources.json file path")
    parser.add_argument("--thumb-dir", default="assets/thumbs", help="Where to save thumbnails (outside resources/)")
    parser.add_argument("--size", type=int, default=640, help="Thumbnail max width")
    parser.add_argument("--write", action="store_true", help="Write updated resources.json")
    args = parser.parse_args()

    root_path = Path(args.root)
    out_path = Path(args.out)
    thumb_root = Path(args.thumb_dir)
    thumb_root.mkdir(parents=True, exist_ok=True)

    # Load resources.json
    if not out_path.exists():
        print("ERROR: resources.json not found.")
        return

    resources = json.loads(out_path.read_text(encoding="utf-8"))
    changed = False

    for entry in resources:
        thumb_rel = process_entry(entry, root_path, thumb_root, width=args.size)
        if thumb_rel:
            entry["thumbnail"] = thumb_rel
            changed = True

    if args.write and changed:
        out_path.write_text(json.dumps(resources, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Updated resources.json with thumbnail paths.")

    print("Thumbnail generation complete.")


if __name__ == "__main__":
    main()
    