"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
class HexStrProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
    }
    get onDidChange() {
        return this._onDidChange.event;
    }
    update(uri) {
        this._onDidChange.fire(uri);
    }
    provideTextDocumentContent(uri, token) {
        let filePath = uri.fsPath;
        if (!filePath || filePath.trim() === '' || !fs.existsSync(filePath)) {
            return "";
        }
        let abspath = path.normalize(filePath);
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
}
exports.default = HexStrProvider;
HexStrProvider.scheme = 'hexstr';
//# sourceMappingURL=provider.js.map