# Monk's Enhanced Journal - AI Development Guidelines

## Project Overview
This is a FoundryVTT module that enhances the default journal system with specialized journal types, tabbed browsing, bookmarking, and advanced UI components. The module follows a sheet-based architecture where different journal types have dedicated sheet classes.

**CRITICAL: This codebase requires migration to FoundryVTT v13+ APIs**

## Core Architecture

### Entry Point & Module Structure
- `monks-enhanced-journal.js` - Main module entry with initialization, settings, and global utilities
- `module.json` - FoundryVTT module manifest defining dependencies, languages, and entry points
- Uses ES6 imports extensively; all files export/import using standard module syntax

### Sheet System (Primary Pattern) - **MIGRATION REQUIRED**
Each journal type has a dedicated sheet class in `sheets/`:
- `EnhancedJournalSheet.js` - Base sheet class extending `JournalPageSheet` (v12 pattern)
- `PersonSheet.js`, `PlaceSheet.js`, `QuestSheet.js`, etc. - Specialized sheets extending the base
- Template files in `templates/sheets/` correspond 1:1 with sheet classes
- **v13+ CHANGE**: All sheets must migrate from `Application` to `ApplicationV2`
- **v13+ CHANGE**: Replace `JournalPageSheet` inheritance with `ApplicationV2` patterns

### Application Architecture - **MIGRATION REQUIRED**
- `apps/enhanced-journal.js` - Main application window with tab management and directory browsing
- `apps/` contains specialized dialog/window classes for features like currency distribution, slide configuration
- **v12 LEGACY**: Currently uses FoundryVTT's `Application` base class with `_updateObject()` lifecycle
- **v13+ MIGRATION**: Must convert to `ApplicationV2` with new form handling patterns

### Plugin System - **TinyMCE DEPRECATED**
TinyMCE editor plugins in `plugins/` extend the text editor:
- `background.plugin.js` - Adds background styling controls to editor toolbar
- `createlink.plugin.js` - Custom link creation functionality
- **v13+ CHANGE**: TinyMCE deprecated in v13, removed in v14 - migrate to ProseMirror

## Key Patterns & Conventions

### Data Management - **MOSTLY COMPATIBLE**
- Uses FoundryVTT flags extensively: `object.getFlag('monks-enhanced-journal', key)` for persistent storage
- `helpers.js` contains `MEJHelpers` class with system-agnostic data access patterns
- Price/currency handling abstracted to support multiple game systems via `getValue()`/`setValue()` helpers
- **v13+ COMPATIBLE**: Flag system unchanged, but document access patterns may need updates

### Internationalization - **COMPATIBLE**
- Language files in `lang/` directory follow FoundryVTT i18n standards
- Use `i18n(key)` and `format(key, data)` helper functions from main module
- All user-facing strings should use localization keys

### Settings & Configuration - **COMPATIBLE**
- `settings.js` registers all module settings using FoundryVTT's settings API
- Settings accessed via `setting(key)` helper function throughout codebase
- Configuration dialogs in `apps/` for complex settings (DC configuration, customization)

### Template & Styling - **REQUIRES v13+ UPDATES**
- Handlebars templates in `templates/` with organized subdirectories by feature
- CSS files in `css/` with component-specific stylesheets
- **v13+ CHANGE**: CSS Layers system now used - update selectors to avoid conflicts
- **v13+ CHANGE**: ThemeV2 system supports light/dark modes automatically
- Uses CSS classes for system compatibility: `${game.system.id}` class added to main elements

### jQuery Usage - **REQUIRES REMOVAL FOR v13+**
- **CRITICAL**: Extensive jQuery usage throughout codebase (`$()`, `.on()`, `.addClass()`, etc.)
- **v13+ MIGRATION**: Replace all jQuery with native DOM APIs
- **v13+ MIGRATION**: Update event handling to use native addEventListener

#### Specific jQuery Patterns to Replace:
**DOM Selection & Manipulation:**
- `$('a[href]', html).each()` → `html.querySelectorAll('a[href]').forEach()`
- `$('.document.journalentry', html)` → `html.querySelectorAll('.document.journalentry')`
- `$(element).addClass()` → `element.classList.add()`
- `$(element).attr('data-show-id', value)` → `element.setAttribute('data-show-id', value)`
- `$(event.currentTarget).closest('li')[0]` → `event.currentTarget.closest('li')`

**DOM Creation & Content:**
- `$('<div>').addClass('class')` → `document.createElement('div'); element.className = 'class'`
- `$('<div>').attr('id', 'slideshow-canvas')` → `element.id = 'slideshow-canvas'`
- `$(element).append()` → `element.appendChild()`
- `$(element).val()` → `element.value`
- `$(element).prop('checked')` → `element.checked`

**Event Handling:**
- `$(element).on('click', handler)` → `element.addEventListener('click', handler)`
- `$(element).change(handler)` → `element.addEventListener('change', handler)`
- `$('body').attr("inline-roll-styling", value)` → `document.body.setAttribute()`

## Development Workflow

### v13+ Migration Strategy
1. **Phase 1**: Convert all jQuery to native DOM APIs
2. **Phase 2**: Migrate `Application` classes to `ApplicationV2`
3. **Phase 3**: Replace TinyMCE plugins with ProseMirror equivalents
4. **Phase 4**: Update CSS to use v13 CSS Layers system
5. **Phase 5**: Test all functionality with v13+ FoundryVTT

