import { MonksEnhancedJournal, log, setting, i18n, makeid } from '../monks-enhanced-journal.js';

export class Objectives extends foundry.applications.api.ApplicationV2 {
    constructor(object, journalentry, options = {}) {
        super(options);
        this.object = object;
        this.journalentry = journalentry;
    }

    static DEFAULT_OPTIONS = {
        id: "objectives",
        classes: ["form", "objective-sheet"],
        tag: "form",
        window: {
            title: "MonksEnhancedJournal.Objectives",
            resizable: true,
            contentClasses: ["standard-form"]
        },
        position: {
            width: 500,
            height: "auto"
        },
        form: {
            handler: Objectives.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    get title() {
        return i18n("MonksEnhancedJournal.Objectives");
    }

    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/objectives.html"
        }
    };

    static async #onSubmit(event, form, formData) {
        const app = form.closest('.app')?.app;
        if (!app) return;

        await app._updateObject(event, formData.object);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        //this._convertFormats(context);
        context.enrichedText = await TextEditor.enrichHTML(this.object.content, {
            relativeTo: this.journalentry.object,
            secrets: this.journalentry.object.isOwner,
            async: true
        });

        context.object = this.object;
        return context;
    }

    /* -------------------------------------------- */

    async _updateObject(event, formData) {
        log('updating objective', event, formData, this.object);
        foundry.utils.mergeObject(this.object, formData);
        let objectives = foundry.utils.duplicate(this.journalentry.object.flags["monks-enhanced-journal"].objectives || []);
        if (this.object.id == undefined) {
            this.object.id = makeid();
            objectives.push(this.object);
        }

        await this.journalentry.object.setFlag('monks-enhanced-journal', 'objectives', objectives);
    }
}