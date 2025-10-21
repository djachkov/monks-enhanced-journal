import { MonksEnhancedJournal, log, setting, i18n, makeid } from '../monks-enhanced-journal.js';

export class EditFields extends foundry.applications.api.ApplicationV2 {
    constructor(object, fields, options = {}) {
        super(options);
        this.object = object;
        this.fields = fields;
    }

    static DEFAULT_OPTIONS = {
        id: "edit-fields",
        classes: ["form", "edit-fields"],
        tag: "form",
        window: {
            title: "MonksEnhancedJournal.EditFields",
            contentClasses: ["standard-form"]
        },
        position: {
            width: 400,
            height: "auto"
        },
        form: {
            handler: EditFields.#onSubmit,
            submitOnChange: true,
            closeOnSubmit: false
        }
    };

    get title() {
        return i18n("MonksEnhancedJournal.EditFields");
    }

    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/editfields.html"
        }
    };

    static async #onSubmit(event, form, formData) {
        const app = form.closest('.app')?.app;
        if (!app) return;

        await app._updateObject(event, formData.object);
    }

    async _updateObject(event, formData) {
        let fd = foundry.utils.mergeObject({}, formData);
        for (let attr of Object.values(fd.attributes)) {
            attr.hidden = !attr.shown;
            delete attr.shown;
        }
        let attributes = foundry.utils.mergeObject(this.object.flags['monks-enhanced-journal'].attributes, fd.attributes);
        await this.object.update({ "flags.monks-enhanced-journal.attributes": attributes }, { focus: false });
        this.change = true;
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return foundry.utils.mergeObject(context, {
            fields: this.fields,
            object: this.object
        });
    }
}