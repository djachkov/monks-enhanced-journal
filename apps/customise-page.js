import { MonksEnhancedJournal, log, setting, i18n, makeid } from '../monks-enhanced-journal.js';
import { MEJHelpers } from '../helpers.js';

export class CustomisePage extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: "customise-page",
        form: {
            handler: CustomisePage.#onSubmit,
            closeOnSubmit: true,
            submitOnClose: false,
            submitOnChange: false
        },
        position: {
            width: 600,
            height: 400,
        },
        window: {
            title: "Customise Page",
        }
    }

    static PARTS = {
        tabs: {
            template: "modules/monks-enhanced-journal/templates/customise/customise-page.html"
        }
    }

    static async #onSubmit(event, form, formData) {
        const app = this;
        let data = foundry.utils.expandObject(formData.object);

        let defaultSettings = app.object.constructor.sheetSettings() || {};
        let settings = data.sheetSettings[app.object.constructor.type] || {};

        // find all values in settings that are not the same as the default
        let changed = {};
        for (let [k, v] of Object.entries(settings)) {
            for (let [k2, v2] of Object.entries(v)) {
                for (let [k3, v3] of Object.entries(v2)) {
                    if (defaultSettings[k][k2][k3] != v3) {
                        changed[k] = changed[k] || {};
                        changed[k][k2] = v2;
                    }
                }
            }
        }

        await app.object.object.unsetFlag("monks-enhanced-journal", "sheet-settings");
        await app.object.object.setFlag("monks-enhanced-journal", "sheet-settings", changed, { diff: false });
        app.object.render(true);
    }

    async _preparePartContext(partId, context, options) {
        delete Handlebars.partials[`modules/monks-enhanced-journal/templates/customise/${this.object.constructor.type}.html`];
        await loadTemplates({
            page: `modules/monks-enhanced-journal/templates/customise/${this.object.constructor.type}.html`,
        });
        return context;
    }

    _prepareContext(options) {
        let data = {};
        data.generalEdit = false;
        let settings = this.object.sheetSettings();
        let sheetSettings = {};
        sheetSettings[this.object.constructor.type] = settings;

        sheetSettings[this.object.constructor.type] = MonksEnhancedJournal.convertObjectToArray(sheetSettings[this.object.constructor.type]);
        data.sheetSettings = sheetSettings;

        return data;
    }

    _onRender(context, options) {
        const resetAllButton = this.element.querySelector("button.reset-all");
        if (resetAllButton) {
            resetAllButton.addEventListener('click', this._onResetDefaults.bind(this));
        }

        const convertButton = this.element.querySelector("button.convert-button");
        if (convertButton) {
            convertButton.addEventListener('click', this._onResetDefaults.bind(this));
        }

        const sellFields = this.element.querySelectorAll('.sell-field');
        sellFields.forEach(field => {
            field.addEventListener('blur', this.validateField.bind(this));
        });
    }

    validateField(event) {
        let val = parseFloat(event.currentTarget.value);
        if (!isNaN(val) && val < 0) {
            event.currentTarget.value = '';
        }
    }



    async _onResetDefaults(event) {
        await this.object.object.unsetFlag("monks-enhanced-journal", "sheet-settings");
        this.object.render(true);
        this.render({ force: true });
    }

    async convertItems(event) {
        event.stopPropagation();
        event.preventDefault();

        const form = this.element.querySelector('form');
        const fd = new FormDataExtended(form);
        let data = foundry.utils.expandObject(fd.object);

        let dataAdjustment = data.sheetSettings.shop.adjustment;

        for (let [k, v] of Object.entries(dataAdjustment)) {
            if (v.sell == undefined)
                delete dataAdjustment[k].sell;
            if (v.buy == undefined)
                delete dataAdjustment[k].buy;

            if (Object.keys(dataAdjustment[k]).length == 0)
                delete dataAdjustment[k];
        }

        let defaultSettings = this.object.constructor.sheetSettings() || {};
        let adjustment = Object.assign({}, defaultSettings, { adjustment: dataAdjustment });

        let items = this.object.getFlag('monks-enhanced-journal', 'items') || [];

        for (let item of items) {
            let sell = adjustment[item.type]?.sell ?? adjustment.default.sell ?? 1;
            let price = MEJHelpers.getPrice(foundry.utils.getProperty(item, "flags.monks-enhanced-journal.price"));
            let cost = Math.max(Math.ceil((price.value * sell), 1)) + " " + price.currency;
            foundry.utils.setProperty(item, "flags.monks-enhanced-journal.cost", cost);
        }

        await this.object.update({ "flags.monks-enhanced-journal.items": items }, { focus: false });
    }
}