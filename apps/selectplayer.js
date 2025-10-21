import { MonksEnhancedJournal, log, setting, i18n } from '../monks-enhanced-journal.js';

export class SelectPlayer extends foundry.applications.api.ApplicationV2 {
    users = [];
    showpic = false;
    updatepermission = false;

    constructor(sheet, options = {}) {
        super(options);
        this.object = sheet.object;
        this.showpic = (options.showpic != undefined ? options.showpic : false);
        this.updatepermission = (options.updatepermission != undefined ? options.updatepermission : false);

        this.journalsheet = sheet;
    }

    static DEFAULT_OPTIONS = {
        id: "select-player",
        classes: ["form", "select-sheet"],
        tag: "form",
        window: {
            title: "MonksEnhancedJournal.SelectPlayer",
            contentClasses: ["standard-form"]
        },
        position: {
            width: 400,
            height: "auto"
        },
        form: {
            handler: SelectPlayer.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    get title() {
        return i18n("MonksEnhancedJournal.SelectPlayer");
    }

    static PARTS = {
        form: {
            template: "modules/monks-enhanced-journal/templates/selectplayer.html"
        }
    };

    static async #onSubmit(event, form, formData) {
        const app = form.closest('.app')?.app;
        if (!app) return;

        await app._updateObject(event, formData.object);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        this.users = game.users.map(u => {
            return {
                id: u.id,
                name: u.name,
                active: u.active,
                selected: false
            };
        }).filter(u => u.id != game.user.id);
        
        return foundry.utils.mergeObject(context, {
            users: this.users,
            picchoice: this.canShowPic(),
            showpic: this.showpic,
            updatepermission: this.updatepermission,
            object: this.object
        });
    }

    canShowPic() {
        let type = this.journalsheet.object?.flags["monks-enhanced-journal"]?.type || 'oldentry';
        return ((["person", "place", "poi", "event", "quest", "oldentry", "organization", "shop", "oldentry", "journalentry", "base"].includes(type) || this.object.documentName == 'Actor') && this.object.img);
    }

    /* -------------------------------------------- */

    /** @override */
    async _updateObject(event, formData) {

    }

    updateSelection(event) {
        log('Changing selection');
        let ctrl = event.currentTarget;
        let li = ctrl.closest('li');
        let id = li.dataset.userId;

        let user = this.users.find(u => u.id == id);
        user.selected = ctrl.checked;
    }

    updateShowPic(event) {
        this.showpic = event.currentTarget.checked;
        if (this.showpic) {
            this.updatepermission = false;
            const updatePermissionEl = this.element.querySelector('.update-permission');
            if (updatePermissionEl) updatePermissionEl.checked = false;
        }
    }

    updatePermission(event) {
        this.updatepermission = event.currentTarget.checked;
        if (this.updatepermission) {
            this.showpic = false;
            const showPicEl = this.element.querySelector('.show-pic');
            if (showPicEl) showPicEl.checked = false;
        }
    }

    showPlayers(mode, event) {
        let users = this.users.filter(u => u.selected);
        if (mode == 'players' && users.length == 0) {
            ui.notifications.info(i18n("MonksEnhancedJournal.msg.NoPlayersSelected"));
            return;
        }
        event.data = { users: (mode == 'all' ? null : users), options: { showpic: this.showpic, updatepermission: this.updatepermission }};
        this.journalsheet._onShowPlayers.call(this.journalsheet, event);
    }

    async _onRender(context, options) {
        const html = this.element;

        // Add event listeners for buttons
        html.querySelectorAll('button[name="showall"]').forEach(button => {
            button.addEventListener('click', this.showPlayers.bind(this, 'all'));
        });

        html.querySelectorAll('button[name="show"]').forEach(button => {
            button.addEventListener('click', this.showPlayers.bind(this, 'players'));
        });

        // Add event listeners for checkboxes
        html.querySelectorAll('input[type="checkbox"].user-select').forEach(input => {
            input.addEventListener('change', this.updateSelection.bind(this));
        });

        html.querySelectorAll('input[type="checkbox"].pic-select').forEach(input => {
            input.addEventListener('change', this.updateShowPic.bind(this));
        });

        html.querySelectorAll('input[type="checkbox"].update-permission').forEach(input => {
            input.addEventListener('change', this.updatePermission.bind(this));
        });
    }
}