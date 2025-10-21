import { MonksEnhancedJournal, log, error, i18n, setting, makeid } from "../monks-enhanced-journal.js";

export class EditCurrency extends foundry.applications.api.ApplicationV2 {
    constructor(object, options = {}) {
        super(options);
        this.object = object;
        this.currency = MonksEnhancedJournal.currencies;
    }

    static DEFAULT_OPTIONS = {
        id: "journal-editcurrency",
        classes: ["edit-currency"],
        tag: "form",
        window: {
            title: "MonksEnhancedJournal.EditCurrency",
            contentClasses: ["standard-form"]
        },
        position: {
            width: 500,
            height: "auto"
        },
        form: {
            handler: EditCurrency.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    get title() {
        return i18n("MonksEnhancedJournal.EditCurrency");
    }

    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/edit-currency.html"
        }
    };

    static async #onSubmit(event, form, formData) {
        const app = form.closest('.app')?.app;
        if (!app) return;

        app._updateObject();
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return foundry.utils.mergeObject(context, {
            currency: this.currency
        });
    }

    _updateObject() {
        let data = this.currency.filter(c => !!c.id && !!c.name);
        game.settings.set('monks-enhanced-journal', 'currency', data);
        this.submitting = true;
    }

    addCurrency(event) {
        this.currency.push({ id: "", name: "", convert: 1 });
        this.refresh();
    }

    changeData(event) {
        let currid = event.currentTarget.closest('li.item').dataset.id;
        let prop = event.currentTarget.getAttribute("name");

        let currency = this.currency.find(c => c.id == currid);
        if (currency) {
            let val = event.currentTarget.value;
            if (prop == "convert") {
                if (isNaN(val))
                    val = 1;
                else
                    val = parseFloat(val);
            }
            else if (prop == "id") {
                val = val.replace(/[^a-z]\-/gi, '');
                event.currentTarget.value = val;
                if (!!this.currency.find(c => c.id == val)) {
                    event.currentTarget.value = currid;
                    return;
                }
                event.currentTarget.closest('li.item').setAttribute("data-id", val);
            }

            currency[prop] = val;
        }
    }

    removeCurrency(event) {
        let currid = event.currentTarget.closest('li.item').dataset.id;
        this.currency.findSplice(s => s.id === currid);
        this.refresh();
    }

    resetCurrency() {
        this.currency = MonksEnhancedJournal.defaultCurrencies;
        this.refresh();
    }

    refresh() {
        this.render({ force: true });
        let that = this;
        window.setTimeout(function () { that.setPosition(); }, 500);
    }

    async _onRender(context, options) {
        const html = this.element;

        // Add event listeners for form elements
        html.querySelectorAll('button[name="reset"]').forEach(button => {
            button.addEventListener('click', this.resetCurrency.bind(this));
        });

        html.querySelectorAll('input[name]').forEach(input => {
            input.addEventListener('change', this.changeData.bind(this));
        });

        html.querySelectorAll('.item-delete').forEach(button => {
            button.addEventListener('click', this.removeCurrency.bind(this));
        });

        html.querySelectorAll('.item-add').forEach(button => {
            button.addEventListener('click', this.addCurrency.bind(this));
        });
    }
}