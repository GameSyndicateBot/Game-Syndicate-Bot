REFERENCE CARD BUILDER

What changed:
- Added templates/ with the five approved 000001 references.
- Fixed the Rare bottom-right «ЭКЗЕМПЛЯР» block to blue.
- Added images/cardBuilder/template.js and builder.js.
- Added a new output folder: output-reference.
- Existing output was left untouched for comparison.

Build one test card:
  npm run cards:reference-one -- "input/11 дон.png" legendary

Build the entire collection:
  npm run cards:reference

Results:
  output-reference/000011/000011_legendary.png

Important:
The source cards are flattened PNG/JPG files, so no script can perfectly recover original Photoshop layers.
This builder preserves each source card's artwork and text, then replaces the shared visible frame geometry
with the approved 000001 reference frame. It is the safe non-AI path and should be approved on one test card
before using output-reference in Daily Pack / Album / Dust.
