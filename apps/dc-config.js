import { MonksEnhancedJournal, log, setting, i18n, makeid } from '../monks-enhanced-journal.js';

export class DCConfig extends foundry.applications.api.ApplicationV2 {
    constructor(object, journalentry, options = {}) {
        super(options);
        this.object = object;
        this.journalentry = journalentry;
    }

    static DEFAULT_OPTIONS = {
        id: "dc-config",
        classes: ["form", "dc-sheet"],
        tag: "form",
        window: {
            title: "MonksEnhancedJournal.DCConfiguration",
            contentClasses: ["standard-form"]
        },
        position: {
            width: 400,
            height: "auto"
        },
        form: {
            handler: DCConfig.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    get title() {
        return i18n("MonksEnhancedJournal.DCConfiguration");
    }

    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/dc-config.html"
        }
    };

    static optionList() {
        let config = CONFIG[game.system.id.toUpperCase()] || {};
        if (game.system.id == "tormenta20")
            config = CONFIG.T20;
        else if (game.system.id == "shadowrun5e")
            config = CONFIG.SR5;

        const { lore, ...skills } = config.skillList || {};

        let attributeOptions = [
            { id: "ability", text: "MonksEnhancedJournal.Ability", groups: config.abilities || config.scores || config.atributos },
            { id: "save", text: "MonksEnhancedJournal.SavingThrow", groups: config.savingThrows || config.saves || config.saves_long || config.resistencias || config.abilities },
            { id: "skill", text: "MonksEnhancedJournal.Skill", groups: config.skills || config.pericias || skills }
        ];
        if (game.system.id == "pf2e")
            attributeOptions.push({ id: "attribute", text: i18n("MonksEnhancedJournal.Attribute"), groups: { perception: i18n("PF2E.PerceptionLabel") } });

        attributeOptions = attributeOptions.filter(g => g.groups);
        for (let attr of attributeOptions) {
            attr.groups = foundry.utils.duplicate(attr.groups);
            for (let [k, v] of Object.entries(attr.groups)) {
                attr.groups[k] = v?.label || v;
            }
        }

        return attributeOptions;
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return foundry.utils.mergeObject(context, {
            object: this.object,
            attributeOptions: DCConfig.optionList()
        });
    }

    static async #onSubmit(event, form, formData) {
        const app = form.closest('.app')?.app;
        if (!app) return;

        log('updating dc', event, formData.object, app.object);

        foundry.utils.mergeObject(app.object, formData.object);
        let dcs = foundry.utils.duplicate(app.journalentry.object.flags["monks-enhanced-journal"].dcs || []);
        if (app.object.id == undefined) {
            app.object.id = makeid();
            dcs.push(app.object);
        }
            
        await app.journalentry.object.setFlag('monks-enhanced-journal', 'dcs', dcs);
    }

    /* -------------------------------------------- */

    async _onRender(context, options) {
        // No additional event listeners needed for this simple form
    }

    async close(options = {}) {
        if (this.object.id && (this.object.attribute == 'undefined' || this.object.attribute.indexOf(':') < 0)) {
           this.journalentry.deleteItem(this.object.id, 'dcs');    //delete it if it wasn't created properly
        }
        return super.close(options);
    }
}