# Avatar Image Guide — Character Sheet Approach

## Quick Start

1. Copy the **Character Sheet Prompt** below into GPT Image 2
2. Fill in `[CHARACTER DESCRIPTION]` with your character
3. Generate the image
4. Run the slicer:

```bash
node scripts/slice-avatar.mjs path/to/your-sheet.png
```

This automatically cuts the 2×2 grid into the 4 PNGs this app expects.

---

## Character Sheet Prompt (primary — guarantees consistency)

Copy this entire block. Replace `[CHARACTER DESCRIPTION]` with your character.

```
Create a 2×2 grid character sheet for a VTuber avatar. Four identical panels arranged in a square grid, each showing the same character in bust-up portrait (head and shoulders), facing forward.

CHARACTER: [CHARACTER DESCRIPTION — e.g. "a cheerful young woman with short dark hair, warm brown eyes, wearing a pastel pink hoodie with a star pin"]

LAYOUT (the ONLY thing that changes between panels):

TOP-LEFT panel:    Mouth CLOSED in a gentle smile, EYES OPEN looking at viewer.
TOP-RIGHT panel:   Mouth CLOSED in a gentle smile, EYES CLOSED (happy blink).
BOTTOM-LEFT panel: Mouth OPEN mid-speech (as if saying "ah"), EYES OPEN.
BOTTOM-RIGHT panel: Mouth OPEN mid-speech, EYES CLOSED.

CRITICAL CONSISTENCY RULES:
- The character's head, hair, body, and shoulders must be in the EXACT SAME pixel position in all four panels. Imagine the character is frozen in place and only the mouth and eyelids move.
- Identical lighting, colors, shading, line weight, and art style across all panels.
- Clean separation between panels — thin white grid lines dividing the four quadrants.
- Flat anime/cartoon illustration style with bold clean outlines and vibrant colors.
- Solid flat background color behind the character (no gradient, no scenery).

The output should be one single square image containing all four panels arranged in a 2×2 grid.
```

---

## Example Character Descriptions

Pick one and paste into `[CHARACTER DESCRIPTION]`:

**Casual streamer:**
> a friendly young woman with shoulder-length dark blue hair, bright amber eyes, wearing a cream-colored oversized sweater with a small cat embroidered on the chest

**Cool gamer:**
> a cool young man with messy silver hair, sharp red eyes, wearing a black gaming jacket with neon green accents and a headset around his neck

**Cute mascot:**
> a cute round cat creature with orange fur, big green eyes, pink cheek blush, wearing a tiny yellow scarf

**Professional host:**
> an elegant woman with long black hair in a side ponytail, violet eyes, wearing a navy blazer over a white blouse with a thin gold necklace

---

## Individual Prompts (backup — if sheet approach doesn't work)

If the character sheet comes out inconsistent, generate 4 separate images using these prompts. Use the SAME character description in all four.

### 1. mouth_close_eyes_open.png (resting)
```
Bust-up anime portrait of [CHARACTER DESCRIPTION], facing forward, looking directly at viewer. Gentle closed-mouth smile, eyes open. Flat illustration style, bold outlines, vibrant colors, solid flat background. Centered composition.
```

### 2. mouth_close_eyes_close.png (blinking)
```
Bust-up anime portrait of [CHARACTER DESCRIPTION], facing forward. Gentle closed-mouth smile, eyes closed in a happy expression. IDENTICAL pose, position, lighting, and style to the resting portrait — only the eyes are closed. Flat illustration style, solid flat background.
```

### 3. mouth_open_eyes_open.png (talking)
```
Bust-up anime portrait of [CHARACTER DESCRIPTION], facing forward, looking directly at viewer. Mouth open mid-speech as if saying "ah", eyes open. IDENTICAL pose, position, lighting, and style to the resting portrait — only the mouth is open. Flat illustration style, solid flat background.
```

### 4. mouth_open_eyes_close.png (talking + blink)
```
Bust-up anime portrait of [CHARACTER DESCRIPTION], facing forward. Mouth open mid-speech, eyes closed. IDENTICAL pose, position, lighting, and style to the resting portrait — mouth open and eyes closed. Flat illustration style, solid flat background.
```

---

## Slicing the Character Sheet

After generating the sheet image:

```bash
# Default: outputs to public/avatars/default/
node scripts/slice-avatar.mjs path/to/your-sheet.png

# Custom output:
node scripts/slice-avatar.mjs path/to/your-sheet.png public/avatars/custom/
```

The script uses ffmpeg to crop each quadrant. The image can be any size —
each cell is automatically half the width and half the height.

### Sheet layout reference

```
┌──────────────────┬──────────────────┐
│                  │                  │
│  mouth_close     │  mouth_close     │
│  eyes_open       │  eyes_close      │
│  ← resting       │  ← blinking      │
│                  │                  │
├──────────────────┼──────────────────┤
│                  │                  │
│  mouth_open      │  mouth_open      │
│  eyes_open       │  eyes_close      │
│  ← talking       │  ← talk + blink  │
│                  │                  │
└──────────────────┴──────────────────┘
```

---

## Tips for Best Results

### Consistency
- The **character sheet** approach is strongly recommended over 4 separate generations. One generation guarantees identical style, colors, and proportions.
- If using separate prompts, generate the "resting" image first, then use it as a **reference image** (if your tool supports image-to-image) for the other 3.

### Background
- GPT Image 2 may not produce transparent PNGs. Use a **solid flat background** (white or a specific hex color).
- To remove the background later: use [remove.bg](https://remove.bg), [photoroom](https://photoroom.com), or the GIMP/Photoshop magic wand.
- For streaming: a **solid green background** (#00ff00) works with chroma key in OBS — no need to remove it.
- This app's **broadcast mode** uses a green (#00ff00) background. If your avatar also has a green background, it'll key out automatically.

### Size
- **1024×1024** per panel is plenty (2048×2048 total sheet).
- Larger images (1536×1536 per panel) look sharper but use more VRAM.
- The app automatically fits the image to the viewport with `object-fit: contain`.

### Head Position (critical)
- In a PNGTuber, the app swaps between sprites instantly. If the head shifts even a few pixels between sprites, it looks like a jitter.
- The character sheet approach eliminates this problem because all 4 panels are from the same generation.
- If using separate images, align them in an image editor (overlay with difference blending) and nudge until they match.

### Art Style
- **Flat anime/cartoon** with bold outlines works best — the mouth/eye differences read clearly at small sizes.
- Avoid heavy shading, complex textures, or realistic styles — they make mouth/eye swaps look jarring.
- Simple color palettes (3-5 main colors) look cleaner.
