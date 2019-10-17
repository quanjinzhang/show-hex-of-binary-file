import * as fs from 'fs';
import * as vscode from 'vscode';
export default class HexStrProvider implements vscode.TextDocumentContentProvider {
    static scheme = 'hexstr';
    constructor(public log: vscode.OutputChannel) {
        this._onDidChange = new vscode.EventEmitter<vscode.Uri>();
    }
    private _onDidChange: vscode.EventEmitter<vscode.Uri>;
    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }
    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): string {
        let filePath = uri.fsPath;
        if (!filePath || filePath.trim() === '' || !fs.existsSync(filePath)) {
            return "";
        }
        const baseNum = 16;
        let data = fs.readFileSync(filePath);
        let hexStr = '';
        for (let i=0; i<data.length;) {
            if (i%baseNum === 0) {
                hexStr += i.toString(baseNum).toUpperCase().padStart(8, '0') + ': ';
            }
            hexStr += data[i].toString(baseNum).toUpperCase().padStart(2, '0');
            let j = 1;
            for (;j<baseNum; j++) {
                if ((i+j) >= data.length) {
                    break;
                }
                hexStr += ' ' + (data[i+j]).toString(baseNum).toUpperCase().padStart(2, '0');
            }
            hexStr += '\n';
            i += baseNum;
        }
        this.log.appendLine(`Finish to retrive hex dump string of "${filePath}"`);
        return hexStr;
    }
}
