import io

from PIL import Image, ImageOps

SMALL = 1600
SCALE = 2.5
SURE = 0.8
MARK = "(?)"

_engine = None


def read(photo):
    """Read a receipt photo on this computer into text with one receipt row per line"""
    global _engine
    if _engine is None:
        from rapidocr import RapidOCR
        _engine = RapidOCR()

    result = _engine(photo)
    if result.boxes is None:
        return ""

    pieces = []
    for box, text, score in zip(result.boxes, result.txts, result.scores):
        tl, tr, br, bl = box
        pieces.append({
            "text": text,
            "sure": score >= SURE,
            "left": tl[0],
            "center": (tl[0] + br[0]) / 2,
            "middle": (tl[1] + br[1]) / 2,
            "height": bl[1] - tl[1],
            "width": tr[0] - tl[0],
            "rise": tr[1] - tl[1],
        })

    return rows(pieces)


def enlarge(photo):
    """Return a bigger copy of a small photo or None when the photo is already big"""
    image = Image.open(io.BytesIO(photo))
    if max(image.size) >= SMALL:
        return None

    image = ImageOps.exif_transpose(image).convert("RGB")
    image = image.resize((round(image.width * SCALE), round(image.height * SCALE)), Image.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def straighten(pieces):
    """Undo the tilt of a photo so a price lines up with its item name"""
    width = sum(piece["width"] for piece in pieces)
    if width <= 0:
        return

    tilt = sum(piece["rise"] for piece in pieces) / width
    for piece in pieces:
        piece["middle"] -= tilt * piece["center"]


def rows(pieces):
    """Join text pieces at the same height into receipt rows and mark rows with shaky pieces"""
    straighten(pieces)
    pieces.sort(key=lambda piece: piece["middle"])

    groups = []
    for piece in pieces:
        if groups and abs(piece["middle"] - groups[-1][0]["middle"]) < piece["height"] * 0.6:
            groups[-1].append(piece)
        else:
            groups.append([piece])

    lines = []
    for group in groups:
        group.sort(key=lambda piece: piece["left"])
        line = " ".join(piece["text"] for piece in group)
        if not all(piece["sure"] for piece in group):
            line = MARK + " " + line
        lines.append(line)

    return "\n".join(lines)
