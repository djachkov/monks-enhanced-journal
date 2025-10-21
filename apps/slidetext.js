import { MonksEnhancedJournal, log, setting, i18n, makeid } from '../monks-enhanced-journal.js';

export class SlideText extends foundry.applications.api.ApplicationV2 {
    constructor(object, config, options = {}) {
        super(options);
        this.object = object;
        this.config = config;
        this.tempdata = foundry.utils.duplicate(object);
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "slide-text",
        classes: ["form", "slide-sheet"],
        tag: "form",
        window: {
            frame: true,
            positioned: true,
            title: "MonksEnhancedJournal.SlideText",
            icon: "fas fa-font",
            resizable: true
        },
        position: {
            width: 350,
            height: "auto"
        },
        form: {
            handler: this.#onSubmit,
            closeOnSubmit: false,
            submitOnChange: false
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/sheets/slidetext.html"
        }
    };

    /** @override */
    async _prepareContext(options) {
        let windowSize = 25;
        let fontOptions = foundry.utils.mergeObject({ "": "" }, MonksEnhancedJournal.fonts);
        const context = await super._prepareContext(options);
        return foundry.utils.mergeObject(context,
            {
                object: this.object,
                tempdata: this.tempdata,
                alignOptions: { left: "MonksEnhancedJournal.Left", center: "MonksEnhancedJournal.Center", right: "MonksEnhancedJournal.Right" },
                fontOptions,
                fontPlaceholder: foundry.utils.getProperty(this.config.journalentry, "flags.monks-enhanced-journal.font.size") || windowSize,
                colorPlaceholder: foundry.utils.getProperty(this.config.journalentry, "flags.monks-enhanced-journal.font.color") || "#FFFFFF"
            }, { recursive: false }
        );
    }

    /** @override */
    _onRender(context, options) {
        const html = this.element;
        const cancelButton = html.querySelector('button[name="cancel"]');
        if (cancelButton) {
            cancelButton.addEventListener('click', this.onCancel.bind(this));
        }
    }

    /** @override */
    async _onChangeInput(event) {
        const formData = new FormData(this.element);
        const formObject = {};
        
        for (const [key, value] of formData.entries()) {
            foundry.utils.setProperty(formObject, key, value);
        }

        if (Object.keys(formObject).length == 0)
            return;

        foundry.utils.mergeObject(this.tempdata, formObject);
        this.config.refreshText(this.tempdata);
    }

    onCancel() {
        this.config.refreshText(this.object);
        this.close();
    }

    /**
     * Handle form submission
     * @param {Event} event - The form submission event
     * @param {HTMLFormElement} form - The submitted form
     * @param {FormDataExtended} formData - The form data
     */
    static async #onSubmit(event, form, formData) {
        const app = form.closest('[data-application-id]')?.application;
        if (!app) return;

        app.object = foundry.utils.mergeObject(app.object, formData.object);
    }
}