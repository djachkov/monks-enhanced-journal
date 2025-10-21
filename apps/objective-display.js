import { MonksEnhancedJournal, log, setting, i18n, makeid } from '../monks-enhanced-journal.js';

export class ObjectiveDisplay extends foundry.applications.api.ApplicationV2 {
    constructor(options = {}) {
        super(options);
    }

    static DEFAULT_OPTIONS = {
        id: "objective-display",
        window: {
            title: "MonksEnhancedJournal.Quests",
            resizable: true
        },
        position: {
            width: 500,
            height: 300,
            top: 75,
            left: 120
        }
    };

    static PARTS = {
        display: {
            template: "modules/monks-enhanced-journal/templates/objective-display.html"
        }
    };

    /** @override */
    get title() {
        return i18n("MonksEnhancedJournal.Quests");
    }

    /** @override */
    _getHeaderControls() {
        return super._getHeaderControls();
    }

    /** @override */
    _initializeApplicationOptions(options) {
        options = super._initializeApplicationOptions(options);
        
        // Apply saved position from user flags
        let pos = game.user.getFlag("monks-enhanced-journal", "objectivePos");
        if (pos) {
            options.position = foundry.utils.mergeObject(options.position, pos);
        }
        
        return options;
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        let icons = {
            inactive: "fa-ban",
            available: "fa-file-circle-plus",
            inprogress: "fa-circle-exclamation",
            completed: "fa-check",
            failed: "fa-xmark"
        }
        
        let quests = game.journal.filter(j => {
            if (j.pages.size != 1)
                return false;
            let page = j.pages.contents[0];
            return foundry.utils.getProperty(page, 'flags.monks-enhanced-journal.type') == 'quest' &&
                j.testUserPermission(game.user, "OBSERVER") &&
                page.getFlag('monks-enhanced-journal', 'display');
        }).map(q => {
            let page = q.pages.contents[0];
            let status = foundry.utils.getProperty(page, 'flags.monks-enhanced-journal.status') || (foundry.utils.getProperty(page, 'flags.monks-enhanced-journal.completed') ? 'completed' : 'inactive');
            let data = {
                id: page.id,
                uuid: page.uuid,
                completed: page.getFlag('monks-enhanced-journal', 'completed'),
                status: foundry.utils.getProperty(page, 'flags.monks-enhanced-journal.status') || (foundry.utils.getProperty(page, 'flags.monks-enhanced-journal.completed') ? 'completed' : 'inactive'),
                name: page.name,
                icon: icons[status]
            };

            if (setting('use-objectives')) {
                data.objectives = (page.getFlag('monks-enhanced-journal', 'objectives') || [])
                    .filter(o => o.available)
                    .map(o => {
                        return {
                            content: o.title || o.content,
                            done: o.done || 0,
                            required: o.required,
                            completed: o.status
                        }
                    });
            }

            return data;
        }).sort((a, b) => {
            let indexA = Object.keys(icons).findIndex(i => i == a.status);
            let indexB = Object.keys(icons).findIndex(i => i == b.status);

            return indexA - indexB;
        });

        return foundry.utils.mergeObject(context, { quests: quests });
    }

    async _onRender(context, options) {
        const html = this.element;

        // Add flexrow class to h4 elements (replacing jQuery)
        html.querySelectorAll('h4').forEach(h4 => {
            h4.classList.add('flexrow');
        });

        // Add event listeners for quest items
        html.querySelectorAll('li[data-document-id]').forEach(element => {
            element.addEventListener('click', this.openQuest.bind(this));
        });

        // Remove from ui.windows (ApplicationV2 handles this differently)
        delete ui.windows[this.id];
    }

    async openQuest(event) {
        let id = event.currentTarget.dataset.documentId;
        let page = await fromUuid(id);
        MonksEnhancedJournal.openJournalEntry(page);
    }

    async close(options) {
        if (options?.properClose) {
            super.close(options);
            MonksEnhancedJournal.objdisp;
        }
    }
}