import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("betterroofs")?.active) {
        return;
    }

    patch("Wall.prototype.identifyInteriorState", "OVERRIDE", function () {
        this.roof = null;

        for (const roof of canvas.foreground.roofs) {
            if (roof.document.getFlag("betterroofs", "brMode") === 3) {
                continue;
            }

            const isInterior = roof.containsPixel(this.data.c[0], this.data.c[1]) && roof.containsPixel(this.data.c[2], this.data.c[3]);

            if (isInterior) {
                this.roof = roof;
            }
        }
    });

    patch("betterRoofsHelpers.prototype.computeMask", "OVERRIDE", function (tile, controlledToken) { });

    Hooks.on("updateTile", (document, change, options, userId, arg) => {
        const scene = document.parent;

        if (!scene?.isView || !canvas.ready || !("flags" in change && ("betterroofs" in change.flags || "-=betterroofs" in change.flags) || "-=flags" in change)) {
            return;
        }

        const tile = document.object;

        if (tile) {
            tile.refresh({ refreshPerception: tile.isRoof });
        }
    });
});
