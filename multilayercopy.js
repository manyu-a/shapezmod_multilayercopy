// @ts-nocheck
const METADATA = {
    website: "https://github.com/manyu-a",
    author: "ichigatsu13",
    name: "Multi Layer Copy and Paste",
    version: "1",
    id: "bothlayercopy",
    description:
        "allowing Multiple layers to be selected at once",

    minimumGameVersion: ">=1.5.0",
    // Maybe
    doesNotAffectSavegame: true,
};


const BlueprintExt = ({ $old }) => ({
    /**
     * Creates a new blueprint from the given entity uids
     * @param {GameRoot} root
     * @param {Array<Entity>} entities
     */
    fromEntities(root, entities) {
        const newEntities = [];
    
        let averagePosition = new shapez.Vector();
    
        // First, create a copy
        for (let i = 0; i < entities.length; ++i) {
            const entity = entities[i]; //root.entityMgr.findByUid(uids[i]);
            // assert(entity, "Entity for blueprint not found:" + uids[i]);
    
            const clone = entity.clone();
            newEntities.push(clone);
    
            const pos = entity.components.StaticMapEntity.getTileSpaceBounds().getCenter();
            averagePosition.addInplace(pos);
        }
    
        averagePosition.divideScalarInplace(entities.length);
        const blueprintOrigin = averagePosition.subScalars(0.5, 0.5).floor();
    
        for (let i = 0; i < entities.length; ++i) {
            newEntities[i].components.StaticMapEntity.origin.subInplace(blueprintOrigin);
        }
    
        // Now, make sure the origin is 0,0
        return new shapez.Blueprint(newEntities);
    }
});

