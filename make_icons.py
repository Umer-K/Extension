#!/usr/bin/env python3
"""
make_icons.py — generates icon16.png, icon48.png, icon128.png
Uses only Python standard library (struct, zlib) — no Pillow required.
Run once: python make_icons.py
"""

import struct
import zlib
import os
import math

def make_png(width, height, pixels):
    """
    Build a PNG file from scratch.
    pixels: list of (R, G, B, A) tuples, row by row, top to bottom.
    Returns bytes.
    """
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    # PNG signature
    sig = b'\x89PNG\r\n\x1a\n'

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    # bit depth=8, color type=2 (RGB), no alpha in IHDR but we'll use RGBA via color type 6
    ihdr_data = struct.pack('>II', width, height) + bytes([8, 6, 0, 0, 0])
    ihdr = chunk(b'IHDR', ihdr_data)

    # Image data
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter type: None
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw += bytes([r, g, b, a])

    compressed = zlib.compress(raw, 9)
    idat = chunk(b'IDAT', compressed)

    # IEND
    iend = chunk(b'IEND', b'')

    return sig + ihdr + idat + iend


def draw_icon(size):
    """
    Draw a dark navy circle with a white 'D' in the center.
    Returns list of (R,G,B,A) tuples.
    """
    # Background color: #0a0f1e
    bg = (10, 15, 30)
    # Accent / circle fill: slightly lighter navy #111827
    circle_fill = (17, 24, 39)
    # Border: #6366f1 (indigo accent)
    border_color = (99, 102, 241)
    # Letter color: white
    letter_color = (241, 245, 249)

    cx = size / 2
    cy = size / 2
    radius = size / 2 - 0.5
    border_thickness = max(1, size * 0.06)

    pixels = []
    for y in range(size):
        for x in range(size):
            dx = x - cx + 0.5
            dy = y - cy + 0.5
            dist = math.sqrt(dx*dx + dy*dy)

            if dist > radius:
                # Outside circle — transparent
                pixels.append((0, 0, 0, 0))
            elif dist > radius - border_thickness:
                # Border ring
                alpha = 255
                # Anti-alias outer edge
                if dist > radius - 0.5:
                    t = (radius - dist) / 0.5
                    alpha = int(255 * max(0, min(1, t)))
                pixels.append((border_color[0], border_color[1], border_color[2], alpha))
            else:
                # Inside circle — draw the letter D
                # Normalize coords to [-1, 1] relative to circle
                nx = dx / (radius - border_thickness)
                ny = dy / (radius - border_thickness)

                in_letter = is_in_D(nx, ny, size)

                if in_letter:
                    pixels.append((letter_color[0], letter_color[1], letter_color[2], 255))
                else:
                    pixels.append((circle_fill[0], circle_fill[1], circle_fill[2], 255))

    return pixels


def is_in_D(nx, ny, size):
    """
    Render the letter 'D' in normalized coordinates [-1,1].
    The D occupies roughly x in [-0.35, 0.35], y in [-0.55, 0.55].
    """
    # D bounding box in normalized coords
    # Vertical stroke on the left
    stroke = 0.14  # stroke width in normalized units

    left   = -0.30
    right  =  0.28
    top    = -0.55
    bottom =  0.55

    # Vertical bar (left side of D)
    bar_left  = left
    bar_right = left + stroke

    # D curve: semicircle on the right side
    # Center of the D bump
    bump_cx = left + stroke / 2
    bump_cy = 0.0
    # Outer radius of bump
    bump_r_outer = right - (left + stroke / 2)
    # Inner radius
    bump_r_inner = bump_r_outer - stroke

    # Horizontal bars (top and bottom of D)
    top_bar_bottom    = top + stroke
    bottom_bar_top    = bottom - stroke

    # Check vertical bar
    if bar_left <= nx <= bar_right and top <= ny <= bottom:
        return True

    # Check top horizontal bar
    if left <= nx <= right * 0.7 and top <= ny <= top_bar_bottom:
        return True

    # Check bottom horizontal bar
    if left <= nx <= right * 0.7 and bottom_bar_top <= ny <= bottom:
        return True

    # Check the curved part of D
    # The curve is a half-ring on the right side
    ddx = nx - bump_cx
    ddy = ny - bump_cy
    dist2 = math.sqrt(ddx*ddx + ddy*ddy)

    if bump_r_inner <= dist2 <= bump_r_outer and ddx >= 0:
        return True

    return False


def save_png(path, size):
    pixels = draw_icon(size)
    data = make_png(size, size, pixels)
    with open(path, 'wb') as f:
        f.write(data)
    print(f"  Created: {path}  ({size}x{size})")


if __name__ == '__main__':
    os.makedirs('icons', exist_ok=True)
    print("Generating icons...")
    save_png('icons/icon16.png',  16)
    save_png('icons/icon48.png',  48)
    save_png('icons/icon128.png', 128)
    print("Done! Icons created in ./icons/")