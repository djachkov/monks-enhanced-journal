import { MonksEnhancedJournal, log, error, i18n, setting, makeid, getVolume } from "../monks-enhanced-journal.js";

export class ListEdit extends foundry.applications.api.ApplicationV2 {
    constructor(object, sheet, options = {}) {
        super(options);
        this.object = object;
        this.sheet = sheet;
    }

    static DEFAULT_OPTIONS = {
        classes: ["list-edit"],
        tag: "form",
        window: {
            title: "Edit Item",
            contentClasses: ["standard-form"]
        },
        position: {
            width: 800,
            height: "auto"
        },
        form: {
            handler: ListEdit.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/sheets/listitem.html"
        }
    };

    static async #onSubmit(event, form, formData) {
        const app = form.closest('.app')?.app;
        if (!app) return;

        await app._updateObject(event, formData.object);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        let data = this.object.data;
        data.enrichedText = await TextEditor.enrichHTML(data.text, {
            relativeTo: this.object,
            secrets: this.sheet.object.isOwner,
            async: true
        });
        const folders = this.sheet.folders;
        return foundry.utils.mergeObject(context, {
            data: data,
            name: data.name || game.i18n.format("DOCUMENT.New", { type: options.type }),
            folder: data.folder,
            folders: folders,
            hasFolders: folders.length > 0,
            hasNumber: this.sheet.hasNumbers,
            object: this.object
        });
    }

    async _updateObject(event, formData) {
        foundry.utils.mergeObject(this.object.data, formData);
        let items = foundry.utils.duplicate(this.sheet.object.flags["monks-enhanced-journal"].items || []);
        if (this.object.id == undefined) {
            this.object.data.id = makeid();
            items.push(this.object.data);
        } else {
            items.findSplice((i) => i.id == this.object.id, this.object.data);
        }

        await this.sheet.object.setFlag('monks-enhanced-journal', 'items', items);
    }
}