const HUDMassSelectorExt = ({ $super, $old }) => ({
    initialize() {
        $old.initialize.call(this);

        this.multiLayerSelect = false;
        /**@type {Array<Entity>} */
        this.selectedEntities = [];
        // no needs?
        this.selectedUids.size = function() {
                return selectedEntities.length;
            }
    },

    onEntityDestroyed(entity) {
        if (this.root.bulkOperationRunning) {
            return;
        }
        const index = this.selectedEntities.indexOf(entity);
        if (index != -1) this.selectedEntities.splice(index, 1);
    },

    onBack() {
        // Clear entities on escape
        if (this.selectedEntities.length > 0) {
            this.selectedEntities = [];
            return shapez.STOP_PROPAGATION;
        }
    },

    clearSelection() {
        this.selectedEntities = [];
    },

    confirmDelete() {
        if (
            !this.root.app.settings.getAllSettings().disableCutDeleteWarnings &&
            this.selectedEntities.length > 100
        ) {
            const { ok } = this.root.hud.parts.dialogs.showWarning(
                T.dialogs.massDeleteConfirm.title,
                T.dialogs.massDeleteConfirm.desc.replace(
                    "<count>",
                    "" + formatBigNumberFull(this.selectedEntities.length)
                ),
                ["cancel:good:escape", "ok:bad:enter"]
            );
            ok.add(() => this.doDelete());
        } else {
            this.doDelete();
        }
    },

    doDelete() {
        const entities = Array.from(this.selectedEntities);

        // Build mapping from uid to entity
        /**
         * @type {Map<number, Entity>}
         */
        const mapUidToEntity = this.root.entityMgr.getFrozenUidSearchMap();

        let count = 0;
        this.root.logic.performBulkOperation(() => {
            for (let i = 0; i < entities.length; ++i) {
                const entity = mapUidToEntity.get(entities[i].uid);
                if (entity.destroyed) continue;
                if (!entity) {
                    logger.warn("Invalid Entity in Selected Entities");
                    continue;
                }

                if (!this.root.logic.tryDeleteBuilding(entity)) {
                    logger.error("Error in mass delete, could not remove building");
                } else {
                    count++;
                }
            }

            this.root.signals.achievementCheck.dispatch(shapez.ACHIEVEMENTS.destroy1000, count);
        });

        // Clear uids later
        this.selectedEntities = [];
    },

    startCopy() {
        if (this.selectedEntities.length > 0) {  
            if (!this.root.hubGoals.isRewardUnlocked(shapez.enumHubGoalRewards.reward_blueprints)) {
                this.showBlueprintsNotUnlocked();
                return;
            }
            this.root.hud.signals.buildingsSelectedForCopy.dispatch(this.selectedEntities); 
            this.selectedEntities = [];
            this.root.soundProxy.playUiClick();
        } else {
            this.root.soundProxy.playUiError();
        }
    },

    clearBelts() {
        for (const entity of this.selectedEntities) {
            for (const component of Object.values(entity.components)) {
                /** @type {Component} */ (component).clear();
            }
        }
        this.selectedEntities = [];
    },

    confirmCut() {
        if (!this.root.hubGoals.isRewardUnlocked(shapez.enumHubGoalRewards.reward_blueprints)) {
            this.showBlueprintsNotUnlocked();
        } else if (
            !this.root.app.settings.getAllSettings().disableCutDeleteWarnings &&
            this.selectedEntities.length > 100
        ) {
            const { ok } = this.root.hud.parts.dialogs.showWarning(
                T.dialogs.massCutConfirm.title,
                T.dialogs.massCutConfirm.desc.replace(
                    "<count>",
                    "" + formatBigNumberFull(this.selectedEntities.length)
                ),
                ["cancel:good:escape", "ok:bad:enter"]
            );
            ok.add(() => this.doCut());
        } else {
            this.doCut();
        }
    },

    doCut() {
        if (this.selectedEntities.length > 0) {
            const entities = Array.from(this.selectedEntities);
            const cutAction = () => {
                // copy code relies on entities still existing, so must copy before deleting.
                this.root.hud.signals.buildingsSelectedForCopy.dispatch(entities);

                for (let i = 0; i < entities.length; ++i) {
                    const entity = entities[i];
                    if (entity.destroyed) continue;
                    if (!this.root.logic.tryDeleteBuilding(entity)) {
                        logger.error("Error in mass cut, could not remove building");
                        this.selectedEntities.splice(i, 1);
                    }
                }
            };

            const blueprint = shapez.Blueprint.prototype.fromEntities(this.root, entities);
            if (blueprint.canAfford(this.root)) {
                cutAction();
            } else {
                const { cancel, ok } = this.root.hud.parts.dialogs.showWarning(
                    T.dialogs.massCutInsufficientConfirm.title,
                    T.dialogs.massCutInsufficientConfirm.desc,
                    ["cancel:good:escape", "ok:bad:enter"]
                );
                ok.add(cutAction);
            }

            this.root.soundProxy.playUiClick();
        } else {
            this.root.soundProxy.playUiError();
        }
    },

    onMouseDown(pos, mouseButton) {
        if (!this.root.keyMapper.getBinding(shapez.KEYMAPPINGS.massSelect.massSelectStart).pressed) {
            return;
        }

        if (mouseButton !== shapez.enumMouseButton.left) {
            return;
        }

        this.multiLayerSelect = this.root.keyMapper.getBinding(
            shapez.KEYMAPPINGS.mods.massSelectSelectMultiLayer
        ).pressed;

        if (!this.root.keyMapper.getBinding(shapez.KEYMAPPINGS.massSelect.massSelectSelectMultiple).pressed) {
            // Start new selection
            this.selectedEntities = [];
        }

        this.currentSelectionStartWorld = this.root.camera.screenToWorld(pos.copy());
        this.currentSelectionEnd = pos.copy();
        return shapez.STOP_PROPAGATION;
    },

    onMouseUp() {
        if (this.currentSelectionStartWorld) {
            const worldStart = this.currentSelectionStartWorld;
            const worldEnd = this.root.camera.screenToWorld(this.currentSelectionEnd);

            const tileStart = worldStart.toTileSpace();
            const tileEnd = worldEnd.toTileSpace();

            const realTileStart = tileStart.min(tileEnd);
            const realTileEnd = tileStart.max(tileEnd);

            for (let x = realTileStart.x; x <= realTileEnd.x; ++x) {
                for (let y = realTileStart.y; y <= realTileEnd.y; ++y) {
                    let entities = [];
                    if (this.multiLayerSelect) {
                        entities = this.root.map.getLayersContentsMultipleXY(x, y);
                    } else {
                        entities = [this.root.map.getLayerContentXY(x, y, this.root.currentLayer)];
                    }

                    for (let i = 0; i < entities.length; ++i) {
                        let entity = entities[i];
                        if (entity && this.root.logic.canDeleteBuilding(entity)) {
                            const staticComp = entity.components.StaticMapEntity;

                            if (!staticComp.getMetaBuilding().getIsRemovable(this.root)) {
                                continue;
                            }

                            this.selectedEntities.push(entity);
                        }
                    }
                }

                this.currentSelectionStartWorld = null;
                this.currentSelectionEnd = null;
            }
        }
    },

    draw(parameters) {
        this.multiLayerSelect =
            this.root.keyMapper.getBinding(shapez.KEYMAPPINGS.mods.massSelectSelectMultiLayer).pressed ||
            this.multiLayerSelect;

        if (this.currentSelectionStartWorld) {
            const worldStart = this.currentSelectionStartWorld;
            const worldEnd = this.root.camera.screenToWorld(this.currentSelectionEnd);

            const realWorldStart = worldStart.min(worldEnd);
            const realWorldEnd = worldStart.max(worldEnd);

            const tileStart = worldStart.toTileSpace();
            const tileEnd = worldEnd.toTileSpace();

            const realTileStart = tileStart.min(tileEnd);
            const realTileEnd = tileStart.max(tileEnd);

            parameters.context.lineWidth = 1;
            parameters.context.fillStyle = shapez.THEME.map.selectionBackground;
            parameters.context.strokeStyle = shapez.THEME.map.selectionOutline;
            parameters.context.beginPath();
            parameters.context.rect(
                realWorldStart.x,
                realWorldStart.y,
                realWorldEnd.x - realWorldStart.x,
                realWorldEnd.y - realWorldStart.y
            );
            parameters.context.fill();
            parameters.context.stroke();

            parameters.context.beginPath();

            const renderedUids = new Set();

            for (let x = realTileStart.x; x <= realTileEnd.x; ++x) {
                for (let y = realTileStart.y; y <= realTileEnd.y; ++y) {
                    let entities = [];
                    if (this.multiLayerSelect) {
                        entities = this.root.map.getLayersContentsMultipleXY(x, y);
                    } else {
                        entities = [this.root.map.getLayerContentXY(x, y, this.root.currentLayer)];
                    }

                    for (let i = 0; i < entities.length; ++i) {
                        let entity = entities[i];
                    
                        if (entity && this.root.logic.canDeleteBuilding(entity)) {
                            const staticComp = entity.components.StaticMapEntity;

                            if (!staticComp.getMetaBuilding().getIsRemovable(this.root)) {
                                continue;
                            }

                            // Prevent rendering the overlay twice
                            const uid = entity.uid;
                            if (renderedUids.has(uid)) {
                                continue;
                            }

                            renderedUids.add(uid);
                            this.renderSelectonPreviewTile(parameters, entity);
                        }
                    }
                }
            }
            parameters.context.fill();
        }

        //EXTREMELY SLOW. There must be a better way. (Possibly use a Array)
        for (let i = 0; i < this.selectedEntities.length; ++i) {
            const entity = this.selectedEntities[i];
            this.renderSelectonPreviewTile(parameters, entity);
        }

        parameters.context.globalAlpha = 1;
    },

    /**
     *
     * @param {DrawParameters} parameters
     * @param {Entity} entity
     */
    renderSelectonPreviewTile(parameters, entity) {
        const staticComp = entity.components.StaticMapEntity;

        parameters.context.globalAlpha = entity.layer == this.root.currentLayer ? 1 : 0.7;

        parameters.context.beginPath();

        staticComp.drawSpriteOnBoundsClipped(parameters, staticComp.getBlueprintSprite(), 0);

        parameters.context.fill();
    }
});

