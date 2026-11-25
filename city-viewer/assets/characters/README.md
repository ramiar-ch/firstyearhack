# Close-up characters

The close character kit uses MakeHuman CC0 assets distributed as the CharacterCreator GLB exports. The game adapts seven faces from the head mesh, keeps the textured eyes and hair, and rebinds the visible clothing and hands to the game's walking and cycling rig. Materials include the source skin, hair, cloth and shoe textures. [MakeHuman core asset license](https://www.makehumancommunity.org/about/license.html) · [Pinned export licensing and credits](https://github.com/kblood/CharacterCreator/blob/852e48f316b90a0937234886630e4fb4cdfd1f78/LICENSE-NOTES.md)

## Rebuild the game asset

Use these exports from CharacterCreator's [pinned output directory](https://github.com/kblood/CharacterCreator/tree/852e48f316b90a0937234886630e4fb4cdfd1f78/output).

- Body, eyes and hand source uses `base_body.glb`.
- Hair uses `hair_short02.glb` and `hair_bob01.glb`.
- Wardrobe uses `clothing_jacket.glb`, `clothing_shirt.glb`, `clothing_tshirt.glb`, `clothing_jeans.glb` and `clothing_shoes.glb`.

Put the eight files in one folder, then run from the game repository root.

```sh
node city-viewer/tools/build-character-detail.cjs /path/to/exports city-viewer/assets/characters/close-characters.glb
```

The builder follows the rest joints in protagonist.js. It bakes the facial variants and keeps the blink delta, remaps clothing weights to the twelve game joints, fits the shoes and hands around the existing pedal and handlebar contacts, and bundles the resulting parts and texture maps.
