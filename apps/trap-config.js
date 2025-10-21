import { MonksEnhancedJournal, log, setting, i18n, makeid } from '../monks-enhanced-journal.js';

export class TrapConfig extends foundry.applications.api.ApplicationV2 {
    constructor(object, journalentry, options = {}) {
        super(options);
        this.object = object;
        this.journalentry = journalentry;
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "trap-config",
        classes: ["form", "trap-sheet"],
        tag: "form",
        window: {
            frame: true,
            positioned: true,
            title: "MonksEnhancedJournal.TrapConfiguration",
            icon: "fas fa-exclamation-triangle",
            resizable: true
        },
        position: {
            width: 400,
            height: "auto"
        },
        form: {
            handler: TrapConfig.#onSubmit,
            closeOnSubmit: true,
            submitOnChange: false
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/trap-config.html"
        }
    };

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        context.object = this.object;
        
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Handle form submission
     * @param {Event} event - The form submission event
     * @param {HTMLFormElement} form - The submitted form
     * @param {FormDataExtended} formData - The form data
     */
    static async #onSubmit(event, form, formData) {
        const app = form.closest('[data-application-id]')?.application;
        if (!app) return;

        log('updating trap', event, formData.object, app.object);

        foundry.utils.mergeObject(app.object, formData.object);
        let traps = foundry.utils.duplicate(app.journalentry.object.flags["monks-enhanced-journal"].traps || []);
        if (app.object.id == undefined) {
            app.object.id = makeid();
            traps.push(app.object);
        }

        await app.journalentry.object.setFlag('monks-enhanced-journal', 'traps', traps);
        app.close();
    }

    /** @override */
    _onRender(context, options) {
        // Currently no specific event listeners needed
        // This method can be expanded if additional functionality is required
    }
}