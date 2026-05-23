"""
Generate Tasky PWA icons using Pillow.
Outputs:
    icon-192.png            (any-purpose)
    icon-512.png            (any-purpose)
    icon-192-maskable.png   (safe-zone for adaptive icons)
    icon-512-maskable.png   (safe-zone for adaptive icons)
    apple-touch-icon.png    (180x180)
    favicon-32.png          (32x32)

Run from this folder:    python _gen_icons.py
"""

from PIL import Image, ImageDraw

BG       = (15, 20, 25)        # Tasky deep-dark background  #0f1419
PAPER    = (245, 247, 251)     # paper white
ACCENT   = (79, 142, 247)      # Tasky accent blue          #4f8ef7
ACCENT_2 = (130, 175, 255)
LINE     = (210, 215, 225)


def round_rect(draw, xy, radius, fill):
    """Pillow's rounded_rectangle — present since Pillow 8.2."""
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


def draw_clipboard(canvas_size, padding_ratio=0.16):
    """
    Draw a Tasky clipboard glyph centred on a transparent canvas.
    Returns RGBA image of size canvas_size.

    padding_ratio determines how much margin is left around the clipboard
    so the glyph doesn't touch the edges. Larger ratio = smaller glyph.
    Use 0.16 for normal icons; 0.24 for "maskable" icons so the safe zone
    is respected by adaptive icon masks (Android).
    """
    img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = int(canvas_size * padding_ratio)
    cx, cy = canvas_size / 2, canvas_size / 2

    # Clipboard board (rounded rect)
    board_w = canvas_size - pad * 2
    board_h = int(board_w * 1.2)
    board_y0 = int(cy - board_h / 2 + canvas_size * 0.04)
    board_x0 = int(cx - board_w / 2)
    board_x1 = board_x0 + board_w
    board_y1 = board_y0 + board_h
    radius = int(board_w * 0.10)
    round_rect(d, (board_x0, board_y0, board_x1, board_y1), radius, PAPER)

    # Clipboard clip on top
    clip_w = int(board_w * 0.42)
    clip_h = int(board_h * 0.10)
    clip_x0 = int(cx - clip_w / 2)
    clip_y0 = int(board_y0 - clip_h * 0.55)
    clip_x1 = clip_x0 + clip_w
    clip_y1 = clip_y0 + clip_h
    round_rect(d, (clip_x0, clip_y0, clip_x1, clip_y1), int(clip_h * 0.45), (90, 100, 115))

    # Three task lines (dim grey lines)
    line_h = int(board_h * 0.06)
    line_w_full = int(board_w * 0.62)
    line_w_med  = int(board_w * 0.50)
    line_w_short = int(board_w * 0.40)
    inner_x = board_x0 + int(board_w * 0.22)
    base_y  = board_y0 + int(board_h * 0.32)
    gap     = int(board_h * 0.16)

    rows = [
        (line_w_full,  False),  # active task
        (line_w_med,   False),  # active task
        (line_w_short, True),   # completed (we'll strike-through)
    ]
    bullet_r = int(line_h * 0.55)
    for i, (w, done) in enumerate(rows):
        y_mid = base_y + i * gap + int(line_h / 2)
        # Bullet (filled accent for done, hollow for active)
        bx = inner_x - bullet_r * 3
        if done:
            d.ellipse((bx - bullet_r, y_mid - bullet_r, bx + bullet_r, y_mid + bullet_r), fill=ACCENT)
            # tick inside the bullet
            tick = [
                (bx - bullet_r * 0.5, y_mid),
                (bx - bullet_r * 0.1, y_mid + bullet_r * 0.45),
                (bx + bullet_r * 0.55, y_mid - bullet_r * 0.45),
            ]
            d.line(tick, fill=PAPER, width=max(2, int(bullet_r * 0.45)))
        else:
            d.ellipse(
                (bx - bullet_r, y_mid - bullet_r, bx + bullet_r, y_mid + bullet_r),
                outline=(140, 150, 165), width=max(2, int(bullet_r * 0.30))
            )
        # The text bar
        bar_x0 = inner_x
        bar_x1 = inner_x + w
        bar_y0 = y_mid - int(line_h / 2)
        bar_y1 = y_mid + int(line_h / 2)
        bar_color = (165, 175, 190) if done else LINE
        round_rect(d, (bar_x0, bar_y0, bar_x1, bar_y1), int(line_h * 0.4), bar_color)
        if done:
            # Strike-through over the bar
            mid_y = y_mid
            d.line((bar_x0, mid_y, bar_x1, mid_y), fill=(120, 130, 145), width=max(2, int(line_h * 0.32)))

    return img


def generate_icon(size, maskable=False, with_bg=True):
    """Compose final icon: dark background + clipboard glyph + (optional) corner accent."""
    base = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    if with_bg:
        if maskable:
            # Solid background reaching every corner so adaptive masks
            # don't expose transparency
            d.rectangle((0, 0, size, size), fill=BG)
        else:
            # Rounded square background (iOS will further round it)
            corner = int(size * 0.22)
            round_rect(d, (0, 0, size, size), corner, BG)

    pad = 0.24 if maskable else 0.16
    glyph = draw_clipboard(size, padding_ratio=pad)
    base.alpha_composite(glyph)

    # Subtle accent dot in the bottom-right (only on non-maskable so it
    # isn't clipped by adaptive icon masks)
    if not maskable and with_bg:
        r = int(size * 0.06)
        cx = size - int(size * 0.20)
        cy = size - int(size * 0.20)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=ACCENT)
    return base


def save(img, path):
    img.save(path, 'PNG', optimize=True)
    print(f'  wrote {path}  ({img.size[0]}x{img.size[1]})')


if __name__ == '__main__':
    print('Generating Tasky icons…')
    save(generate_icon(192),                   'icon-192.png')
    save(generate_icon(512),                   'icon-512.png')
    save(generate_icon(192, maskable=True),    'icon-192-maskable.png')
    save(generate_icon(512, maskable=True),    'icon-512-maskable.png')
    save(generate_icon(180),                   'apple-touch-icon.png')
    save(generate_icon(32),                    'favicon-32.png')
    print('done.')
