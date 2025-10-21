import { MonksEnhancedJournal, log, setting, i18n } from '../monks-enhanced-journal.js';
import { MEJHelpers } from '../helpers.js';

export class AdjustPrice extends foundry.applications.api.ApplicationV2 {
    constructor(object, options = {}) {
        super(options);

        this.object = object;
    }
    static DEFAULT_OPTIONS = {
        id: "adjust-price",
        form: {
            handler: AdjustPrice.#onSubmit,
            closeOnSubmit: true,
            submitOnClose: false,
            submitOnChange: false
        },
        position: {
            width: 400,
            height: 'auto',
        },
        window: {
            title: "MonksEnhancedJournal.AdjustPrices",
        }
    }

    get title() {
        return i18n("MonksEnhancedJournal.AdjustPrices");
    }
    
    static PARTS = {
        form: {
            classes: ["adjust-price", "monks-journal-sheet", "dialog"],
            template: "modules/monks-enhanced-journal/templates/adjust-price.html",
        }
    }

    static async #onSubmit(event, form, formData) {
        const app = this;
        let data = foundry.utils.expandObject(formData.object);

        for (let [k, v] of Object.entries(data.adjustment)) {
            if (v.sell == undefined)
                delete data.adjustment[k].sell;
            if (v.buy == undefined)
                delete data.adjustment[k].buy;

            if (Object.keys(data.adjustment[k]).length == 0)
                delete data.adjustment[k];
        }

        if (app.object) {
            await app.object.unsetFlag('monks-enhanced-journal', 'adjustment');
            await app.object.setFlag('monks-enhanced-journal', 'adjustment', data.adjustment);
        } else {
            await game.settings.set("monks-enhanced-journal", "adjustment-defaults", data.adjustment, { diff: false });
        }
    }
    _prepareContext(options) {
        const original = Object.keys(game.system?.documentTypes?.Item || {});
        let types = original.filter(x => MonksEnhancedJournal.includedTypes.includes(x));
        types = types.reduce((obj, t) => {
            const label = CONFIG.Item?.typeLabels?.[t] ?? t;
            obj[t] = game.i18n.has(label) ? game.i18n.localize(label) : t;
            return obj;
        }, {});
        let defaultAdjustment = setting("adjustment-defaults");
        let adjustment = foundry.utils.duplicate(defaultAdjustment);
        if (this.object)
            adjustment = this.object.getFlag('monks-enhanced-journal', 'adjustment') || {};
        else
            defaultAdjustment = {};
        let data = {
            adjustment,
            types,
            defaultAdjustment
        }
        data.showConvert = !!this.object;

        return data;
    }

    _onRender(context, options) {
        const convertButton = this.element.querySelector('.convert-button');
        if (convertButton) {
            convertButton.addEventListener('click', this.convertItems.bind(this));
        }

        const cancelButton = this.element.querySelector('.cancel');
        if (cancelButton) {
            cancelButton.addEventListener('click', this.close.bind(this));
        }

        const resetButton = this.element.querySelector('.reset');
        if (resetButton) {
            resetButton.addEventListener('click', this.resetValues.bind(this));
        }

        const sellFields = this.element.querySelectorAll('.sell-field');
        sellFields.forEach(field => {
            field.addEventListener('blur', this.validateField.bind(this));
        });
    }

    resetValues(event) {
        event.stopPropagation();
        event.preventDefault();

        const sellFields = this.element.querySelectorAll('.sell-field');
        sellFields.forEach(field => field.value = '');

        const buyFields = this.element.querySelectorAll('.buy-field');
        buyFields.forEach(field => field.value = '');
    }

    validateField(event) {
        let val = parseFloat(event.currentTarget.value);
        if (!isNaN(val) && val < 0) {
            event.currentTarget.value = '';
        }
    }

    async convertItems(event) {
        event.stopPropagation();
        event.preventDefault();

        const form = this.element.querySelector('form');
        const fd = new FormDataExtended(form);
        let data = foundry.utils.expandObject(fd.object);

        for (let [k, v] of Object.entries(data.adjustment)) {
            if (v.sell == undefined)
                delete data.adjustment[k].sell;
            if (v.buy == undefined)
                delete data.adjustment[k].buy;

            if (Object.keys(data.adjustment[k]).length == 0)
                delete data.adjustment[k];
        }

        let adjustment = Object.assign({}, setting("adjustment-defaults"), data.adjustment || {});

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