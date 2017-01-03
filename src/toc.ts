'use strict';

/**
 * Modified from <https://github.com/AlanWalk/Markdown-TOC>
 */

import { commands, languages, window, workspace, CancellationToken, CodeLens, CodeLensProvider, ExtensionContext, Position, Range, TextDocument } from 'vscode';

const prefix = 'markdown.extension.toc.';

const REGEXP_HEADING = /^\#{1,6}/;
const REGEXP_CODE_BLOCK = /^```/;

/**
 * Workspace config
 */
let wsConfig = { tab: '    ', eol: '\r\n' };
let tocConfig = { depth: 6, orderedList: false, updateOnSave: false };

let alreadyUpdated = false; // Prevent update TOC again after manually calling `doc.save()`

export function activate(context: ExtensionContext) {
    const cmds: Command[] = [
        { command: 'create', callback: createToc },
        { command: 'update', callback: updateToc }
        // , { command: 'delete', callback: deleteToc }
    ].map(cmd => {
        cmd.command = prefix + cmd.command;
        return cmd;
    });

    cmds.forEach(cmd => {
        context.subscriptions.push(commands.registerCommand(cmd.command, cmd.callback));
    });

    context.subscriptions.push(workspace.onDidSaveTextDocument(onSave));
    context.subscriptions.push(languages.registerCodeLensProvider({ language: 'markdown', scheme: 'file' }, new TocCodeLensProvider()));
}

function createToc() {
    loadConfig();

    let editor = window.activeTextEditor;
    editor.edit(function (editBuilder) {
        editBuilder.insert(editor.selection.active, generateTocText());
    });
}

function updateToc() {
    let range = detectTocRange();
    if (range != null) {
        let oldToc = window.activeTextEditor.document.getText(range);
        let newToc = generateTocText();
        if (oldToc == newToc) return;

        let anchor = range.start;
        window.activeTextEditor.edit(editBuilder => {
            editBuilder.delete(range);
            editBuilder.insert(anchor, newToc);
        });
    }
}

function deleteToc() {
    // Pass
}

function generateTocText(): string {
    let toc = [];
    let headingList = getHeadingList();
    let startDepth = 6; // In case that there is no heading in level 1.
    headingList.forEach(heading => {
        if (heading.level < startDepth) startDepth = heading.level;
    });
    let order = new Array(tocConfig.depth - startDepth + 1).fill(0); // Used for ordered list
    headingList.forEach(heading => {
        if (heading.level <= tocConfig.depth) {
            let indentation = heading.level - startDepth;
            let row = [
                wsConfig.tab.repeat(indentation),
                tocConfig.orderedList ? ++order[indentation] + '. ' : '- ',
                heading.title
            ];
            toc.push(row.join(''));
            if (tocConfig.orderedList) order.fill(0, indentation + 1);
        }
    });
    return toc.join(wsConfig.eol);
}

function detectTocRange(): Range {
    console.log('Detecting TOC ...');

    let doc = window.activeTextEditor.document;
    let start, end: Position;
    let headings = getHeadingList();

    if (headings.length == 0) return;

    for (let index = 0; index < doc.lineCount; index++) {
        let lineText = doc.lineAt(index).text;
        if (start == null) { // No line matched with start yet
            if (lineText.startsWith('- ') || lineText.startsWith('1. ')) {
                lineText = lineText.replace(/^- /, '').replace(/^\d\. /, '');
                if (lineText.startsWith(headings[0].title)) {
                    start = new Position(index, 0);
                    console.log(`Start: Ln ${start.line + 1}, Col ${start.character + 1}`);
                }
            }
        } else { // Start line already found
            lineText = lineText.trim();
            if (!(lineText.startsWith('- ') || lineText.match(/^\d\. /))) { // End of a list block
                end = new Position(index - 1, doc.lineAt(index - 1).text.length);
                console.log(`End:   Ln ${end.line + 1}, Col ${end.character + 1}`);
                break;
            }
        }
    }
    if ((start != null) && (end != null)) {
        return new Range(start, end);
    }
    console.log('No TOC detected.')
    return null;
}

function getHeadingList(): Heading[] {
    let doc = window.activeTextEditor.document;

    let headingList: Heading[] = [];
    let isInCode = false;
    for (let i = 0; i < doc.lineCount; i++) {
        let lineText = doc.lineAt(i).text;

        let codeResult = lineText.match(REGEXP_CODE_BLOCK); // Code block
        if (codeResult != null) isInCode = !isInCode;
        if (isInCode) continue;

        let headingResult = lineText.match(REGEXP_HEADING); // Heading pattern
        if (headingResult == null) continue;

        let level = headingResult[0].length; // Get heading level
        if (level > tocConfig.depth) continue;

        let title = lineText.substr(level).trim().replace(/\#*$/, "").trim(); // Get heading title

        headingList.push({
            level: level,
            title: title
        });
    }
    return headingList;
}

function onSave(doc: TextDocument) {
    if (alreadyUpdated) {
        alreadyUpdated = false;
        return;
    } else if (doc.languageId == 'markdown') {
        updateToc();
        alreadyUpdated = true;
        doc.save();
    }
}

function loadConfig() {
    // Workspace config
    wsConfig.eol = <string>workspace.getConfiguration("files").get("eol");
    let tabSize = <number>workspace.getConfiguration("editor").get("tabSize");
    let insertSpaces = <boolean>workspace.getConfiguration("editor").get("insertSpaces");

    wsConfig.tab = '\t';
    if (insertSpaces && tabSize > 0) {
        wsConfig.tab = " ".repeat(tabSize);
    }

    // TOC config
    tocConfig.depth = <number>workspace.getConfiguration('markdown.extension.toc').get('depth');
    tocConfig.orderedList = <boolean>workspace.getConfiguration('markdown.extension.toc').get('orderedList');
    tocConfig.updateOnSave = <boolean>workspace.getConfiguration('markdown.extension.toc').get('updateOnSave');
}

class TocCodeLensProvider implements CodeLensProvider {
    public provideCodeLenses(document: TextDocument, token: CancellationToken):
        CodeLens[] | Thenable<CodeLens[]> {
        let lenses: CodeLens[] = [];
        lenses.push(new CodeLens(detectTocRange(), {
            arguments: [],
            title: 'Table of Contents',
            command: ''
        }));
        console.log('executed.');
        return Promise.resolve(lenses);
    }

    // public resolveCodeLens?(codeLens: CodeLens, token: CancellationToken):
    //     CodeLens | Thenable<CodeLens> {

    // }
}
