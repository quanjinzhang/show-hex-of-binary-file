"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const HexStrProvider_1 = require("./HexStrProvider");
const docList = new Map();
let hexStrProvider = new HexStrProvider_1.default();
let hexStrReadonly = true;
function getReadonlyCfg() {
    let cfgReadonly = vscode.workspace.getConfiguration().get("show-hex-of-binary-file.readOnly");
    if (typeof (cfgReadonly) === 'boolean') {
        hexStrReadonly = cfgReadonly;
    }
    return hexStrReadonly;
}
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "show-hex-of-binary-file" is now active!');
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let pickType = vscode.workspace.getConfiguration().get("show-hex-of-binary-file.pickType");
    getReadonlyCfg();
    pickType = pickType ? pickType : "select";
    let showBinHex;
    if (pickType === 'input') {
        showBinHex = inputToShowHex;
    }
    else {
        showBinHex = selectToShowHex;
    }
    let disposables = [
        vscode.workspace.registerTextDocumentContentProvider(HexStrProvider_1.default.scheme, hexStrProvider),
        vscode.commands.registerCommand('extension.showBinHexStr', showBinHex)
    ];
    context.subscriptions.push(...disposables);
    let doing = false;
    let closedDocs = [];
    let interval = vscode.workspace.getConfiguration().get("show-hex-of-binary-file.checkInterval");
    if (interval) {
        interval = interval < 500 ? 500 : interval;
    }
    else {
        interval = 3000;
    }
    setInterval(function () {
        if (doing) {
            return;
        }
        if (closedDocs.length > 0) {
            for (let i = 0; i < closedDocs.length; i++) {
                docList.delete(closedDocs[i]);
            }
            closedDocs = [];
        }
        doing = true;
        docList.forEach((docInfo, key) => __awaiter(this, void 0, void 0, function* () {
            // check each opened binary file every 1 second, and reload them if the source changed
            let doc = docInfo[0];
            if (doc.isClosed) {
                closedDocs.push(key);
            }
            else {
                let mtimeMs = docInfo[1];
                let size = docInfo[2];
                let filePath = key.substring(1);
                let newStat = fs.statSync(filePath);
                if (mtimeMs !== fs.statSync(filePath).mtimeMs || size !== newStat.size) {
                    console.log(`refresh the hex string of file: ${key} ${fs.statSync(filePath).mtimeMs} ${fs.statSync(filePath).size}`);
                    if (typeof (docInfo[3]) === 'boolean' && docInfo[3]) {
                        yield showHexStrPreview(filePath, doc);
                    }
                    else {
                        yield showHexStrFromBinFile(filePath, true);
                    }
                }
            }
        }));
        doing = false;
    }, interval);
}
exports.activate = activate;
function inputToShowHex() {
    return __awaiter(this, void 0, void 0, function* () {
        const filePath = yield vscode.window.showInputBox({
            placeHolder: 'Please input absolute path of the binary file to preview.',
        });
        if (filePath && filePath !== '') {
            if (fs.existsSync(filePath)) {
                let uri = vscode.Uri.file(filePath);
                try {
                    let doc = yield vscode.workspace.openTextDocument(uri);
                    vscode.window.showInformationMessage(`'${filePath}' isn't a binary file. It's a text file!`);
                }
                catch (e) {
                    // a binary file
                    if (e.toString().includes('File seems to be binary')) {
                        if (getReadonlyCfg()) {
                            showHexStrPreview(filePath);
                        }
                        else {
                            showHexStrFromBinFile(filePath);
                        }
                    }
                    else {
                        throw e;
                    }
                }
            }
            else {
                vscode.window.showInformationMessage(`Please input a valid absolute path of a binary file to preview!\n'${filePath}' isn't valid!`);
            }
        }
    });
}
/**
 * open file dialog to select binary file
 */
