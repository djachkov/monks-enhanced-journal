import { MonksEnhancedJournal, log, setting, i18n, makeid, quantityname } from '../monks-enhanced-journal.js';
import { getValue, setValue } from "../helpers.js";

export class TransferCurrency extends foundry.applications.api.ApplicationV2 {
    constructor(object, actor, loot, options = {}) {
        super(options);
        this.object = object;
        this.loot = loot;
        this.currency = {};
        this.actor = actor || game.user.character;
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "transfer-currency",
        classes: ["form", "transfer-currency", "monks-journal-sheet", "dialog"],
        tag: "form",
        window: {
            frame: true,
            positioned: true,
            title: "MonksEnhancedJournal.TransferCurrency",
            icon: "fas fa-coins",
            resizable: true
        },
        position: {
            width: 600,
            height: "auto"
        },
        form: {
            handler: TransferCurrency.#onSubmit,
            closeOnSubmit: true,
            submitOnChange: false
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/transfer-currency.html"
        }
    };

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        context.object = this.object;
        context.currency = MonksEnhancedJournal.currencies.filter(c => c.convert != null).map(c => { return { id: c.id, name: c.name }; });
        context.coins = this.currency;
        context.actor = {
            id: this.actor?.id,
            name: this.actor?.name || "No Actor",
            img: this.actor?.img || "icons/svg/mystery-man.svg"
        };

        return context;
    }

    /** @override */
    _canDragStart(selector) {
        return game.user.isGM;
    }

    /** @override */
    _canDragDrop(selector) {
        return true;
    }

    /** @override */
    async _onDrop(event) {
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        }
        catch (err) {
            return false;
        }

        if (data.type == "Actor") {
            let actor = await fromUuid(data.uuid);

            if (!actor || actor.compendium)
                return;

            this.actor = actor;
            this.render();
        }
    }

    /**
     * Validate form submission
     * @param {Event} event - The form submission event
     */
    async _onSubmitForm(event) {
        event.preventDefault();

        let remainder = this.object.getFlag('monks-enhanced-journal', 'currency');

        for (let [k, v] of Object.entries(this.currency)) {
            if (v < 0) {
                // make sure the character has the currency
                let curr = this.loot.getCurrency(this.actor, k);
                if (curr < Math.abs(v)) {
                    ui.notifications.warn("Actor does not have enough currency: " + k);
                    return false;
                }
            } else if (v > 0) {
                if (remainder[k] < v) {
                    ui.notifications.warn("Loot does not have enough currency: " + k);
                    return false;
                }
            }
        }

        return true;
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

        // Validate before processing
        const isValid = await app._onSubmitForm(event);
        if (!isValid) return;

        let remainder = app.object.getFlag('monks-enhanced-journal', 'currency') || {};

        for (let [k, v] of Object.entries(app.currency)) {
            if (v != 0) {
                await app.loot.addCurrency(app.actor, k, v);
                remainder[k] = (remainder[k] ?? 0) - v;
            }
        }
        
        if (game.user.isGM || app.object.isOwner) {
            await app.object.setFlag('monks-enhanced-journal', 'currency', remainder);
        } else {
            // Send this to the GM to update the loot sheet currency
            MonksEnhancedJournal.emit("transferCurrency", { currency: remainder, uuid: app.object.uuid });
        }

        app.close();
    }

    /** @override */
    _onRender(context, options) {
        const html = this.element;

        // Actor icon double-click handler
        const actorIcon = html.querySelector('.actor-icon');
        if (actorIcon) {
            actorIcon.addEventListener('dblclick', this.openActor.bind(this));
        }

        // Clear all items button
        const clearItemsBtn = html.querySelector('.clear-items');
        if (clearItemsBtn) {
            clearItemsBtn.addEventListener('click', this.clearAllCurrency.bind(this));
        }

        // Item delete buttons
        html.querySelectorAll('.item-delete').forEach(btn => {
            btn.addEventListener('click', this.clearCurrency.bind(this));
        });

        // Cancel button
        const cancelBtn = html.querySelector('.cancel-offer');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', this.close.bind(this));
        }

        // Currency field blur handlers
        html.querySelectorAll('.currency-field').forEach(field => {
            field.addEventListener('blur', (event) => {
                const currName = event.currentTarget.getAttribute("name");
                const lootCurrency = this.loot.object.getFlag("monks-enhanced-journal", "currency") || {};
                const maxCurr = lootCurrency[currName] || 0;
                this.currency[currName] = Math.min(parseInt(event.currentTarget.value || 0), maxCurr);
                event.currentTarget.value = this.currency[currName];
            });
        });
    }

    clearCurrency(event) {
        const id = event.currentTarget.closest(".item").dataset.id;

        this.currency[id] = 0;
        const field = this.element.querySelector(`.currency-field[name="${id}"]`);
        if (field) {
            field.value = '';
        }
    }

    clearAllCurrency(event) {
        this.currency = {};
        this.element.querySelectorAll('.currency-field').forEach(field => {
            field.value = '';
        });
    }

    async openActor() {
        try {
            if (this.actor) {
                this.actor.sheet.render(true);
            }
        } catch { }
    }
}