const HUDShapeTooltipExt = ({ $super, $old }) => ({
    isActive() {
        const hudParts = this.root.hud.parts;
        const active =
            this.root.app.settings.getSetting("shapeTooltipAlwaysOn") ||
            this.root.keyMapper.getBinding(shapez.KEYMAPPINGS.ingame.showShapeTooltip).pressed;
        // return false if any other placer is active
        return (
            active &&
            !this.isPlacingBuilding &&
            !hudParts.massSelector.currentSelectionStartWorld &&
            hudParts.massSelector.selectedEntities.length < 1 &&
            !hudParts.blueprintPlacer.currentBlueprint.get()
        );
    }
});

const MapResourcesSystemExt = ({ $super, $old }) => ({
    generateChunkBackground(chunk, canvas, context, w, h, dpi) {

        if (this.root.app.settings.getAllSettings().disableTileGrid) {
            // The map doesn't draw a background, so we have to
            context.fillStyle = shapez.THEME.map.background;
            context.fillRect(0, 0, w, h);
        } else {
            context.clearRect(0, 0, w, h);
        }
        context.globalAlpha = 0.5;
        const layer = chunk.lowerLayer;
        for (let x = 0; x < shapez.globalConfig.mapChunkSize; ++x) {
            const row = layer[x];
            for (let y = 0; y < shapez.globalConfig.mapChunkSize; ++y) {
                const item = row[y];
                if (item) {
                    context.fillStyle = item.getBackgroundColorAsResource();
                    context.fillRect(x, y, 1, 1);
                }
            }
        }
        if (this.root.app.settings.getAllSettings().displayChunkBorders) {
            context.fillStyle = shapez.THEME.map.chunkBorders;
            context.fillRect(0, 0, w, 1);
            context.fillRect(0, 1, 1, h);
        }
        context.globalAlpha = 1;
    }

});

