import io

from PIL import Image, ImageOps

SMALL_PHOTO = 1600  # pixels on the longer side. Phone photos are bigger; pictures saved from a website are smaller
ENLARGE_BY = 2.5    # how many times bigger enlarge_small_photo makes a small photo

# The reader scores every piece of text from 0 (a guess) to 1 (certain).
# A row holding a piece below this score gets UNSURE_MARK in front, so the app can ask the user to check it.
UNSURE_BELOW = 0.8
UNSURE_MARK = "(?)"

_local_engine = None  # the text-reading model is big, so it is loaded once, on the first scan


def extract_text(image_bytes):
    """Turn a receipt photo (raw bytes) into text, one receipt row per line.
    Runs on this computer with RapidOCR: free, no internet, no limits."""
    global _local_engine
    if _local_engine is None:
        from rapidocr import RapidOCR
        _local_engine = RapidOCR()

    result = _local_engine(image_bytes)
    if result.boxes is None:
        return ""  # no readable text in the image

    # Each piece of text comes with a box: 4 corner points (each one is x, y)
    pieces = []
    for box, text, score in zip(result.boxes, result.txts, result.scores):
        top_left, top_right, bottom_right, bottom_left = box
        pieces.append({
            "text": text,
            "sure": score >= UNSURE_BELOW,
            "left": top_left[0],
            "center": (top_left[0] + bottom_right[0]) / 2,
            "middle": (top_left[1] + bottom_right[1]) / 2,
            "height": bottom_left[1] - top_left[1],
            "width": top_right[0] - top_left[0],
            "rise": top_right[1] - top_left[1],  # how much lower the right end is than the left end
        })

    return group_into_rows(pieces)


def enlarge_small_photo(image_bytes):
    """In a small photo the letters are only a few pixels tall, and some get misread.
    Returns a bigger copy to read as a second try, or None when the photo is already big."""
    image = Image.open(io.BytesIO(image_bytes))
    if max(image.size) >= SMALL_PHOTO:
        return None

    image = ImageOps.exif_transpose(image)  # stand the photo upright the way the phone meant it
    image = image.convert("RGB")
    image = image.resize((round(image.width * ENLARGE_BY), round(image.height * ENLARGE_BY)), Image.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def straighten(pieces):
    """A photo is almost never perfectly level, so a price on the right sits a little
    lower (or higher) than its item name on the left. Measure that tilt and undo it."""
    total_width = sum(piece["width"] for piece in pieces)
    if total_width <= 0:
        return

    tilt = sum(piece["rise"] for piece in pieces) / total_width
    for piece in pieces:
        piece["middle"] = piece["middle"] - tilt * piece["center"]


def group_into_rows(pieces):
    """The OCR reads an item name and its price as two separate pieces.
    Pieces at about the same height on the page belong to the same row."""
    straighten(pieces)
    pieces.sort(key=lambda piece: piece["middle"])

    rows = []
    for piece in pieces:
        last_row = rows[-1] if rows else None
        if last_row and abs(piece["middle"] - last_row[0]["middle"]) < piece["height"] * 0.6:
            last_row.append(piece)
        else:
            rows.append([piece])

    lines = []
    for row in rows:
        row.sort(key=lambda piece: piece["left"])
        line = " ".join(piece["text"] for piece in row)
        if not all(piece["sure"] for piece in row):
            line = UNSURE_MARK + " " + line
        lines.append(line)

    return "\n".join(lines)


if __name__ == "__main__":
    with open("sample_receipt.jpg", "rb") as image_file:
        print(extract_text(image_file.read()))
