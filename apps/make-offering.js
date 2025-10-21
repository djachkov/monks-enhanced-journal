import { MonksEnhancedJournal, log, setting, i18n, makeid, quantityname } from '../monks-enhanced-journal.js';
import { getValue, setValue } from "../helpers.js";

export class MakeOffering extends foundry.applications.api.ApplicationV2 {
    constructor(object, journalsheet, options = {}) {
        super(options);
        this.object = object;
        this.journalsheet = journalsheet;
        this.offering = foundry.utils.mergeObject({
            currency: {},
            items: []
        }, options.offering || {});

        if (game.user.character && !this.offering.actor) {
            this.offering.actor = {
                id: game.user.character.id,
                name: game.user.character.name,
                img: game.user.character.img
            }
        }
    }

    static DEFAULT_OPTIONS = {
        id: "make-offering",
        classes: ["form", "make-offering", "monks-journal-sheet", "dialog"],
        tag: "form",
        window: {
            title: "MonksEnhancedJournal.MakeOffering",
            contentClasses: ["standard-form"]
        },
        position: {
            width: 600,
            height: "auto"
        },
        form: {
            handler: MakeOffering.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    get title() {
        return i18n("MonksEnhancedJournal.MakeOffering");
    }

    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/make-offering.html"
        }
    };

    static async #onSubmit(event, form, formData) {
        const app = form.closest('.app')?.app;
        if (!app) return;

        await app._updateObject(event, formData.object);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        context.private = this.offering.hidden;
        context.currency = MonksEnhancedJournal.currencies.filter(c => c.convert != null).map(c => { return { id: c.id, name: c.name }; });
        context.coins = this.offering.currency;
        context.items = (this.offering.items || []).map(i => {
            let actor = game.actors.get(i.actorId)
            if (!actor)
                return null;

            let item = actor.items.get(i.id);
            if (!item)
                return null;

            let details = MonksEnhancedJournal.getDetails(item);

            return {
                id: i.id,
                name: game.user.isGM ? details.identifiedName : details.name,
                img: details.img,
                qty: i.qty
            }
        }).filter(i => !!i);

        let actor = game.actors.get(this.offering?.actor?.id);
        context.actor = {
            id: actor?.id,
            name: actor?.name || "No Actor",
            img: actor?.img || "icons/svg/mystery-man.svg"
        };

        context.object = this.object;
        return context;
    }

    /* -------------------------------------------- */

    _canDragDrop() {
        return true;
    }

    async _onRender(context, options) {
        const html = this.element;

        // Set up drag and drop functionality
        this._setupDragDrop();

        // Add event listeners
        html.querySelectorAll('.actor-icon').forEach(element => {
            element.addEventListener('dblclick', this.openActor.bind(this));
        });

        html.querySelectorAll('.item-delete').forEach(element => {
            element.addEventListener('click', this.removeOffering.bind(this));
        });

        html.querySelectorAll('.cancel-offer').forEach(element => {
            element.addEventListener('click', this.close.bind(this));
        });

        html.querySelectorAll('.private').forEach(element => {
            element.addEventListener('change', (event) => {
                this.offering.hidden = event.currentTarget.checked;
            });
        });

        html.querySelectorAll('.currency-field').forEach(element => {
            element.addEventListener('blur', (event) => {
                this.offering.currency[event.currentTarget.getAttribute('name')] = parseInt(event.currentTarget.value || 0);
            });
        });
    }

    _setupDragDrop() {
        const html = this.element;
        
        // Set up drop zones
        html.querySelectorAll('.make-offer-container').forEach(element => {
            element.addEventListener('dragover', (event) => event.preventDefault());
            element.addEventListener('drop', this._onDrop.bind(this));
        });
    }

    async _onDrop(event) {
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        }
        catch (err) {
            return false;
        }

        if (data.type == 'Item') {
            let item = await fromUuid(data.uuid);
            let actor = item.parent;

            //Only allow items from an actor
            if (!actor || actor.compendium)
                return;

            let max = getValue(item.system, quantityname(), null);

            this.offering.actor = {
                id: actor.id,
                name: actor.name,
                img: actor.img
            }

            let result = await this.journalsheet.constructor.confirmQuantity(item, max, "offer", false);
            if ((result?.quantity ?? 0) > 0) {

                this.offering.items.push({
                    id: item.id,
                    itemName: item.name,
                    actorId: actor.id,
                    actorName: actor.name,
                    qty: result.quantity
                });
                this.render();
            }
        } else if (data.type == "Actor") {
            let actor = await fromUuid(data.uuid);

            if (!actor || actor.compendium)
                return;

            this.offering.actor = {
                id: actor.id,
                name: actor.name,
                img: actor.img
            }
            this.render();
        }

        log('drop data', event, data);
    }

    /** @override */
    async _updateObject(event, formData) {
        this.offering.userid = game.user.id;
        this.offering.state = "offering";

        if (game.user.isGM || this.object.isOwner) {
            let offerings = foundry.utils.duplicate(this.object.getFlag("monks-enhanced-journal", "offerings") || []);
            this.offering.id = makeid();
            offerings.unshift(this.offering);
            await this.object.setFlag("monks-enhanced-journal", "offerings", offerings);
        } else {
            MonksEnhancedJournal.emit("makeOffering", { offering: this.offering, uuid: this.object.uuid });
        }
    }



    removeOffering(event) {
        let that = this;
        const id = event.currentTarget.closest(".item").dataset.id;
        Dialog.confirm({
            title: `Remove offering Item`,
            content: "Are you sure you want to remove this item from the offering?",
            yes: () => {
                that.offering.items.findSplice(i => i.id == id);
                that.render();
            }
        });
    }

    async openActor() {
        try {
            let actor = game.actors.get(this.offering?.actor?.id);
            if (actor) {
                actor.sheet.render(true);
            }
        } catch {}
    }
}