const GameCoreExt = ({ $old }) => ({
    draw() {
        const root = this.root;
        const systems = root.systemMgr.systems;

        this.root.dynamicTickrate.onFrameRendered();

        if (!this.shouldRender()) {
            // Always update hud tho
            root.hud.update();
            return;
        }

        this.root.signals.gameFrameStarted.dispatch();

        root.queue.requireRedraw = false;

        // Gather context and save all state
        const context = root.context;
        context.save();
        if (shapez.IS_DEBUG) {
            context.fillStyle = "#a10000";
            context.fillRect(0, 0, window.innerWidth * 3, window.innerHeight * 3);
        }

        // Compute optimal zoom level and atlas scale
        const zoomLevel = root.camera.zoomLevel;
        const lowQuality = root.app.settings.getAllSettings().lowQualityTextures;
        const effectiveZoomLevel =
            (zoomLevel / shapez.globalConfig.assetsDpi) * shapez.getDeviceDPI() * shapez.globalConfig.assetsSharpness;

        let desiredAtlasScale = "0.25";
        if (effectiveZoomLevel > 0.5 && !lowQuality) {
            desiredAtlasScale = shapez.ORIGINAL_SPRITE_SCALE;
        } else if (effectiveZoomLevel > 0.35 && !lowQuality) {
            desiredAtlasScale = "0.5";
        }

        // Construct parameters required for drawing
        const params = new shapez.DrawParameters({
            context: context,
            visibleRect: root.camera.getVisibleRect(),
            desiredAtlasScale,
            zoomLevel,
            root: root,
        });

        if (shapez.IS_DEBUG && shapez.globalConfig.debug.testCulling) {
            context.clearRect(0, 0, root.gameWidth, root.gameHeight);
        }

        // Transform to world space

        if (shapez.IS_DEBUG && shapez.globalConfig.debug.testClipping) {
            params.visibleRect = params.visibleRect.expandedInAllDirections(
                -200 / this.root.camera.zoomLevel
            );
        }

        root.camera.transform(context);

        if (context.globalAlpha !== 1.0) {
            console.warn("Global Alpha not set back to 1 on Frame Begin");
            context.globalAlpha = 1;
        }

        // Update hud
        root.hud.update();

        // Main rendering order
        // -----

        const desiredOverlayAlpha = this.root.camera.getIsMapOverlayActive() ? 1 : 0;
        this.overlayAlpha = shapez.lerp(this.overlayAlpha, desiredOverlayAlpha, 0.25);

        // On low performance, skip the fade
        if (this.root.entityMgr.entities.length > 5000 || this.root.dynamicTickrate.averageFps < 50) {
            this.overlayAlpha = desiredOverlayAlpha;
        }

        if (this.overlayAlpha < 0.99) {
            // Background (grid, resources, etc)
            root.map.drawBackground(params);

            // Belt items
            systems.belt.drawBeltItems(params);

            // Miner & Static map entities etc.
            root.map.drawForeground(params);

            // HUB Overlay
            systems.hub.draw(params);

            // Green wires overlay
            if (root.hud.parts.wiresOverlay) {
                root.hud.parts.wiresOverlay.draw(params);
            }

            if (this.root.currentLayer === "wires") {
                // Static map entities
                root.map.drawWiresForegroundLayer(params);
            }
        }

        if (this.overlayAlpha > 0.01) {
            // Map overview
            context.globalAlpha = this.overlayAlpha;
            root.map.drawOverlay(params);
            context.globalAlpha = 1;
        }

        if (shapez.IS_DEBUG) {
            root.map.drawStaticEntityDebugOverlays(params);
        }

        if (shapez.IS_DEBUG && shapez.globalConfig.debug.renderBeltPaths) {
            systems.belt.drawBeltPathDebug(params);
        }

        // END OF GAME CONTENT
        // -----

        // Finally, draw the hud. Nothing should come after that
        root.hud.draw(params);

        assert(context.globalAlpha === 1.0, "Global alpha not 1 on frame end before restore");

        // Restore to screen space
        context.restore();

        // Restore parameters
        params.zoomLevel = 1;
        params.desiredAtlasScale = shapez.ORIGINAL_SPRITE_SCALE;
        params.visibleRect = new shapez.Rectangle(0, 0, this.root.gameWidth, this.root.gameHeight);
        if (shapez.IS_DEBUG && shapez.globalConfig.debug.testClipping) {
            params.visibleRect = params.visibleRect.expandedInAllDirections(-200);
        }

        // Draw overlays, those are screen space
        root.hud.drawOverlays(params);

        assert(context.globalAlpha === 1.0, "context.globalAlpha not 1 on frame end");

        if (shapez.IS_DEBUG && shapez.globalConfig.debug.simulateSlowRendering) {
            let sum = 0;
            for (let i = 0; i < 1e8; ++i) {
                sum += i;
            }
            if (Math.random() > 0.95) {
                console.log(sum);
            }
        }

        if (shapez.IS_DEBUG && shapez.globalConfig.debug.showAtlasInfo) {
            context.font = "13px GameFont";
            context.fillStyle = "blue";
            context.fillText(
                "Atlas: " +
                    desiredAtlasScale +
                    " / Zoom: " +
                    round2Digits(zoomLevel) +
                    " / Effective Zoom: " +
                    round2Digits(effectiveZoomLevel),
                20,
                600
            );

            const stats = this.root.buffers.getStats();

            context.fillText(
                "Maintained Buffers: " +
                    stats.rootKeys +
                    " root keys / " +
                    stats.subKeys +
                    " buffers / VRAM: " +
                    round2Digits(stats.vramBytes / (1024 * 1024)) +
                    " MB",
                20,
                620
            );
            const internalStats = getBufferStats();
            context.fillText(
                "Total Buffers: " +
                    internalStats.bufferCount +
                    " buffers / " +
                    internalStats.backlogSize +
                    " backlog / " +
                    internalStats.backlogKeys +
                    " keys in backlog / VRAM " +
                    round2Digits(internalStats.vramUsage / (1024 * 1024)) +
                    " MB / Backlog " +
                    round2Digits(internalStats.backlogVramUsage / (1024 * 1024)) +
                    " MB / Created " +
                    internalStats.numCreated +
                    " / Reused " +
                    internalStats.numReused,
                20,
                640
            );
        }

        if (shapez.IS_DEBUG && shapez.globalConfig.debug.testClipping) {
            context.strokeStyle = "red";
            context.lineWidth = 1;
            context.beginPath();
            context.rect(200, 200, this.root.gameWidth - 400, this.root.gameHeight - 400);
            context.stroke();
        }
    }
});

