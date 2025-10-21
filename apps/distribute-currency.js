import { MonksEnhancedJournal, log, setting, i18n } from '../monks-enhanced-journal.js';

export class DistributeCurrency extends foundry.applications.api.ApplicationV2 {
    original = {};
    characters = [];
    currency = {};
    totals = {};

    constructor(characters, currency, loot, options = {}) {
        super(options);

        this.loot = loot;
        this.currency = currency;
        this.original = foundry.utils.duplicate(currency);
        this.totals = foundry.utils.duplicate(currency);
        let playercurrency = foundry.utils.duplicate(currency);
        for (let curr of Object.keys(currency))
            playercurrency[curr] = 0;
        this.characters = characters.map(c => {
            return {
                id: c.id,
                name: c.name,
                img: c.img,
                currency: foundry.utils.duplicate(playercurrency)
            }
        });

        this.currencies = MonksEnhancedJournal.currencies;

        if (setting("loot-auto-distribute"))
            this.splitCurrency();

    }

    static DEFAULT_OPTIONS = {
        id: "distribute-currency",
        classes: ["distribute-currency", "monks-journal-sheet", "dialog"],
        tag: "form",
        window: {
            title: "MonksEnhancedJournal.DistributeCurrency",
            contentClasses: ["standard-form"]
        },
        position: {
            width: 600,
            height: "auto"
        },
        form: {
            handler: DistributeCurrency.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    get title() {
        return i18n("MonksEnhancedJournal.DistributeCurrency");
    }

    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/distribute-currency.html"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return foundry.utils.mergeObject(context, {
            characters: this.characters,
            currencies: this.currencies,
            currency: this.currency,
            totals: this.totals
        });
    }

    static async #onSubmit(event, form, formData) {
        const app = form.closest('.app')?.app;
        if (!app) return;

        app.loot.doSplitMoney(app.characters, app.currency);
    }

    calcTotal(currencies) {
        if (currencies == undefined)
            currencies = Object.keys(this.currency);
        else
            currencies = [currencies];
        for (let curr of currencies) {
            this.totals[curr] = this.currency[curr];
            for (let character of this.characters) {
                if (character.currency[curr] !== "")
                    this.totals[curr] = this.totals[curr] + character.currency[curr];
            }
        }
    }

    resetData() {
        this.currency = foundry.utils.duplicate(this.original);
        for (let character of this.characters) {
            for (let curr of Object.keys(character.currency)) {
                character.currency[curr] = 0;
            }
        }

        this.calcTotal();

        this.render({ force: true });
    }

    updateAmount(event) {
        let curr = event.currentTarget.dataset.currency;
        let charId = event.currentTarget.dataset.character;

        if (charId == undefined)
            this.currency[curr] = parseInt(event.currentTarget.value || 0);
        else {
            let character = this.characters.find(c => c.id == charId);
            let value = event.currentTarget.value;
            if (value === "")
                character.currency[curr] = "";
            else
                character.currency[curr] = parseInt(value);
        }

        this.calcTotal();

        this.render({ force: true });
    }

    splitCurrency(event) {
        for (let curr of Object.keys(this.currency)) {
            if (this.currency[curr] == 0)
                continue;
            let characters = this.characters.filter(c => {
                return c.currency[curr] !== "";
            });
            if (characters.length == 0)
                continue;
            let part = Math.floor(this.currency[curr] / characters.length);
            for (let character of characters) {
                character.currency[curr] = character.currency[curr] + part;
            }

            this.currency[curr] = this.currency[curr] - (part * characters.length);
            if (setting("distribute-conversion") && this.currency[curr] > 0) {
                //find the next lower currency
                let idx = this.currencies.findIndex(c => c.id == curr);
                let newIdx = idx + 1;
                if (newIdx < this.currencies.length && this.currencies[newIdx].convert != undefined) {
                    //convert to default
                    let convVal = this.currency[curr] * (this.currencies[idx].convert || 1);
                    convVal = convVal / (this.currencies[newIdx].convert || 1);
                    this.currency[curr] = 0;
                    this.currency[this.currencies[newIdx].id] = this.currency[this.currencies[newIdx].id] + convVal;
                }
            }
        }

        this.calcTotal();

        this.render({ force: true });
    }

    assignCurrency(event) {
        let charId = event.currentTarget.dataset.character;

        let character = this.characters.find(c => c.id == charId);
        for (let curr of Object.keys(this.totals)) {
            character.currency[curr] = (character.currency[curr] || 0) + this.currency[curr];
            this.currency[curr] = 0;
        }

        this.calcTotal();

        this.render({ force: true });
    }

    async _onRender(context, options) {
        const html = this.element;

        // Add event listeners for input fields
        html.querySelectorAll('input.player-amount, input.currency-amount').forEach(input => {
            input.addEventListener('change', this.updateAmount.bind(this));
        });

        // Add event listeners for action buttons
        html.querySelectorAll('a.split').forEach(button => {
            button.addEventListener('click', this.splitCurrency.bind(this));
        });

        html.querySelectorAll('a.reset').forEach(button => {
            button.addEventListener('click', this.resetData.bind(this));
        });

        html.querySelectorAll('a.assign').forEach(button => {
            button.addEventListener('click', this.assignCurrency.bind(this));
        });
    }


}