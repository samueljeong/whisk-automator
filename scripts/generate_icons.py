#!/usr/bin/env python3
"""Generate simple icons for the Whisk Automator extension."""

from PIL import Image, ImageDraw
import os

# Icon sizes
SIZES = [16, 48, 128]

# Colors
BG_COLOR = (99, 102, 241)  # Indigo
ACCENT_COLOR = (255, 255, 255)  # White

def create_icon(size):
    """Create a simple icon with a 'W' letter and sparkle effect."""
    # Create image with anti-aliasing support
    scale = 4
    img_size = size * scale
    img = Image.new('RGBA', (img_size, img_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw rounded rectangle background
    padding = int(img_size * 0.1)
    radius = int(img_size * 0.2)
    draw.rounded_rectangle(
        [padding, padding, img_size - padding, img_size - padding],
        radius=radius,
        fill=BG_COLOR
    )

    # Draw a simple 'W' shape
    center = img_size // 2
    w_width = int(img_size * 0.5)
    w_height = int(img_size * 0.4)
    w_left = center - w_width // 2
    w_right = center + w_width // 2
    w_top = center - w_height // 2
    w_bottom = center + w_height // 2

    line_width = max(2, int(img_size * 0.08))

    # Draw W shape
    points = [
        (w_left, w_top),
        (w_left + w_width * 0.25, w_bottom),
        (center, w_top + w_height * 0.4),
        (w_right - w_width * 0.25, w_bottom),
        (w_right, w_top),
    ]
    draw.line(points, fill=ACCENT_COLOR, width=line_width, joint='curve')

    # Draw small sparkle/star in corner
    sparkle_size = int(img_size * 0.12)
    sparkle_x = w_right - sparkle_size
    sparkle_y = w_top - sparkle_size

    # 4-point star
    draw.polygon([
        (sparkle_x, sparkle_y - sparkle_size),
        (sparkle_x + sparkle_size // 3, sparkle_y),
        (sparkle_x + sparkle_size, sparkle_y),
        (sparkle_x + sparkle_size // 3, sparkle_y),
        (sparkle_x, sparkle_y + sparkle_size),
        (sparkle_x - sparkle_size // 3, sparkle_y),
        (sparkle_x - sparkle_size, sparkle_y),
        (sparkle_x - sparkle_size // 3, sparkle_y),
    ], fill=(255, 220, 100))

    # Resize back to target size with anti-aliasing
    img = img.resize((size, size), Image.Resampling.LANCZOS)

    return img


def main():
    # Create icons directory if it doesn't exist
    icons_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    for size in SIZES:
        icon = create_icon(size)
        icon_path = os.path.join(icons_dir, f'icon{size}.png')
        icon.save(icon_path, 'PNG')
        print(f'Created: {icon_path}')

    print('All icons generated!')


if __name__ == '__main__':
    main()
