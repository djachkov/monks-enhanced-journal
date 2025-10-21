import { MonksEnhancedJournal, log, i18n, error, setting, getVolume, makeid  } from "../monks-enhanced-journal.js"
import { EnhancedJournalSheet } from "../sheets/EnhancedJournalSheet.js"
import { JournalEntrySheet } from "../sheets/JournalEntrySheet.js"

export class EnhancedJournal extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    tabs = [];
    bookmarks = [];
    searchresults = [];
    searchpos = 0;
    lastquery = '';
    _imgcontext = null;

    constructor(object, options = {}) {
        super(options);

        // Store the object for later use
        this._initialObject = object;
        this._initialOptions = options;

        this.tabs = foundry.utils.duplicate(game.user.getFlag('monks-enhanced-journal', 'tabs') || [{ "id": makeid(), "text": i18n("MonksEnhancedJournal.NewTab"), "active": true, "history": [] }]);
        this.tabs = this.tabs.map(t => { delete t.entity; return t; })
        this.tabs.active = (findone = true) => {
            let tab = this.tabs.find(t => t.active);
            if (findone) {
                if (tab == undefined && this.tabs.length > 0)
                    tab = this.tabs[0];
            }
            return tab;
        };
        this.bookmarks = foundry.utils.duplicate(game.user.getFlag('monks-enhanced-journal', 'bookmarks') || []);

        this._tabs;// = new Tabs({ navSelector: ".tabs", contentSelector: ".sheet-body", initial: null, callback: this.tabChange });

        this._collapsed = setting('start-collapsed');

        this.subdocument = null;

        this._lastentry = null;
        this._backgroundsound = {};

        this._soundHook = Hooks.on(game.modules.get("monks-sound-enhancements")?.active ? "globalSoundEffectVolumeChanged" : "globalInterfaceVolumeChanged", (volume) => {
            for (let sound of Object.values(this._backgroundsound)) {
                sound.volume = volume * getVolume()
            }
        });
    }

    /** @override */
    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        
        //load up the last entry being shown
        this.object = this._initialObject;
        if (this._initialObject != undefined)
            this.open(this._initialObject, this._initialOptions?.newtab, { anchor: this._initialOptions?.anchor });
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "MonksEnhancedJournal",
        tag: "div",
        window: {
            frame: true,
            positioned: true,
            title: "MonksEnhancedJournal.Title",
            icon: "fas fa-book-open",
            resizable: true,
            minimizable: true
        },
        position: {
            width: 1025,
            height: 700
        },
        form: {
            handler: undefined,
            closeOnSubmit: false,
            submitOnChange: true
        },
        dragDrop: [
            { dragSelector: ".journal-tab, .bookmark-button", dropSelector: ".enhanced-journal-header" }
        ]
    };

    /** @override */
    static PARTS = {
        main: {
            template: "modules/monks-enhanced-journal/templates/main.html"
        }
    };

    /** @override */
    get classes() {
        const classes = ["monks-enhanced-journal", `${game.system.id}`];
        if (game.modules.get("rippers-ui")?.active)
            classes.push('rippers-ui');
        if (game.modules.get("rpg-styled-ui")?.active)
            classes.push('rpg-styled-ui');
        if (!setting("show-bookmarkbar"))
            classes.push('hide-bookmark');
        return classes;
    }

    get entryType() {
        return ui.journal.collection.documentName;
    }

    get _onCreateDocument() {
        return ui.journal._onCreateDocument;
    }

    get collection() {
        return ui.journal.collection;
    }

    get isEditable() {
        let object = this.object;
        if (object instanceof JournalEntryPage && !!foundry.utils.getProperty(object, "flags.monks-enhanced-journal.type")) {
            let type = foundry.utils.getProperty(object, "flags.monks-enhanced-journal.type");
            if (type == "base" || type == "oldentry") type = "journalentry";
            let types = MonksEnhancedJournal.getDocumentTypes();
            if (types[type]) {
                object = object.parent;
            }
        }

        let editable = !!this.options["editable"] && object.isOwner;
        if (object.pack) {
            const pack = game.packs.get(object.pack);
            if (pack.locked) editable = false;
        }
        return editable;
    }

    /** @override */
    async _prepareContext(options) {
        //const cfg = CONFIG["JournalEntry"];
        let canBack = this.canBack();
        let canForward = this.canForward();

        const context = await super._prepareContext(options);
        return foundry.utils.mergeObject(context,
            {
                tabs: this.tabs,
                bookmarks: this.bookmarks.sort((a, b) => a.sort - b.sort),
                user: game.user,
                canForward: canForward,
                canBack: canBack,
                collapsed: this._collapsed
            }, {recursive: false}
        );
    }

    //checkForChanges() {
    //    return this.subsheet?.editors?.content?.active && this.subsheet.editors?.content?.mce?.isDirty();
    //}

    /** @override */
    async _onRender(context, options) {
        // Remove any existing GM notes
        const existingGMNotes = this.element.querySelectorAll('.open-gm-note');
        existingGMNotes.forEach(note => note.remove());

        // Set background images
        if (setting('background-image') != 'none') {
            this.element.setAttribute("background-image", setting('background-image'));
        } else {
            this.element.removeAttribute("background-image");
        }

        if (setting('sidebar-image') != 'none') {
            this.element.setAttribute("sidebar-image", setting('sidebar-image'));
        } else {
            this.element.removeAttribute("sidebar-image");
        }

        // Render directory and subsheet
        this.renderDirectory().then((html) => {
            if (html) {
                MonksEnhancedJournal.updateDirectory(html, false);
            }
        }).catch(err => {
            console.warn("Enhanced Journal: Error rendering directory", err);
        });

        this.renderSubSheet(true, options); /*.then(() => {
            if (options?.pageId && this.subsheet.goToPage) {
                this.subsheet.goToPage(options.pageId, options?.anchor);
            }
        });*/  //Removing this because goToPage requires the toc to be loaded, and it's not loaded yet

        // Activate event listeners
        this._activateEventListeners();
    }

    /**
     * Activate event listeners for the Enhanced Journal
     */
    _activateEventListeners() {
        const html = this.element;

        this._contextMenu(html);

        // Sidebar toggle
        const sidebarToggle = html.querySelector('.sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                if (this._collapsed)
                    this.expandSidebar();
                else
                    this.collapseSidebar();
            });
        }

        // Add bookmark button
        const addBookmarkBtn = html.querySelector('.add-bookmark');
        if (addBookmarkBtn) {
            addBookmarkBtn.addEventListener('click', this.addBookmark.bind(this));
        }

        // Bookmark buttons (excluding add-bookmark)
        html.querySelectorAll('.bookmark-button:not(.add-bookmark)').forEach(btn => {
            btn.addEventListener('click', this.activateBookmark.bind(this));
        });

        // Add tab button
        const addTabBtn = html.querySelector('.tab-add');
        if (addTabBtn) {
            addTabBtn.addEventListener('click', this.addTab.bind(this));
        }

        // Journal tabs
        html.querySelectorAll('.journal-tab').forEach(elem => {
            elem.addEventListener('click', this.activateTab.bind(this, elem.getAttribute('data-tabid')));
        });

        // Journal tab close buttons
        html.querySelectorAll('.journal-tab .close').forEach(closeBtn => {
            const tabid = closeBtn.closest('.journal-tab').dataset.tabid;
            const tab = this.tabs.find(t => t.id == tabid);
            closeBtn.addEventListener('click', this.removeTab.bind(this, tab));
        });

        // Back/forward buttons
        const showNavButtons = game.user.isGM || setting('allow-player');
        html.querySelectorAll('.back-button, .forward-button').forEach(btn => {
            btn.style.display = showNavButtons ? '' : 'none';
            if (showNavButtons) {
                btn.addEventListener('click', this.navigateHistory.bind(this));
            }
        });
    }

    async renderDirectory() {
        const cfg = CONFIG["JournalEntry"];
        const cls = cfg.documentClass;
        let template = "modules/monks-enhanced-journal/templates/directory.html";
        let data = {
            tree: ui.journal.collection.tree,
            entryPartial: ui.journal.constructor.entryPartial,
            folderPartial: ui.journal.constructor.folderPartial,
            canCreateEntry: ui.journal.canCreateEntry,
            canCreateFolder: ui.journal.canCreateFolder,
            sortIcon: ui.journal.collection.sortingMode === "a" ? "fa-arrow-down-a-z" : "fa-arrow-down-short-wide",
            sortTooltip: ui.journal.collection.sortingMode === "a" ? "SIDEBAR.SortModeAlpha" : "SIDEBAR.SortModeManual",
            searchIcon: ui.journal.collection.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME ? "fa-search" : "fa-file-magnifying-glass",
            searchTooltip: ui.journal.collection.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME ? "SIDEBAR.SearchModeName" : "SIDEBAR.SearchModeFull",
            documentCls: cls.documentName.toLowerCase(),
            tabName: cls.metadata.collection,
            sidebarIcon: cfg.sidebarIcon,
            folderIcon: "fas fa-folder",
            user: game.user,
            label: i18n("MonksEnhancedJournal.Entry"),
            labelPlural: i18n(cls.metadata.labelPlural),
            unavailable: game.user.isGM ? cfg.collection?.instance?.invalidDocumentIds?.size : 0
        };

        let html = await renderTemplate(template, data);
        const htmlElement = document.createElement('div');
        htmlElement.innerHTML = html;
        const htmlContent = htmlElement.firstElementChild;

        // Check if element exists before trying to query it
        if (this.element) {
            const sidebarElement = this.element.querySelector('.directory-sidebar');
            if (sidebarElement) {
                sidebarElement.replaceChildren(htmlContent);
            }
        }

        //if (game.modules.get("forien-quest-log")?.active && !game.settings.get("forien-quest-log", 'showFolder')) {
        let folder = game.journal.directory.folders.find(f => (f.name == '_fql_quests' && f.parent == null));
        if (folder) {
            let elem = html.querySelector(`.folder[data-folder-id="${folder.id}"]`);
            if (elem) elem.remove();
        }
        //}

        folder = game.journal.directory.folders.find(f => (f.name == '_simple_calendar_notes_directory' && f.parent == null));
        if (folder) {
            let elem = html.querySelector(`.folder[data-folder-id="${folder.id}"]`);
            if (elem) elem.remove();
        }

        this.activateDirectoryListeners(html);

        this._restoreScrollPositions(html);

        return html;
    }

    async renderSubSheet(force, options = {}) {
        try {
            const modes = JournalSheet.VIEW_MODES;

            let currentTab = this.tabs.active();
            if (!currentTab) {
                if (this.tabs.length)
                    currentTab = this.tabs[0];
                else
                    currentTab = this.addTab();
            }
            if (!currentTab.entity && !["blank", "folder"].includes(foundry.utils.getProperty(currentTab, "flags.monks-enhanced-journal.type")))
                currentTab.entity = await this.findEntity(currentTab.entityId);
            if (this.object?.id != currentTab.entity?.id || currentTab.entity instanceof Promise || currentTab.entity?.id == undefined)
                this.object = currentTab.entity;

            //if there's no object then show the default
            if (this.object instanceof Promise)
                this.object = await this.object;

            let defaultOptions = {
                collapsed: setting("start-toc-collapsed")
            };

            options = foundry.utils.mergeObject(options, foundry.utils.mergeObject(defaultOptions, game.user.getFlag("monks-enhanced-journal", `pagestate.${this.object.id}`) || {}), { overwrite: false });

            let contentform = this.element.querySelector('.content > section');

            if (this.object instanceof JournalEntry && this.object.pages.size == 1 && (!!foundry.utils.getProperty(this.object.pages.contents[0], "flags.monks-enhanced-journal.type") || !!foundry.utils.getProperty(this.object, "flags.monks-enhanced-journal.type"))) {
                let type = foundry.utils.getProperty(this.object.pages.contents[0], "flags.monks-enhanced-journal.type") || foundry.utils.getProperty(this.object, "flags.monks-enhanced-journal.type");
                if (type == "base" || type == "oldentry") type = "journalentry";
                let types = MonksEnhancedJournal.getDocumentTypes();
                if (types[type]) {
                    this.object = this.object.pages.contents[0];
                    let tab = this.tabs.active();
                    tab.entityId = this.object.uuid;
                    tab.entity = this.object;
                    this.saveTabs();
                }
            }

            MonksEnhancedJournal.fixType(this.object);

            force = force || this.tempOwnership;

            if (force != true) {
                let testing = this.object;
                if (testing instanceof JournalEntryPage && !!foundry.utils.getProperty(testing, "flags.monks-enhanced-journal.type"))
                    testing = testing.parent;

                if (!game.user.isGM && testing && ((!testing.compendium && testing.testUserPermission && !testing.testUserPermission(game.user, "OBSERVER")) || (testing.compendium && !testing.compendium.visible))) {
                    this.object = {
                        name: this.object.name,
                        type: 'blank',
                        options: { hidebuttons: true },
                        flags: {
                            'monks-enhanced-journal': { type: 'blank' }
                        },
                        content: `${i18n("MonksEnhancedJournal.DoNotHavePermission")}: ${this.object.name}`
                    }
                }
            } else if (!["blank", "folder"].includes(this.object.type) && this.object.testUserPermission) {
                if (!this.object.testUserPermission(game.user, "OBSERVER") || (this.object.parent && !this.object.parent.testUserPermission(game.user, "OBSERVER"))) {
                    this.object.ownership[game.user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                    if (this.object.parent)
                        this.object.parent.ownership[game.user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                    this.tempOwnership = true;
                }
            }

            const cls = (this.object._getSheetClass ? this.object._getSheetClass() : null);
            if (!cls)
                this.subsheet = new EnhancedJournalSheet(this.object, this.object.options);
            else
                this.subsheet = new cls(this.object, { editable: this.object.isOwner, enhancedjournal: this });
            this.object._sheet = this.subsheet;

            this.subsheet.options.popOut = false;
            this.subsheet._state = this.subsheet.constructor.RENDER_STATES.RENDERING;

            this.activateFooterListeners(this.element);

            // Remove existing subsheet buttons
            this.element.querySelectorAll('> header a.subsheet').forEach(el => el.remove());
            
            if (this.subsheet._getHeaderButtons && this.object.id && !(this.object instanceof JournalEntry)) {
                let buttons = this.subsheet._getHeaderButtons();
                buttons.findSplice(b => b.class == "share-image");
                Hooks.call(`getDocumentSheetHeaderButtons`, this.subsheet, buttons);

                let first = true;
                let lastButton;
                const closeButton = this.element.querySelector('> header a.close');
                
                for (let btn of buttons) {
                    // Check if button already exists
                    if (!this.element.querySelector(`> header a.${btn.class}`)) {
                        const a = document.createElement('a');
                        a.className = `${btn.class} subsheet`;
                        if (first) a.classList.add('first');
                        
                        const icon = document.createElement('i');
                        icon.className = btn.icon;
                        a.appendChild(icon);
                        
                        a.appendChild(document.createTextNode(i18n(btn.label)));
                        
                        a.addEventListener('click', event => {
                            event.preventDefault();
                            btn.onclick.call(this.subsheet, event);
                        });
                        
                        if (closeButton) {
                            closeButton.parentNode.insertBefore(a, closeButton);
                        }
                        
                        lastButton = a;
                        first = false;
                    }
                }
                
                if (lastButton) {
                    lastButton.classList.add('last');
                }
            }

            this.subsheet.enhancedjournal = this;

            let templateData = await this.subsheet.getData(options);
            if (this.object instanceof JournalEntry) {
                game.user.setFlag("monks-enhanced-journal", `pagestate.${this.object.id}.pageId`, options?.pageId);
                //game.user.setFlag("monks-enhanced-journal", `pagestate.${this.object.id}.anchor`, options?.anchor);

                templateData.mode = (options?.mode || templateData.mode);
                if (templateData.mode == modes.SINGLE) {
                    let pageIndex = this.subsheet._pages.findIndex(p => p._id === options?.pageId);
                    if (pageIndex == -1) pageIndex = this.subsheet.pageIndex;
                    templateData.pages = [templateData.toc[pageIndex]];
                    templateData.viewMode = { label: "JOURNAL.ViewMultiple", icon: "fa-solid fa-note", cls: "single-page" };
                } else {
                    templateData.pages = templateData.toc;
                    templateData.viewMode = { label: "JOURNAL.ViewSingle", icon: "fa-solid fa-notes", cls: "multi-page" };
                }

                let collapsed = options?.collapsed ?? this.subsheet.sidebarCollapsed;
                templateData.sidebarClass = collapsed ? "collapsed" : "";
                templateData.collapseMode = collapsed
                    ? { label: "JOURNAL.ViewExpand", icon: "fa-solid fa-caret-left" }
                    : { label: "JOURNAL.ViewCollapse", icon: "fa-solid fa-caret-right" };
            }

            //let defaultOptions = this.subsheet.constructor.defaultOptions;
            await loadTemplates({
                journalEntryPageHeader: "templates/journal/parts/page-header.html",
                journalEntryPageFooter: "templates/journal/parts/page-footer.html"
            });
            if (this.subsheet.sheetTemplates) {
                await loadTemplates(this.subsheet.sheetTemplates);
            }
            let html = await renderTemplate(this.subsheet.template, templateData);

            // Create subdocument from HTML string
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            this.subdocument = tempDiv.firstElementChild;
            
            // Set subsheet form reference
            this.subsheet.form = (this.subdocument.tagName == 'FORM' ? this.subdocument : this.subdocument.querySelector('form'));
            this.subsheet._element = this.subdocument;

            if (this.subsheet.refresh)
                this.subsheet.refresh();
            else if (this.object instanceof JournalEntry) {
                /*
                let old_render = this.subsheet._render;
                this.subsheet._render = async function (...args) {
                    let result = await old_render(...args);
                    this._saveScrollPositions();
                    return result;
                }*/
                this.subsheet.render(true, options);
                if (templateData.mode != this.subsheet.mode) {
                    if (options.anchor) {
                        window.setTimeout(() => {
                            this.subsheet._saveScrollPositions(this.subsheet._element);
                            this.toggleViewMode({ preventDefault: () => { }, currentTarget: { dataset: { action: "toggleView" } } }, options);
                        }, 100);
                    } else
                        this.toggleViewMode({ preventDefault: () => { }, currentTarget: { dataset: { action: "toggleView" } } }, options);
                }
            }

            // Update window title
            const windowTitle = this.element.querySelector('.window-title');
            if (windowTitle) {
                windowTitle.textContent = (this.subsheet.title || i18n("MonksEnhancedJournal.NewTab")) + ' - ' + i18n("MonksEnhancedJournal.Title");
            }

            if (this.subsheet._createDocumentIdLink)
                this.subsheet._createDocumentIdLink(this.element)

            // Set content attributes
            const contentElement = this.element.querySelector('.content');
            if (contentElement) {
                contentElement.setAttribute('entity-type', this.object.type);
                contentElement.setAttribute('entity-id', this.object.id);
            }
            //extract special classes
            if (setting("extract-extra-classes")) {
                let extraClasses = this.subsheet.options.classes.filter(x => !["sheet", "journal-sheet", "journal-entry", "monks-journal-sheet"].includes(x) && !!x);
                if (extraClasses.length) {
                    this.element.addClass(extraClasses);
                }
            }
            let classes = this.subsheet.options.classes.join(' ').replace('monks-enhanced-journal', '');
            if (game.system.id == "pf2e")
                classes += " journal-page-content";
            if (!(this.subsheet instanceof ActorSheet)) {
                if (!setting("use-system-tag"))
                    classes = classes.replace(game.system.id, '');
            }

            if (this.object instanceof JournalEntry) {
                classes += (this.subsheet?.mode === modes.MULTIPLE ? " multiple-pages" : " single-page");
            }

            contentform.empty().attr('class', classes).append(this.subdocument); //.concat([`${game.system.id}`]).join(' ')

            if (!this.isEditable) {
                this.subsheet._disableFields(contentform[0]);
            }

            if (this.subsheet._createSecretHandlers) {
                this._secrets = this.subsheet._createSecretHandlers();
                this._secrets.forEach(secret => secret.bind(this.element));
            }

            //connect the tabs to the enhanced journal so that opening the regular document won't try and change tabs on the other window.
            this._tabs = this.subsheet.options.tabs.map(t => {
                t.callback = this.subsheet._onChangeTab.bind(this);
                return new Tabs(t);
            });
            this._tabs.forEach(t => t.bind(this.subdocument));

            //reset the original drag drop
            this._dragDrop = this._createDragDropHandlers();
            this._dragDrop.forEach(d => d.bind(this.element));

            //add the subsheet drag drop
            let subDragDrop = this.subsheet.options.dragDrop.map(d => {
                d.permissions = {
                    dragstart: this._canDragStart.bind(this),
                    drop: this._canDragDrop.bind(this)
                };
                d.callbacks = {
                    dragstart: this._onDragStart.bind(this),
                    dragover: this._onDragOver.bind(this),
                    drop: this._onDrop.bind(this)
                };
                return new DragDrop(d);
            });
            subDragDrop.forEach(d => d.bind(contentform));
            this._dragDrop = this._dragDrop.concat(subDragDrop);

            this.subsheet.activateListeners(this.subdocument, this);

            // Handle submit buttons - change type and add click handler
            this.subdocument.querySelectorAll('button[type="submit"]').forEach(btn => {
                btn.setAttribute('type', 'button');
                btn.addEventListener('click', this.subsheet._onSubmit.bind(this.subsheet));
            });
            
            // Prevent journal header form submission
            this.subdocument.querySelectorAll('form.journal-header').forEach(form => {
                form.addEventListener('submit', (e) => { 
                    e.preventDefault(); 
                    return false; 
                });
            });

            if (this.subsheet.updateStyle && !["blank", "folder"].includes(this.object.type))
                this.subsheet.updateStyle(null, this.subdocument);

            if (game.modules.get("polyglot")?.active && this.subsheet.renderPolyglot)
                this.subsheet.renderPolyglot(this.subdocument);

            let that = this;
            let oldSaveEditor = this.subsheet.saveEditor;
            this.subsheet.saveEditor = function (...args) {
                let result = oldSaveEditor.call(this, ...args);
                that.saveEditor(...args);
                return result;
            }

            let oldActivateEditor = this.subsheet.activateEditor;
            this.subsheet.activateEditor = function (...args) {
                that.activateEditor.apply(that, args);
                return oldActivateEditor.call(this, ...args);
            }

            if (this.subsheet.goToPage) {
                let oldGoToPage = this.subsheet.goToPage;
                this.subsheet.goToPage = function (...args) {
                    let [pageId, anchor] = args;
                    game.user.setFlag("monks-enhanced-journal", `pagestate.${that.object.id}.pageId`, pageId);
                    //game.user.setFlag("monks-enhanced-journal", `pagestate.${that.object.id}.anchor`, anchor);
                    return oldGoToPage.call(this, ...args);
                }
            }

            this.object._sheet = null;  // Adding this to prevent Quick Encounters from automatically opening

            if (!["blank", "folder"].includes(this.object.type)) {
                Hooks.callAll('renderJournalSheet', this.subsheet, contentform, templateData); //this.object);
                if (this.object._source.type == "text")
                    Hooks.callAll('renderJournalTextPageSheet', this.subsheet, contentform, templateData);
                if (this.subsheet.object instanceof JournalEntryPage)
                    Hooks.callAll('renderJournalPageSheet', this.subsheet, contentform, Object.assign({ enhancedjournal: this }, templateData));
            }

            this.object._sheet = this.subsheet;

            if (this.subsheet.options.scrollY && !options.anchor) {
                let resetScrollPos = () => {
                    let savedScroll = foundry.utils.flattenObject(game.user.getFlag("monks-enhanced-journal", `pagestate.${this.object.id}.scrollPositions`) || {});
                    this._scrollPositions = foundry.utils.flattenObject(foundry.utils.mergeObject(this._scrollPositions || {}, savedScroll));
                    /*
                    for (let [k, v] of Object.entries(this.subsheet._scrollPositions || {})) {
                        this._scrollPositions[k] = v || this._scrollPositions[k];
                    }*/
                    let oldScrollY = this.options.scrollY;
                    this.options.scrollY = this.options.scrollY.concat(this.subsheet.options.scrollY);
                    this._restoreScrollPositions(contentform);
                    this.options.scrollY = oldScrollY;

                    this.subsheet._scrollPositions = this._scrollPositions;
                }
                if (this.subsheet?.mode == modes.SINGLE)
                    window.setTimeout(resetScrollPos, 100);
                else
                    resetScrollPos();
            }

            //if this entry is different from the last one...
            if (this._lastentry != this.object.id) {
                // end a sound file if it's playing
                for(let [key, sound] of Object.entries(this._backgroundsound)) {
                    sound.fade(0, { duration: 250 }).then(() => {
                        sound?.stop();
                        delete this._backgroundsound[key];
                    });
                }
                // if the new entry has a sound file, that autoplays, then start the sound file playing
                if (!["blank", "folder"].includes(this.object.type)) {
                    let sound = this.object.getFlag("monks-enhanced-journal", "sound");
                    if (sound?.audiofile && sound?.autoplay && this.subsheet?.canPlaySound) {
                        this.subsheet._playSound(sound).then((soundfile) => {
                            this._backgroundsound[this.object.id] = soundfile;
                        });
                    }
                }
            }
            
            this._lastentry = this.object.id;

            // Clear and activate journal controls
            const journalButtons = this.element.querySelector('#journal-buttons');
            if (journalButtons) {
                journalButtons.replaceChildren();
                this.activateControls(journalButtons);
            }

            this.object._sheet = null; //set this to null so that other things can open the sheet
            this.subsheet._state = this.subsheet.constructor.RENDER_STATES.RENDERED;
            
        } catch(err) {
            // display an error rendering the subsheet
            error(err);
        }
    }

    _saveScrollPositions(html) {
        super._saveScrollPositions(html);
        if (this.subsheet && this.subsheet.rendered && this.subsheet.options.scrollY && this.subsheet.object.id == this.object.id) {   //only save if we're refreshing the sheet
            const selectors = this.subsheet.options.scrollY || [];

            this._scrollPositions = selectors.reduce((pos, sel) => {
                const el = this.subdocument.querySelectorAll(sel);
                pos[sel] = Array.from(el).map(el => el.scrollTop);
                return pos;
            }, (this._scrollPositions || {}));

            game.user.setFlag("monks-enhanced-journal", `pagestate.${this.object.id}.scrollPositions`, foundry.utils.flattenObject(this._scrollPositions));
        }
    }

    saveScrollPos() {
        if (this?.subsheet && this.subsheet.options.scrollY && this.subsheet.object.id == this.object.id) {   //only save if we're refreshing the sheet
            const selectors = this.subsheet.options.scrollY || [];

            let newScrollPositions = selectors.reduce((pos, sel) => {
                const el = this.subdocument.querySelectorAll(sel);
                pos[sel] = Array.from(el).map(el => el.scrollTop);
                return pos;
            }, {});

            let oldScrollPosition = foundry.utils.flattenObject(game.user.getFlag("monks-enhanced-journal", `pagestate.${this.object.id}.scrollPositions`) || {});

            game.user.setFlag("monks-enhanced-journal", `pagestate.${this.object.id}.scrollPositions`, foundry.utils.flattenObject(foundry.utils.mergeObject(oldScrollPosition, newScrollPositions)));
        }
    }

    _activateEditor(div) {
        return this.subsheet._activateEditor.call(this, div);
    }

    activateEditor() {
        // Update edit button
        const editButton = this.element.querySelector('.nav-button.edit i');
        if (editButton) {
            editButton.classList.remove('fa-pencil-alt');
            editButton.classList.add(setting("editor-engine") == "tinymce" ? 'fa-download' : 'fa-save');
            editButton.parentElement.title = i18n("MonksEnhancedJournal.SaveChanges");
        }
        
        // Disable split button
        const splitButton = this.element.querySelector('.nav-button.split');
        if (splitButton) {
            splitButton.classList.add('disabled');
        }
    }

    saveEditor(name) {
        // Reset edit button
        const editButton = this.element.querySelector('.nav-button.edit i');
        if (editButton) {
            editButton.classList.add('fa-pencil-alt');
            editButton.classList.remove('fa-download', 'fa-save');
            editButton.parentElement.title = i18n("MonksEnhancedJournal.EditDescription");
        }
        
        // Enable split button
        const splitButton = this.element.querySelector('.nav-button.split');
        if (splitButton) {
            splitButton.classList.remove('disabled');
        }
        const editor = this.subsheet.editors[name];
        if (editor)
            editor.button.style.display = "";

        const owner = this.object.isOwner;
        (game.system.id == "pf2e" ? game.pf2e.TextEditor : TextEditor).enrichHTML(this.object.content, { secrets: owner, documents: true, async: true }).then((content) => {
            const editorContent = this.element.querySelector(`.editor-content[data-edit="${name}"]`);
            if (editorContent) {
                editorContent.innerHTML = content;
            }
        });
        
    }

    activateControls(html) {
        let ctrls = [];
        if (this.subsheet._documentControls)
            ctrls = this.subsheet._documentControls();
        else if (this.object instanceof JournalEntry) {
            ctrls = this.journalEntryDocumentControls();
         }

        let that = this;

        Hooks.callAll('activateControls', this, ctrls);
        if (ctrls) {
            for (let ctrl of ctrls) {
                if (ctrl.conditional != undefined) {
                    if (typeof ctrl.conditional == 'function') {
                        if (!ctrl.conditional.call(this.subsheet, this.subsheet.object))
                            continue;
                    }
                    else if (!ctrl.conditional)
                        continue;
                }
                let div = null;
                switch (ctrl.type || 'button') {
                    case 'button':
                        div = document.createElement('div');
                        div.className = `nav-button ${ctrl.id}`;
                        div.title = ctrl.text;
                        
                        const icon = document.createElement('i');
                        icon.className = `fas ${ctrl.icon}`;
                        div.appendChild(icon);
                        
                        div.addEventListener('click', ctrl.callback.bind(this.subsheet));
                        break;
                    case 'input':
                        div = document.createElement('input');
                        div.className = `nav-input ${ctrl.id}`;
                        
                        const attrs = foundry.utils.mergeObject({ 'type': 'text', 'autocomplete': 'off', 'placeholder': ctrl.text }, (ctrl.attributes || {}));
                        for (const [key, value] of Object.entries(attrs)) {
                            div.setAttribute(key, value);
                        }
                        
                        div.addEventListener('keyup', function (event) {
                            ctrl.callback.call(that.subsheet, this.value, event);
                        });
                        break;
                    case 'text':
                        div = document.createElement('div');
                        div.className = `nav-text ${ctrl.id}`;
                        div.innerHTML = ctrl.text;
                        break;
                }

                if (div && ctrl.attr) {
                    for (const [key, value] of Object.entries(ctrl.attr)) {
                        div.setAttribute(key, value);
                    }
                }

                if (div) {
                    if (ctrl.visible === false) {
                        div.style.display = 'none';
                    }
                    html.appendChild(div);
                }
            }
        }

        if (this.object instanceof JournalEntry) {
            const modes = JournalSheet.VIEW_MODES;
            let mode = game.user.getFlag("monks-enhanced-journal", `pagestate.${this.object.id}.mode`) ?? this.subsheet?.mode;
            const viewModeBtn = html.querySelector ? html.querySelector('.viewmode') : this.element.querySelector('.viewmode');
            if (viewModeBtn) {
                viewModeBtn.setAttribute("data-action", "toggleView");
                viewModeBtn.setAttribute("title", mode === modes.SINGLE ? "View Multiple Pages" : "View Single Page");
                
                const icon = viewModeBtn.querySelector("i");
                if (icon) {
                    icon.classList.toggle("fa-notes", mode === modes.SINGLE);
                    icon.classList.toggle("fa-note", mode !== modes.SINGLE);
                }
            }
        }
    }

    get getDocumentTypes() {
        return foundry.utils.mergeObject(MonksEnhancedJournal.getDocumentTypes(), {
            blank: EnhancedJournalSheet
        });
    }

    get entitytype() {
        if (this.object instanceof Actor)
            return 'actor';

        let flags = this.object?.flags;
        let type = (flags != undefined ? flags['monks-enhanced-journal']?.type : null) || 'oldentry';

        if (this.object?.folder?.name == '_fql_quests')
            type = 'oldentry';

        return type;
    }

    async close(options) {
        if (options?.submit !== false) {
            this.saveScrollPos();

            if (await this?.subsheet?.close() === false)
                return false;

            MonksEnhancedJournal.journal = null;
            // if there's a sound file playing, then close it
            for (let [key, sound] of Object.entries(this._backgroundsound)) {
                sound.stop();
            }

            Hooks.off(game.modules.get("monks-sound-enhancements")?.active ? "globalSoundEffectVolumeChanged" : "globalInterfaceVolumeChanged", this._soundHook);

            return super.close(options);
        }
    }

    tabChange(tab, event) {
        log('tab change', tab, event);
    }

    canBack(tab) {
        if (tab == undefined)
            tab = this.tabs.active();
        if (tab == undefined)
            return false;
        return tab.history?.length > 1 && (tab.historyIdx == undefined || tab.historyIdx < tab.history.length - 1);
    }

    canForward(tab) {
        if (tab == undefined)
            tab = this.tabs.active();
        if (tab == undefined)
            return false;
        return tab.history?.length > 1 && tab.historyIdx && tab.historyIdx > 0;
    }

    async findEntity(entityId, text) {
        if (entityId == undefined)
            return { flags: { 'monks-enhanced-journal': { type: 'blank' } }, text: { content: "" } };
        else {
            let entity;
            if (entityId.indexOf('.') >= 0) {
                try {
                    entity = await fromUuid(entityId);
                } catch (err) { log('Error find entity', entityId, err); }
            } else {
                if (entity == undefined)
                    entity = game.journal.get(entityId);
                if (entity == undefined)
                    entity = game.actors.get(entityId);
            }
            if (entity == undefined)
                entity = { name: text, flags: { 'monks-enhanced-journal': { type: 'blank' }, content: `${i18n("MonksEnhancedJournal.CannotFindEntity")}: ${text}` } };

            return entity;
        }
    }

    async deleteEntity(entityId){
        //an entity has been deleted, what do we do?
        for (let tab of this.tabs) {
            if (tab.entityId?.startsWith(entityId)) {
                tab.entity = await this.findEntity('', tab.text); //I know this will return a blank one, just want to maintain consistency
                tab.text = i18n("MonksEnhancedJournal.NewTab");
                const tabElement = this.element.querySelector(`.journal-tab[data-tabid="${tab.id}"] .tab-content`);
                if (tabElement) {
                    tabElement.textContent = tab.text;
                }
            }

            //remove it from the history
            tab.history = tab.history.filter(h => h != entityId);

            if (tab.active && this.rendered)
                this.render(true);  //if this entity was being shown on the active tab, then refresh the journal
        }

        this.saveTabs();
    }

    addTab(entity, options = { activate: true, refresh: true }) {
        if (entity?.currentTarget != undefined)
            entity = null;

        if (entity?.parent) {
            options.pageId = entity.id;
            entity = entity.parent;
        }

        let tab = {
            id: makeid(),
            text: entity?.name || i18n("MonksEnhancedJournal.NewTab"),
            active: false,
            entityId: entity?.uuid,
            entity: entity || { flags: { 'monks-enhanced-journal': { type: 'blank' }, content: i18n("MonksEnhancedJournal.NewTab") } },
            pageId: options.pageId,
            anchor: options.anchor,
            history: []
        };
        if (tab.entityId != undefined)
            tab.history.push(tab.entityId);
        this.tabs.push(tab);

        if (options.activate)
            this.activateTab(tab);  //activating the tab should save it
        else {
            this.saveTabs();
            if (options.refresh)
                this.render(true, { focus: true });
        }

        this.updateRecent(tab.entity);

        return tab;
    }

    async activateTab(tab, event, options) {
        this.saveScrollPos();

        if (await this?.subsheet?.close() === false)
            return false;

        if (tab == undefined)
            tab = this.addTab();

        if (event != undefined)
            event.preventDefault();

        if (tab.currentTarget != undefined) {
            tab.preventDefault();
            tab = tab.currentTarget.dataset.tabid;
        }
        if (typeof tab == 'string')
            tab = this.tabs.find(t => t.id == tab);
        else if (typeof tab == 'number')
            tab = this.tabs[tab];

        if (event?.altKey) {
            // Open this outside of the Enhnaced Journal
            let document = await this.findEntity(tab?.entityId, tab?.text);
            if (document) {
                MonksEnhancedJournal.fixType(document);
                document.sheet.render(true);
            }
        } else if (event?.shiftKey) {
            // Close this tab
            this.removeTab(tab, event);
            tab = this.tabs.active(false);
            if (!tab) {
                if (this.tabs.length)
                    tab = this.tabs[0];
                else
                    tab = this.addTab();
            }
        }

        let currentTab = this.tabs.active(false);
        if (currentTab?.id != tab.id || this.subdocument == undefined) {
            tab.entity = await this.findEntity(tab.entityId, tab.text);
        }

        /*
        if (currentTab?.id == tab.id) {
            this.display(tab.entity);
            this.updateHistory();
            return false;
        }*/

        if (currentTab != undefined)
            currentTab.active = false;
        tab.active = true;

        if (this._tabs) {
            this._tabs.active = null;
        }

        //$('.back-button', this.element).toggleClass('disabled', !this.canBack(tab));
        //$('.forward-button', this.element).toggleClass('disabled', !this.canForward(tab));

        //$(`.journal-tab[data-tabid="${tab.id}"]`, this.element).addClass('active').siblings().removeClass('active');

        //this.display(tab.entity);

        this.saveTabs();

        //this.updateHistory();
        if (this.rendered)
            this.render(true, options);
        else {
            window.setTimeout(() => {
                // Set active tab
                const currentTab = this.element.querySelector(`.journal-tab[data-tabid="${tab.id}"]`);
                if (currentTab) {
                    // Remove active class from all tabs
                    this.element.querySelectorAll('.journal-tab').forEach(t => t.classList.remove('active'));
                    // Add active class to current tab
                    currentTab.classList.add('active');
                }
            }, 100);
        }

        this.updateRecent(tab.entity);

        return true;
    }

    updateTab(tab, entity, options = {}) {
        if (!entity)
            return;

        if (entity?.parent) {
            options.pageId = entity.id;
            entity = entity.parent;
        }

        if (tab != undefined) {
            if (tab.entityId != entity.uuid) {
                tab.text = entity.name;
                tab.entityId = entity.uuid;
                tab.entity = entity;
                tab.pageId = options.pageId;
                tab.anchor = options.anchor;

                if ((game.user.isGM || setting('allow-player')) && tab.entityId != undefined) {    //only save the history if the player is a GM or they get the full journal experience... and if it's not a blank tab
                    if (tab.history == undefined)
                        tab.history = [];
                    if (tab.historyIdx != undefined) {
                        tab.history = tab.history.slice(tab.historyIdx);
                        tab.historyIdx = 0;
                    }
                    tab.history.unshift(tab.entityId);

                    if (tab.history.length > 10)
                        tab.history = tab.history.slice(0, 10);
                }

                this.saveTabs();

                //$(`.journal-tab[data-tabid="${tab.id}"]`, this.element).attr('title', tab.text).find('.tab-content').html(tab.text);
            } else if (tab.entity == undefined) {
                tab.entity = entity;
            }

            //$('.back-button', this.element).toggleClass('disabled', !this.canBack(tab));
            //$('.forward-button', this.element).toggleClass('disabled', !this.canForward(tab));
            //this.updateHistory();
            this.updateRecent(tab.entity);
        }

        if (!this.rendered)
            return;

        this.render(true, foundry.utils.mergeObject({ focus: true }, options));
    }

    removeTab(tab, event) {
        if (typeof tab == 'string')
            tab = this.tabs.find(t => t.id == tab);

        let idx = this.tabs.findIndex(t => t.id == tab.id);
        if (idx >= 0) {
            this.tabs.splice(idx, 1);
            const tabElement = this.element.querySelector('.journal-tab[data-tabid="' + tab.id + '"]');
            if (tabElement) tabElement.remove();
        }

        if (this.tabs.length == 0) {
            this.addTab();
        } else {
            if (tab.active) {
                let nextIdx = (idx >= this.tabs.length ? idx - 1 : idx);
                if (!this.activateTab(nextIdx))
                    this.saveTabs();
            }
        }

        if (event != undefined)
            event.preventDefault();
    }

    saveTabs() {
        let update = this.tabs.map(t => {
            let entity = t.entity;
            delete t.entity;
            let tab = foundry.utils.duplicate(t);
            t.entity = entity;
            delete tab.element;
            delete tab.entity;
            //delete tab.history;  //technically we could save the history if it's just an array of ids
            //delete tab.historyIdx;
            delete tab.userdata;
            return tab;
        });
        game.user.update({
            flags: { 'monks-enhanced-journal': { 'tabs': update } }
        }, { render: false });
    }

    updateTabNames(uuid, name) {
        for (let tab of this.tabs) {
            if (tab.entityId == uuid) {
                const tabContent = this.element.querySelector(`.journal-tab[data-tabid="${tab.id}"] .tab-content`);
                if (tabContent) {
                    tabContent.setAttribute("title", name);
                    tabContent.innerHTML = name;
                }
                tab.text = name;
                this.saveTabs();
                if (tab.active) {
                    const windowTitle = this.element.querySelector('.window-title');
                    if (windowTitle) {
                        windowTitle.textContent = (tab.text || i18n("MonksEnhancedJournal.NewTab")) + ' - ' + i18n("MonksEnhancedJournal.Title");
                    }
                }
            }
        }
    }

    navigateFolder(event) {
        let ctrl = event.currentTarget;
        let id = ctrl.dataset.entityId;

        if (id == '')
            return;

        let entity = game.journal.find(j => j.id == id);
        this.open(entity);
    }

    navigateHistory(event) {
        if (!event.currentTarget.classList.contains('disabled')) {
            let dir = event.currentTarget.dataset.history;
            let tab = this.tabs.active();

            if (tab.history.length > 1) {
                let result = true;
                let idx = 0;
                do {
                    idx = ((tab.historyIdx == undefined ? 0 : tab.historyIdx) + (dir == 'back' ? 1 : -1));
                    result = this.changeHistory(idx);
                } while (!result && idx > 0 && idx < tab.history.length )
            }
        }
        event.preventDefault();
    }

    async changeHistory(idx) {
        let tab = this.tabs.active();
        tab.historyIdx = Math.clamp(idx, 0, (tab.history.length - 1));

        tab.entityId = tab.history[tab.historyIdx];
        tab.entity = await this.findEntity(tab.entityId, tab.text);
        tab.text = tab.entity.name;

        this.saveTabs();

        this.render(true, { autoPage: true } );

        this.updateRecent(tab.entity);

        //$('.back-button', this.element).toggleClass('disabled', !this.canBack(tab));
        //$('.forward-button', this.element).toggleClass('disabled', !this.canForward(tab));

        return (tab?.entity?.id != undefined);
    }

    async getHistory() {
        let index = 0;
        let tab = this.tabs.active();
        let menuItems = [];

        if (tab?.history == undefined)
            return;

        for (let i = 0; i < tab.history.length; i++) {
            let h = tab.history[i];
            let entity = await this.findEntity(h, '');
            if (tab?.entity?.id != undefined) {
                let type = (entity.getFlag && entity.getFlag('monks-enhanced-journal', 'type'));
                let icon = MonksEnhancedJournal.getIcon(type);
                let item = {
                    name: entity.name || i18n("MonksEnhancedJournal.Unknown"),
                    icon: `<i class="fas ${icon}"></i>`,
                    callback: (li) => {
                        let idx = i;
                        this.changeHistory(idx)
                    }
                }
                menuItems.push(item);
            }
        };

        return menuItems;
    }

    addBookmark() {
        //get the current tab and save the entity and name
        let tab = this.tabs.active();

        if (tab?.entityId == undefined)
            return;

        if (this.bookmarks.find(b => b.entityId == tab.entityId) != undefined) {
            ui.notifications.warn(i18n("MonksEnhancedJournal.MsgOnlyOneBookmark"));
            return;
        }

        let entitytype = function(entity) {
            if (entity instanceof Actor)
                return 'actor';

            let type = foundry.utils.getProperty(entity, "flags.monks-enhanced-journal.type") || 'journalentry';

            return type;
        }

        let bookmark = {
            id: makeid(),
            entityId: tab.entityId,
            text: tab.entity.name,
            icon: MonksEnhancedJournal.getIcon(entitytype(tab.entity))
        }

        this.bookmarks.push(bookmark);

        const bookmarkDiv = document.createElement('div');
        bookmarkDiv.className = 'bookmark-button';
        bookmarkDiv.setAttribute('title', bookmark.text);
        bookmarkDiv.setAttribute('data-bookmark-id', bookmark.id);
        bookmarkDiv.setAttribute('data-entity-id', bookmark.entityId);
        bookmarkDiv.innerHTML = `<i class="fas ${bookmark.icon}"></i> ${bookmark.text}`;
        
        const bookmarkBar = this.element.querySelector('.bookmark-bar');
        if (bookmarkBar) {
            bookmarkBar.appendChild(bookmarkDiv);
            bookmarkDiv.addEventListener('click', this.activateBookmark.bind(this));
        }

        this.saveBookmarks();
    }

    async activateBookmark(event) {
        let id = event.currentTarget.dataset.bookmarkId;
        let bookmark = this.bookmarks.find(b => b.id == id);
        let entity = await this.findEntity(bookmark.entityId, bookmark.text);
        this.open(entity, setting("open-new-tab"));
    }

    removeBookmark(bookmark) {
        this.bookmarks.findSplice(b => b.id == bookmark.id);
        const bookmarkElement = this.element.querySelector(`.bookmark-button[data-bookmark-id="${bookmark.id}"]`);
        if (bookmarkElement) bookmarkElement.remove();
        this.saveBookmarks();
    }

    saveBookmarks() {
        let update = this.bookmarks.map(b => {
            let bookmark = foundry.utils.duplicate(b);
            return bookmark;
        });
        game.user.setFlag('monks-enhanced-journal', 'bookmarks', update);
    }

    async open(entity, newtab, options) {
        //if there are no tabs, then create one
        if (this._tabs) {
            this._tabs.active = null;
        }
        if (this.tabs.length == 0) {
            this.addTab(entity);
        } else {
            if (newtab === true) {
                //the journal is getting created
                //lets see if we can find  tab with this entity?
                let tab = this.tabs.find(t => t.entityId?.endsWith(entity.id));
                if (tab != undefined)
                    this.activateTab(tab, null, options);
                else
                    this.addTab(entity);
            } else {
                if (await this?.subsheet?.close() !== false) {
                    // Check to see if this entity already exists in the tab list
                    let tab = this.tabs.find(t => t.entityId?.endsWith(entity.id));
                    if (tab != undefined)
                        this.activateTab(tab, null, options);
                    else
                        this.updateTab(this.tabs.active(), entity, options);
                }
            }
        }
    }

    async updateRecent(entity) {
        if (entity.id) {
            let recent = game.user.getFlag("monks-enhanced-journal", "_recentlyViewed") || [];
            recent.findSplice(e => e.id == entity.id || typeof e != 'object');
            recent.unshift({ id: entity.id, uuid: entity.uuid, name: entity.name, type: entity.getFlag("monks-enhanced-journal", "type") });
            if (recent.length > 5)
                recent = recent.slice(0, 5);
            await game.user.update({
                flags: { 'monks-enhanced-journal': { '_recentlyViewed': recent } }
            }, { render: false });
        }
    }

    expandSidebar() {
        this._collapsed = false;
        const enhancedJournal = this.element.querySelector('.enhanced-journal');
        if (enhancedJournal) enhancedJournal.classList.remove('collapse');
        
        const sidebarToggle = this.element.querySelector('.sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.setAttribute('data-tooltip', i18n("MonksEnhancedJournal.CollapseDirectory"));
            const icon = sidebarToggle.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-caret-left');
                icon.classList.add('fa-caret-right');
            }
        }
    }

    collapseSidebar() {
        this._collapsed = true;
        const enhancedJournal = this.element.querySelector('.enhanced-journal');
        if (enhancedJournal) enhancedJournal.classList.add('collapse');
        
        const sidebarToggle = this.element.querySelector('.sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.setAttribute('data-tooltip', i18n("MonksEnhancedJournal.ExpandDirectory"));
            const icon = sidebarToggle.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-caret-right');
                icon.classList.add('fa-caret-left');
            }
        }
    }

    _randomizePerson() {
        //randomize first name, last name, race, gender, profession
        //check first to see if the field needs to be rendomized, or if the fields are filled in
    }

    searchText(query) {
        let that = this;
        $('.editor .editor-content,.journal-entry-content', this.element).unmark().mark(query, {
            wildcards: 'enabled',
            accuracy: "complementary",
            separateWordSearch: false,
            noMatch: function () {
                if (query != '') {
                    const searchElement = that.element.querySelector('.mainbar .navigation .search');
                    if (searchElement) searchElement.classList.add('error');
                }
            },
            done: function (total) {
                const searchElement = that.element.querySelector('.mainbar .navigation .search');
                if (query == '') {
                    if (searchElement) searchElement.classList.remove('error');
                }
                if (total > 0) {
                    if (searchElement) searchElement.classList.remove('error');
                    
                    const first = that.element.querySelector('.editor .editor-content mark:first-child, .journal-entry-content .scrollable mark:first-child');
                    if (first) {
                        const rect = first.getBoundingClientRect();
                        const editor = that.element.querySelector('.editor');
                        const scrollable = that.element.querySelector('.scrollable');
                        
                        if (editor && editor.parentElement) {
                            editor.parentElement.scrollTop = rect.top - 10;
                        }
                        if (scrollable) {
                            scrollable.scrollTop = rect.top - 10;
                        }
                    }
                }
            }
        });
    }

    splitJournal(event) {
        const splitButton = this.enhancedjournal.element.querySelector('.nav-button.split i');
        if (splitButton && splitButton.classList.contains('disabled')) {
            ui.notifications.warn(i18n("MonksEnhancedJournal.CannotSplitJournal"));
            return;
        }

        this.splitJournal();
    }

    _canDragStart(selector) {
        if (selector == ".journal-tab") return true;

        if (this.subsheet)
            return this.subsheet._canDragStart(selector);
        else
            return super._canDragStart(selector);
    }

    _canDragDrop(selector) {
        if (this.subsheet)
            return this.subsheet._canDragDrop(selector);
        else
            return true;
    }

    /** @override */
    _onDragStart(event) {
        const target = event.currentTarget;

        if (target.classList.contains('journal-tab')) {
            const dragData = { from: this.object?.uuid };

            let tabid = target.dataset.tabid;
            let tab = this.tabs.find(t => t.id == tabid);
            dragData.uuid = tab.entityId;
            dragData.type = "JournalTab";
            dragData.tabid = tabid;

            log('Drag Start', dragData);

            event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        } else if (target.classList.contains('bookmark-button')) {
            const dragData = { from: this.object?.uuid };

            let bookmarkId = target.dataset.bookmarkId;
            let bookmark = this.bookmarks.find(t => t.id == bookmarkId);
            dragData.uuid = bookmark.entityId;
            dragData.type = "Bookmark";
            dragData.bookmarkId = bookmarkId;

            log('Drag Start', dragData);

            event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        } else if (this.subsheet && this.subsheet._onDragStart) {
            return this.subsheet._onDragStart(event);
        }
    }

    /** @override */
    async _onDrop(event) {
        log('enhanced journal drop', event);
        let result = event.currentTarget.classList.contains('enhanced-journal-header') ? false : this.subsheet?._onDrop(event);

        if (result instanceof Promise)
            result = await result;

        if (result === false) {
            let data;
            try {
                data = JSON.parse(event.dataTransfer.getData('text/plain'));
            }
            catch (err) {
                return false;
            }

            if (data.tabid) {
                const target = event.target.closest(".journal-tab") || null;
                let tabs = foundry.utils.duplicate(this.tabs);

                if (data.tabid === target.dataset.tabid) return; // Don't drop on yourself

                let from = tabs.findIndex(a => a.id == data.tabid);
                let to = tabs.findIndex(a => a.id == target.dataset.tabid);
                log('moving tab from', from, 'to', to);
                tabs.splice(to, 0, tabs.splice(from, 1)[0]);

                this.tabs = tabs;
                this.tabs.active = (findone = true) => {
                    let tab = this.tabs.find(t => t.active);
                    if (findone) {
                        if (tab == undefined && this.tabs.length > 0)
                            tab = this.tabs[0];
                    }
                    return tab;
                };

                const tabElement = this.element.querySelector('.journal-tab[data-tabid="' + data.tabid + '"]');
                if (tabElement) {
                    if (from < to) {
                        target.parentNode.insertBefore(tabElement, target.nextSibling);
                    } else {
                        target.parentNode.insertBefore(tabElement, target);
                    }
                }

                game.user.update({
                    flags: { 'monks-enhanced-journal': { 'tabs': tabs } }
                }, { render: false });
            } else if (data.bookmarkId) {
                const target = event.target.closest(".bookmark-button") || null;
                let bookmarks = foundry.utils.duplicate(this.bookmarks);

                if (data.bookmarkId === target.dataset.bookmarkId) return; // Don't drop on yourself

                let from = bookmarks.findIndex(a => a.id == data.bookmarkId);
                let to = bookmarks.findIndex(a => a.id == target.dataset.bookmarkId);
                log('moving bookmark from', from, 'to', to);
                bookmarks.splice(to, 0, bookmarks.splice(from, 1)[0]);

                this.bookmarks = bookmarks;
                const bookmarkElement = this.element.querySelector('.bookmark-button[data-bookmark-id="' + data.bookmarkId + '"]');
                if (bookmarkElement) {
                    if (from < to) {
                        target.parentNode.insertBefore(bookmarkElement, target.nextSibling);
                    } else {
                        target.parentNode.insertBefore(bookmarkElement, target);
                    }
                }

                game.user.update({
                    flags: { 'monks-enhanced-journal': { 'bookmarks': bookmarks } }
                }, { render: false });
            } else if (data.type == 'Actor') {
                if (data.pack == undefined) {
                    let actor = await fromUuid(data.uuid);
                    if (actor && actor instanceof Actor)
                        this.open(actor, setting("open-new-tab"));
                }
            } else if (data.type == 'JournalEntry') {
                let entity = await fromUuid(data.uuid);
                if (entity)
                    this.open(entity, setting("open-new-tab"));
            }     
            log('drop data', event, data);
        }

        return result;
    }

    async _updateObject(event, formData) {
        if (this._sheetMode === "image") {
            formData.name = formData.title;
            delete formData["title"];
            formData.img = formData.image;
            delete formData["image"];
        }
        return super._updateObject(event, formData);
    }

    async _onSwapMode(event, mode) {
        //don't do anything, but leave this here to prevent the regular journal page from doing anything
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();

        buttons.unshift({
            label: i18n("MonksEnhancedJournal.Maximize"),
            class: "toggle-fullscreen",
            icon: "fas fa-expand-arrows-alt",
            onclick: this.fullscreen.bind(this)
        });

        return buttons;
    }

    findMapEntry(event) {
        let pageId = event.currentTarget.getAttribute('page-id');
        let journalId = event.currentTarget.getAttribute('journal-id');

        let note = canvas.notes.placeables.find(n => {
            return n.document.entryId == pageId || n.document.pageId == pageId || (n.document.entryId == journalId && n.document.pageId == null);
        });
        canvas.notes.panToNote(note);
    }

    doShowPlayers(event) {
        if (event.shiftKey)
            this._onShowPlayers({ data: { users: null, object: this.object, options: { showpic: false } } });
        else if (event.ctrlKey)
            this._onShowPlayers({ data: { users: null, object: this.object, options: { showpic: true } } });
        else {
            this._onShowPlayers(event);
        }
    }

    fullscreen() {
        if (this.element.classList.contains("maximized")) {
            this.element.classList.remove("maximized");
            const toggleBtn = this.element.querySelector('.toggle-fullscreen');
            if (toggleBtn) {
                toggleBtn.innerHTML = `<i class="fas fa-expand-arrows-alt"></i>${i18n("MonksEnhancedJournal.Maximize")}`;
            }
            this.setPosition({ width: this._previousPosition.width, height: this._previousPosition.height });
            this.setPosition({ left: this._previousPosition.left, top: this._previousPosition.top });
        } else {
            this.element.classList.add("maximized");
            const toggleBtn = this.element.querySelector('.toggle-fullscreen');
            if (toggleBtn) {
                toggleBtn.innerHTML = `<i class="fas fa-compress-arrows-alt"></i>${i18n("MonksEnhancedJournal.Restore")}`;
            }
            
            this._previousPosition = foundry.utils.duplicate(this.position);
            this.setPosition({ left: 0, top: 0 });
            
            const sidebar = document.querySelector('#sidebar');
            const sidebarWidth = sidebar ? sidebar.offsetWidth : 0;
            this.setPosition({ 
                height: document.body.offsetHeight, 
                width: document.body.offsetWidth - sidebarWidth 
            });
        }
    }

    cancelSend(id, showpic) {
        MonksEnhancedJournal.emit("cancelShow", {
            showid: id,
            userId: game.user.id
        });
    }

    _onSelectFile(selection, filePicker, event) {
        log(selection, filePicker, event);
        let updates = {};
        updates[filePicker.field.name] = selection;
        this.object.update(updates);
    }

    async convert(type, sheetClass) {
        this.object._sheet = null;
        MonksEnhancedJournal.fixType(this.object, type);
        await this.object.setFlag('monks-enhanced-journal', 'type', type);
        if (sheetClass)
            await this.object.setFlag('core', 'sheetClass', sheetClass);
        await ui.sidebar.tabs.journal.render(true);
        //MonksEnhancedJournal.updateDirectory($('#journal'));
    }

    async _contextMenu(html) {
        this._context = new ContextMenu(html, ".bookmark-button", [
            {
                name: "Open outside Enhanced Journal",
                icon: '<i class="fas fa-file-export"></i>',
                callback: async (li) => {
                    let bookmark = this.bookmarks.find(b => b.id == li[0].dataset.bookmarkId);
                    let document = await fromUuid(bookmark.entityId);
                    if (!document) {
                        document = game.journal.get(bookmark.entityId);
                    }
                    if (document) {
                        MonksEnhancedJournal.fixType(document);
                        document.sheet.render(true);
                    }
                }
            },
            {
                name: "Open in new tab",
                icon: '<i class="fas fa-file-export"></i>',
                callback: async (li) => {
                    let bookmark = this.bookmarks.find(b => b.id == li[0].dataset.bookmarkId);
                    let document = await fromUuid(bookmark.entityId);
                    if (!document) {
                        document = game.journal.get(bookmark.entityId);
                    }
                    if (document) {
                        MonksEnhancedJournal.fixType(document);
                        this.open(document, true);
                    }
                }
            },
            {
                name: "MonksEnhancedJournal.Delete",
                icon: '<i class="fas fa-trash"></i>',
                callback: li => {
                    const bookmark = this.bookmarks.find(b => b.id === li[0].dataset.bookmarkId);
                    this.removeBookmark(bookmark);
                }
            }
        ]);

        this._tabcontext = new ContextMenu(html, ".enhanced-journal-header .tab-bar", [
            {
                name: "Open outside Enhanced Journal",
                icon: '<i class="fas fa-file-export"></i>',
                condition: (li) => {
                    let tab = this.tabs.find(t => t.id == this.contextTab);
                    if (!tab) return false;
                    return !["blank", "folder"].includes(tab.entity?.type);
                },
                callback: async (li) => {
                    let tab = this.tabs.find(t => t.id == this.contextTab);
                    if (!tab) return;
                    let document = tab.entity;
                    if (!tab.entity) {
                        document = await fromUuid(tab.entityId);
                    }
                    if (document) {
                        MonksEnhancedJournal.fixType(document);
                        document.sheet.render(true);
                    }
                }
            },
            {
                name: "Close Tab",
                icon: '<i class="fas fa-trash"></i>',
                callback: li => {
                    let tab = this.tabs.find(t => t.id == this.contextTab);
                    if (tab)
                        this.removeTab(tab);
                }
            },
            {
                name: "Close All Tabs",
                icon: '<i class="fas fa-dumpster"></i>',
                callback: li => {
                    this.tabs.splice(0, this.tabs.length);
                    this.saveTabs();
                    this.addTab();
                }
            },
            {
                name: "Close Other Tabs",
                icon: '<i class="fas fa-dumpster"></i>',
                callback: li => {
                    let idx = this.tabs.findIndex(t => t.id == this.contextTab);
                    this.tabs.splice(0, idx);
                    this.tabs.splice(1, this.tabs.length);
                    this.saveTabs();
                    this.render();
                }
            },
            {
                name: "Close To the right",
                icon: '<i class="fas fa-dumpster"></i>',
                callback: li => {
                    let idx = this.tabs.findIndex(t => t.id == this.contextTab);
                    this.tabs.splice(idx + 1, this.tabs.length);
                    this.saveTabs();
                    this.render();
                }
            }
        ]);
        // Tab bar context menu
        const tabBar = html.querySelector ? html.querySelector('.tab-bar') : this.element.querySelector('.tab-bar');
        if (tabBar) {
            tabBar.addEventListener("contextmenu", (event) => {
                var r = document.querySelector(':root');
                let tab = event.target.closest(".journal-tab");
                if (!tab) {
                    event.stopPropagation();
                    event.preventDefault();
                    return false;
                }
                const rect = tab.getBoundingClientRect();
                const parentRect = tabBar.getBoundingClientRect();
                let x = rect.left - parentRect.left;
                r.style.setProperty('--mej-context-x', x + "px");
            });
        }
        
        // Journal tab context menu
        const journalTabs = html.querySelectorAll ? html.querySelectorAll('.tab-bar .journal-tab') : this.element.querySelectorAll('.tab-bar .journal-tab');
        journalTabs.forEach(tab => {
            tab.addEventListener("contextmenu", (event) => {
                this.contextTab = event.currentTarget.dataset.tabid;
            });
        });
        
        // Bookmark context menu
        const bookmarkButtons = html.querySelectorAll ? html.querySelectorAll('.bookmark-bar .bookmark-button') : this.element.querySelectorAll('.bookmark-bar .bookmark-button');
        bookmarkButtons.forEach(btn => {
            btn.addEventListener("contextmenu", (event) => {
                this.contextBookmark = event.currentTarget.dataset.bookmarkId;
            });
        });

        let history = await this.getHistory();
        this._historycontext = new ContextMenu(html, ".mainbar .navigation .nav-button.history", history);
        this._imgcontext = new ContextMenu(html, ".journal-body.oldentry .tab.picture", [
            {
                name: "MonksEnhancedJournal.Delete",
                icon: '<i class="fas fa-trash"></i>',
                callback: li => {
                    log('Remove image on old entry');
                }
            }
        ]);

        this._convertmenu = new ContextMenu(html, ".nav-button.convert", [
            {
                name: i18n("MonksEnhancedJournal.encounter"),
                icon: '<i class="fas fa-toolbox"></i>',
                callback: li => {
                    this.convert('encounter');
                }
            },
            {
                name: i18n("MonksEnhancedJournal.event"),
                icon: '<i class="fas fa-calendar-days"></i>',
                callback: li => {
                    this.convert('event');
                }
            },
            {
                name: i18n("MonksEnhancedJournal.journalentry"),
                icon: '<i class="fas fa-book-open"></i>',
                callback: li => {
                    this.convert('journalentry', "monks-enhanced-journal.TextEntrySheet");
                }
            },
            {
                name: i18n("MonksEnhancedJournal.loot"),
                icon: '<i class="fas fa-donate"></i>',
                callback: li => {
                    this.convert('loot');
                }
            },
            {
                name: i18n("MonksEnhancedJournal.organization"),
                icon: '<i class="fas fa-flag"></i>',
                callback: li => {
                    this.convert('organization');
                }
            },
            {
                name: i18n("MonksEnhancedJournal.person"),
                icon: '<i class="fas fa-user"></i>',
                callback: li => {
                    this.convert('person');
                }
            },
            {
                name: i18n("MonksEnhancedJournal.picture"),
                icon: '<i class="fas fa-image"></i>',
                callback: li => {
                    this.convert('picture');
                }
            },
            {
                name: i18n("MonksEnhancedJournal.place"),
                icon: '<i class="fas fa-place-of-worship"></i>',
                callback: li => {
                    this.convert('place');
                }
            },
            {
                name: i18n("MonksEnhancedJournal.poi"),
                icon: '<i class="fas fa-map-marker-alt"></i>',
                callback: li => {
                    this.convert('poi');
                }
            },
            {
                name: i18n("MonksEnhancedJournal.quest"),
                icon: '<i class="fas fa-map-signs"></i>',
                callback: li => {
                    this.convert('quest');
                }
            },
            {
                name: i18n("MonksEnhancedJournal.shop"),
                icon: '<i class="fas fa-dolly-flatbed"></i>',
                callback: li => {
                    this.convert('shop');
                }
            },
            {
                name: i18n("MonksEnhancedJournal.textimage"),
                icon: '<i class="fas fa-book-open-reader"></i>',
                callback: li => {
                    this.convert('journalentry', "monks-enhanced-journal.TextImageEntrySheet");
                }
            }
        ], { eventName: 'click' });
    }

    async _onChangeInput(event) {
        return this.subsheet._onChangeInput(event);
    }

    _activateFilePicker(event) {
        return this.subsheet._activateFilePicker(event);
    }

    activateDirectoryListeners(html) {   
        const sidebarToggle = html.querySelector('.sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                if (this._collapsed)
                    this.expandSidebar();
                else
                    this.collapseSidebar();
            });
        }
        //_onClickPageLink

        ui.journal._contextMenu.call(ui.journal, html);

        const directory = html.querySelector(".directory-list");
        const entries = directory ? directory.querySelectorAll(".directory-item") : [];

        // Directory-level events
        const createFolders = html.querySelectorAll(`[data-folder-depth="${this.maxFolderDepth}"] .create-folder`);
        createFolders.forEach(el => el.remove());
        
        const toggleSort = html.querySelector('.toggle-sort');
        if (toggleSort) {
            toggleSort.addEventListener('click', (event) => {
                event.preventDefault();
                ui.journal.collection.toggleSortingMode();
                ui.journal.render();
            });
        }
        
        const collapseAll = html.querySelector(".collapse-all");
        if (collapseAll) {
            collapseAll.addEventListener('click', ui.journal.collapseAll.bind(this));
        }

        // Intersection Observer
        if (directory) {
            const observer = new IntersectionObserver(ui.journal._onLazyLoadImage.bind(this), { root: directory });
            entries.forEach(li => observer.observe(li));

            // Entry-level events
            directory.addEventListener("click", (event) => {
                if (event.target.matches(".entry-name") || event.target.closest(".entry-name")) {
                    ui.journal._onClickEntryName.call(ui.journal, event);
                }
            });
            directory.addEventListener("click", (event) => {
                if (event.target.matches(".folder-header") || event.target.closest(".folder-header")) {
                    ui.journal._toggleFolder.call(this, event);
                }
            });
        }
        const dh = ui.journal._onDragHighlight.bind(this);
        const folders = html.querySelectorAll(".folder");
        folders.forEach(folder => {
            folder.addEventListener("dragenter", dh);
            folder.addEventListener("dragleave", dh);
        });
        //this._contextMenu(html);

        // Allow folder and entry creation
        if (ui.journal.canCreateFolder) {
            const createFolderBtns = html.querySelectorAll(".create-folder");
            createFolderBtns.forEach(btn => {
                btn.addEventListener('click', ui.journal._onCreateFolder.bind(this));
            });
        }
        if (ui.journal.canCreateEntry) {
            const createEntryBtns = html.querySelectorAll(".create-entry");
            createEntryBtns.forEach(btn => {
                btn.addEventListener('click', ui.journal._onCreateEntry.bind(this));
            });
        }

        this._searchFilters = [new SearchFilter({ inputSelector: 'input[name="search"]', contentSelector: ".directory-list", callback: ui.journal._onSearchFilter.bind(ui.journal) })];
        this._searchFilters.forEach(f => f.bind(html));

        ui.journal._dragDrop.forEach(d => d.bind(html[0]));
    }



    activateFooterListeners(html) {
        let folder = (this.object.folder || this.object.parent?.folder);
        let content = folder ? folder.contents : ui.journal.collection.tree?.entries || ui.journal.documents;
        let sorting = folder?.sorting || ui.journal.collection.sortingMode || "m";
        
        let documents = content
            .map(c => {
                if (c.testUserPermission && !c.testUserPermission(game.user, "OBSERVER"))
                    return null;
                return {
                    id: c.id,
                    name: c.name || "",
                    sort: c.sort
                }
            })
            .filter(d => !!d)
            .sort((a, b) => {
                return sorting == "m" ? a.sort - b.sort : a.name.localeCompare(b.name);
            })
        let idx = documents.findIndex(e => e.id == this.object.id || e.id == this.object.parent?.id);

        let prev = (idx > 0 ? documents[idx - 1] : null);
        let next = (idx < documents.length - 1 ? documents[idx + 1] : null);
        // Navigation buttons
        const navPrev = html.querySelector('.navigate-prev');
        const navNext = html.querySelector('.navigate-next');
        
        if (navPrev) {
            const isVisible = !["blank", "folder"].includes(this.object.type);
            navPrev.style.display = isVisible ? '' : 'none';
            navPrev.classList.toggle('disabled', !prev);
            if (prev) navPrev.setAttribute("title", prev.name);
            if (isVisible && prev) {
                navPrev.addEventListener("click", () => this.openPage(prev));
            }
        }
        
        if (navNext) {
            const isVisible = !["blank", "folder"].includes(this.object.type);
            navNext.style.display = isVisible ? '' : 'none';
            navNext.classList.toggle('disabled', !next);
            if (next) navNext.setAttribute("title", next.name);
            if (isVisible && next) {
                navNext.addEventListener("click", () => this.openPage(next));
            }
        }

        // Page navigation for JournalEntry
        const pagePrev = html.querySelector('.page-prev');
        const pageNext = html.querySelector('.page-next');
        
        if (this.object instanceof JournalEntry) {
            if (pagePrev) {
                pagePrev.classList.toggle("disabled", !this.subsheet || this.subsheet?.pageIndex < 1);
                pagePrev.style.display = '';
                pagePrev.addEventListener("click", () => this.previousPage());
            }
            if (pageNext) {
                pageNext.classList.toggle("disabled", !this.subsheet || this.subsheet?.pageIndex >= (this.object?.pages?.size || 0) - 1);
                pageNext.style.display = '';
                pageNext.addEventListener("click", () => this.nextPage());
            }
        /*} else if (this.object instanceof JournalEntryPage) {
            let pageIdx = this.object.parent.pages.contents.findIndex(p => p.id == this.object.id);
            let prevPage = (pageIdx > 0 ? this.object.parent.pages.contents[pageIdx - 1] : null);
            let nextPage = (pageIdx < this.object.parent.pages?.contents.length - 1 ? this.object.parent.pages.contents[pageIdx + 1] : null);
            if (pagePrev) {
                pagePrev.classList.toggle('disabled', !prevPage);
                pagePrev.style.display = this.object.parent.pages?.contents?.length > 1 ? '' : 'none';
                if (prevPage) pagePrev.setAttribute("title", prevPage.name);
                pagePrev.addEventListener("click", () => this.previousPage(prevPage));
            }
            if (pageNext) {
                pageNext.classList.toggle('disabled', !nextPage);
                pageNext.style.display = this.object.parent.pages?.contents?.length > 1 ? '' : 'none';
                if (nextPage) pageNext.setAttribute("title", nextPage.name);
                pageNext.addEventListener("click", () => this.nextPage(nextPage));
            }
        */
        } else {
            if (pagePrev) pagePrev.style.display = 'none';
            if (pageNext) pageNext.style.display = 'none';
        }

        // Add page and toggle menu buttons
        const addPageBtn = html.querySelector('.add-page');
        if (addPageBtn) {
            addPageBtn.addEventListener("click", () => this.addPage());
        }
        
        const toggleMenuBtn = html.querySelector('.toggle-menu');
        if (toggleMenuBtn) {
            const isVisible = !(this.object instanceof JournalEntryPage);
            toggleMenuBtn.style.display = isVisible ? '' : 'none';
            if (isVisible) {
                toggleMenuBtn.addEventListener("click", () => this.toggleMenu());
            }
        }
     }

    journalEntryDocumentControls() {
        let ctrls = [
            { text: '<i class="fas fa-search"></i>', type: 'text' },
            { id: 'search', type: 'input', text: "Search Journal", callback: this.searchText },
            { id: 'viewmode', text: "View Single Page", icon: 'fa-notes', callback: this.toggleViewMode.bind(this) },
            {
                id: 'add', text: "Add a Page", icon: 'fa-file-plus', conditional: (doc) => {
                    return game.user.isGM || doc.isOwner
                }, callback: this.addPage
            },
            { id: 'show', text: i18n("MonksEnhancedJournal.ShowToPlayers"), icon: 'fa-eye', conditional: game.user.isGM, callback: this.doShowPlayers }
        ];

        return ctrls;
    }

    openPage(page) {
        if (!page?.id)
            return;
        let journal = game.journal.get(page.id);
        if (journal) this.open(journal);
    }

    toggleMenu() {
        if (this.subsheet.toggleSidebar) this.subsheet.toggleSidebar(event);
        game.user.setFlag("monks-enhanced-journal", `pagestate.${this.object.id}.collapsed`, this.subsheet.sidebarCollapsed);
    }

    toggleViewMode(event) {
        this.subsheet._onAction(event);
        const modes = JournalSheet.VIEW_MODES;
        game.user.setFlag("monks-enhanced-journal", `pagestate.${this.object.id}.mode`, this.subsheet.mode);
        const viewmodeBtn = this.element.querySelector('.viewmode');
        if (viewmodeBtn) {
            viewmodeBtn.setAttribute("title", this.subsheet.mode === modes.SINGLE ? "View Multiple Pages" : "View Single Page");
            const icon = viewmodeBtn.querySelector("i");
            if (icon) {
                icon.classList.toggle("fa-notes", this.subsheet.mode === modes.SINGLE);
                icon.classList.toggle("fa-note", this.subsheet.mode !== modes.SINGLE);
            }
        }
    }

    journalSettings() {

    }

    addPage() {
        /*
        let journal = this.object.parent || this.object;

        const options = { parent: journal };
        return JournalEntryPage.implementation.createDialog({}, options);
        */
        this.createPage();
    }

    previousPage() {
        if (this.subsheet) {
            if (this.subsheet.previousPage) this.subsheet.previousPage(event);
            
            // Update page navigation buttons
            const pagePrev = this.element.querySelector('.page-prev');
            const pageNext = this.element.querySelector('.page-next');
            
            if (pagePrev) {
                pagePrev.classList.toggle("disabled", !this.subsheet || this.subsheet?.pageIndex < 1);
            }
            if (pageNext) {
                pageNext.classList.toggle("disabled", !this.subsheet || this.subsheet?.pageIndex >= this.subsheet?._pages.length - 1);
            }
        }
    }

    nextPage() {
        if (this.subsheet) {
            if (this.subsheet.nextPage) this.subsheet.nextPage(event);
            
            // Update page navigation buttons
            const pagePrev = this.element.querySelector('.page-prev');
            const pageNext = this.element.querySelector('.page-next');
            
            if (pagePrev) {
                pagePrev.classList.toggle("disabled", !this.subsheet || this.subsheet?.pageIndex < 1);
            }
            if (pageNext) {
                pageNext.classList.toggle("disabled", !this.subsheet || this.subsheet?.pageIndex >= this.subsheet?._pages.length - 1);
            }
        }
    }
}