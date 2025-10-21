import { MonksEnhancedJournal, log, setting, i18n, makeid } from '../monks-enhanced-journal.js';

export class CustomisePages extends foundry.applications.api.ApplicationV2 {

    constructor(object, options) {
        super(options);

        this.object = object;
        this.sheetSettings = {};
        let types = MonksEnhancedJournal.getDocumentTypes();
        for (let page of CustomisePages.typeList) {
            this.sheetSettings[page] = {};
            let cls = types[page];
            if (!cls) continue;
            if (cls.sheetSettings != undefined) {
                let settings = cls.sheetSettings();
                this.sheetSettings[page] = settings;
            }
        }
        this._activeCategory = "encounter";
    }

    get activeCategory() {
        return this._activeCategory;
    }

    static get typeList() {
        return ["encounter", "event", "organization", "person", "picture", "place", "poi", "quest", "shop"];
    }

    static DEFAULT_OPTIONS = {
        id: "customise-pages",
        form: {
            handler: CustomisePages.#onSubmit,
            closeOnSubmit: true,
            submitOnClose: false,
            submitOnChange: false
        },
        position: {
            width: 800,
            resizable: true,
        },
        window: {
            title: "Customise Pages",
        }
    }

    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/customise/customise-pages.html"
        }
    }

    static async #onSubmit(event, form, formData) {
        const app = this;
        await game.settings.set("monks-enhanced-journal", "sheet-settings", app.sheetSettings, { diff: false });
    }

    async _preparePartContext(partId, context, options) {
        let load_templates = {};
        for (let page of CustomisePages.typeList) {
            let template = `modules/monks-enhanced-journal/templates/customise/${page}.html`;
            load_templates[page] = template;
            delete Handlebars.partials[template];
        }
        await loadTemplates(load_templates);
        return context;
    }

    _prepareContext(options) {
        let data = {};
        data.generalEdit = true;
        data.sheetSettings = foundry.utils.duplicate(this.sheetSettings);

        for (let page of CustomisePages.typeList) {
            data.sheetSettings[page] = MonksEnhancedJournal.convertObjectToArray(data.sheetSettings[page]);
        }

        return data;
    }

    _onRender(context, options) {
        const resetAllButton = this.element.querySelector("button.reset-all");
        if (resetAllButton) {
            resetAllButton.addEventListener('click', this._onResetDefaults.bind(this));
        }

        const inputFields = this.element.querySelectorAll('input[name]');
        inputFields.forEach(input => {
            input.addEventListener('change', this.changeData.bind(this));
        });

        const deleteButtons = this.element.querySelectorAll('.item-delete-attribute');
        deleteButtons.forEach(button => {
            button.addEventListener('click', this.removeAttribute.bind(this));
        });

        const addButtons = this.element.querySelectorAll('.item-add-attribute');
        addButtons.forEach(button => {
            button.addEventListener('click', this.addAttribute.bind(this));
        });

        // Set up drag and drop
        const dragElements = this.element.querySelectorAll('.reorder-attribute');
        dragElements.forEach(element => {
            element.draggable = true;
            element.addEventListener('dragstart', this._onDragStart.bind(this));
        });

        const dropElements = this.element.querySelectorAll('.item-list');
        dropElements.forEach(element => {
            element.addEventListener('drop', this._onDrop.bind(this));
            element.addEventListener('dragover', (e) => e.preventDefault());
        });
    }

    get currentType() {
        return this.activeCategory;
    }

    addAttribute(event) {
        let attribute = event.currentTarget.dataset.attribute;
        let attributes = foundry.utils.getProperty(this, attribute);

        if (!attributes) return;

        // find the maximum order
        let maxOrder = 0;
        for (let attr of Object.values(attributes)) {
            maxOrder = Math.max(maxOrder, attr.order);
        }

        attributes[foundry.utils.randomID()] = { id: foundry.utils.randomID(), name: "", shown: true, full: false, order: maxOrder + 1 };

        this.render({ force: true });
    }

    changeData(event) {
        let prop = event.currentTarget.getAttribute("name");
        if (foundry.utils.hasProperty(this, prop)) {
            let val = event.currentTarget.type === "checkbox" ? event.currentTarget.checked : event.currentTarget.value;
            foundry.utils.setProperty(this, prop, val);
        }
    }

        removeAttribute(event) {
        event.preventDefault();
        const li = event.currentTarget.closest('li');
        if (li) li.remove();
    }

    _onDragStart(event) {
        let li = event.currentTarget.closest(".item");
        const dragData = { id: li.dataset.id };
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    _canDragStart(selector) {
        return true;
    }

    _onDrop(event) {
        // Try to extract the data
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        }
        catch (err) {
            return false;
        }

        // Identify the drop target
        const target = event.target.closest(".item") || null;

        // Call the drop handler
        if (target && target.dataset.id) {
            if (data.id === target.dataset.id) return; // Don't drop on yourself

            let property = event.target.dataset.attribute;
            let attributes = foundry.utils.getProperty(this, property);

            let from = (foundry.utils.getProperty(this, data.id) || {}).order ?? 0;
            let to = (foundry.utils.getProperty(this, target.dataset.id) || {}).order ?? 0;
            log('from', from, 'to', to);

            if (from < to) {
                for (let attr of Object.values(attributes)) {
                    if (attr.order > from && attr.order <= to) {
                        attr.order--;
                    }
                }
                const draggedElement = this.element.querySelector(`.item-list .item[data-id="${data.id}"]`);
                if (draggedElement && target.nextSibling) {
                    target.parentNode.insertBefore(draggedElement, target.nextSibling);
                } else if (draggedElement) {
                    target.parentNode.appendChild(draggedElement);
                }
            } else {
                for (let attr of Object.values(attributes)) {
                    if (attr.order < from && attr.order >= to) {
                        attr.order++;
                    }
                }
                const draggedElement = this.element.querySelector(`.item-list .item[data-id="${data.id}"]`);
                if (draggedElement) {
                    target.parentNode.insertBefore(draggedElement, target);
                }
            }
            (foundry.utils.getProperty(this, data.id) || {}).order = to;
        }
    }

    _updateObject(event, formData) {
        game.settings.set("monks-enhanced-journal", "sheet-settings", this.sheetSettings, { diff: false });
    }

    async _onResetDefaults(event) {
        let sheetSettings = game.settings.settings.get("monks-enhanced-journal.sheet-settings");
        await game.settings.set("monks-enhanced-journal", "sheet-settings", sheetSettings.default);
        this.sheetSettings = sheetSettings.default;

        this.render({ force: true });
    }
}