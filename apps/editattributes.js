import { MonksEnhancedJournal, log, setting, i18n, makeid } from '../monks-enhanced-journal.js';

export class EditAttributes extends foundry.applications.api.ApplicationV2 {
    constructor(object, options = {}) {
        super(options);
        this.object = object;
    }

    static DEFAULT_OPTIONS = {
        id: "edit-attributes",
        classes: ["form", "edit-attributes"],
        tag: "form",
        window: {
            title: "MonksEnhancedJournal.EditAttributes",
            contentClasses: ["standard-form"]
        },
        position: {
            width: 600,
            height: "auto"
        },
        form: {
            handler: EditAttributes.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    get title() {
        return i18n("MonksEnhancedJournal.EditAttributes");
    }

    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/editattributes.html",
            scrollable: [".item-list"]
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
            fields: this.attributes || []
        });
    }

    addAttribute(event) {
        this.attributes.push({ id: "", name: "", hidden: false, full: false });
        this.refresh();
    }

    changeData(event) {
        let attrid = event.currentTarget.closest('li.item').dataset.id;
        let prop = event.currentTarget.getAttribute("name");

        let attr = this.attributes.find(c => c.id == attrid);
        if (attr) {
            let val = event.currentTarget.value;
            if (prop == "hidden" || prop == "full") {
                val = event.currentTarget.checked;
            }
            else if (prop == "id") {
                val = val.replace(/[^a-z]/gi, '');
                event.currentTarget.value = val;
                if (!!this.attributes.find(c => c.id == val)) {
                    event.currentTarget.value = attrid;
                    return;
                }
                event.currentTarget.closest('li.item').setAttribute("data-id", val);
            }

            attr[prop] = val;
        }
    }

    removeAttribute(event) {
        let attrid = event.currentTarget.closest('li.item').dataset.id;
        this.attributes.findSplice(s => s.id === attrid);
        this.refresh();
    }

    refresh() {
        this.render({ force: true });
        let that = this;
        window.setTimeout(function () {
            that.setPosition({ height: 'auto' });
        }, 100);
    }

    async _onRender(context, options) {
        const html = this.element;

        // Set up drag and drop functionality
        this._setupDragDrop();

        // Add event listeners for form elements
        html.querySelectorAll('button[name="reset"]').forEach(button => {
            button.addEventListener('click', this.resetAttributes.bind(this));
        });

        html.querySelectorAll('input[name]').forEach(input => {
            input.addEventListener('change', this.changeData.bind(this));
        });

        html.querySelectorAll('.item-delete').forEach(button => {
            button.addEventListener('click', this.removeAttribute.bind(this));
        });

        html.querySelectorAll('.item-add').forEach(button => {
            button.addEventListener('click', this.addAttribute.bind(this));
        });
    }

    _setupDragDrop() {
        const html = this.element;
        
        // Set up draggable elements
        html.querySelectorAll('.reorder').forEach(element => {
            element.draggable = true;
            element.addEventListener('dragstart', this._onDragStart.bind(this));
        });

        // Set up drop zones
        html.querySelectorAll('.item-list').forEach(element => {
            element.addEventListener('dragover', (event) => event.preventDefault());
            element.addEventListener('drop', this._onDrop.bind(this));
        });
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

            let from = this.attributes.findIndex(a => a.id == data.id);
            let to = this.attributes.findIndex(a => a.id == target.dataset.id);
            log('from', from, 'to', to);
            this.attributes.splice(to, 0, this.attributes.splice(from, 1)[0]);

            const draggedElement = this.element.querySelector(`.item-list .item[data-id="${data.id}"]`);
            if (draggedElement) {
                if (from < to) {
                    if (target.nextSibling) {
                        target.parentNode.insertBefore(draggedElement, target.nextSibling);
                    } else {
                        target.parentNode.appendChild(draggedElement);
                    }
                } else {
                    target.parentNode.insertBefore(draggedElement, target);
                }
            }
        }
    }
}

export class EditPersonAttributes extends EditAttributes {
    constructor(object, options = {}) {
        super(object, options);
    }

    async _prepareContext(options) {
        this.attributes = this.attributes || setting("person-attributes");
        const context = await super._prepareContext(options);
        return foundry.utils.mergeObject(context, {
            fields: this.attributes
        });
    }

    _updateObject() {
        let data = this.attributes.filter(c => !!c.id && !!c.name);
        game.settings.set('monks-enhanced-journal', 'person-attributes', data);
        this.submitting = true;
    }

    resetAttributes() {
        this.attributes = game.settings.settings.get('monks-enhanced-journal.person-attributes').default;
        this.refresh();
    }
}

export class EditPlaceAttributes extends EditAttributes {
    constructor(object, options = {}) {
        super(object, options);
    }

    async _prepareContext(options) {
        this.attributes = this.attributes || setting("place-attributes");
        const context = await super._prepareContext(options);
        return foundry.utils.mergeObject(context, {
            fields: this.attributes
        });
    }

    _updateObject() {
        let data = this.attributes.filter(c => !!c.id && !!c.name);
        game.settings.set('monks-enhanced-journal', 'place-attributes', data);
        this.submitting = true;
    }

    resetAttributes() {
        this.attributes = game.settings.settings.get('monks-enhanced-journal.place-attributes').default;
        this.refresh();
    }
}