const HUDBlueprintPlacerExt = ({ $super, $old }) => ({
    /**
     * Called when an array of bulidings was selected
     * @param {Array<Entity>} entities
     */
    createBlueprintFromBuildings(entities) {
        if (entities.length === 0) {
            return;
        }
        this.currentBlueprint.set(shapez.Blueprint.prototype.fromEntities(this.root, entities));
    }
})

const GameHUDExt = ({ $old }) => ({
    initialize() {
        this.signals = {
            buildingSelectedForPlacement: /** @type {TypedSignal<[MetaBuilding|null]>} */ (new shapez.Signal()),
            selectedPlacementBuildingChanged: /** @type {TypedSignal<[MetaBuilding|null]>} */ (new shapez.Signal()),
            shapePinRequested: /** @type {TypedSignal<[ShapeDefinition]>} */ (new shapez.Signal()),
            shapeUnpinRequested: /** @type {TypedSignal<[string]>} */ (new shapez.Signal()),
            notification: /** @type {TypedSignal<[string, enumNotificationType]>} */ (new shapez.Signal()),
            buildingsSelectedForCopy: /** @type {TypedSignal<[Array<Entity>]>} */ (new shapez.Signal()),
            pasteBlueprintRequested: /** @type {TypedSignal<[]>} */ (new shapez.Signal()),
            viewShapeDetailsRequested: /** @type {TypedSignal<[ShapeDefinition]>} */ (new shapez.Signal()),
            unlockNotificationFinished: /** @type {TypedSignal<[]>} */ (new shapez.Signal()),
        };
        
        this.parts = {
            buildingsToolbar: new shapez.HUDBuildingsToolbar(this.root),

            blueprintPlacer: new shapez.HUDBlueprintPlacer(this.root),
            buildingPlacer: new shapez.HUDBuildingPlacer(this.root),

            shapeTooltip: new shapez.HUDShapeTooltip(this.root),

            // Must always exist
            settingsMenu: new shapez.HUDSettingsMenu(this.root),
            debugInfo: new shapez.HUDDebugInfo(this.root),
            dialogs: new shapez.HUDModalDialogs(this.root),
            
            // remove none 
        };

        if (shapez.IS_DEBUG) {
            this.parts.entityDebugger = new shapez.HUDEntityDebugger(this.root);
        }

        if (shapez.IS_DEBUG && shapez.globalConfig.debug.renderChanges) {
            this.parts.changesDebugger = new shapez.HUDChangesDebugger(this.root);
        }

        if (this.root.app.settings.getAllSettings().vignette) {
            this.parts.vignetteOverlay = new shapez.HUDVignetteOverlay(this.root);
        }

        if (this.root.app.settings.getAllSettings().enableColorBlindHelper) {
            this.parts.colorBlindHelper = new shapez.HUDColorBlindHelper(this.root);
        }

        if (!shapez.IS_RELEASE && !shapez.IS_DEBUG) {
            this.parts.betaOverlay = new shapez.HUDBetaOverlay(this.root);
        }

        const additionalParts = this.root.gameMode.additionalHudParts;
        for (const [partId, part] of Object.entries(additionalParts)) {
            this.parts[partId] = new part(this.root);
        }

        shapez.MOD_SIGNALS.hudInitializer.dispatch(this.root);

        const frag = document.createDocumentFragment();
        console.log($old);
        for (const key in this.parts) {
            console.log(key);
            shapez.MOD_SIGNALS.hudElementInitialized.dispatch(this.parts[key]);
            this.parts[key].createElements(frag);
        }

        document.body.appendChild(frag);

        for (const key in this.parts) {
            this.parts[key].initialize();
            shapez.MOD_SIGNALS.hudElementFinalized.dispatch(this.parts[key]);
        }

        this.root.keyMapper.getBinding(shapez.KEYMAPPINGS.ingame.toggleHud).add(this.toggleUi, this);

        /* dev:start */
        if (shapez.IS_DEBUG && shapez.globalConfig.debug.renderForTrailer) {
            this.trailerMaker = new TrailerMaker(this.root);
        }
        /* dev:end*/
    }
});



class Mod extends shapez.Mod {
    init() {

        this.modInterface.extendClass(shapez.Blueprint, BlueprintExt);
        this.modInterface.extendClass(shapez.HUDMassSelector, HUDMassSelectorExt);
        this.modInterface.extendClass(shapez.HUDShapeTooltip, HUDShapeTooltipExt);
        this.modInterface.extendClass(shapez.GameCore, GameCoreExt);
        this.modInterface.extendClass(shapez.HUDBlueprintPlacer, HUDBlueprintPlacerExt);
        this.modInterface.extendClass(shapez.GameHUD, GameHUDExt);
        this.modInterface.extendClass(shapez.MapResourcesSystem, MapResourcesSystemExt);
        this.modInterface.extendClass(shapez.HUDKeybindingOverlay, HUDKeybindingOverlayExt);

        this.modInterface.registerIngameKeybinding({
            id: "massSelectSelectMultiLayer",
            keyCode: 18 ,
            translation: "Select multiple Layers",
            modifiers: {
                shift: false,
            },
            handler: root => {},
        });
    }
}