function selectToShowHex() {
    return __awaiter(this, void 0, void 0, function* () {
        const options = {
            canSelectMany: true,
            openLabel: 'Open',
            canSelectFiles: true,
            canSelectFolders: false
        };
        vscode.window.showOpenDialog(options).then((fileUris) => __awaiter(this, void 0, void 0, function* () {
            if (fileUris && fileUris[0]) {
                for (let i = 0; i < fileUris.length; i++) {
                    if (getReadonlyCfg()) {
                        yield showHexStrPreview(fileUris[i].fsPath);
                    }
                    else {
                        yield showHexStrFromBinFile(fileUris[i].fsPath);
                    }
                }
            }
        }));
    });
}
/**
 * show readonly preview editor for the binary file
 * @param filePath the absolute path of the binary file
 * @param alreadyOpen the already opened flag of the binary file
 */
function showHexStrPreview(filePath, openedDoc) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!filePath || filePath.trim() === '' || !fs.existsSync(filePath)) {
            return;
        }
        let abspath = path.normalize(filePath);
        let previewTitle = HexStrProvider_1.default.scheme + ':' + filePath;
        let uri = vscode.Uri.parse(previewTitle, false);
        if (openedDoc) {
            let stat = fs.statSync(abspath);
            docList.set('0' + abspath, [openedDoc, stat.mtimeMs, stat.size, true]);
            hexStrProvider.update(uri);
            return;
        }
        let opened = false;
        vscode.workspace.openTextDocument(uri).then(doc => {
            let stat = fs.statSync(abspath);
            docList.set('0' + abspath, [doc, stat.mtimeMs, stat.size, true]);
            vscode.window.showTextDocument(doc, { preview: false }).then(editor => {
                opened = true;
            });
        }, reason => {
            vscode.window.showInformationMessage(reason.toString());
        });
        while (!opened) {
            // wait the file open
            yield new Promise(done => setTimeout(done, 30));
        }
    });
}
/**
 * get the hex string of the binary file
 * @param filePath the file path of the binary file
 */
function getHexStrFromPath(filePath) {
    const baseNum = 16;
    let data = fs.readFileSync(filePath);
    let hexStr = '';
    for (let i = 0; i < data.length;) {
        if (i % baseNum === 0) {
            hexStr += i.toString(baseNum).padStart(8, '0') + ': ';
        }
        hexStr += data[i].toString(baseNum).padStart(2, '0');
        let j = 1;
        for (; j < baseNum; j++) {
            if ((i + j) >= data.length) {
                break;
            }
            hexStr += ' ' + (data[i + j]).toString(baseNum).padStart(2, '0');
        }
        hexStr += '\n';
        i += baseNum;
    }
    return hexStr;
}
/**
 * show hex string from the binary file
 * @param filePath the file path of the binary file
 * @returns void
 */
function showHexStrFromBinFile(filePath, alreadyOpen) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!filePath || filePath.trim() === '' || !fs.existsSync(filePath)) {
            return;
        }
        let abspath = path.normalize(filePath);
        let hexStr = getHexStrFromPath(filePath);
        let filename = path.basename(filePath);
        let previewTitle = 'untitled:' + filename;
        let uri = vscode.Uri.parse(previewTitle, false);
        let opened = false;
        vscode.workspace.openTextDocument(uri).then(doc => {
            let stat = fs.statSync(abspath);
            docList.set('1' + abspath, [doc, stat.mtimeMs, stat.size, false]);
            vscode.window.showTextDocument(doc).then(textEditor => {
                textEditor.edit(editBuilder => {
                    if (alreadyOpen) {
                        let range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(doc.lineCount, 57));
                        editBuilder.replace(range, hexStr);
                    }
                    else {
                        editBuilder.insert(new vscode.Position(0, 0), hexStr);
                    }
                    // flag that the file has been opened
                    opened = true;
                });
            });
        }, reason => {
            vscode.window.showInformationMessage(reason.toString());
        });
        while (!opened) {
            // wait the file open
            yield new Promise(done => setTimeout(done, 30));
        }
    });
}
// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map