### Adding New Journal Types (v13+ Pattern)
1. Create sheet class in `sheets/` extending `ApplicationV2` (not `EnhancedJournalSheet`)
2. Add corresponding template in `templates/sheets/`
3. Use new v13+ form handling patterns (not `_updateObject()`)
4. Register sheet type in main module initialization
5. Add localization keys for new type
6. Create CSS styling using v13 CSS Layers system

### ApplicationV2 Migration Patterns
- Replace `Application.defaultOptions` with `static DEFAULT_OPTIONS`
- Replace `_updateObject()` with form submission handlers
- Use `ApplicationV2` render lifecycle (`_prepareContext()`, `_renderHTML()`)
- Update template data handling for v13 patterns

### Editor Integration - **DEPRECATED PATH**
- **v13**: TinyMCE plugins deprecated, removed in v14
- **MIGRATION**: Convert to ProseMirror editor system
- Custom toolbar integration needs complete rewrite for ProseMirror
- Sheet classes will need new editor access patterns

### System Compatibility - **ENHANCED IN v13+**
- Use `MEJHelpers` methods for data access to ensure cross-system compatibility
- Check `game.system.id` for system-specific logic
- Price/currency handling varies significantly between systems (D&D5e vs PF2e vs others)
- **v13+ IMPROVEMENT**: Better cross-system compatibility APIs available

## v13+ Migration Checklist

### Immediate Priorities
1. **jQuery Removal**: Search codebase for `$(`, `jQuery` - 50+ instances need conversion
2. **ApplicationV2 Conversion**: All `Application` classes in `apps/` and `sheets/`
3. **Form Handling**: Replace all `_updateObject()` methods with v13 form handlers
4. **TinyMCE Replacement**: Convert `plugins/` directory to ProseMirror
5. **CSS Layers**: Update all CSS files to use v13 CSS Layers system

### Specific Code Migration Examples

**jQuery DOM Manipulation (monks-enhanced-journal.js lines 636-638):**
```javascript
// v12 LEGACY:
$('a[href]', html).each(function () {
    if ($(this).attr('href').startsWith("#"))
        $(this).addClass("journal-link");
});

// v13+ REPLACEMENT:
html.querySelectorAll('a[href]').forEach(element => {
    if (element.getAttribute('href').startsWith("#"))
        element.classList.add("journal-link");
});
```

**jQuery Element Creation (lines 2601, 2649):**
```javascript
// v12 LEGACY:
$('<div>').attr('id', 'slideshow-canvas').addClass('monks-journal-sheet flexrow')

// v13+ REPLACEMENT:
const div = document.createElement('div');
div.id = 'slideshow-canvas';
div.className = 'monks-journal-sheet flexrow';
```

**jQuery Event Handling:**
```javascript
// v12 LEGACY:
$(element).on('click', handler)
$('.item-delete', html).click(this.removeAttribute.bind(this))

// v13+ REPLACEMENT:
element.addEventListener('click', handler)
html.querySelectorAll('.item-delete').forEach(el => {
    el.addEventListener('click', this.removeAttribute.bind(this))
});
```

### Key Migration Files (Priority Order)
1. `sheets/EnhancedJournalSheet.js` - Convert base class to `ApplicationV2`
2. `apps/enhanced-journal.js` - Main application needs full `ApplicationV2` conversion
3. `monks-enhanced-journal.js` - Update jQuery DOM manipulation (50+ instances)
4. `plugins/background.plugin.js` - Replace TinyMCE with ProseMirror
5. `plugins/createlink.plugin.js` - Replace TinyMCE with ProseMirror
6. All files in `apps/` - Convert Application classes to ApplicationV2

### v12 to v13 API Changes Found in Codebase
**TinyMCE Configuration (DEPRECATED in v13):**
- `CONFIG.TinyMCE.content_css` - Replace with ProseMirror equivalents
- `CONFIG.TinyMCE.style_formats` - Custom styling needs ProseMirror approach
- `tinyMCE.PluginManager.add()` - Convert to ProseMirror plugins

**Sheet Registration Patterns:**
- `DocumentSheetConfig.registerSheet(JournalEntryPage, ...)` - Compatible but may need updates
- `JournalPageSheet` inheritance - Replace with `ApplicationV2` patterns
- Form submission via `_updateObject()` - Replace with v13 form handlers

**Hook Usage (Some Changed in v13):**
- `renderJournalPageSheet` - Compatible
- `chatBubble` - Deprecated, use `chatBubbleHTML` (passes HTMLElement not jQuery)
- Event handling hooks may need signature updates

### Compatibility Requirements
- **Minimum FoundryVTT Version**: v13.341+
- **Node.js Version**: 20+ (v13 requirement)
- **Breaking Changes**: All jQuery, Application classes, TinyMCE usage must be updated
- **CSS**: Must adopt CSS Layers to prevent conflicts with core v13 styles

## Critical Files for Understanding
- `monks-enhanced-journal.js` - Global utilities and module initialization
- `sheets/EnhancedJournalSheet.js` - Base sheet architecture and patterns
- `apps/enhanced-journal.js` - Main UI application structure
- `helpers.js` - Cross-system compatibility layer
- `templates/main.html` - Main application template structure

## Testing & Debugging
- Module includes debug logging system controlled by `debugEnabled` global
- Use `debug()`, `log()`, `warn()`, `error()` functions from main module for consistent logging
- FoundryVTT dev tools and browser console for debugging UI components