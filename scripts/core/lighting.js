import { LightingFramebuffer } from "./lighting-framebuffer.js";
import { LightingSystem } from "./lighting-system.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    let globalLight = false;
    let fogExploration = false;
    let illuminationBackground;

    Hooks.once("createEffectsCanvasGroup", effects => {
        effects.background.vision.sortableChildren = false;
        effects.background.lighting.sortableChildren = false;
        effects.illumination.lights.sortableChildren = false;
        effects.coloration.sortableChildren = false;
        effects.illumination.removeChild(effects.illumination.background);

        illuminationBackground = effects.illumination.addChildAt(
            new SpriteMesh(PIXI.Texture.WHITE, IlluminationBackgroundSamplerShader), 0);
    });

    Hooks.once("drawEffectsCanvasGroup", () => {
        const container = canvas.masks.depth.addChild(new PIXI.Container());
        const render = function (renderer) {
            for (const region of LightingSystem.instance.activeRegions) {
                if (region.object instanceof Tile) {
                    continue;
                }

                region.renderDepth(renderer);
            }
        };

        container.render = render.bind(container);
    });

    Hooks.on("drawEffectsCanvasGroup", () => {
        const bgRect = canvas.dimensions.rect;

        illuminationBackground.x = bgRect.x;
        illuminationBackground.y = bgRect.y;
        illuminationBackground.width = bgRect.width;
        illuminationBackground.height = bgRect.height;

        LightingFramebuffer.instance.draw();
    });

    Hooks.on("tearDownEffectsCanvasGroup", () => {
        LightingFramebuffer.instance.tearDown();
    });

    Hooks.on("canvasTearDown", () => {
        LightingSystem.instance.reset();
    });

    Hooks.on("canvasReady", () => {
        Hooks.once("lightingRefresh", () => {
            const meshes = [];

            for (const container of [
                canvas.effects.background.vision,
                canvas.effects.background.lighting,
                canvas.effects.illumination.lights,
                canvas.effects.coloration]) {
                for (const mesh of container.children) {
                    if (mesh.cullable) {
                        mesh.cullable = false;
                        meshes.push(mesh);
                    }
                }
            }

            canvas.app.ticker.addOnce(
                function () {
                    for (const mesh of meshes) {
                        mesh.cullable = true;
                    }
                },
                globalThis,
                PIXI.UPDATE_PRIORITY.LOW - 1
            );
        });
    });

    libWrapper.register(
        "perfect-vision",
        "CanvasIlluminationEffects.prototype.updateGlobalLight",
        function () {
            return false;
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "CONFIG.Canvas.fogManager.prototype.fogExploration",
        function () {
            return fogExploration;
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "CONFIG.Canvas.groups.effects.groupClass.prototype.initializeLightSources",
        function (wrapped, ...args) {
            wrapped(...args);

            for (const region of LightingSystem.instance) {
                this.lightSources.set(region.id, region.source);
            }
        },
        libWrapper.WRAPPER
    );

    libWrapper.register(
        "perfect-vision",
        "CONFIG.Canvas.groups.effects.groupClass.prototype.refreshLighting",
        function (wrapped, ...args) {
            const perception = LightingSystem.instance.refresh();

            globalLight = false;
            fogExploration = false;

            for (const region of LightingSystem.instance.activeRegions) {
                globalLight ||= region.globalLight;
                fogExploration ||= region.fogExploration;

                if (globalLight && fogExploration) {
                    break;
                }
            }

            this.illumination.globalLight = globalLight;

            if (perception.refreshLighting) {
                perception.refreshLighting = false;

                canvas.lighting._onDarknessChange();
                canvas.sounds._onDarknessChange();

                LightingFramebuffer.instance.refresh();
            }

            canvas.perception.update(perception, true);

            wrapped(...args);

            this.background.vision.children.sort(PointSourceMesh._compare);
            this.background.lighting.children.sort(PointSourceMesh._compare);
            this.illumination.lights.children.sort(PointSourceMesh._compare);
            this.coloration.children.sort(PointSourceMesh._compare);
        },
        libWrapper.WRAPPER
    );
});

class IlluminationBackgroundSamplerShader extends BaseSamplerShader {
    /** @override */
    static classPluginName = null;

    /** @override */
    static vertexShader = `
      precision ${PIXI.settings.PRECISION_VERTEX} float;

      attribute vec2 aVertexPosition;

      uniform mat3 projectionMatrix;
      uniform vec2 screenDimensions;

      varying vec2 vUvsMask;

      void main() {
        vUvsMask = aVertexPosition / screenDimensions;
        gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
      }
    `;

    /** @override */
    static fragmentShader = `
      precision ${PIXI.settings.PRECISION_FRAGMENT} float;

      varying vec2 vUvsMask;

      uniform sampler2D colorBackgroundTexture;

      void main() {
        gl_FragColor = vec4(texture2D(colorBackgroundTexture, vUvsMask).rgb, 1.0);
      }
    `;

    /** @override */
    static defaultUniforms = {
        screenDimensions: [1, 1],
        colorBackgroundTexture: null
    };

    constructor(...args) {
        super(...args);

        this.uniforms.screenDimensions = canvas.screenDimensions;
        this.uniforms.colorBackgroundTexture = LightingFramebuffer.instance.textures[1];
    }
}
