# Creating Extension Icons

The extension requires the following icon sizes:
- 16x16 pixels (toolbar icon)
- 32x32 pixels (toolbar icon on high-DPI displays)
- 48x48 pixels (extension management page)
- 128x128 pixels (Chrome Web Store)

## Icon Design Guidelines

The PathCurator extension icon should:
1. Be recognizable at small sizes (16x16)
2. Use the PathCurator brand colors (primary blue: #0d6efd)
3. Be simple and clear
4. Work well on both light and dark backgrounds

## Suggested Design

A simple "P" lettermark in a rounded square, similar to the logo used in the popup:
- Background: #0d6efd (PathCurator blue)
- Text: White "P" in a bold, sans-serif font
- Border radius: 20% of the icon size
- Letter should be centered and take up about 60% of the icon height

## Creating the Icons

You can create these icons using:
1. **Design tools**: Figma, Sketch, Adobe Illustrator
2. **Online tools**: Canva, Favicon.io
3. **Code generation**: HTML Canvas or SVG converted to PNG

## File Locations

Place the created PNG files in the `icons/` directory:
- `icons/icon-16.png`
- `icons/icon-32.png`
- `icons/icon-48.png`
- `icons/icon-128.png`

## Alternative: Programmatic Generation

You can also generate these icons programmatically using the provided `generate-icons.html` file which creates them using HTML Canvas.