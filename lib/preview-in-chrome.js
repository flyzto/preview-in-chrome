'use strict';

const { CompositeDisposable, BufferedProcess } = require('atom');
const path = require('path');
const fs = require('fs');
const os = require('os');

exports['default'] = {

    subscriptions: null,

    activate(state) {

        if(os.platform() !== 'darwin') {
            console.log('Unsupported platform');
            return;
        }

        this.subscriptions = new CompositeDisposable();
        this.editorSubscriptions = new CompositeDisposable();

        this.registerCommands();
        this.registerTextEditorSaveCallback();
        this.registerContextMenuItem();
    },

    deactivate() {
        this.subscriptions.dispose();
        this.editorSubscriptions.dispose();
    },

    registerCommands() {
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'preview-in-chrome:preview': event => {
                this.preview(event);
            },
            'preview-in-chrome:refresh': event => {
                this.refresh(event);
            }
        }));
    },

    registerTextEditorSaveCallback() {
        this.editorSubscriptions.add(atom.workspace.observeTextEditors(editor => {
            this.subscriptions.add(editor.onDidSave(event => {
                let filePath = event.path;
                if(this.isFileHTML(filePath)) {
                    this.processWithPath('refresh', filePath);
                }
            }));
        }));
    },

    registerContextMenuItem() {
        let itemSets = atom.contextMenu.itemSets;
        let contextMenuItem = null;
        itemSets.some(itemSet => {
            if(itemSet.selector === '.tree-view .file') {
                return itemSet.items.some(item => {
                    if(item.id === 'preview-in-chrome-context-menu') {
                        contextMenuItem = item;
                        return true;
                    }
                    return false;
                });
            }
            return false;
        });
        contextMenuItem.shouldDisplay = event => {
            let target = event.target;
            if(target.matches('.tree-view .file span')) {
                target = target.parentNode;
            }
            if(target.matches('.tree-view .file')) {
                let child = target.firstElementChild;
                let filename = child.getAttribute('data-name');
                return this.isFileHTML(filename);
            }
            return false;
        }
    },

    getProjectOfFile(file) {
        let currentProject;
        atom.project.getPaths().some(item => {
            if(file.startsWith(item)) {
                currentProject = item;
                return true;
            }
            return false;
        });
        return currentProject;
    },

    getPackageScriptPath(scriptName) {
        let packageDirPaths = atom.packages.packageDirPaths;
        let scriptPath;
        packageDirPaths.some(item => {
            scriptPath = path.join(item, `preview-in-chrome/applescript/${scriptName}.scpt`);
            return fs.existsSync(scriptPath);
        });
        return scriptPath;
    },

    urlOfPath(filePath) {
        if(!path.isAbsolute(filePath)) {
            return;
        }
        let fileUrl = encodeURI(`file://${filePath}`);
        return fileUrl;
    },

    isFileHTML(file) {
        return ['.html', '.htm', '.xhtml'].some(item => {
            return file.endsWith(item);
        });
    },

    preview(event) {
        let filePath;
        let target = event.target;
        if(target.matches('.tree-view .file span')) {
            target = target.parentNode;
        }
        if(target.matches('.tree-view .file')) {
            let child = target.firstElementChild;
            filePath = child.getAttribute('data-path');
        }
        else if(atom.workspace.getActiveTextEditor() && atom.workspace.getActiveTextEditor().getPath()) {
            filePath = atom.workspace.getActiveTextEditor().getPath();
        }
        if(filePath && this.isFileHTML(filePath)) {
            this.processWithPath('preview', filePath);
        }
    },

    refresh(event) {
        if(atom.workspace.getActiveTextEditor() && atom.workspace.getActiveTextEditor().getPath()) {
            let filePath = atom.workspace.getActiveTextEditor().getPath();
            let projectPath = this.getProjectOfFile(filePath);
            if(projectPath) {
                this.processWithPath('refresh', projectPath);
            }
        }
    },

    processWithPath(processType, filePath, delay) {
        if(processType !== 'preview' && processType !== 'refresh') {
            return;
        }
        let scriptPath = this.getPackageScriptPath(processType);
        if(!scriptPath) {
            return;
        }
        let fileUrl = this.urlOfPath(filePath);
        if(!fileUrl) {
            return;
        }
        if(!delay) {
            delay = 0;
        }
        let appleEvent = {
            'preview': `previewInChrome("${fileUrl}")`,
            'refresh': `refreshChrome("${fileUrl}", ${delay})`
        }
        let appleScript = `
            set scriptFile to (POSIX file "${scriptPath}")
            set chromeScript to load script scriptFile
            tell chromeScript
            	${appleEvent[processType]}
            end tell
            `.trim();
        new BufferedProcess({
            command: 'osascript',
            args: ['-e', appleScript],
            stderr: (error) => {
                console.log(error)
			}
        });
    }

};

module.exports = exports['default']
