import { MonksEnhancedJournal, log, setting, i18n } from '../monks-enhanced-journal.js';

export class SlideshowWindow extends foundry.applications.api.ApplicationV2 {
    constructor(object, options = {}) {
        super(options);
        this.object = object;
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "slideshow-display",
        classes: ["sheet"],
        tag: "div",
        window: {
            frame: true,
            positioned: true,
            title: ".",
            icon: "fas fa-play-circle",
            resizable: true,
            minimizable: false
        },
        position: {
            width: Math.floor(document.body.clientWidth * 0.75),
            height: Math.floor(document.body.clientHeight * 0.75),
            left: Math.floor(document.body.clientWidth * 0.125),
            top: Math.floor(document.body.clientHeight * 0.125)
        },
        form: {
            handler: undefined,
            closeOnSubmit: false,
            submitOnChange: false
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/sheets/slideshow-display.html"
        }
    };

    /** @override */
    get title() {
        return this.object?.name || ".";
    }

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.object = this.object;
        return context;
    }
}